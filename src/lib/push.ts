import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY: string = ((import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'ios-install' | 'no-key' | 'save-failed' | 'error'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true

function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    await navigator.serviceWorker.register('/sw.js')
    return await navigator.serviceWorker.ready
  } catch (err) {
    console.warn('[push] service worker failed', err)
    return null
  }
}

async function saveSubscription(deviceId: string, sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return false
  const { error } = await supabase.rpc('register_push', {
    p_device: deviceId,
    p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh,
    p_auth: j.keys.auth,
  })
  if (error) console.warn('[push] could not save subscription', error.message)
  return !error
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return true
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

async function getOrCreateSub(reg: ServiceWorkerRegistration) {
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  let sub = await reg.pushManager.getSubscription()
  // A subscription made with a different VAPID key can never receive our pushes: drop it and re-subscribe.
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe()
    sub = null
  }
  return sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource }))
}

/** True when a first tap can safely trigger the permission prompt (not yet decided, and installed on iPhone). */
export const canAutoEnablePush = () =>
  typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default' && !(isIOS() && !isStandalone())

/** Call from a real tap/click (iOS only allows the permission prompt from a user gesture). */
export async function enablePush(deviceId: string): Promise<PushResult> {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  try {
    // Ask first: even without background push set up, in-app notifications (mentions, DMs...) work once this is granted.
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    if (!pushSupported()) return 'unsupported'
    const reg = await registerSW()
    if (!reg) return 'error'
    if (!VAPID_PUBLIC_KEY) return 'no-key' // VITE_VAPID_PUBLIC_KEY was not set when the site was built
    return (await saveSubscription(deviceId, await getOrCreateSub(reg))) ? 'ok' : 'save-failed'
  } catch (err) {
    console.warn('[push] enable failed', err)
    return 'error'
  }
}

/** Silent: if notifications were already allowed, keep the subscription saved. */
export async function syncPush(deviceId: string) {
  if (!pushSupported() || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return
  const reg = await registerSW()
  if (!reg) return
  try {
    await saveSubscription(deviceId, await getOrCreateSub(reg))
  } catch (err) {
    console.warn('[push] sync failed', err)
  }
}

/** In-app notification: through the service worker (needed on phones), plain Notification as a desktop fallback. */
export async function showLocalNotification(title: string, body: string, tag = 'lounge') {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return
  try {
    const reg = 'serviceWorker' in navigator ? await registerSW() : null
    if (reg) {
      await reg.showNotification(title, { body, icon: '/jims.png', tag, renotify: true, data: { url: '/' } } as NotificationOptions)
      return
    }
  } catch (err) {
    console.warn('[push] service worker notification failed', err)
  }
  try {
    new Notification(title, { body, tag, icon: '/jims.png' })
  } catch (err) {
    console.warn('[push] local notification failed', err)
  }
}

/** Game invites use a live broadcast an offline phone never gets, so ask the server to push them. */
export async function pushInvite(to: string, fromName: string, game: string) {
  try {
    await supabase.functions.invoke('lounge-push', { body: { kind: 'invite', to, fromName, game } })
  } catch (err) {
    console.warn('[push] invite push failed', err)
  }
}
/** Asks the server to push a test notification to this device (works with the app closed). */
export async function pushTest(deviceId: string) {
  try {
    await supabase.functions.invoke('lounge-push', { body: { kind: 'test', to: deviceId } })
  } catch (err) {
    console.warn('[push] test push failed', err)
  }
}
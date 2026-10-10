// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const SYS_PREFIX = '::sys:: '
const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const clip = (t: string, n = 100) => (t.length > n ? t.slice(0, n - 1) + '…' : t)

type Payload = { title: string; body: string; tag: string; url?: string }

async function pushTo(deviceIds: string[], payload: Payload) {
  if (!deviceIds.length) return
  const { data: subs } = await sb.from('lounge_push_subscriptions').select('*').in('device_id', deviceIds)
  await Promise.all(
    (subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ url: '/', ...payload }),
          { TTL: 3600, urgency: 'high' },
        )
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.from('lounge_push_subscriptions').delete().eq('endpoint', s.endpoint)
        } else {
          console.warn('push failed', e?.statusCode, e?.body)
        }
      }
    }),
  )
}

async function onMessage(m: any) {
  if (!m?.text || String(m.text).startsWith(SYS_PREFIX)) return
  const sender: string = m.device_id ?? ''
  const author: string = m.author ?? 'Someone'

  let candidates: string[] = []
  let convName = ''
  let isDm = false
  if (m.conversation_id) {
    const { data: conv } = await sb.from('lounge_conversations').select('kind,name,members').eq('id', m.conversation_id).maybeSingle()
    if (!conv) return
    candidates = (conv.members as string[]).filter((id: string) => id !== sender)
    convName = conv.name ?? 'Group'
    isDm = conv.kind === 'dm'
  } else {
    const { data: all } = await sb.from('lounge_profiles').select('device_id')
    candidates = (all ?? []).map((p: any) => p.device_id).filter((id: string) => id !== sender)
  }
  if (!candidates.length) return

  const { data: people } = await sb.from('lounge_profiles').select('device_id,name').in('device_id', candidates)
  const mentioned = new Set<string>()
  for (const p of people ?? []) {
    if (new RegExp(`(^|[^\\w@])@${esc(p.name)}(?![\\w])`, 'i').test(m.text)) mentioned.add(p.device_id)
  }

  const body = clip(m.text)
  const chatTag = `chat-${m.conversation_id ?? 'global'}`
  const mentionIds = candidates.filter((id) => mentioned.has(id))
  const plainIds = m.conversation_id ? candidates.filter((id) => !mentioned.has(id)) : []

  await Promise.all([
    pushTo(mentionIds, { title: `${author} mentioned you${convName && !isDm ? ` in ${convName}` : ''}`, body, tag: chatTag }),
    pushTo(plainIds, { title: isDm ? author : `${author} in ${convName}`, body, tag: chatTag }),
  ])
}

async function onNote(record: any, old: any) {
  if (!record?.note || record.note === old?.note) return
  const { data: all } = await sb.from('lounge_profiles').select('device_id')
  const ids = (all ?? []).map((p: any) => p.device_id).filter((id: string) => id !== record.device_id)
  await pushTo(ids, { title: 'Note shared', body: `${record.name} shared a note: ${clip(record.note, 60)}`, tag: `note-${record.device_id}` })
}

Deno.serve(async (req: Request) => {
  try {
    const b = await req.json()
    if (b.kind === 'invite' && b.to) {
      await pushTo([String(b.to)], {
        title: 'Game invitation',
        body: `${String(b.fromName ?? 'Someone').slice(0, 30)} invited you to play ${String(b.game ?? 'a game').slice(0, 30)}`,
        tag: 'invite',
      })
    } else if (b.table === 'lounge_messages' && b.type === 'INSERT') {
      await onMessage(b.record)
    } else if (b.table === 'lounge_profiles' && b.type === 'UPDATE') {
      await onNote(b.record, b.old_record)
    }
    return new Response('ok')
  } catch (e) {
    console.error(e)
    return new Response('error', { status: 500 })
  }
})
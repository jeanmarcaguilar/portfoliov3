import { Fragment, useState, useRef, useEffect, useCallback, useMemo, type ReactNode, type ChangeEvent, type FormEvent, type KeyboardEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, CaretRight, Plus } from '@/components/slab'
import { useDismiss, type DismissReason } from '@/hooks/useDismiss'
import { supabase } from '@/lib/supabase'
import LoungeGames, { type DuelBus } from './LoungeGames'
import ChillZone, { type ChillMember } from './ChillZone'
import { sounds } from '@/utils/soundManager'

export const LOUNGE_OPEN_EVENT = 'lounge:open'

export function openDevLounge(target?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(LOUNGE_OPEN_EVENT, { detail: target }))
}

// Every avatar a member can pick (fixed list, no shuffling)
const AVATAR_SALTS = Array.from({ length: 48 }, (_, i) => `av${String(i + 1).padStart(2, '0')}`)

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🙏']

/* ---------- notification ping (own tiny Web Audio synth, no asset files) ----------
   Plays a soft two-note "ding" when someone DMs me or @mentions me. */
let pingCtx: AudioContext | null = null
let lastPingAt = 0
function getPingCtx(): AudioContext | null {
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as any).webkitAudioContext
  if (!Ctor) return null
  if (!pingCtx) pingCtx = new Ctor()
  return pingCtx
}
// Browsers keep audio muted until the person has clicked / tapped / typed on the page once.
// Called from the first interaction so the ding is allowed to play later, when a message arrives.
function unlockPing() {
  try {
    const ctx = getPingCtx()
    if (ctx && ctx.state === 'suspended') void ctx.resume()
  } catch {
    /* audio unsupported */
  }
}
function playPing() {
  try {
    const now = Date.now()
    if (now - lastPingAt < 400) return // several messages at once = one ding
    lastPingAt = now
    const ctx = getPingCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    ;[880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = t0 + i * 0.12
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
  } catch {
    /* audio blocked or unsupported: the toast still shows */
  }
}

/* ---------- browser notifications ---------- */
let lastNotificationAt = 0

async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('[Notifications] Not supported in this environment')
    return false
  }
  if (Notification.permission === 'granted') {
    console.log('[Notifications] Already granted')
    return true
  }
  if (Notification.permission !== 'denied') {
    console.log('[Notifications] Requesting permission...')
    const result = await Notification.requestPermission()
    console.log('[Notifications] Permission result:', result)
    return result === 'granted'
  }
  console.log('[Notifications] Permission denied')
  return false
}

function showBrowserNotification(title: string, body: string, icon?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('[Notifications] Cannot show: not supported')
    return
  }
  if (Notification.permission !== 'granted') {
    console.log('[Notifications] Cannot show: permission not granted, current:', Notification.permission)
    return
  }
  
  const now = Date.now()
  if (now - lastNotificationAt < 1000) return // debounce: several events at once = one notification
  lastNotificationAt = now
  
  console.log('[Notifications] Showing:', title, body)
  
  try {
    const notification = new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      tag: 'lounge-notification',
    })
    
    // Focus the window when notification is clicked
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
    
    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000)
  } catch (err) {
    console.warn('[Notifications] Failed to show:', err)
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isTmp = (id: unknown) => typeof id === 'string' && id.startsWith('tmp_')
const byCreatedAt = (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
const sameReaction = (a: any, b: any) =>
  a.message_id === b.message_id && a.device_id === b.device_id && a.emoji === b.emoji

interface ReactionUser {
  deviceId: string
  name: string
  avatarSeed: string
  isMe: boolean
}

interface Reaction {
  emoji: string
  count: number
  mine: boolean
  users: ReactionUser[]
}

interface LoungeMember {
  deviceId: string
  name: string
  avatarSeed: string
}

// Someone who currently has the lounge open (from Supabase Realtime Presence)
// The song someone is playing right now (shared with everyone through presence)
interface LoungeNowPlaying {
  id: string // YouTube video id
  title: string
  // Wall-clock time (ms) at which this song was at 0:00 on the host's player. Everyone else uses it to
  // jump to the same second. null = live stream (nothing to seek to).
  startedAt?: number | null
}
interface OnlineMember {
  deviceId: string
  name: string
  music?: LoungeNowPlaying | null
}
// What the music pill shows for another member
interface LoungeListener {
  deviceId: string
  name: string
  id: string
  title: string
  startedAt?: number | null
}

// How long (ms) a "typing" signal stays alive without a refresh
const TYPING_TTL = 4000
// Minimum gap (ms) between typing broadcasts while the user keeps typing
const TYPING_THROTTLE = 2000

interface Message {
  id: string
  author: string
  location: string
  createdAt: string
  time: string
  text: string
  avatarSeed: string
  isMe?: boolean
  authorId: string // the sender's device id (used for group nicknames)
  system?: boolean // a group notice (member added / approved), shown centered instead of as a bubble
  replyTo?: string | null
  edited?: boolean
  reactions: Reaction[]
}

interface StoryUser {
  id: string
  deviceId: string
  name: string
  updatedAt: string
  time: string
  note: string
  noteAt: string | null // when the note was posted (drives the 24h expiry)
  avatarSeed: string
  isMe?: boolean
}

// A group chat or a direct message (null conversation_id on a message = the global chat)
interface Conversation {
  id: string
  kind: 'group' | 'dm'
  name: string
  icon: string
  avatarSeed: string // DMs: the other person's avatar
  otherId: string // DMs: the other person's device id
  members: string[]
  lastAt: string
  createdBy: string // the group's admin (whoever created it)
  pinned: boolean // pinned by me: sits first in my chat row (max 2, stored on this device)
  requests: JoinRequest[] // people a member wants to add, waiting for an admin to approve
  nicknames: Record<string, string> // per-group nicknames (device id -> nickname)
}

// "member X wants to add Y": an admin accepts or rejects it
interface JoinRequest {
  deviceId: string // the person to be added
  by: string // the member who asked
  at: string
}

// Group notices ("Alex added Sam", "Admin approved Sam") are stored as normal messages whose text starts with this marker
const SYS_PREFIX = '::sys:: '
const isSysText = (t: unknown) => typeof t === 'string' && t.startsWith(SYS_PREFIX)

const PINNED_CONVS_KEY = 'lounge_pinned_chats'
const MAX_PINNED_CHATS = 2

const GROUP_ICONS = ['💬', '🚀', '🎮', '☕', '🔥', '🎧', '🌈', '🍕', '🐱', '⚡', '🎯', '🧠']
const GROUP_TINTS = [
  ['#ff7a1a', '#ffb02d'],
  ['#ff5d8f', '#ff7a1a'],
  ['#7c5cff', '#4ea1ff'],
  ['#16a085', '#4ade80'],
  ['#4ea1ff', '#22d3ee'],
  ['#f43f5e', '#fb923c'],
]
// Same group => same colour on every device
const groupTint = (id: string): CSSProperties => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  const [a, b] = GROUP_TINTS[h % GROUP_TINTS.length]
  return { background: `linear-gradient(135deg, ${a}, ${b})` }
}
const dmId = (a: string, b: string) => `dm_${[a, b].sort().join('_')}`
const chatsNotSetUp = (err: any) =>
  err?.code === '42P01' || err?.code === '42703' || /lounge_conversations|conversation_id/.test(String(err?.message ?? ''))
// Which groups have their music player switched on, on this device (nothing is stored in the database)

/* ---------- tiny inline icons (no dependency on the slab icon set) ---------- */
const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}
const SmileIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <path d="M9 9h.01M15 9h.01" />
  </svg>
)
const ReplyIcon = () => (
  <svg {...iconProps}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 6 6v3" />
  </svg>
)
const PinIcon = () => (
  <svg {...iconProps}>
    <path d="M12 17v5" />
    <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3Z" />
  </svg>
)

const PencilIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

const GlobeIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z" />
  </svg>
)
const UsersIcon = () => (
  <svg {...iconProps}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    <path d="M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
)

// Emojis people reacted to a note with: they sit on the note bubble, and a little burst of that
// emoji pops out of the bubble the moment a new reaction arrives.
function NoteReacts({ items }: { items: { emoji: string; count: number; names?: string[] }[] }) {
  const prev = useRef<Map<string, number> | null>(null)
  const [bursts, setBursts] = useState<{ id: number; emoji: string; dx: number }[]>([])
  const key = items.map((g) => `${g.emoji}:${g.count}`).join('|')
  useEffect(() => {
    const now = new Map(items.map((g) => [g.emoji, g.count] as const))
    const before = prev.current
    prev.current = now
    if (!before) return // first render: nothing "just arrived"
    const fresh: { id: number; emoji: string; dx: number }[] = []
    now.forEach((count, emoji) => {
      const gained = count - (before.get(emoji) ?? 0)
      for (let i = 0; i < Math.min(gained, 3); i++) fresh.push({ id: Date.now() + Math.random(), emoji, dx: Math.round((Math.random() - 0.5) * 36) })
    })
    if (!fresh.length) return
    setBursts((b) => [...b, ...fresh])
    const ids = new Set(fresh.map((f) => f.id))
    const t = window.setTimeout(() => setBursts((b) => b.filter((x) => !ids.has(x.id))), 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!items.length && !bursts.length) return null
  return (
    <>
      {items.length > 0 && (
        <span className="lounge-nr" aria-label={`Reactions: ${items.map((g) => g.emoji).join(' ')}`}>
          {items.slice(0, 3).map((g) => (
            <span key={g.emoji} className="lounge-nr__chip" title={g.names?.join(', ')}>
              {g.emoji}
              {g.count > 1 && <b>{g.count}</b>}
            </span>
          ))}
        </span>
      )}
      <span className="lounge-nr__bursts" aria-hidden="true">
        {bursts.map((b) => (
          <span key={b.id} className="lounge-nr__burst" style={{ '--dx': `${b.dx}px` } as CSSProperties}>
            {b.emoji}
          </span>
        ))}
      </span>
    </>
  )
}

function LoungeAvatar({ seed, size = 36 }: { seed: string; size?: number }) {
  const avatarUrl = `https://api.dicebear.com/10.x/lorelei/svg?seed=${encodeURIComponent(seed)}`

  return (
    <img
      src={avatarUrl}
      alt={`${seed}'s avatar`}
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        backgroundColor: '#E2E8F0',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  )
}

/* ---------- Community game: Dev Trivia ----------
   Every round deals 10 fresh random questions (a different set each time you play),
   and the leaderboard resets every 24 hours at midnight Manila time. Scores live in
   `lounge_scores` (see lounge_scores.sql); if that table isn't set up the game still
   works, it just can't rank people. */

interface TriviaItem {
  c: string // category label
  q: string
  a: string // the correct answer
  w: string[] // three wrong answers
}

const TRIVIA_BANK: TriviaItem[] = [
  // ---------- HTML ----------
  { c: 'HTML', q: 'Which HTML tag defines the largest heading?', a: '<h1>', w: ['<h6>', '<head>', '<header>'] },
  { c: 'HTML', q: 'What does HTML stand for?', a: 'HyperText Markup Language', w: ['HyperText Machine Language', 'High-level Text Markup Logic', 'Hyperlink and Text Management Language'] },
  { c: 'HTML', q: 'Which attribute gives an image a text description for screen readers?', a: 'alt', w: ['title', 'src', 'caption'] },
  { c: 'HTML', q: 'Which tag creates a hyperlink?', a: '<a>', w: ['<link>', '<href>', '<nav>'] },
  { c: 'HTML', q: 'Which semantic element wraps the main navigation links?', a: '<nav>', w: ['<menu>', '<links>', '<navigate>'] },
  { c: 'HTML', q: 'What does the defer attribute on a script tag do?', a: 'Loads it in parallel and runs it after the HTML is parsed', w: ['Delays loading by five seconds', 'Runs it only when clicked', 'Blocks parsing until it finishes'] },
  { c: 'HTML', q: 'Which tag defines a table row?', a: '<tr>', w: ['<td>', '<th>', '<row>'] },
  { c: 'HTML', q: 'Which meta tag makes a page scale properly on phones?', a: 'viewport', w: ['responsive', 'mobile', 'scale'] },
  { c: 'HTML', q: 'Which attribute gives an element an accessible name when there is no visible label?', a: 'aria-label', w: ['data-label', 'title-text', 'alt-name'] },
  { c: 'HTML', q: 'What does the HTML doctype declaration tell the browser?', a: 'To render the page in standards mode', w: ['Which server hosts the page', 'Which fonts to download', 'Which language the page is written in'] },

  // ---------- CSS ----------
  { c: 'CSS', q: 'What does CSS stand for?', a: 'Cascading Style Sheets', w: ['Computer Style Sheets', 'Creative Style System', 'Colorful Style Syntax'] },
  { c: 'CSS', q: 'Which CSS property controls the stacking order of positioned elements?', a: 'z-index', w: ['order', 'layer', 'stack-level'] },
  { c: 'CSS', q: 'Which CSS declaration makes an element a flex container?', a: 'display: flex', w: ['flex: container', 'position: flex', 'float: flex'] },
  { c: 'CSS', q: 'Which symbol starts a CSS class selector?', a: '. (dot)', w: ['# (hash)', '@ (at)', '* (star)'] },
  { c: 'CSS', q: 'What does box-sizing: border-box do?', a: 'Includes padding and border in the element\'s width', w: ['Collapses the margins', 'Hides overflowing content', 'Turns the element inline'] },
  { c: 'CSS', q: 'Which unit is relative to the width of the viewport?', a: 'vw', w: ['em', 'rem', 'ch'] },
  { c: 'CSS', q: 'What does position: sticky do?', a: 'Sticks the element to an edge once you scroll to it', w: ['Pins it to the page corner forever', 'Removes it from the layout', 'Makes it float beside text'] },
  { c: 'CSS', q: 'Which CSS feature is built for two-dimensional layouts of rows and columns?', a: 'CSS Grid', w: ['Floats', 'Table-cell hacks', 'Inline-block'] },
  { c: 'CSS', q: 'Which pseudo-class matches an element while the pointer is over it?', a: ':hover', w: [':active', ':focus', ':over'] },
  { c: 'CSS', q: 'The rem unit is relative to what?', a: 'The root element\'s font size', w: ['The parent\'s font size', 'The viewport height', 'The element\'s width'] },
  { c: 'CSS', q: 'Which property adds space outside an element\'s border?', a: 'margin', w: ['padding', 'gap', 'outline'] },
  { c: 'CSS', q: 'Which selector has the highest specificity?', a: '#header', w: ['.header', 'header', 'div > p'] },

  // ---------- JavaScript ----------
  { c: 'JavaScript', q: 'In JavaScript, what does typeof null return?', a: '"object"', w: ['"null"', '"undefined"', '"number"'] },
  { c: 'JavaScript', q: 'Which operator compares both value and type in JavaScript?', a: '===', w: ['==', '=', '!='] },
  { c: 'JavaScript', q: 'Which of these is NOT a primitive type in JavaScript?', a: 'Array', w: ['String', 'Boolean', 'Symbol'] },
  { c: 'JavaScript', q: 'What does Array.prototype.map() return?', a: 'A new array', w: ['The original array, mutated', 'A single value', 'undefined'] },
  { c: 'JavaScript', q: 'What does console.log(0.1 + 0.2 === 0.3) print?', a: 'false', w: ['true', 'undefined', 'NaN'] },
  { c: 'JavaScript', q: 'What does async/await make easier to work with?', a: 'Promises', w: ['CSS animations', 'Web fonts', 'Git merges'] },
  { c: 'JavaScript', q: 'Which keyword declares a block-scoped constant?', a: 'const', w: ['var', 'static', 'final'] },
  { c: 'JavaScript', q: 'What does "5" + 3 evaluate to?', a: '"53"', w: ['8', '"8"', 'NaN'] },
  { c: 'JavaScript', q: 'Which method adds an element to the end of an array?', a: 'push()', w: ['pop()', 'shift()', 'unshift()'] },
  { c: 'JavaScript', q: 'What does NaN === NaN evaluate to?', a: 'false', w: ['true', 'undefined', 'NaN'] },
  { c: 'JavaScript', q: 'What is special about the this value in an arrow function?', a: 'It is inherited from the surrounding scope', w: ['It always points to window', 'It is bound to the caller', 'It is always undefined'] },
  { c: 'JavaScript', q: 'What does JSON.stringify() do?', a: 'Converts a value into a JSON string', w: ['Parses a JSON string', 'Sorts the object keys', 'Validates a JSON schema'] },
  { c: 'JavaScript', q: 'Which array method removes and returns the last element?', a: 'pop()', w: ['shift()', 'splice()', 'slice()'] },
  { c: 'JavaScript', q: 'What does typeof undefined return?', a: '"undefined"', w: ['"null"', '"object"', '"void"'] },
  { c: 'JavaScript', q: 'Which statement is used to handle errors in JavaScript?', a: 'try...catch', w: ['try...except', 'catch...try', 'error...handle'] },
  { c: 'JavaScript', q: 'What is a closure?', a: 'A function that remembers variables from its outer scope', w: ['A function with no return value', 'A private class method', 'A way to close a browser tab'] },
  { c: 'JavaScript', q: 'What does Object.freeze() do?', a: 'Prevents changes to an object\'s properties', w: ['Pauses script execution', 'Deep clones the object', 'Removes all its properties'] },
  { c: 'JavaScript', q: 'Which runs first: a resolved Promise\'s .then or setTimeout(fn, 0)?', a: 'The .then callback', w: ['The setTimeout callback', 'They run at the same time', 'It depends on the browser'] },
  { c: 'JavaScript', q: 'What does Array.prototype.filter() return?', a: 'A new array of items that pass the test', w: ['Only the first match', 'A boolean', 'The original array, sorted'] },
  { c: 'JavaScript', q: 'Which operator is the nullish coalescing operator?', a: '??', w: ['||', '?.', '::'] },
  { c: 'JavaScript', q: 'Which operator is optional chaining?', a: '?.', w: ['?:', '??', '?!'] },
  { c: 'JavaScript', q: 'What is the difference between let and var?', a: 'let is block-scoped, var is function-scoped', w: ['let is function-scoped, var is block-scoped', 'let can\'t be reassigned', 'There is no difference'] },
  { c: 'JavaScript', q: 'What does parseInt("42px") return?', a: '42', w: ['NaN', '"42px"', '0'] },
  { c: 'JavaScript', q: 'What happens to Promise.all() if one promise rejects?', a: 'It rejects immediately', w: ['It waits and returns the rest', 'It ignores the failure', 'It retries the promise'] },
  { c: 'JavaScript', q: 'What does the spread syntax do in [...arr]?', a: 'Copies the elements into a new array', w: ['Deletes the array', 'Sorts the array', 'Makes the array immutable'] },
  { c: 'JavaScript', q: 'Which language did Brendan Eich famously create in about ten days?', a: 'JavaScript', w: ['Python', 'Java', 'PHP'] },

  // ---------- React ----------
  { c: 'React', q: 'Which React hook runs side effects after render?', a: 'useEffect', w: ['useState', 'useMemo', 'useRef'] },
  { c: 'React', q: 'Which hook stores state inside a function component?', a: 'useState', w: ['useMemo', 'useCallback', 'useEffect'] },
  { c: 'React', q: 'Which prop must be unique among siblings when rendering a list?', a: 'key', w: ['id', 'ref', 'index'] },
  { c: 'React', q: 'What is JSX?', a: 'A syntax that lets you write markup inside JavaScript', w: ['A JavaScript testing library', 'A CSS preprocessor', 'A module bundler'] },
  { c: 'React', q: 'What does useMemo do?', a: 'Caches a computed value between renders', w: ['Fetches data from an API', 'Creates global state', 'Runs code on unmount'] },
  { c: 'React', q: 'Which hook gives you a mutable value that doesn\'t trigger a re-render?', a: 'useRef', w: ['useState', 'useReducer', 'useId'] },
  { c: 'React', q: 'In React, which direction does data normally flow through props?', a: 'Parent to child', w: ['Child to parent', 'Sibling to sibling', 'Both ways automatically'] },
  { c: 'React', q: 'Which company created React?', a: 'Meta (Facebook)', w: ['Google', 'Microsoft', 'Twitter'] },
  { c: 'React', q: 'When does a useEffect cleanup function run?', a: 'Before the effect re-runs and on unmount', w: ['Only on the first render', 'After every click', 'Never automatically'] },
  { c: 'React', q: 'What does an empty dependency array [] in useEffect mean?', a: 'Run once after the first render', w: ['Run on every render', 'Never run', 'Run only on unmount'] },

  // ---------- TypeScript ----------
  { c: 'TypeScript', q: 'Which company created TypeScript?', a: 'Microsoft', w: ['Google', 'Meta', 'Oracle'] },
  { c: 'TypeScript', q: 'What does TypeScript add to JavaScript?', a: 'Static types', w: ['A new runtime', 'Garbage collection', 'A virtual DOM'] },
  { c: 'TypeScript', q: 'Which type forces you to check a value before you can use it?', a: 'unknown', w: ['any', 'void', 'object'] },
  { c: 'TypeScript', q: 'What does a ? after a property name mean in an interface?', a: 'The property is optional', w: ['The property is read-only', 'The property is private', 'The property is a promise'] },
  { c: 'TypeScript', q: 'Which utility type makes every property of T optional?', a: 'Partial<T>', w: ['Optional<T>', 'Maybe<T>', 'Required<T>'] },

  // ---------- Git ----------
  { c: 'Git', q: 'What does git stash do?', a: 'Shelves uncommitted changes for later', w: ['Deletes your last commit', 'Pushes to the remote', 'Creates a new branch'] },
  { c: 'Git', q: 'What is a .gitignore file for?', a: 'Telling Git which files not to track', w: ['Storing commit messages', 'Listing remote branches', 'Encrypting secrets'] },
  { c: 'Git', q: 'Which command creates a new branch and switches to it?', a: 'git checkout -b', w: ['git branch -d', 'git merge --new', 'git push --branch'] },
  { c: 'Git', q: 'What does git clone do?', a: 'Copies a remote repository to your machine', w: ['Duplicates a branch on the server', 'Deletes the history', 'Stages every file'] },
  { c: 'Git', q: 'What does git pull do?', a: 'Fetches and merges changes from the remote', w: ['Uploads your commits', 'Deletes the local branch', 'Creates a tag'] },
  { c: 'Git', q: 'What does git rebase do?', a: 'Replays your commits on top of another base', w: ['Deletes the remote branch', 'Reverts the last commit', 'Squashes every file into one'] },
  { c: 'Git', q: 'What does git commit --amend do?', a: 'Modifies the most recent commit', w: ['Creates a new branch', 'Force-pushes to the remote', 'Resets the working directory'] },
  { c: 'Git', q: 'In Git, what is HEAD?', a: 'A pointer to your current checked-out commit', w: ['The very first commit', 'The remote server', 'The staging area'] },

  // ---------- Web & HTTP ----------
  { c: 'Web', q: 'Which HTTP status code means "Not Found"?', a: '404', w: ['401', '403', '500'] },
  { c: 'Web', q: 'What does JSON stand for?', a: 'JavaScript Object Notation', w: ['Java Standard Object Naming', 'JavaScript Online Network', 'Joined Script Object Node'] },
  { c: 'Web', q: 'What is the default port for HTTPS?', a: '443', w: ['80', '21', '8080'] },
  { c: 'Web', q: 'What does DOM stand for?', a: 'Document Object Model', w: ['Data Object Mapping', 'Dynamic Output Method', 'Document Order Markup'] },
  { c: 'Web', q: 'What does API stand for?', a: 'Application Programming Interface', w: ['Applied Program Integration', 'Automated Process Instruction', 'Application Protocol Index'] },
  { c: 'Web', q: 'HTTP status codes in the 5xx range mean what?', a: 'Server errors', w: ['Redirects', 'Client errors', 'Success'] },
  { c: 'Web', q: 'Which HTTP method is meant to fully replace a resource?', a: 'PUT', w: ['GET', 'HEAD', 'OPTIONS'] },
  { c: 'Web', q: 'Which HTTP status code means "Too Many Requests"?', a: '429', w: ['408', '451', '503'] },
  { c: 'Web', q: 'What does a 301 status code mean?', a: 'Moved permanently', w: ['Not modified', 'Unauthorized', 'Bad gateway'] },
  { c: 'Web', q: 'What does CORS stand for?', a: 'Cross-Origin Resource Sharing', w: ['Cross-Origin Request Security', 'Common Origin Routing System', 'Client-Origin Response Sharing'] },
  { c: 'Web', q: 'Which HTTP method is typically used to create a resource?', a: 'POST', w: ['GET', 'DELETE', 'HEAD'] },
  { c: 'Web', q: 'What does DNS do?', a: 'Translates domain names into IP addresses', w: ['Encrypts web traffic', 'Compresses images', 'Hosts web pages'] },
  { c: 'Web', q: 'What does a CDN do?', a: 'Serves content from servers close to the user', w: ['Compiles your code', 'Manages your database', 'Writes your CSS'] },
  { c: 'Web', q: 'What does REST stand for?', a: 'Representational State Transfer', w: ['Remote Server Transfer', 'Rapid Service Technology', 'Resource Sync Tunnel'] },
  { c: 'Web', q: 'What is a WebSocket used for?', a: 'Keeping a two-way connection open between browser and server', w: ['Sending one request per page', 'Downloading images only', 'Encrypting passwords'] },
  { c: 'Web', q: 'How does localStorage differ from sessionStorage?', a: 'localStorage persists after the tab closes', w: ['sessionStorage persists forever', 'Both clear on every reload', 'localStorage is sent with every request'] },
  { c: 'Web', q: 'What does URL stand for?', a: 'Uniform Resource Locator', w: ['Universal Resource Link', 'Uniform Routing Label', 'Unified Remote Locator'] },
  { c: 'Web', q: 'Which response header sets a cookie in the browser?', a: 'Set-Cookie', w: ['Cookie-Set', 'X-Cookie', 'Authorization'] },
  { c: 'Web', q: 'Which HTTP status code means "OK"?', a: '200', w: ['201', '204', '302'] },
  { c: 'Web', q: 'What does WCAG focus on?', a: 'Web accessibility', w: ['Web caching', 'Web graphics', 'Web payments'] },
  { c: 'Web', q: 'What does responsive design mean?', a: 'Layouts adapt to different screen sizes', w: ['Pages load instantly', 'The server replies quickly', 'Buttons make sounds when clicked'] },

  // ---------- Computer science ----------
  { c: 'CS', q: 'What is the time complexity of binary search?', a: 'O(log n)', w: ['O(n)', 'O(1)', 'O(n²)'] },
  { c: 'CS', q: 'Which data structure follows LIFO order?', a: 'Stack', w: ['Queue', 'Heap', 'Graph'] },
  { c: 'CS', q: 'What is the time complexity of reading an array element by index?', a: 'O(1)', w: ['O(log n)', 'O(n)', 'O(n log n)'] },
  { c: 'CS', q: 'Which data structure follows FIFO order?', a: 'Queue', w: ['Stack', 'Tree', 'Heap'] },
  { c: 'CS', q: 'Which sorting algorithm is divide-and-conquer with O(n log n) average time?', a: 'Merge sort', w: ['Bubble sort', 'Insertion sort', 'Selection sort'] },
  { c: 'CS', q: 'What does Big O notation describe?', a: 'How runtime or memory grows with input size', w: ['The exact running time in milliseconds', 'The number of bugs in code', 'The size of a codebase'] },
  { c: 'CS', q: 'How many bits are in a byte?', a: '8', w: ['4', '16', '32'] },
  { c: 'CS', q: 'What is recursion?', a: 'A function that calls itself', w: ['Running code in parallel', 'Caching results', 'A function with no arguments'] },
  { c: 'CS', q: 'What is the decimal number 5 in binary?', a: '101', w: ['110', '011', '100'] },
  { c: 'CS', q: 'What is the average lookup time of a hash table?', a: 'O(1)', w: ['O(n)', 'O(log n)', 'O(n²)'] },
  { c: 'CS', q: 'Which data structure does breadth-first search use?', a: 'Queue', w: ['Stack', 'Heap', 'Linked list'] },
  { c: 'CS', q: 'What does the DRY principle stand for?', a: 'Don\'t Repeat Yourself', w: ['Do Review Yearly', 'Debug, Run, Yield', 'Deploy Right Yesterday'] },
  { c: 'CS', q: 'How many different symbols does hexadecimal use?', a: '16', w: ['8', '10', '12'] },
  { c: 'CS', q: 'What does a compiler do?', a: 'Translates source code into machine code or another language', w: ['Formats your code', 'Manages your packages', 'Hosts your repository'] },
  { c: 'CS', q: 'What does RAM stand for?', a: 'Random Access Memory', w: ['Rapid Application Memory', 'Read And Modify', 'Random Allocation Module'] },
  { c: 'CS', q: 'Which OOP principle lets a class reuse another class\'s behavior?', a: 'Inheritance', w: ['Encapsulation', 'Serialization', 'Recursion'] },
  { c: 'CS', q: 'What is the worst-case time complexity of bubble sort?', a: 'O(n²)', w: ['O(n)', 'O(log n)', 'O(n log n)'] },
  { c: 'CS', q: 'What commonly causes a stack overflow error?', a: 'Infinite or very deep recursion', w: ['Too many CSS rules', 'A slow network', 'Unused variables'] },
  { c: 'CS', q: 'In SOLID, what does the "S" stand for?', a: 'Single Responsibility', w: ['Static Typing', 'Separation of Services', 'Shared State'] },

  // ---------- Databases ----------
  { c: 'SQL', q: 'Which SQL clause filters groups after GROUP BY?', a: 'HAVING', w: ['WHERE', 'FILTER', 'ORDER BY'] },
  { c: 'SQL', q: 'Which SQL statement retrieves data from a table?', a: 'SELECT', w: ['GET', 'PULL', 'OPEN'] },
  { c: 'SQL', q: 'Which SQL keyword removes duplicate rows from results?', a: 'DISTINCT', w: ['UNIQUE', 'ONLY', 'SINGLE'] },
  { c: 'SQL', q: 'What does a PRIMARY KEY do?', a: 'Uniquely identifies each row', w: ['Encrypts a column', 'Sorts the table', 'Links to another database'] },
  { c: 'SQL', q: 'Which JOIN returns only rows that match in both tables?', a: 'INNER JOIN', w: ['LEFT JOIN', 'CROSS JOIN', 'OUTER JOIN'] },
  { c: 'SQL', q: 'What does the "A" in ACID stand for?', a: 'Atomicity', w: ['Availability', 'Accuracy', 'Authentication'] },
  { c: 'SQL', q: 'What is a database index for?', a: 'Speeding up lookups on a column', w: ['Backing up the table', 'Encrypting the data', 'Deleting old rows'] },
  { c: 'SQL', q: 'Which SQL clause sorts the results?', a: 'ORDER BY', w: ['GROUP BY', 'ARRANGE', 'SORT'] },
  { c: 'SQL', q: 'MongoDB stores data as what?', a: 'JSON-like documents', w: ['Rows in tables', 'Spreadsheet files', 'Binary images only'] },

  // ---------- Python ----------
  { c: 'Python', q: 'In Python, which creates an empty dictionary?', a: '{}', w: ['[]', '()', '<>'] },
  { c: 'Python', q: 'Which keyword defines a function in Python?', a: 'def', w: ['func', 'function', 'fn'] },
  { c: 'Python', q: 'How does a single-line comment start in Python?', a: '#', w: ['//', '/*', '--'] },
  { c: 'Python', q: 'Which of these is immutable in Python?', a: 'tuple', w: ['list', 'dict', 'set'] },
  { c: 'Python', q: 'What does range(3) produce?', a: '0, 1, 2', w: ['1, 2, 3', '0, 1, 2, 3', '3'] },
  { c: 'Python', q: 'What does Python use indentation for?', a: 'Defining code blocks', w: ['Style only, it is optional', 'Marking comments', 'Declaring variables'] },
  { c: 'Python', q: 'What is PEP 8?', a: 'Python\'s style guide', w: ['A package manager', 'A web framework', 'A testing tool'] },
  { c: 'Python', q: 'Who created Python?', a: 'Guido van Rossum', w: ['Linus Torvalds', 'Brendan Eich', 'James Gosling'] },
  { c: 'Python', q: 'What does [x * 2 for x in [1, 2, 3]] produce?', a: '[2, 4, 6]', w: ['[1, 4, 9]', '[2, 3, 4]', '[1, 2, 3, 2]'] },
  { c: 'Python', q: 'What is pip?', a: 'Python\'s package installer', w: ['A debugger', 'A code formatter', 'A virtual machine'] },

  // ---------- Tools & workflow ----------
  { c: 'Tools', q: 'Which command installs the dependencies listed in package.json?', a: 'npm install', w: ['npm publish', 'npm init', 'npm audit'] },
  { c: 'Tools', q: 'What does CI/CD stand for?', a: 'Continuous Integration / Continuous Delivery', w: ['Code Inspection / Code Debugging', 'Central Index / Central Database', 'Compile Instantly / Compile Directly'] },
  { c: 'Tools', q: 'Docker packages applications into what?', a: 'Containers', w: ['Spreadsheets', 'Browsers', 'Compilers'] },
  { c: 'Tools', q: 'Which of these is a JavaScript bundler?', a: 'Webpack', w: ['Photoshop', 'Postman', 'Figma'] },
  { c: 'Tools', q: 'Which of these is a CSS framework?', a: 'Tailwind CSS', w: ['Express', 'Django', 'Jest'] },
  { c: 'Tools', q: 'Which of these is a JavaScript testing framework?', a: 'Jest', w: ['Sass', 'Prettier', 'Nodemon'] },
  { c: 'Tools', q: 'What does a linter do?', a: 'Flags problems and style issues in code', w: ['Compiles code', 'Deploys code', 'Hosts repositories'] },
  { c: 'Tools', q: 'What does IDE stand for?', a: 'Integrated Development Environment', w: ['Internal Debug Engine', 'Interactive Design Editor', 'Integrated Deployment Engine'] },
  { c: 'Tools', q: 'Which of these is a Node.js web framework?', a: 'Express', w: ['Flask', 'Rails', 'Laravel'] },
  { c: 'Tools', q: 'Which Markdown syntax creates a level-1 heading?', a: '# Title', w: ['== Title', '*** Title', '1. Title'] },
  { c: 'Tools', q: 'What does SSH stand for?', a: 'Secure Shell', w: ['Simple Server Host', 'Secure Socket Hub', 'System Shell Host'] },
  { c: 'Tools', q: 'What does localhost refer to?', a: 'Your own computer (127.0.0.1)', w: ['Google\'s servers', 'Your router', 'The nearest CDN'] },
  { c: 'Tools', q: 'What does SDK stand for?', a: 'Software Development Kit', w: ['System Design Key', 'Source Debug Kit', 'Standard Deployment Kernel'] },
  { c: 'Tools', q: 'What does LGTM mean in a code review?', a: 'Looks Good To Me', w: ['Let\'s Get This Merged', 'Last Good Test Message', 'Looks Great, Try More'] },
  { c: 'Tools', q: 'What does MVP stand for in product development?', a: 'Minimum Viable Product', w: ['Most Valuable Programmer', 'Maximum Viable Plan', 'Minimal Version Pipeline'] },
  { c: 'Tools', q: 'What does UX stand for?', a: 'User Experience', w: ['Ultimate Experience', 'User Extension', 'Universal Exchange'] },
  { c: 'Tools', q: 'What is "rubber duck debugging"?', a: 'Explaining your code line by line to find the bug', w: ['Typing on a duck-shaped keyboard', 'Debugging only on Fridays', 'A tool that auto-fixes bugs'] },

  // ---------- Security ----------
  { c: 'Security', q: 'What does XSS stand for?', a: 'Cross-Site Scripting', w: ['Extra Style Sheets', 'Cross-Server Syntax', 'XML Secure Socket'] },
  { c: 'Security', q: 'What is the best defence against SQL injection?', a: 'Parameterized queries', w: ['Minifying your code', 'Using longer variable names', 'Adding more indexes'] },
  { c: 'Security', q: 'Why are passwords hashed before being stored?', a: 'So only a one-way fingerprint is kept, not the password', w: ['So they can be decrypted later', 'So they take less space', 'So they can be emailed safely'] },
  { c: 'Security', q: 'What does HTTPS add over HTTP?', a: 'Encrypted traffic between browser and server', w: ['Faster image loading', 'Built-in ad blocking', 'Complete anonymity'] },
  { c: 'Security', q: 'What does CSRF stand for?', a: 'Cross-Site Request Forgery', w: ['Cross-Server Rendering Failure', 'Client-Side Request Filter', 'Cached Site Redirect Flow'] },
  { c: 'Security', q: 'Where should API secrets never be placed?', a: 'In client-side frontend code', w: ['In environment variables', 'In a secrets manager', 'In server-side config'] },

  // ---------- Dev culture ----------
  { c: 'Culture', q: 'Who created the Linux kernel?', a: 'Linus Torvalds', w: ['Dennis Ritchie', 'Bill Gates', 'Guido van Rossum'] },
  { c: 'Culture', q: 'Which animal is the Linux mascot?', a: 'A penguin (Tux)', w: ['A daemon (Beastie)', 'A paperclip (Clippy)', 'A cat (Octocat)'] },
  { c: 'Culture', q: 'Which mascot belongs to GitHub?', a: 'Octocat', w: ['Tux', 'Ferris', 'Duke'] },
  { c: 'Culture', q: 'Which programming language has a gopher as its mascot?', a: 'Go', w: ['Rust', 'Ruby', 'Swift'] },
]

const TRIVIA_ROUND = 10
const TRIVIA_SECONDS = 15
const MEDALS = ['🥇', '🥈', '🥉']

const DAY_MS = 24 * 60 * 60 * 1000

// Notes disappear 24 hours after they were posted
const NOTE_TTL_MS = DAY_MS
const noteAgeMs = (postedAt?: string | null) => {
  if (!postedAt) return Infinity
  const t = new Date(postedAt).getTime()
  if (Number.isNaN(t)) return Infinity
  return Math.max(0, Date.now() - t) // never negative if another device's clock runs a bit ahead
}
const isNoteLive = (note?: string | null, postedAt?: string | null) =>
  !!note && !!postedAt && noteAgeMs(postedAt) < NOTE_TTL_MS

const MANILA_OFFSET = 8 * 60 * 60 * 1000 // UTC+8

// The leaderboard "day" rolls over at midnight Manila time, so scores refresh every 24 hours
const triviaDay = () => new Date(Date.now() + MANILA_OFFSET).toISOString().slice(0, 10)
const msUntilReset = () => DAY_MS - ((Date.now() + MANILA_OFFSET) % DAY_MS)
const formatReset = (ms: number) => {
  const mins = Math.max(1, Math.ceil(ms / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

interface TriviaQuestion {
  c: string
  q: string
  options: string[]
  answer: number
}

// Remember which questions you've already been dealt so a new round
// prefers ones you haven't seen. Once the whole bank has been used, it starts over.
const SEEN_KEY = 'lounge_trivia_seen'
const readSeen = (): Set<string> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
const saveSeen = (seen: Set<string>) => {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(seen)))
  } catch {
    /* storage unavailable (private mode) — variety still works for this session */
  }
}

function pickRound(seen: Set<string>): TriviaQuestion[] {
  const fresh = TRIVIA_BANK.filter((i) => !seen.has(i.q))
  let chosen: TriviaItem[]
  if (fresh.length >= TRIVIA_ROUND) {
    chosen = shuffle(fresh).slice(0, TRIVIA_ROUND)
  } else {
    // bank nearly used up: take what's left unseen, top up from the rest, begin a new cycle
    const used = TRIVIA_BANK.filter((i) => seen.has(i.q))
    chosen = [...shuffle(fresh), ...shuffle(used)].slice(0, TRIVIA_ROUND)
    seen.clear()
  }
  chosen.forEach((i) => seen.add(i.q))
  return shuffle(chosen).map((item) => {
    const options = shuffle([item.a, ...item.w])
    return { c: item.c, q: item.q, options, answer: options.indexOf(item.a) }
  })
}

const bestKey = (day: string) => `lounge_trivia_best_${day}`
const readBest = (day: string) => {
  try {
    return Number(localStorage.getItem(bestKey(day))) || 0
  } catch {
    return 0
  }
}
const saveBest = (day: string, value: number) => {
  try {
    localStorage.setItem(bestKey(day), String(value))
  } catch {
    /* storage unavailable (private mode) — not worth interrupting the game */
  }
}

const verdictFor = (correct: number) =>
  correct >= 9 ? 'Dev legend 🏆' : correct >= 7 ? 'Solid work 💪' : correct >= 4 ? 'Getting there 🌱' : 'Warm-up round 😅'

type StepResult = 'right' | 'wrong' | 'skip'

const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

interface LeaderRow {
  deviceId: string
  name: string
  avatarSeed: string
  score: number
}

interface DevTriviaProps {
  deviceId: string
  userName: string
  avatarSalt: string
  refreshKey: number // bumps when someone else finishes a round
  onFinished: (score: number, correct: number) => void
  onShare: (text: string) => void
}

function DevTrivia({ deviceId, userName, avatarSalt, refreshKey, onFinished, onShare }: DevTriviaProps) {
  const [day, setDay] = useState(triviaDay)
  const [round, setRound] = useState<TriviaQuestion[]>([])
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>('intro')
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [log, setLog] = useState<StepResult[]>([])
  const [picked, setPicked] = useState<number | null>(null) // -1 = ran out of time
  const [gain, setGain] = useState(0)
  const [timeLeft, setTimeLeft] = useState(TRIVIA_SECONDS)
  const [best, setBest] = useState(() => readBest(triviaDay()))
  const [shared, setShared] = useState(false)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [boardState, setBoardState] = useState<'loading' | 'ok' | 'offline'>('loading')
  const [resetIn, setResetIn] = useState(msUntilReset)

  const deadlineRef = useRef(0)
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dayRef = useRef(day)
  const seenRef = useRef<Set<string> | null>(null)

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current)
    },
    [],
  )

  // Moves to the new leaderboard day the moment the 24h window rolls over
  const syncDay = () => {
    const today = triviaDay()
    if (today !== dayRef.current) {
      dayRef.current = today
      setDay(today)
      setBest(readBest(today))
    }
    return today
  }

  // Keeps the "resets in" countdown fresh and flips to the new day at midnight
  useEffect(() => {
    const tick = () => {
      setResetIn(msUntilReset())
      syncDay()
    }
    tick()
    const timer = setInterval(tick, 30000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadBoard = useCallback(
    async (forDay: string = day) => {
      const { data, error } = await supabase
        .from('lounge_scores')
        .select('device_id, name, avatar_salt, score')
        .eq('day', forDay)
        .order('score', { ascending: false })
        .limit(80)
      if (error || !data) {
        setBoardState('offline')
        return
      }
      // keep each player's best score only
      const seen = new Set<string>()
      const rows: LeaderRow[] = []
      for (const r of data as any[]) {
        if (seen.has(r.device_id)) continue
        seen.add(r.device_id)
        rows.push({ deviceId: r.device_id, name: r.name, avatarSeed: `${r.name}-${r.avatar_salt}`, score: r.score })
      }
      setBoard(rows)
      setBoardState('ok')
    },
    [day],
  )

  useEffect(() => {
    loadBoard()
  }, [loadBoard, refreshKey])

  const finish = async (finalScore: number, finalCorrect: number) => {
    setPhase('done')
    const today = syncDay()
    const prevBest = readBest(today)
    if (finalScore > prevBest) saveBest(today, finalScore)
    setBest(Math.max(prevBest, finalScore))
    if (!userName) return

    // Play win sound if score is decent
    if (finalCorrect >= 5) {
      sounds.playSfx('win')
    }

    const { error } = await supabase.from('lounge_scores').insert([
      { device_id: deviceId, name: userName, avatar_salt: avatarSalt, score: finalScore, correct: finalCorrect, day: today },
    ])
    if (error) {
      setBoardState('offline')
      return
    }
    onFinished(finalScore, finalCorrect)
    loadBoard(today)
  }

  const answer = (choice: number) => {
    if (phase !== 'playing' || picked !== null) return
    const q = round[index]
    if (!q) return
    const ok = choice === q.answer
    const left = choice === -1 ? 0 : Math.max(0, (deadlineRef.current - Date.now()) / 1000)

    let gained = 0
    let nextStreak = 0
    if (ok) {
      nextStreak = streak + 1
      // 100 for being right + up to 50 for speed + a small streak bonus
      gained = 100 + Math.round((left / TRIVIA_SECONDS) * 50) + Math.min(nextStreak - 1, 5) * 10
      sounds.playSfx('correct')
    } else {
      sounds.playSfx('wrong')
    }
    const newScore = score + gained
    const newCorrect = correct + (ok ? 1 : 0)

    setStreak(nextStreak)
    setBestStreak((b) => Math.max(b, nextStreak))
    setScore(newScore)
    setCorrect(newCorrect)
    setGain(gained)
    setPicked(choice)
    setLog((l) => [...l, ok ? 'right' : choice === -1 ? 'skip' : 'wrong'])

    advanceRef.current = setTimeout(() => {
      if (index + 1 >= round.length) {
        finish(newScore, newCorrect)
      } else {
        setIndex(index + 1)
        setPicked(null)
      }
    }, 1300)
  }

  // Countdown for the current question
  useEffect(() => {
    if (phase !== 'playing' || picked !== null) return
    deadlineRef.current = Date.now() + TRIVIA_SECONDS * 1000
    setTimeLeft(TRIVIA_SECONDS)
    const timer = setInterval(() => {
      const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000)
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(timer)
        answer(-1)
      }
    }, 100)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index, picked])

  // Keys 1–4 pick an answer
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 4 && !e.metaKey && !e.ctrlKey && !e.altKey) answer(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const start = () => {
    if (advanceRef.current) clearTimeout(advanceRef.current)
    syncDay()
    if (!seenRef.current) seenRef.current = readSeen()
    // a brand-new set of questions every single time you play
    const next = pickRound(seenRef.current)
    saveSeen(seenRef.current)
    setRound(next)
    setIndex(0)
    setScore(0)
    setCorrect(0)
    setStreak(0)
    setBestStreak(0)
    setLog([])
    setGain(0)
    setPicked(null)
    setShared(false)
    setPhase('playing')
    sounds.playSfx('start')
  }

  const myIdx = board.findIndex((r) => r.deviceId === deviceId)
  const topScore = board[0]?.score || 1
  const rowStyle = (score: number) => ({ '--pct': `${Math.max(6, Math.round((score / topScore) * 100))}%` }) as CSSProperties

  const boardEl = (
    <section className="lounge-board" aria-label="Today's leaderboard">
      <div className="lounge-board__head">
        <div>
          <h4>Leaderboard</h4>
          <p>Best score of the day</p>
        </div>
        <span className="lounge-board__reset" title="The leaderboard refreshes every 24 hours">
          <svg {...iconProps} width={12} height={12}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Resets in {formatReset(resetIn)}
        </span>
      </div>
      {boardState === 'loading' && <p className="lounge-game__note">Loading scores…</p>}
      {boardState === 'offline' && (
        <p className="lounge-game__note">The leaderboard is offline right now. You can still play and share your score in chat.</p>
      )}
      {boardState === 'ok' && board.length === 0 && (
        <p className="lounge-game__note">Fresh board, no scores yet. Be the first one on it!</p>
      )}
      {boardState === 'ok' && board.length > 0 && (
        <ol className="lounge-board__list">
          {board.slice(0, 10).map((r, i) => (
            <li
              key={r.deviceId}
              className={`lounge-board__row${r.deviceId === deviceId ? ' is-me' : ''}${i < 3 ? ` is-top is-top-${i + 1}` : ''}`}
              style={rowStyle(r.score)}
            >
              <span className="lounge-board__rank">{MEDALS[i] ?? i + 1}</span>
              <LoungeAvatar seed={r.avatarSeed} size={28} />
              <span className="lounge-board__name">{r.deviceId === deviceId ? 'You' : r.name}</span>
              <span className="lounge-board__score">{r.score}</span>
            </li>
          ))}
          {myIdx >= 10 && (
            <li className="lounge-board__row is-me" style={rowStyle(board[myIdx].score)}>
              <span className="lounge-board__rank">{myIdx + 1}</span>
              <LoungeAvatar seed={board[myIdx].avatarSeed} size={28} />
              <span className="lounge-board__name">You</span>
              <span className="lounge-board__score">{board[myIdx].score}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  )

  const stepsEl = (
    <div className="lounge-game__steps" aria-hidden="true">
      {Array.from({ length: round.length }, (_, i) => {
        const state = log[i] ?? (i === index && phase === 'playing' ? 'current' : 'todo')
        return <i key={i} className={`is-${state}`} />
      })}
    </div>
  )

  if (phase === 'playing' && round[index]) {
    const q = round[index]
    const low = timeLeft <= 5
    const frac = Math.min(1, Math.max(0, timeLeft / TRIVIA_SECONDS))
    return (
      <div className="lounge-game lounge-game--play" key={`q-${index}`}>
        <div className="lounge-game__top">
          <div className="lounge-game__meta">
            <span className="lounge-game__cat">{q.c}</span>
            <span className="lounge-game__count">
              Question {index + 1} of {round.length}
            </span>
          </div>
          <div className={`lounge-game__ring${low && picked === null ? ' is-low' : ''}`} role="timer" aria-label={`${Math.ceil(timeLeft)} seconds left`}>
            <svg viewBox="0 0 44 44" aria-hidden="true">
              <circle className="lounge-game__ring-bg" cx="22" cy="22" r={RING_R} />
              <circle
                className="lounge-game__ring-fg"
                cx="22"
                cy="22"
                r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - frac)}
              />
            </svg>
            <b>{Math.ceil(timeLeft)}</b>
          </div>
        </div>

        {stepsEl}

        <h3 className="lounge-game__q">{q.q}</h3>

        <div className="lounge-game__opts">
          {q.options.map((opt, i) => {
            const state =
              picked === null ? '' : i === q.answer ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim'
            return (
              <button
                key={i}
                type="button"
                className={`lounge-game__opt${state}`}
                style={{ '--i': i } as CSSProperties}
                onClick={() => answer(i)}
                disabled={picked !== null}
              >
                <span className="lounge-game__key">{i + 1}</span>
                <span className="lounge-game__opt-text">{opt}</span>
              </button>
            )
          })}
        </div>

        <div className="lounge-game__feedback" aria-live="polite">
          {picked === -1 && <span className="is-bad">Time's up! The answer was {q.options[q.answer]}</span>}
          {picked !== null && picked !== -1 && picked === q.answer && (
            <span className="is-good">
              Correct! <b>+{gain}</b>
            </span>
          )}
          {picked !== null && picked !== -1 && picked !== q.answer && (
            <span className="is-bad">Not quite. The answer was {q.options[q.answer]}</span>
          )}
        </div>

        <div className="lounge-game__foot">
          <span className="lounge-game__score">⚡ {score} pts</span>
          {streak >= 2 && <span className="lounge-game__streak">🔥 {streak} in a row</span>}
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const shareText = `🧠 I scored ${score} on today's Dev Trivia (${correct}/${round.length} correct). Think you can beat me?`
    const accuracy = round.length ? Math.round((correct / round.length) * 100) : 0
    return (
      <>
        <div className="lounge-game lounge-game--result">
          <span className="lounge-game__verdict">{verdictFor(correct)}</span>
          <div className="lounge-game__big">
            {score}
            <small>pts</small>
          </div>
          <p className="lounge-game__sub">
            {correct} of {round.length} correct
            {myIdx >= 0 && boardState === 'ok' ? ` · you're #${myIdx + 1} today` : ''}
          </p>

          {stepsEl}

          <div className="lounge-game__stats">
            <div>
              <b>{accuracy}%</b>
              <span>Accuracy</span>
            </div>
            <div>
              <b>{bestStreak}</b>
              <span>Best streak</span>
            </div>
            <div>
              <b>{best}</b>
              <span>Best today</span>
            </div>
          </div>

          <div className="lounge-game__actions">
            <button type="button" className="lounge-game__btn" onClick={start}>
              Play again · new questions
            </button>
            <button
              type="button"
              className="lounge-game__btn is-ghost"
              onClick={() => {
                onShare(shareText)
                setShared(true)
              }}
              disabled={shared || !userName}
            >
              {shared ? 'Shared ✓' : 'Share to chat'}
            </button>
          </div>
          <p className="lounge-game__note">Every round is a brand-new set. Only your best score of the day counts.</p>
        </div>
        {boardEl}
      </>
    )
  }

  return (
    <>
      <div className="lounge-game lounge-game--center lounge-game--intro">
        <div className="lounge-game__glow" aria-hidden="true" />
        <div className="lounge-game__badge" aria-hidden="true">
          🧠
        </div>
        <span className="lounge-game__eyebrow">Daily challenge</span>
        <h3 className="lounge-game__title">Dev Trivia</h3>
        <p className="lounge-game__sub">
          Test your dev knowledge against the lounge. Answer fast and build a streak for bonus points.
        </p>
        <ul className="lounge-game__facts">
          <li>
            <b>{TRIVIA_ROUND}</b> questions
          </li>
          <li>
            <b>{TRIVIA_SECONDS}s</b> each
          </li>
          <li>
            <b>New</b> set every play
          </li>
        </ul>
        {best > 0 && (
          <div className="lounge-game__chip">
            <span>Your best today</span>
            <b>{best}</b>
          </div>
        )}
        <div className="lounge-game__actions">
          <button type="button" className="lounge-game__btn" onClick={start} disabled={!userName}>
            {best > 0 ? 'Play again' : 'Start playing'}
          </button>
        </div>
      </div>
      {boardEl}
    </>
  )
}

/* ---------- Lounge music player (YouTube) ----------
   Personal player: paste YouTube links, build a queue, listen while you chat.
   Uses the official YouTube IFrame API, so the small video must stay visible (YouTube's rules).
   Queue + volume are remembered on this device. Playback never starts on its own. */

interface MusicTrack {
  id: string // YouTube video id
  title: string
}

const MUSIC_KEY = 'lounge_music_v1'
// Where the person dragged the music pill to (null = default spot). Stored per device.
const MUSIC_POS_KEY = 'lounge_music_pos_v1'
type MusicPos = { x: number; y: number }
function readMusicPos(): MusicPos | null {
  try {
    const raw = localStorage.getItem(MUSIC_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return typeof p?.x === 'number' && typeof p?.y === 'number' ? { x: p.x, y: p.y } : null
  } catch {
    return null
  }
}
// Built-in stations: `/play lofi` works with no search key at all
const STATIONS: { key: string; label: string; track: MusicTrack }[] = [
  { key: 'lofi', label: '☕ Lofi', track: { id: 'jfKfPfyJRdk', title: 'lofi hip hop radio' } },
  { key: 'synthwave', label: '🌆 Synthwave', track: { id: '4xDzrJKXOOY', title: 'synthwave radio' } },
  { key: 'chillhop', label: '🌿 Chillhop', track: { id: '5yx6BWlEVcY', title: 'chillhop radio' } },
]
const findStation = (q: string) => {
  const key = q.toLowerCase().trim().replace(/\s*(radio|beats|music)$/, '')
  return STATIONS.find((st) => st.key === key)
}

// Song-name search uses the YouTube Data API. Put a key in VITE_YOUTUBE_API_KEY (see notes).
const YT_KEY: string = ((import.meta as any).env?.VITE_YOUTUBE_API_KEY as string | undefined) ?? ''
const decodeEntities = (t: string) => new DOMParser().parseFromString(t, 'text/html').documentElement.textContent ?? t

async function searchYouTube(query: string): Promise<MusicTrack | null> {
  const run = async (music: boolean) => {
    const url =
      'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=1' +
      (music ? '&videoCategoryId=10' : '') +
      `&q=${encodeURIComponent(query)}&key=${YT_KEY}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(res.status === 403 ? 'quota' : 'search')
    const json = await res.json()
    const item = json.items?.[0]
    return item?.id?.videoId ? { id: item.id.videoId as string, title: decodeEntities(item.snippet?.title ?? query) } : null
  }
  return (await run(true)) ?? (await run(false))
}

const parseYouTubeId = (input: string): string | null => {
  const raw = input.trim()
  if (/^[\w-]{11}$/.test(raw)) return raw
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    const host = url.hostname.replace(/^www\.|^m\.|^music\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else {
        const m = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname)
        id = m ? m[1] : null
      }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

let ytApiPromise: Promise<any> | null = null
const loadYouTubeApi = (): Promise<any> => {
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve, reject) => {
    const w = window as any
    if (w.YT?.Player) return resolve(w.YT)
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(w.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.onerror = () => {
      ytApiPromise = null
      reject(new Error('YouTube could not be loaded'))
    }
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

const readMusic = (key: string = MUSIC_KEY): { tracks: MusicTrack[]; index: number; volume: number } => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}')
    const tracks: MusicTrack[] = Array.isArray(parsed.tracks)
      ? parsed.tracks.filter((t: any) => t && typeof t.id === 'string' && typeof t.title === 'string')
      : []
    const volume = Number.isFinite(parsed.volume) ? Math.min(100, Math.max(0, parsed.volume)) : 35
    const index = Number.isInteger(parsed.index) && parsed.index >= 0 && parsed.index < tracks.length ? parsed.index : 0
    return { tracks, index, volume }
  } catch {
    return { tracks: [], index: 0, volume: 35 }
  }
}

const PlayIcon = () => (
  <svg {...iconProps} fill="currentColor" stroke="none">
    <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
  </svg>
)
const PauseIcon = () => (
  <svg {...iconProps} fill="currentColor" stroke="none">
    <rect x="6" y="5" width="4.5" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4.5" height="14" rx="1.2" />
  </svg>
)
const SkipIcon = ({ back }: { back?: boolean }) => (
  <svg {...iconProps} fill="currentColor" stroke="none" style={back ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M6 5.5v13a1 1 0 0 0 1.5.86l8.5-6.5a1 1 0 0 0 0-1.72L7.5 4.64A1 1 0 0 0 6 5.5Z" />
    <rect x="17" y="5" width="2.6" height="14" rx="1.2" />
  </svg>
)
const NoteIcon = () => (
  <svg {...iconProps}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="17" cy="16" r="3" />
  </svg>
)

function LoungeMusic({
  open,
  covered = false,
  suppressed = false,
  others = [],
  onNowPlaying,
  commandRef,
  slotRef,
  variant = 'global',
  storageKey = MUSIC_KEY,
  liveLabel = 'Playing in the lounge',
  pinned = false,
  away = false,
}: {
  open: boolean
  away?: boolean // global player only: the header pill is tucked away (Chill Zone open / radio hidden); audio keeps playing
  suppressed?: boolean // global player only: a group's own player is showing, so this one steps aside
  covered?: boolean // a sheet (new group, new message, avatar picker...) is open over the lounge
  others?: LoungeListener[] // other members who are playing a song right now
  onNowPlaying?: (track: LoungeNowPlaying | null) => void // tells everyone what I'm playing
  commandRef: { current: (text: string) => boolean }
  slotRef?: { current: HTMLDivElement | null } // global player only: the header slot it docks into
  // 'group' = a group chat's own player: it sits in that chat's header, has its own queue + volume,
  // and pauses when you leave the group or close the lounge. The global player is untouched.
  variant?: 'global' | 'group'
  storageKey?: string // where this player's queue + volume are remembered on this device
  liveLabel?: string
  pinned?: boolean // desktop Chill Zone: the playlist panel is always open and the pill is hidden
}) {
  const isGroup = variant === 'group'
  const saved = useRef(readMusic(storageKey)).current
  const [tracks, setTracks] = useState<MusicTrack[]>(saved.tracks)
  const [index, setIndex] = useState(saved.index)
  const [volume, setVolume] = useState(saved.volume)
  const [playing, setPlaying] = useState(false)
  const [expandedState, setExpanded] = useState(false)
  const expanded = pinned || expandedState
  const [input, setInput] = useState('')
  const [note, setNote] = useState('')
  const [active, setActive] = useState(false) // a song is loaded (playing or paused): keeps the floating player on screen
  const [dock, setDock] = useState<{ top: number; left: number } | null>(null)
  const [pos, setPos] = useState<MusicPos | null>(() => (isGroup ? null : readMusicPos())) // dragged position (null = default spot)
  const [dragging, setDragging] = useState(false)
  // Follow mode: someone else started a song, so this player plays the same song at the same second.
  // While following I do NOT announce anything (only the person who pressed play is the "host").
  const [following, setFollowing] = useState(false)
  const [loadedVid, setLoadedVid] = useState('') // the YouTube id the player is actually playing right now
  const followingRef = useRef(false)
  const hostingRef = useRef(false) // I pressed play myself and I am playing
  const myStartRef = useRef(0) // when my own song started (used to decide who "pressed play last")
  const userPausedKeyRef = useRef('') // the host song I paused on purpose: don't force it back on me
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const playerPromise = useRef<Promise<any> | null>(null)
  const loadedRef = useRef(false) // has a video been loaded into the player yet?
  const tracksRef = useRef(tracks)
  const indexRef = useRef(index)
  const volumeRef = useRef(volume)
  const skipRef = useRef<(dir: 1 | -1) => void>(() => {})
  const finishRef = useRef<() => void>(() => {}) // a song ended: drop it from the list, play the next
  const leaderRef = useRef<LoungeListener | null>(null)
  tracksRef.current = tracks
  indexRef.current = index
  volumeRef.current = volume

  const current: MusicTrack | undefined = tracks[index]

  // remember queue + volume on this device
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ tracks, index, volume }))
    } catch {
      /* storage unavailable: the player still works for this session */
    }
  }, [tracks, index, volume, storageKey])

  const flash = (text: string) => {
    setNote(text)
    window.setTimeout(() => setNote((n) => (n === text ? '' : n)), 4000)
  }

  const ensurePlayer = useCallback((): Promise<any> => {
    if (playerPromise.current) return playerPromise.current
    playerPromise.current = loadYouTubeApi()
      .then(
        (YT) =>
          new Promise<any>((resolve) => {
            const host = document.createElement('div')
            wrapRef.current?.appendChild(host)
            const player = new YT.Player(host, {
              width: '100%',
              height: '100%',
              playerVars: { playsinline: 1, rel: 0, controls: 0, disablekb: 1, modestbranding: 1 },
              events: {
                onReady: () => {
                  player.setVolume(volumeRef.current)
                  playerRef.current = player
                  resolve(player)
                },
                onStateChange: (e: any) => {
                  if (e.data === 1) {
                    setPlaying(true)
                    try {
                      setLoadedVid(player.getVideoData?.()?.video_id ?? '')
                    } catch {
                      /* ignore */
                    }
                  } else if (e.data === 2) setPlaying(false)
                  else if (e.data === 0) {
                    setPlaying(false)
                    if (!followingRef.current) finishRef.current() // following: the host moves on, I just wait for their next song
                  }
                  // swap a placeholder title for the real one once YouTube knows it
                  if (e.data === 1 || e.data === 3) {
                    const title: string | undefined = player.getVideoData?.()?.title
                    const vid: string | undefined = player.getVideoData?.()?.video_id
                    if (title && vid) {
                      setTracks((prev) => prev.map((t) => (t.id === vid && t.title !== title ? { ...t, title } : t)))
                    }
                  }
                },
                onError: () => {
                  flash("That video can't be played here. Skipping.")
                  setPlaying(false)
                  if (!followingRef.current && tracksRef.current.length > 1) skipRef.current(1)
                },
              },
            })
          }),
      )
      .catch((err) => {
        playerPromise.current = null
        flash('Music needs YouTube, and it could not be loaded.')
        throw err
      })
    return playerPromise.current
  }, [])

  const playIndex = useCallback(
    async (i: number) => {
      const track = tracksRef.current[i]
      if (!track) return
      setIndex(i)
      followingRef.current = false // I chose a song myself: I am the host now, everyone else follows me
      setFollowing(false)
      try {
        const player = await ensurePlayer()
        loadedRef.current = true
        setActive(true)
        player.loadVideoById(track.id)
      } catch {
        /* flash() already told the user */
      }
    },
    [ensurePlayer],
  )

  const skip = (dir: 1 | -1) => {
    const list = tracksRef.current
    if (!list.length) return
    playIndex((indexRef.current + dir + list.length) % list.length)
  }
  skipRef.current = skip

  const togglePlay = async () => {
    // Following someone: Play/Pause only affects THIS device. It never starts a second copy of the song.
    if (followingRef.current) {
      try {
        const player = await ensurePlayer()
        if (player.getPlayerState() === 1) {
          userPausedKeyRef.current = leaderKeyRef.current
          player.pauseVideo()
        } else {
          userPausedKeyRef.current = ''
          if (leaderRef.current) followLeader(leaderRef.current)
          else player.playVideo()
        }
      } catch {
        /* flash() already told the user */
      }
      return
    }
    if (!current) {
      setExpanded(true)
      return
    }
    if (!loadedRef.current) {
      playIndex(index)
      return
    }
    try {
      const player = await ensurePlayer()
      if (player.getPlayerState() === 1) player.pauseVideo()
      else player.playVideo()
    } catch {
      /* flash() already told the user */
    }
  }

  const addTrack = (track: MusicTrack, playNow = false) => {
    const startNow = playNow || tracksRef.current.length === 0 || !loadedRef.current
    const nextIndex = tracksRef.current.length
    const next = [...tracksRef.current, track]
    tracksRef.current = next
    setTracks(next)
    if (startNow) playIndex(nextIndex)
    else flash('Added to the queue')
    // fetch a proper title in the background (best effort)
    fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${track.id}`)}&format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.title) setTracks((prev) => prev.map((t) => (t.id === track.id && t.title === track.title ? { ...t, title: j.title } : t)))
      })
      .catch(() => {})
  }

  // Turns "a link", "a station name" or "a song name" into a track and queues/plays it
  const playQuery = async (query: string, playNow: boolean) => {
    const id = parseYouTubeId(query)
    const station = id ? undefined : findStation(query)
    let track: MusicTrack | null = id ? { id, title: 'YouTube video' } : station ? station.track : null
    if (!track) {
      if (!YT_KEY) {
        flash('Song search needs a YouTube API key. For now use /play lofi, or paste a link.')
        return
      }
      flash(`Searching “${query}”…`)
      try {
        track = await searchYouTube(query)
      } catch (err) {
        flash((err as Error).message === 'quota' ? 'YouTube search limit reached for today. Paste a link instead.' : 'Search failed. Check your connection and try again.')
        return
      }
      if (!track) {
        flash(`No results for “${query}”.`)
        return
      }
    }
    addTrack(track, playNow)
    flash(`${playNow ? 'Playing' : 'Added'}: ${track.title}`)
  }

  // Chat commands: /play song · /queue song · /pause · /resume · /skip · /back · /stop · /volume 50
  const runCommand = (raw: string): boolean => {
    const m = /^\/(\w+)\s*([\s\S]*)$/.exec(raw.trim())
    if (!m) return false
    const cmd = m[1].toLowerCase()
    const arg = m[2].trim()
    const player = playerRef.current
    switch (cmd) {
      case 'play':
      case 'p':
        if (arg) playQuery(arg, true)
        else if (tracksRef.current.length && !playing) togglePlay()
        else flash('Try /play song name')
        return true
      case 'queue':
      case 'add':
      case 'q':
        if (arg) playQuery(arg, false)
        else flash('Try /queue song name')
        return true
      case 'pause':
        player?.pauseVideo?.()
        return true
      case 'resume':
      case 'unpause':
        if (tracksRef.current.length && !playing) togglePlay()
        return true
      case 'skip':
      case 'next':
        skip(1)
        return true
      case 'back':
      case 'prev':
      case 'previous':
        skip(-1)
        return true
      case 'stop':
        stopAll()
        return true
      case 'volume':
      case 'vol':
      case 'v': {
        const n = parseInt(arg, 10)
        if (Number.isNaN(n)) flash(`Volume is ${volumeRef.current}. Try /volume 50`)
        else {
          changeVolume(Math.min(100, Math.max(0, n)))
          flash(`Volume ${Math.min(100, Math.max(0, n))}`)
        }
        return true
      }
      case 'music':
      case 'playlist':
        setExpanded(true)
        return true
      case 'help':
        flash('/play song · /queue song · /pause · /resume · /skip · /back · /stop · /volume 50')
        return true
      default:
        return false // not a music command: it is sent as a normal chat message
    }
  }
  commandRef.current = runCommand

  const submitLink = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    if (text.startsWith('/') && runCommand(text)) return
    playQuery(text, false)
  }

  const stopAll = () => {
    if (followingRef.current) userPausedKeyRef.current = leaderKeyRef.current
    followingRef.current = false
    setFollowing(false)
    playerRef.current?.stopVideo?.()
    loadedRef.current = false
    setPlaying(false)
    setActive(false)
    setExpanded(false)
  }

  const removeTrack = (i: number) => {
    const wasCurrent = i === indexRef.current
    const next = tracksRef.current.filter((_, k) => k !== i)
    tracksRef.current = next
    setTracks(next)
    if (!next.length) {
      setIndex(0)
      stopAll()
      return
    }
    if (i < indexRef.current) setIndex(indexRef.current - 1)
    else if (wasCurrent) {
      const ni = Math.min(i, next.length - 1)
      setIndex(ni)
      if (loadedRef.current) playIndex(ni)
    }
  }

  // When a song finishes, take it out of the playlist and move on to the next one
  const finishCurrent = () => {
    const i = indexRef.current
    const list = tracksRef.current
    if (!list[i]) return
    const next = list.filter((_, k) => k !== i)
    tracksRef.current = next
    setTracks(next)
    if (!next.length) {
      setIndex(0)
      stopAll()
      return
    }
    // the next song slides into the finished song's slot (wrap to the start if it was last)
    const ni = i >= next.length ? 0 : i
    setIndex(ni)
    playIndex(ni)
  }
  finishRef.current = finishCurrent

  const changeVolume = (v: number) => {
    setVolume(v)
    playerRef.current?.setVolume?.(v)
  }

  // Closing the lounge, or opening a sheet over it, folds the playlist away (the music keeps playing)
  useEffect(() => {
    if (!open || covered) setExpanded(false)
  }, [open, covered])

  // While the lounge is open the player sits in the header slot; follow that slot's position.
  // (The player lives on the page itself, not inside the modal, so closing the modal can't stop it.)
  useEffect(() => {
    if (!open || isGroup) {
      setDock(null)
      return
    }
    const slot = slotRef?.current
    if (!slot) return
    let raf = 0
    const until = performance.now() + 800 // the modal animates in, so keep measuring for a moment
    const measure = () => {
      const r = slot.getBoundingClientRect()
      if (!r.width || !r.height) return // the slot is hidden: keep the last good spot instead of jumping to 0,0
      let left = r.left
      // never sit on top of the "online" badge: stop the pill's right edge just before the badge
      const badge = slot.closest('.lounge-modal')?.querySelector('.lounge-live-badge--btn') as HTMLElement | null
      const b = badge?.getBoundingClientRect()
      if (b && b.width && r.top < b.bottom && r.top + r.height > b.top && left + r.width > b.left - 14) {
        left = Math.max(0, b.left - 14 - r.width)
      }
      setDock((prev) => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - left) < 0.5 ? prev : { top: r.top, left }))
    }
    const loop = () => {
      measure()
      if (performance.now() < until) raf = requestAnimationFrame(loop)
    }
    loop()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(slot)
    if (slot.parentElement) ro?.observe(slot.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open, slotRef, isGroup])

  // Click anywhere outside the player to close the playlist
  useEffect(() => {
    if (!expanded) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setExpanded(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [expanded])

  useEffect(
    () => () => {
      try {
        playerRef.current?.destroy?.()
      } catch {
        /* already gone */
      }
      playerRef.current = null
      playerPromise.current = null
    },
    [],
  )

  // If I'm not playing anything, the pill shows what someone else in the lounge is playing
  const spotlight = !current && others.length > 0 ? others[0] : null

  // Tell the lounge what I'm playing (null when paused / stopped, and also while I am only following
  // someone else, so followers never echo the song back and the music can't double up)
  const onNowPlayingRef = useRef(onNowPlaying)
  onNowPlayingRef.current = onNowPlaying
  const nowId = playing && current ? current.id : null
  const nowTitle = playing && current ? current.title : ''
  hostingRef.current = !following && !!nowId
  useEffect(() => {
    if (following || !nowId) {
      myStartRef.current = 0
      onNowPlayingRef.current?.(null)
      return
    }
    if (loadedVid !== nowId) return // the player is still switching songs: wait until it really plays this one
    // the exact moment this song was at 0:00, so other devices can jump to the same second
    let startedAt: number | null = null
    try {
      const p = playerRef.current
      if ((p?.getDuration?.() ?? 0) > 0) startedAt = Math.round(Date.now() - (p.getCurrentTime?.() ?? 0) * 1000)
    } catch {
      /* live stream or player not ready: followers just start from the beginning / live edge */
    }
    myStartRef.current = startedAt ?? Date.now()
    onNowPlayingRef.current?.({ id: nowId, title: nowTitle, startedAt })
  }, [nowId, nowTitle, following, loadedVid])

  // ---------- auto-follow: when someone else plays, play the same song at the same second ----------
  // The person who pressed play LAST is the leader (so if two people start songs, everyone settles on the newer one).
  const leader = useMemo<LoungeListener | null>(() => {
    let best: LoungeListener | null = null
    for (const o of others) {
      if (!best) best = o
      else {
        const a = o.startedAt ?? 0
        const b = best.startedAt ?? 0
        if (a > b || (a === b && o.deviceId > best.deviceId)) best = o
      }
    }
    return best
  }, [others])
  leaderRef.current = leader
  const leaderKey = leader ? `${leader.deviceId}|${leader.id}|${leader.startedAt ?? ''}` : ''
  const leaderKeyRef = useRef('')
  leaderKeyRef.current = leaderKey

  const followed = following && leader ? leader : null
  const status = followed
    ? playing
      ? `Listening with ${followed.name}`
      : 'Paused'
    : !current
      ? spotlight
        ? `${spotlight.name} is playing`
        : 'Add a song'
      : playing
        ? 'Now playing'
        : 'Paused'

  const followLeader = async (l: LoungeListener) => {
    try {
      const player = await ensurePlayer()
      followingRef.current = true
      setFollowing(true)
      loadedRef.current = true
      setActive(true)
      const start = l.startedAt ? Math.max(0, (Date.now() - l.startedAt) / 1000) : 0
      player.loadVideoById({ videoId: l.id, startSeconds: start })
      // Browsers can block sound until the person has tapped the page once: if so, ask for one tap
      window.setTimeout(() => {
        try {
          const st = player.getPlayerState?.()
          if (followingRef.current && st !== 1 && st !== 3 && userPausedKeyRef.current !== leaderKeyRef.current) flash('Tap play to join the music')
        } catch {
          /* player gone */
        }
      }, 2500)
    } catch {
      /* flash() already told the user */
    }
  }

  useEffect(() => {
    if (suppressed && !isGroup) return // a group's own player is showing, so the global one stays quiet
    if (!open && (isGroup || !followingRef.current)) return
    if (!leader) {
      // the host stopped / paused / left: stop following and go quiet
      userPausedKeyRef.current = ''
      if (followingRef.current) {
        followingRef.current = false
        setFollowing(false)
        playerRef.current?.pauseVideo?.()
      }
      return
    }
    // I pressed play more recently than the leader did: keep my own song
    if (hostingRef.current && myStartRef.current >= (leader.startedAt ?? 0)) return
    // I paused this exact song on purpose: leave it paused until the host starts something new
    if (userPausedKeyRef.current === leaderKey) return
    void followLeader(leader)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderKey, open, suppressed, isGroup])

  // keep followers on the same second as the host (fixes slow loading / buffering drift)
  useEffect(() => {
    if (!following) return
    const t = window.setInterval(() => {
      const l = leaderRef.current
      const p = playerRef.current
      if (!l?.startedAt || !p || p.getPlayerState?.() !== 1) return
      const dur = p.getDuration?.() ?? 0
      const expected = (Date.now() - l.startedAt) / 1000
      if (dur > 0 && expected < dur && Math.abs((p.getCurrentTime?.() ?? 0) - expected) > 2.5) p.seekTo?.(expected, true)
    }, 6000)
    return () => window.clearInterval(t)
  }, [following])

  // Group player: when it goes away (you switched chats) stop telling the group it is playing,
  // and pause it whenever the lounge is closed (its video is only visible inside the lounge).
  useEffect(
    () => () => {
      if (isGroup) onNowPlayingRef.current?.(null)
    },
    [isGroup],
  )
  useEffect(() => {
    if (isGroup && !open) playerRef.current?.pauseVideo?.()
  }, [isGroup, open])
  // Global player steps aside while a group's player is on: pause it so two songs never overlap
  useEffect(() => {
    if (suppressed && !isGroup) playerRef.current?.pauseVideo?.()
  }, [suppressed, isGroup])

  const noteEl = note && (
    <p className="lounge-music__note" role="status">
      {note}
    </p>
  )

  // ---------- drag the pill anywhere; it stays where you drop it ----------
  const clampPos = useCallback((x: number, y: number): MusicPos => {
    const el = rootRef.current
    const w = el?.offsetWidth || 300
    const h = el?.offsetHeight || 44
    const m = 6
    return {
      x: Math.min(Math.max(m, x), Math.max(m, window.innerWidth - w - m)),
      y: Math.min(Math.max(m, y), Math.max(m, window.innerHeight - h - m)),
    }
  }, [])

  // remember the spot on this device
  useEffect(() => {
    if (isGroup) return // a group player has no dragged spot, and must not wipe the global one
    try {
      if (pos) localStorage.setItem(MUSIC_POS_KEY, JSON.stringify(pos))
      else localStorage.removeItem(MUSIC_POS_KEY)
    } catch {
      /* storage unavailable: the spot lasts for this session */
    }
  }, [pos, isGroup])

  // keep it on screen when the window is resized or the phone is rotated
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y) : p))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampPos])

  // only the closed lounge's floating pill is free to move; inside the lounge it stays docked in the header
  const free = !isGroup && !open && !!pos

  const onPillPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (open || isGroup) return // inside the lounge the pill stays docked in the header; a group player never moves
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const root = rootRef.current
    if (!root) return
    const r = root.getBoundingClientRect()
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false }
  }
  const onPillPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return // a tap, not a drag: buttons keep working
      d.moved = true
      setDragging(true)
      setExpanded(false)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* pointer already gone */
      }
    }
    setPos(clampPos(d.ox + dx, d.oy + dy))
  }
  const endPillDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    if (!d.moved) return
    setDragging(false)
    // the click that follows a drag must not press a button under the finger
    const swallow = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 80)
  }
  const resetPos = () => {
    if (!open) setPos(null)
  }

  const docked = open && !!dock && !free
  const mode = isGroup ? 'is-inline' : free ? (active ? 'is-custom' : 'is-hidden') : docked ? 'is-docked' : open ? 'is-measuring' : active ? 'is-floating' : 'is-hidden'
  // the playlist opens toward the middle of the screen so it never runs off an edge
  const popUp = free && !!pos && pos.y > window.innerHeight / 2
  const popLeft = free && !!pos && pos.x + 150 < window.innerWidth / 2
  const keepOut = (e: { nativeEvent: Event }) => e.nativeEvent.stopPropagation()

  return (
    <div
      className={`lounge-music ${mode}${pinned ? ' is-pinned' : ''}${playing ? ' is-playing' : ''}${expanded ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}${covered ? ' is-covered' : ''}${suppressed && !isGroup ? ' is-suppressed' : ''}${away && !isGroup ? ' is-away' : ''}${popUp ? ' is-up' : ''}${popLeft ? ' is-left' : ''}`}
      ref={rootRef}
      style={free && pos ? { top: pos.y, left: pos.x, right: 'auto', bottom: 'auto' } : docked && dock ? { top: dock.top, left: dock.left } : undefined}
      onPointerDown={keepOut}
      onMouseDown={keepOut}
      onTouchStart={keepOut}
    >
      <div
        className="lounge-music__pill"
        onPointerDown={onPillPointerDown}
        onPointerMove={onPillPointerMove}
        onPointerUp={endPillDrag}
        onPointerCancel={endPillDrag}
      >
        <div className="lounge-music__screen" onDoubleClick={resetPos} title={open ? undefined : 'Drag the player anywhere · double-click here to reset'}>
          <div ref={wrapRef} className="lounge-music__frame" />
          {!(playing || active) && (
            <span className="lounge-music__ph" aria-hidden="true">
              <NoteIcon />
            </span>
          )}
        </div>

        <button
          type="button"
          className="lounge-music__info"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Open playlist"
        >
          <b className="lounge-music__title">{followed?.title ?? current?.title ?? spotlight?.title ?? (isGroup ? 'Chat music' : 'Lounge radio')}</b>
          <span className="lounge-music__status">
            {(playing || spotlight) && (
              <span className="lounge-music__eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            {status}
          </span>
        </button>

        <button type="button" className="lounge-music__btn is-main" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        {!docked && !isGroup && (
          <button type="button" className="lounge-music__btn lounge-music__close" onClick={stopAll} aria-label="Stop music" title="Stop music">
            <X size={11} weight="bold" />
          </button>
        )}
        <button
          type="button"
          className="lounge-music__btn lounge-music__chev"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Close playlist' : 'Open playlist'}
          title="Playlist"
        >
          <CaretRight size={13} weight="bold" />
          {tracks.length > 0 && <span className="lounge-music__count">{tracks.length}</span>}
        </button>
      </div>

      {!expanded && noteEl}

      {expanded && (
        <div className="lounge-music__pop" role="dialog" aria-label="Music playlist">
          <div className="lounge-music__now">
            <span className="lounge-music__eyebrow">{playing ? 'Now playing' : 'Playlist'}</span>
            <b className="lounge-music__now-title">{current?.title ?? 'Nothing queued yet'}</b>
            <div className="lounge-music__transport">
              <button type="button" className="lounge-music__btn" onClick={() => skip(-1)} disabled={tracks.length < 2} aria-label="Previous song">
                <SkipIcon back />
              </button>
              <button type="button" className="lounge-music__btn is-main is-lg" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button type="button" className="lounge-music__btn" onClick={() => skip(1)} disabled={tracks.length < 2} aria-label="Next song">
                <SkipIcon />
              </button>
            </div>
            <label className="lounge-music__volrow">
              <span aria-hidden="true">{volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}</span>
              <input
                type="range"
                className="lounge-music__vol"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label="Music volume"
                style={{ '--vol': `${volume}%` } as CSSProperties}
              />
              <em>{volume}</em>
            </label>
          </div>

          <form className="lounge-music__add" onSubmit={submitLink}>
            <input
              type="text"
              placeholder="Song name, link, or /play…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              autoComplete="off"
              aria-label="Song name or YouTube link"
            />
            <button type="submit" disabled={!input.trim()}>
              Add
            </button>
          </form>

          {others.length > 0 && (
            <div className="lounge-music__live">
              <span className="lounge-music__eyebrow">{liveLabel}</span>
              <ul>
                {others.map((o) => (
                  <li key={o.deviceId}>
                    <span className="lounge-music__live-who">
                      <b>{o.name}</b>
                      <em title={o.title}>{o.title}</em>
                    </span>
                    <button type="button" onClick={() => addTrack({ id: o.id, title: o.title }, true)}>
                      Play too
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tracks.length === 0 && (
            <div className="lounge-music__empty">
              <span>Type a song name or try a station:</span>
              <div className="lounge-music__stations">
                {STATIONS.map((st) => (
                  <button key={st.key} type="button" onClick={() => addTrack(st.track, true)}>
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tracks.length > 0 && (
            <ol className="lounge-music__queue">
              {tracks.map((t, i) => (
                <li key={`${t.id}-${i}`} className={i === index ? 'is-current' : ''}>
                  <button type="button" className="lounge-music__song" onClick={() => playIndex(i)} title={t.title}>
                    <span className="lounge-music__num">{i === index && playing ? '♪' : i + 1}</span>
                    <span className="lounge-music__song-title">{t.title}</span>
                  </button>
                  <button type="button" className="lounge-music__rm" onClick={() => removeTrack(i)} aria-label={`Remove ${t.title}`}>
                    <X size={11} weight="bold" />
                  </button>
                </li>
              ))}
            </ol>
          )}

          {noteEl}
        </div>
      )}
    </div>
  )
}

interface DevLoungeModalProps {
  open?: boolean
  onClose?: () => void
}

export default function DevLoungeModal({
  open: controlledOpen,
  onClose: controlledOnClose,
}: DevLoungeModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const returnRef = useRef<HTMLElement | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const storiesRef = useRef<HTMLDivElement>(null)
  const feedEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastMsgId = useRef<string | null>(null)
  // Prevents the rawProfiles effect from overwriting userNoteUpdatedAt right
  // after a post — keeps "just now" visible until the next natural sync.
  const skipNextTimestampUpdate = useRef(false)

  // Realtime channel + refs so the channel callbacks always see fresh values
  const channelRef = useRef<any>(null)
  const channelReadyRef = useRef(false)
  const reconnectRef = useRef<() => void>(() => {}) // rebuilds the realtime connection if it is not live
  const deviceIdRef = useRef('')
  const userNameRef = useRef('')
  // Listeners for live duel messages (Tic-Tac-Toe / Quiz Duel). The games subscribe through `duelBus`.
  const duelListeners = useRef(new Set<(payload: any) => void>())
  const lastTypingSent = useRef(0)
  // The music player registers its slash-command handler here (/play, /pause, ...)
  const musicCommandRef = useRef<(text: string) => boolean>(() => false)
  // ...and the open group's own player registers here, so /play in a music group goes to that group's player
  const groupMusicCommandRef = useRef<(text: string) => boolean>(() => false)
  const musicSlotRef = useRef<HTMLDivElement>(null)
  // header slot (next to the speaker / BGM button) where the open group's music player is shown
  const [groupMusicSlot, setGroupMusicSlot] = useState<HTMLDivElement | null>(null)
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Mention-toast bookkeeping (so old messages never trigger a toast)
  const msgsFetchedRef = useRef(false)
  const baselineDoneRef = useRef(false)
  const seenMsgIds = useRef<Set<string>>(new Set())
  // Live-sync bookkeeping
  const fetchSeq = useRef(0) // newest fetch wins; older responses are dropped
  const lastFetchAt = useRef(0)
  const pendingWrites = useRef(0) // my own in-flight sends/edits/reactions
  const writeEpoch = useRef(0) // bumps whenever a write starts or ends
  const realtimeAliveRef = useRef(false) // true once a realtime event has actually arrived

  // Device & User State
  const [deviceId, setDeviceId] = useState<string>('')
  const [userName, setUserName] = useState<string>('')
  const [userNote, setUserNote] = useState<string>('')
  const [userNoteUpdatedAt, setUserNoteUpdatedAt] = useState<string>('')
  const [avatarSalt, setAvatarSalt] = useState<string>('default')

  // Onboarding & Modals
  const [needsRegistration, setNeedsRegistration] = useState(false)
  const [registrationInput, setRegistrationInput] = useState('')
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
  const [noteModalInput, setNoteModalInput] = useState('')
  const [isChoosingAvatar, setIsChoosingAvatar] = useState(false)

  // Live Data & Raw Timestamps
  const [rawMessages, setRawMessages] = useState<any[]>([])
  const [rawProfiles, setRawProfiles] = useState<any[]>([])
  const [rawReactions, setRawReactions] = useState<any[]>([])
  const [allMembers, setAllMembers] = useState<LoungeMember[]>([])

  // Realtime presence: who has the lounge open right now (deviceId -> member)
  const [channelReady, setChannelReady] = useState(false)
  const [online, setOnline] = useState<Record<string, OnlineMember>>({})
  // The song I'm playing, shared through presence so everyone can see it
  const [myMusic, setMyMusic] = useState<LoungeNowPlaying | null>(null)
  const handleNowPlaying = useCallback((t: LoungeNowPlaying | null) => {
    setMyMusic((prev) => (prev?.id === t?.id && prev?.title === t?.title && prev?.startedAt === t?.startedAt ? prev : t))
  }, [])

  // The song I'm playing in the open group's own player. It is shared ONLY on that group's private
  // channel (below), never on the public lounge channel, so people outside the group never receive it.
  const [myGroupMusic, setMyGroupMusic] = useState<LoungeNowPlaying | null>(null)
  const handleGroupNowPlaying = useCallback((_convId: string, t: LoungeNowPlaying | null) => {
    setMyGroupMusic((prev) => (prev?.id === t?.id && prev?.title === t?.title && prev?.startedAt === t?.startedAt ? prev : t))
  }, [])
  const groupChRef = useRef<any>(null)
  const groupChReadyRef = useRef(false)
  const myGroupMusicRef = useRef<LoungeNowPlaying | null>(null)
  myGroupMusicRef.current = myGroupMusic
  const [groupListeners, setGroupListeners] = useState<Record<string, { name: string; id: string; title: string; startedAt: number | null }>>({})

  // Typing indicator: deviceId -> name of everyone currently typing
  const [typers, setTypers] = useState<Record<string, string>>({})

  // @mention picker
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)

  // "Who reacted" card (click a reaction chip)
  const [whoFor, setWhoFor] = useState<{ messageId: string; emoji: string } | null>(null)

  const [messages, setMessages] = useState<Message[]>([])
  const [stories, setStories] = useState<StoryUser[]>([])
  const [inputText, setInputText] = useState('')

  // Reply / edit / reactions UI state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null) // tap-to-show actions on touch
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Community game (lives beside the chat)
  const [gameRefresh, setGameRefresh] = useState(0) // bumps when another member finishes a round
  const [gamesOpen, setGamesOpen] = useState(false) // the person tapped the Games button
  // which sidebar button was clicked last (drives the orange highlight): Lounge or Music
  const [navFocus, setNavFocus] = useState<'lounge' | 'music'>('lounge')
  const [chillHidden, setChillHidden] = useState(false) // the person closed the Chill Zone (its close button, or the Music button)
  const [gamePlaying, setGamePlaying] = useState(false) // a game / challenge is active
  const showGames = gamesOpen || gamePlaying
  // Chill Zone: the calm side panel (with the music player) that takes the games' place when they are closed.
  const [shareActivity, setShareActivity] = useState(() => {
    try {
      return localStorage.getItem('lounge_share_activity_v1') !== '0'
    } catch {
      return true
    }
  })
  // The side panel (Chill Zone, or the games) is always there now, so the music player in it is always on.
  // (Phones/tablets hide the side panel with CSS and keep the header pill.)
  const showSide = showGames || !chillHidden // closing the Chill Zone folds the side panel away
  // Desktop only: the Chill Zone is where the music plays. On phones/tablets (<= 900px) the Chill Zone is
  // hidden, so the music pill and /play behave exactly as before.
  const [isWide, setIsWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 901px)').matches : true))
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 901px)')
    const on = () => setIsWide(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])
  const chillPlayer = false // the music lives in the header pill, never in the Chill Zone
  // The header music pill steps aside while the Chill Zone panel is showing (desktop), and comes back when it closes
  const chillOpen = isWide && !showGames && !chillHidden
  const hidePill = chillOpen
  const [chillMusicSlot, setChillMusicSlot] = useState<HTMLDivElement | null>(null)
  const toggleShareActivity = () =>
    setShareActivity((v) => {
      try {
        localStorage.setItem('lounge_share_activity_v1', v ? '0' : '1')
      } catch {
        /* storage unavailable: the choice just won't be remembered */
      }
      return !v
    })

  // Sound state
  const [isPlayingBgm, setIsPlayingBgm] = useState(false)

  // Handle Background Music Toggle
  const handleBgmToggle = () => {
    sounds.initializeAudio() // Initialize audio context on user interaction
    const playingState = sounds.toggleBgm()
    setIsPlayingBgm(playingState)
    console.log('BGM toggled, playing:', playingState)
  }

  // Chats: 'global' or a conversation id (group / direct message)
  const [activeChat, setActiveChat] = useState<string>('global')
  const [rawConvs, setRawConvs] = useState<any[]>([])
  const [convsLoaded, setConvsLoaded] = useState(false)
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [chatSheet, setChatSheet] = useState<null | 'group' | 'dm'>(null)
  const [pinnedConvs, setPinnedConvs] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PINNED_CONVS_KEY) ?? '[]')
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX_PINNED_CHATS) : []
    } catch {
      return []
    }
  })
  const [viewNoteId, setViewNoteId] = useState<string | null>(null) // someone's note opened full size
  // Reactions on notes (table lounge_note_reactions, see lounge_note_reactions.sql)
  const [rawNoteReactions, setRawNoteReactions] = useState<any[]>([])
  const noteTime = (at?: string | null) => (at ? new Date(at).getTime() : NaN)
  const noteReactionsFor = (ownerId: string, at?: string | null) => {
    const t = noteTime(at)
    const grouped = new Map<string, { emoji: string; count: number; mine: boolean; names: string[] }>()
    if (Number.isNaN(t)) return []
    rawNoteReactions
      .filter((r) => r.note_owner === ownerId && noteTime(r.note_at) === t)
      .forEach((r) => {
        const g = grouped.get(r.emoji) ?? { emoji: r.emoji as string, count: 0, mine: false, names: [] as string[] }
        const mine = r.device_id === deviceId
        g.count += 1
        if (mine) g.mine = true
        g.names.push(mine ? 'You' : memberByDevice.get(r.device_id)?.name ?? 'Someone')
        grouped.set(r.emoji, g)
      })
    return Array.from(grouped.values())
  }
  // One reaction per person per note: tapping a new emoji swaps your old one, tapping the same one removes it.
  const toggleNoteReaction = async (ownerId: string, at: string | null | undefined, emoji: string) => {
    if (!deviceId || !at) return
    const noteAtIso = new Date(at).toISOString()
    const t = noteTime(noteAtIso)
    const isMineOnThisNote = (r: any) => r.note_owner === ownerId && noteTime(r.note_at) === t && r.device_id === deviceId
    const mineNow = rawNoteReactions.filter(isMineOnThisNote)
    const sameOne = mineNow.find((r) => r.emoji === emoji)

    if (sameOne) {
      // same emoji again = take it back
      setRawNoteReactions((prev) => prev.filter((r) => !isMineOnThisNote(r)))
      const { error } = await supabase
        .from('lounge_note_reactions')
        .delete()
        .eq('note_owner', ownerId)
        .eq('device_id', deviceId)
        .eq('note_at', sameOne.note_at)
      if (error) showToast(`Couldn't remove reaction: ${error.message}`)
    } else {
      // different emoji = replace whatever I reacted with before (only ever 1 left)
      const row = { note_owner: ownerId, note_at: noteAtIso, device_id: deviceId, emoji }
      const previous = mineNow
      setRawNoteReactions((prev) => [...prev.filter((r) => !isMineOnThisNote(r)), row])
      if (previous.length > 0) {
        const { error: delErr } = await supabase
          .from('lounge_note_reactions')
          .delete()
          .eq('note_owner', ownerId)
          .eq('device_id', deviceId)
          .eq('note_at', previous[0].note_at)
        if (delErr) {
          setRawNoteReactions((prev) => [...prev.filter((r) => r !== row), ...previous])
          showToast(`Couldn't change reaction: ${delErr.message}`)
          return
        }
      }
      const { error } = await supabase.from('lounge_note_reactions').insert([row])
      if (error) {
        setRawNoteReactions((prev) => [...prev.filter((r) => r !== row), ...previous])
        showToast(
          /lounge_note_reactions/.test(error.message) || (error as any).code === '42P01'
            ? 'Note reactions need lounge_note_reactions.sql run in Supabase first.'
            : `Couldn't add reaction: ${error.message}`,
        )
      }
    }
    fetchData()
  }
  const [peopleOpen, setPeopleOpen] = useState(false) // who's online / offline list
  const [groupInfoOpen, setGroupInfoOpen] = useState(false) // a group's members / admin panel
  const [groupInfoView, setGroupInfoView] = useState<'list' | 'add'>('list')
  const [addPick, setAddPick] = useState<string[]>([])
  const [addQuery, setAddQuery] = useState('')
  const [kickConfirm, setKickConfirm] = useState<string | null>(null)
  const [optionsFor, setOptionsFor] = useState<string | null>(null) // member whose 3-dot options are open
  const [nickFor, setNickFor] = useState<string | null>(null) // member whose nickname is being edited
  const [nickInput, setNickInput] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupIcon, setGroupIcon] = useState(GROUP_ICONS[0])
  const [groupPick, setGroupPick] = useState<string[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  // groups whose player was switched on automatically because a member started playing (not saved)
  const [, setGroupAuto] = useState<Record<string, boolean>>({})
  // groups where I closed the player while someone was still playing: don't pop it open again
  const [groupDismissed, setGroupDismissed] = useState<Record<string, boolean>>({})
  const activeChatRef = useRef('global')
  const conversationsRef = useRef<Conversation[]>([])
  const memberByDeviceRef = useRef<Map<string, LoungeMember>>(new Map())
  activeChatRef.current = activeChat

  // Visible feedback instead of silent console errors
  const showToast = (text: string) => {
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3600)
  }

  deviceIdRef.current = deviceId
  userNameRef.current = userName

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  // Unlock notification sound on the first click / tap / key press (browser autoplay rule)
  useEffect(() => {
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    const unlock = () => {
      unlockPing()
      // Also request notification permission on first interaction
      requestNotificationPermission().then(granted => {
        console.log('[Notifications] Permission requested on interaction, granted:', granted)
      })
      events.forEach((ev) => window.removeEventListener(ev, unlock))
    }
    events.forEach((ev) => window.addEventListener(ev, unlock))
    return () => events.forEach((ev) => window.removeEventListener(ev, unlock))
  }, [])

  // Everyone who has joined, keyed by device so reactions can show real names
  const memberByDevice = useMemo(() => {
    const map = new Map<string, LoungeMember>()
    allMembers.forEach((m) => map.set(m.deviceId, m))
    return map
  }, [allMembers])
  memberByDeviceRef.current = memberByDevice

  // One regex that recognises "@Name" for every known member (names may contain spaces)
  const mentionSource = useMemo(() => {
    const names = Array.from(new Set([...allMembers.map((m) => m.name), userName].filter(Boolean)))
    if (!names.length) return null
    names.sort((a, b) => b.length - a.length)
    return names.map(escapeRegExp).join('|')
  }, [allMembers, userName])

  // Chats I belong to, newest activity first
  const conversations = useMemo<Conversation[]>(() => {
    if (!deviceId) return []
    const lastAt = new Map<string, string>()
    rawMessages.forEach((m: any) => {
      if (!m.conversation_id) return
      const cur = lastAt.get(m.conversation_id)
      if (!cur || m.created_at > cur) lastAt.set(m.conversation_id, m.created_at)
    })
    return rawConvs
      .filter((c: any) => Array.isArray(c.members) && c.members.includes(deviceId))
      .map((c: any): Conversation => {
        const isDm = c.kind === 'dm'
        const otherId: string = isDm ? c.members.find((id: string) => id !== deviceId) ?? '' : ''
        const other = isDm ? memberByDevice.get(otherId) : undefined
        return {
          id: c.id,
          kind: isDm ? 'dm' : 'group',
          name: isDm ? other?.name ?? 'Member' : c.name || 'Group',
          icon: c.icon || '💬',
          avatarSeed: other?.avatarSeed ?? otherId,
          otherId,
          members: c.members,
          lastAt: lastAt.get(c.id) ?? c.created_at ?? '',
          pinned: pinnedConvs.includes(c.id),
          createdBy: c.created_by ?? c.members[0] ?? '',
          requests: Array.isArray(c.join_requests)
            ? c.join_requests.filter((r: any) => r && typeof r.deviceId === 'string' && !c.members.includes(r.deviceId))
            : [],
          nicknames: c.nicknames && typeof c.nicknames === 'object' && !Array.isArray(c.nicknames) ? c.nicknames : {},
        }
      })
      .sort((a, b) => {
        // pinned chats first (in the order they were pinned), then the most recent
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.pinned && b.pinned) return pinnedConvs.indexOf(a.id) - pinnedConvs.indexOf(b.id)
        return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
      })
  }, [rawConvs, rawMessages, deviceId, memberByDevice, pinnedConvs])
  conversationsRef.current = conversations
  const activeConv = activeChat === 'global' ? null : conversations.find((c) => c.id === activeChat) ?? null
  // the open group's own music player is shown only when this person turned it on (button in the group header)
  const activeMusic = !!activeConv && true // the pill is always present in group/DM chats
  // Someone in the open group starts playing: show the group player by itself, no button press needed
  const someoneIsPlayingInGroup = Object.keys(groupListeners).length > 0
  useEffect(() => {
    if (!activeConv) return
    const id = activeConv.id
    if (someoneIsPlayingInGroup) {
      if (!groupDismissed[id]) setGroupAuto((p) => (p[id] ? p : { ...p, [id]: true }))
    } else if (groupDismissed[id]) {
      setGroupDismissed((p) => ({ ...p, [id]: false })) // everyone stopped: the next song may open it again
    }
  }, [activeConv, someoneIsPlayingInGroup, groupDismissed])

  // If the chat I was in disappears, go back to the global chat
  useEffect(() => {
    if (activeChat !== 'global' && convsLoaded && !conversations.some((c) => c.id === activeChat)) setActiveChat('global')
  }, [activeChat, convsLoaded, conversations])

  // Turns message text into nodes with highlighted @mentions
  const renderMessageText = (text: string): { nodes: ReactNode[]; mentionsMe: boolean } => {
    if (!mentionSource) return { nodes: [text], mentionsMe: false }
    const re = new RegExp(`(^|[^\\w@])@(${mentionSource})(?![\\w])`, 'gi')
    const nodes: ReactNode[] = []
    let mentionsMe = false
    let last = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      const start = match.index + match[1].length
      if (start > last) nodes.push(text.slice(last, start))
      const self = match[2].toLowerCase() === userName.toLowerCase()
      if (self) mentionsMe = true
      nodes.push(
        <span key={`${start}-${match[2]}`} className={`lounge-mention${self ? ' is-me' : ''}`}>
          @{match[2]}
        </span>,
      )
      last = start + 1 + match[2].length
    }
    if (last < text.length) nodes.push(text.slice(last))
    return { nodes, mentionsMe }
  }

  // Format helper
  const formatTimeAgo = (dateString?: string) => {
    if (!dateString) return 'just now'
    const diffSecs = Math.floor(noteAgeMs(dateString) / 1000)
    if (diffSecs < 10) return 'just now'
    if (diffSecs < 60) return `${diffSecs}s ago`
    const diffMins = Math.floor(diffSecs / 60)
    if (diffMins === 1) return '1m ago'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  // Live ticker for time strings
  const [, setTick] = useState(0)
  const noteTimesRef = useRef<string[]>([])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      // youngest live note decides how often labels must refresh; also wake exactly when the next note expires
      let delay = 10000
      for (const at of noteTimesRef.current) {
        const age = noteAgeMs(at)
        if (age >= NOTE_TTL_MS) continue
        if (age < 60000) delay = Math.min(delay, 1000)
        delay = Math.min(delay, Math.max(250, NOTE_TTL_MS - age + 50))
      }
      timer = setTimeout(() => {
        setTick((t) => t + 1)
        schedule()
      }, delay)
    }
    schedule()
    // background tabs throttle timers, so refresh the moment the tab is looked at again
    const wake = () => {
      if (document.visibilityState === 'visible') setTick((t) => t + 1)
    }
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  useEffect(() => {
    const scope = activeChat === 'global' ? null : activeChat
    const formattedMsgs: Message[] = rawMessages
      .filter((m: any) => (m.conversation_id ?? null) === scope)
      .map((m: any) => {
      // Group this message's reactions by emoji, keeping first-seen order
      const grouped = new Map<string, Reaction>()
      rawReactions
        .filter((r: any) => r.message_id === m.id)
        .forEach((r: any) => {
          const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, users: [] as ReactionUser[] }
          const isMine = r.device_id === deviceId
          const member = memberByDevice.get(r.device_id)
          g.count += 1
          if (isMine) g.mine = true
          g.users.push({
            deviceId: r.device_id,
            name: isMine ? userName || 'You' : member?.name ?? 'Someone',
            avatarSeed: member?.avatarSeed ?? `${r.device_id}`,
            isMe: isMine,
          })
          grouped.set(r.emoji, g)
        })

      return {
        id: m.id,
        author: m.author,
        authorId: m.device_id ?? '',
        location: m.location,
        createdAt: m.created_at,
        time: formatTimeAgo(m.created_at),
        text: isSysText(m.text) ? m.text.slice(SYS_PREFIX.length) : m.text,
        system: isSysText(m.text),
        avatarSeed: m.avatar_seed,
        // Prefer device ownership; fall back to name for messages sent before device_id existed
        isMe: isSysText(m.text) ? false : m.device_id ? m.device_id === deviceId : m.author === userName,
        replyTo: m.reply_to ?? null,
        edited: !!m.edited_at,
        reactions: Array.from(grouped.values()),
      }
    })
    setMessages(formattedMsgs)
  }, [rawMessages, rawReactions, userName, deviceId, memberByDevice, activeChat])

  // Toast when someone else @mentions you while the lounge is running
  useEffect(() => {
    if (!baselineDoneRef.current) {
      if (msgsFetchedRef.current) {
        rawMessages.forEach((m: any) => seenMsgIds.current.add(m.id))
        baselineDoneRef.current = true
      }
      return
    }
    if (!userName) return
    const mentionRe = mentionSource
      ? new RegExp(`(^|[^\\w@])@${escapeRegExp(userName)}(?![\\w])`, 'i')
      : null
    rawMessages.forEach((m: any) => {
      if (seenMsgIds.current.has(m.id) || isTmp(m.id)) return
      const convKey: string | null = m.conversation_id ?? null
      const conv = convKey ? conversationsRef.current.find((c) => c.id === convKey) : null
      if (convKey && !conv) return // not one of my chats (or my list hasn't loaded it yet): look again next update
      seenMsgIds.current.add(m.id)
      if (isSysText(m.text)) return // group notices never ping
      const mine = m.device_id ? m.device_id === deviceId : m.author === userName
      if (mine) return
      const chatKey = convKey ?? 'global'
      const elsewhere = chatKey !== activeChatRef.current
      if (elsewhere) setUnread((u) => ({ ...u, [chatKey]: (u[chatKey] ?? 0) + 1 }))
      const isMention = !!mentionRe?.test(m.text ?? '')
      const isDm = conv?.kind === 'dm'
      // Sound: any new message in the global chat, a direct message to me, or an @mention of me
      if (!convKey || isMention || isDm) playPing()
      if (isMention) {
        showToast(`${m.author} mentioned you`)
        showBrowserNotification(`${m.author} mentioned you`, m.text?.substring(0, 100) || 'Check the chat')
      } else if (conv && elsewhere) {
        const toastMsg = conv.kind === 'dm' ? `${m.author} sent you a message` : `${m.author} in ${conv.name}`
        showToast(toastMsg)
        showBrowserNotification(toastMsg, m.text?.substring(0, 100) || 'New message')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMessages])

  useEffect(() => {
    const formattedStories: StoryUser[] = rawProfiles.map((p: any) => {
      const isSelf = p.device_id === deviceId
      // The note's age comes ONLY from when the note was posted, never from when the account was created
      const timestamp = p.note_updated_at || ''
      if (isSelf) {
        if (!skipNextTimestampUpdate.current) {
          setUserNoteUpdatedAt(timestamp)
        }
        skipNextTimestampUpdate.current = false
      }
      return {
        id: p.id,
        deviceId: p.device_id,
        name: p.name,
        updatedAt: timestamp,
        time: formatTimeAgo(timestamp || undefined),
        note: p.note,
        noteAt: p.note_updated_at || null,
        avatarSeed: `${p.name}-${p.avatar_salt}`,
        isMe: isSelf,
      }
    })

    // Always put the current user first
    formattedStories.sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0))
    noteTimesRef.current = formattedStories.filter((x) => x.note && x.noteAt).map((x) => x.noteAt as string)

    setStories(formattedStories)
  }, [rawProfiles, deviceId])

  /* ---------- live updates ---------- */

  const applyMessageChange = (payload: any) => {
    realtimeAliveRef.current = true
    const { eventType, new: row, old } = payload
    if (eventType === 'INSERT') {
      setRawMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev
        // swap out my optimistic copy of this message, if there is one
        const rest = prev.filter(
          (m) =>
            !(isTmp(m.id) && m.device_id === row.device_id && m.text === row.text && (m.conversation_id ?? null) === (row.conversation_id ?? null)),
        )
        return [...rest, row].sort(byCreatedAt)
      })
    } else if (eventType === 'UPDATE') {
      setRawMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)))
    } else if (eventType === 'DELETE') {
      setRawMessages((prev) => prev.filter((m) => m.id !== old?.id))
    }
  }

  const applyReactionChange = (payload: any) => {
    realtimeAliveRef.current = true
    const { eventType, new: row, old } = payload
    if (eventType === 'INSERT') {
      setRawReactions((prev) => {
        const i = prev.findIndex((r) => sameReaction(r, row))
        if (i === -1) return [...prev, row]
        if (prev[i].id === row.id) return prev
        const next = [...prev]
        next[i] = { ...prev[i], ...row } // my optimistic copy gets its real id
        return next
      })
    } else if (eventType === 'UPDATE') {
      setRawReactions((prev) => prev.map((r) => (r.id !== undefined && r.id === row.id ? { ...r, ...row } : r)))
    } else if (eventType === 'DELETE') {
      const hasId = old?.id !== undefined && old?.id !== null
      const hasTuple = !!(old?.message_id && old?.device_id && old?.emoji)
      if (!hasId && !hasTuple) {
        fetchData() // payload too thin to know which row went away — just resync
        return
      }
      setRawReactions((prev) =>
        prev.filter((r) => !(hasId && r.id === old.id) && !(hasTuple && sameReaction(r, old))),
      )
    }
  }

  // While I'm writing, ignore stale fetches so optimistic UI doesn't flicker back
  const beginWrite = () => {
    pendingWrites.current += 1
    writeEpoch.current += 1
  }
  const endWrite = () => {
    pendingWrites.current -= 1
    writeEpoch.current += 1
  }

  // Safety net: resync when the tab comes back / network returns, and poll as a fallback
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') fetchData()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)

    const poll = setInterval(() => {
      if (!open || document.visibilityState !== 'visible') return
      // Realtime delivering? then only a slow safety sync. Not delivering? poll quickly.
      const every = realtimeAliveRef.current ? 30000 : 4000
      if (Date.now() - lastFetchAt.current >= every) fetchData()
    }, 2000)

    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Initialize Device ID & Supabase Realtime Subscription
  useEffect(() => {
    let devId = localStorage.getItem('lounge_device_id')
    if (!devId) {
      devId = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36)
      localStorage.setItem('lounge_device_id', devId)
    }
    setDeviceId(devId)
    checkUserRegistration(devId)

    // Presence is keyed by device, so two tabs from the same person count as ONE online member
    const readPresence = () => {
      const state = (channelRef.current?.presenceState() ?? {}) as Record<string, any[]>
      const next: Record<string, OnlineMember> = {}
      Object.entries(state).forEach(([key, metas]) => {
        // a member whose every tab is hidden counts as away, not online
        const active = metas.filter((m) => !m?.away)
        if (!active.length) return
        const last = active[active.length - 1]
        // only accept a well-formed YouTube id from other clients
        const m = last?.music
        const music: LoungeNowPlaying | null =
          m && typeof m.id === 'string' && /^[\w-]{11}$/.test(m.id) ? { id: m.id, title: String(m.title ?? 'YouTube video').slice(0, 120), startedAt: typeof m.startedAt === 'number' ? m.startedAt : null } : null
        next[key] = { deviceId: key, name: last?.name ?? 'Someone', music }
      })
      setOnline(next)
    }

    // The connection is created by connect() so it can be rebuilt: if the socket stalls or drops
    // (sleeping phone, flaky network, a tab left in the background) it reconnects by itself
    // instead of staying on "Connecting…" until the page is refreshed.
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    const teardown = () => {
      const old = channelRef.current
      channelRef.current = null // lets the old channel's CLOSED callback know it is stale
      channelReadyRef.current = false
      if (old) supabase.removeChannel(old)
    }

    const scheduleReconnect = () => {
      if (cancelled || retryTimer) return
      const wait = Math.min(1000 * 2 ** attempts, 15000)
      attempts += 1
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        reconnect()
      }, wait)
    }

    const connect = () => {
      if (cancelled) return
      const channel = supabase
        .channel('public-lounge', { config: { presence: { key: devId } } })
        .on('presence', { event: 'sync' }, readPresence)
        .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
          if (!payload || payload.deviceId === deviceIdRef.current) return
          if ((payload.chat ?? 'global') !== activeChatRef.current) return
          const id: string = payload.deviceId
          clearTimeout(typingTimers.current[id])
          if (payload.typing) {
            setTypers((prev) => (prev[id] === payload.name ? prev : { ...prev, [id]: payload.name }))
            // Auto-expire in case the "stopped typing" signal never arrives
            typingTimers.current[id] = setTimeout(() => {
              setTypers((prev) => {
                const { [id]: _gone, ...rest } = prev
                return rest
              })
            }, TYPING_TTL)
          } else {
            setTypers((prev) => {
              const { [id]: _gone, ...rest } = prev
              return rest
            })
          }
        })
        // Someone finished a round of the community game: refresh the board and say so
        .on('broadcast', { event: 'game-score' }, ({ payload }: any) => {
          if (!payload || payload.deviceId === deviceIdRef.current) return
          setGameRefresh((n) => n + 1)
          const msg = `${payload.name} scored ${payload.score} in ${payload.game || 'Dev Trivia'}`
          showToast(msg)
          showBrowserNotification('Game Score Update', msg)
        })
        // Live 1v1 messages (invites, moves, scores). Every client receives them; the games
        // only act on the ones addressed to this device.
        .on('broadcast', { event: 'duel' }, ({ payload }: any) => {
          if (!payload || payload.from === deviceIdRef.current) return
          // Show notification for game invites
          if (payload.type === 'invite') {
            const msg = `${payload.fromName} invited you to play ${payload.game || 'a game'}`
            showToast(msg)
            showBrowserNotification('Game Invitation', msg)
          }
          duelListeners.current.forEach((fn) => fn(payload))
        })
        // Messages (new messages, replies, edits) are applied straight from the event payload,
        // so they show up instantly without another round-trip to the database.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_messages' }, applyMessageChange)
        // Reactions too — counts and "who reacted" update live.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_reactions' }, applyReactionChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_note_reactions' }, () => {
          realtimeAliveRef.current = true
          fetchData()
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lounge_profiles' }, (payload: any) => {
          realtimeAliveRef.current = true
          const { new: newProfile, old: oldProfile } = payload
          // Notify when someone shares/updates their note (if the note content changed)
          if (newProfile && oldProfile && newProfile.note !== oldProfile.note && newProfile.device_id !== deviceIdRef.current) {
            const member = memberByDeviceRef.current.get(newProfile.device_id)
            const name = member?.name || 'Someone'
            const msg = newProfile.note ? `${name} shared a note` : `${name} removed their note`
            showToast(msg)
            showBrowserNotification('Note Shared', msg)
          }
          fetchData()
        })
        .subscribe((status: string, err?: Error) => {
          if (cancelled || channelRef.current !== channel) return // stale channel
          channelReadyRef.current = status === 'SUBSCRIBED'
          setChannelReady(status === 'SUBSCRIBED')
          if (status !== 'SUBSCRIBED') setOnline({}) // can't vouch for anyone while disconnected
          if (status === 'SUBSCRIBED') {
            attempts = 0
            // (Re)connected: catch up on anything missed while offline / before subscribing
            readPresence()
            fetchData()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[lounge] realtime problem:', status, err)
            scheduleReconnect()
          }
        })

      channelRef.current = channel
    }

    const reconnect = () => {
      if (cancelled) return
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = undefined
      }
      teardown()
      connect()
    }
    // lets the "lounge opened" effect below force a fresh connection if the old one is not live
    reconnectRef.current = () => {
      if (!channelReadyRef.current) {
        attempts = 0
        reconnect()
      } else {
        readPresence()
      }
    }

    connect()

    // coming back online / returning to the tab: make sure the connection is alive
    const wake = () => {
      if (document.visibilityState === 'hidden' || channelReadyRef.current) return
      attempts = 0
      reconnect()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      reconnectRef.current = () => {}
      Object.values(typingTimers.current).forEach(clearTimeout)
      teardown()
    }
  }, [])

  // Opening the lounge: if the connection went stale, rebuild it now; otherwise refresh who is online
  useEffect(() => {
    if (open) reconnectRef.current()
  }, [open])

  // Announce "I'm here" only while the lounge is open and the tab is visible.
  // Closing the lounge (or the tab / losing network) removes you from everyone's online count.
  useEffect(() => {
    const ch = channelRef.current
    if (!ch || !channelReady) return
    if (!open || !userName || !deviceId) {
      ch.untrack()
      return
    }
    const announce = () =>
      ch.track({
        deviceId,
        name: userName,
        avatarSeed: `${userName}-${avatarSalt}`,
        music: shareActivity ? myMusic : null,
        away: document.visibilityState === 'hidden',
        at: new Date().toISOString(),
      })
    announce()
    document.addEventListener('visibilitychange', announce)
    return () => document.removeEventListener('visibilitychange', announce)
  }, [channelReady, open, userName, deviceId, avatarSalt, myMusic, shareActivity])

  // New groups / DMs show up live. Separate channel on purpose: if the table isn't set up yet,
  // only this subscription fails and the main lounge channel keeps working.
  useEffect(() => {
    const ch = supabase
      .channel('lounge-conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_conversations' }, () => {
        realtimeAliveRef.current = true
        fetchData()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkUserRegistration = async (devId: string) => {
    const { data } = await supabase
      .from('lounge_profiles')
      .select('*')
      .eq('device_id', devId)
      .maybeSingle()

    if (!data) {
      setNeedsRegistration(true)
    } else {
      setUserName(data.name)
      setUserNote(data.note || '')
      setUserNoteUpdatedAt(data.note_updated_at || '')
      setAvatarSalt(data.avatar_salt)
      setNeedsRegistration(false)
      fetchData()
    }
  }

  const fetchData = async () => {
    const seq = ++fetchSeq.current
    const epoch = writeEpoch.current
    lastFetchAt.current = Date.now()

    const meId = deviceIdRef.current || localStorage.getItem('lounge_device_id') || ''
    const [msgRes, profileRes, memberRes, reactionRes, convRes, noteReactRes]: any[] = await Promise.all([
      supabase.from('lounge_messages').select('*').order('created_at', { ascending: true }),
      supabase.from('lounge_profiles').select('*').order('created_at', { ascending: false }).limit(10),
      // Full member list (the stories rail only keeps the 10 newest) — used for @mentions & reaction names
      supabase.from('lounge_profiles').select('device_id, name, avatar_salt').order('name', { ascending: true }),
      supabase.from('lounge_reactions').select('*'),
      // Group chats and DMs I'm in (quietly empty if lounge_chats.sql hasn't been run yet)
      meId ? supabase.from('lounge_conversations').select('*').contains('members', [meId]) : Promise.resolve({ data: null }),
      // Reactions on notes (quietly empty if lounge_note_reactions.sql hasn't been run yet)
      supabase.from('lounge_note_reactions').select('*'),
    ])

    // A newer fetch has started — this response is stale
    if (seq !== fetchSeq.current) return

    if (profileRes.data) setRawProfiles(profileRes.data)
    if (memberRes.data) {
      setAllMembers(
        memberRes.data.map((p: any) => ({
          deviceId: p.device_id,
          name: p.name,
          avatarSeed: `${p.name}-${p.avatar_salt}`,
        })),
      )
    }

    // If I wrote something while this was in flight, the result may predate my write.
    // Skip it; a fresh fetch runs right after every write.
    if (pendingWrites.current > 0 || epoch !== writeEpoch.current) return

    if (msgRes.data) {
      msgsFetchedRef.current = true
      setRawMessages(msgRes.data)
    }
    if (reactionRes.data) setRawReactions(reactionRes.data)
    if (noteReactRes?.data) setRawNoteReactions(noteReactRes.data)
    if (convRes?.data) {
      setRawConvs(convRes.data)
      setConvsLoaded(true)
    }
    if (msgRes.error || reactionRes.error) console.warn('[lounge] fetch error', msgRes.error ?? reactionRes.error)
  }

  const handleRegisterUser = async (e: FormEvent) => {
    e.preventDefault()
    if (!registrationInput.trim()) return

    const name = registrationInput.trim()
    const randomSalt = AVATAR_SALTS[Math.floor(Math.random() * AVATAR_SALTS.length)]
    const nowIso = new Date().toISOString()

    // Set initial note to empty string so it shows "Add note" or your fallback text
    const defaultInitialNote = ''

    const { error } = await supabase.from('lounge_profiles').insert([
      {
        device_id: deviceId,
        name: name,
        note: defaultInitialNote,
        avatar_salt: randomSalt,
      },
    ])

    if (error) {
      showToast(`Registration failed: ${error.message}`)
      return
    }

    setUserName(name)
    setUserNote(defaultInitialNote)
    setUserNoteUpdatedAt(nowIso)
    setAvatarSalt(randomSalt)
    setNeedsRegistration(false)
    fetchData()
  }

  useEffect(() => {
    const handleOpen = (e: Event) => {
      returnRef.current = (e as CustomEvent<HTMLElement | null>).detail
      setInternalOpen(true)
      fetchData()
    }
    window.addEventListener(LOUNGE_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(LOUNGE_OPEN_EVENT, handleOpen)
  }, [userName])

  const handleClose = useCallback(
    (reason: DismissReason | 'button') => {
      if (isControlled && controlledOnClose) {
        controlledOnClose()
      } else {
        setInternalOpen(false)
      }
      if (reason !== 'outside') {
        returnRef.current?.focus()
      }
      returnRef.current = null
    },
    [isControlled, controlledOnClose],
  )

  useDismiss(open, rootRef, handleClose)

  useEffect(() => {
    if (open) {
      fetchData()
      setTimeout(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 100)
    }
  }, [open])

  // Only auto-scroll when a NEW message arrives — not when someone reacts or edits
  useEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1].id : null
    if (lastId !== lastMsgId.current) {
      lastMsgId.current = lastId
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const scrollStories = () => {
    if (storiesRef.current) {
      storiesRef.current.scrollBy({ left: 140, behavior: 'smooth' })
    }
  }

  const openAvatarPicker = () => {
    setIsChoosingAvatar(true)
  }

  const selectNewAvatar = async (newSalt: string) => {
    setAvatarSalt(newSalt)
    setIsChoosingAvatar(false)

    const { error } = await supabase
      .from('lounge_profiles')
      .update({ avatar_salt: newSalt })
      .eq('device_id', deviceId)

    if (error) console.error('Error updating avatar:', error.message)
    fetchData()
  }

  const handleSaveNote = async () => {
    const cleaned = noteModalInput.trim()
    const nowIso = new Date().toISOString()
    setUserNote(cleaned)
    setUserNoteUpdatedAt(nowIso) // reset to "just now"
    skipNextTimestampUpdate.current = true // don't let fetchData overwrite it
    setIsNoteModalOpen(false)

    // Instantly update the Rail bubble without waiting for DB round-trip
    window.dispatchEvent(new CustomEvent('rail:note-updated', { detail: cleaned }))

    const { error } = await supabase
      .from('lounge_profiles')
      .update({ note: cleaned, note_updated_at: nowIso })
      .eq('device_id', deviceId)

    if (error) {
      console.error('Error saving note:', error.message)
      showToast(`Could not save note: ${error.message}`)
    }

    fetchData()
  }

  const handleRemoveNote = async () => {
    const nowIso = new Date().toISOString()
    setUserNote('')
    setUserNoteUpdatedAt(nowIso)
    setNoteModalInput('')
    setIsNoteModalOpen(false)

    // Instantly clear the Rail bubble
    window.dispatchEvent(new CustomEvent('rail:note-updated', { detail: '' }))

    const { error } = await supabase
      .from('lounge_profiles')
      .update({ note: '', note_updated_at: nowIso })
      .eq('device_id', deviceId)

    if (error) {
      console.error('Error removing note:', error.message)
    }

    fetchData()
  }

  /* ---------- typing indicator ---------- */

  const sendTyping = (typing: boolean) => {
    const ch = channelRef.current
    if (!ch || !channelReadyRef.current || !userNameRef.current) return
    ch.send({
      type: 'broadcast',
      event: 'typing',
      payload: { deviceId: deviceIdRef.current, name: userNameRef.current, typing, chat: activeChatRef.current },
    })
  }

  const notifyTyping = (value: string) => {
    if (!value.trim()) {
      lastTypingSent.current = 0
      sendTyping(false)
      return
    }
    const now = Date.now()
    if (now - lastTypingSent.current > TYPING_THROTTLE) {
      lastTypingSent.current = now
      sendTyping(true)
    }
  }

  const memberCount = Math.max(allMembers.length, stories.length)
  // Online = members with the lounge open right now. I always count myself once I'm in.
  const onlineList = useMemo(() => {
    const map = new Map<string, string>()
    Object.values(online).forEach((m) => map.set(m.deviceId, m.name))
    if (open && userName && deviceId) map.set(deviceId, userName)
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [online, open, userName, deviceId])
  const onlineCount = onlineList.length
  // everyone else who is playing a song right now
  const musicOthers = useMemo<LoungeListener[]>(
    () =>
      Object.values(online)
        .filter((m) => m.music && m.deviceId !== deviceId)
        .map((m) => ({ deviceId: m.deviceId, name: m.name, id: m.music!.id, title: m.music!.title, startedAt: m.music!.startedAt ?? null })),
    [online, deviceId],
  )
  // Who the Chill Zone shows depends on the chat that is open:
  //  - Global chat: everyone in the lounge, with the music they share on the public channel
  //  - Direct chat / group: only that chat's members, with what they play in THAT chat's own player
  const chillMembers = useMemo<ChillMember[]>(() => {
    const inChat = activeConv ? new Set(activeConv.members) : null
    const ids = new Set<string>()
    onlineList.forEach(({ id }) => {
      if (!inChat || inChat.has(id)) ids.add(id)
    })
    if (inChat) Object.keys(groupListeners).forEach((id) => inChat.has(id) && ids.add(id))
    if (deviceId && (!inChat || inChat.has(deviceId))) ids.add(deviceId)
    const nameOf = (id: string) =>
      id === deviceId ? userName : onlineList.find((m) => m.id === id)?.name ?? memberByDevice.get(id)?.name ?? groupListeners[id]?.name ?? 'Member'
    const list = Array.from(ids).map((id) => {
      const isMe = id === deviceId
      const name = nameOf(id)
      let music: { id: string; title: string } | null
      if (inChat) music = isMe ? myGroupMusic : groupListeners[id] ?? null
      else music = isMe ? (shareActivity ? myMusic : null) : online[id]?.music ?? null
      return {
        deviceId: id,
        name,
        avatarSeed: isMe ? `${userName}-${avatarSalt}` : memberByDevice.get(id)?.avatarSeed ?? `${name}-av01`,
        isMe,
        track: music ? { id: music.id, title: music.title } : null,
      }
    })
    return list.sort((a, b) => Number(b.isMe) - Number(a.isMe) || Number(!!b.track) - Number(!!a.track) || a.name.localeCompare(b.name))
  }, [activeConv, onlineList, online, deviceId, userName, avatarSalt, myMusic, myGroupMusic, groupListeners, shareActivity, memberByDevice])
  // Other members of the open group who are playing something in the group's own player.
  const groupMusicOthers = useMemo<LoungeListener[]>(
    () => Object.entries(groupListeners).map(([id, v]) => ({ deviceId: id, name: v.name, id: v.id, title: v.title, startedAt: v.startedAt })),
    [groupListeners],
  )

  // Each music group has its OWN realtime channel ("lounge-music-<group id>"). Only members of the open
  // group subscribe to it, so a song played in a group is never sent to anyone outside that group.
  const openMusicGroupId = activeConv ? activeConv.id : null
  useEffect(() => {
    groupChReadyRef.current = false
    groupChRef.current = null
    setGroupListeners({})
    if (!openMusicGroupId || !open || !deviceId || !userName) return
    const conv = conversationsRef.current.find((c) => c.id === openMusicGroupId)
    if (!conv || !conv.members.includes(deviceId)) return // not a member: never connect

    const ch = supabase.channel(`lounge-music-${openMusicGroupId}`, { config: { presence: { key: deviceId } } })
    const read = () => {
      const members = conversationsRef.current.find((c) => c.id === openMusicGroupId)?.members ?? []
      const state = (ch.presenceState() ?? {}) as Record<string, any[]>
      const next: Record<string, { name: string; id: string; title: string; startedAt: number | null }> = {}
      Object.entries(state).forEach(([key, metas]) => {
        if (key === deviceId || !members.includes(key)) return // me, or someone who is not in the group
        const last = metas[metas.length - 1]
        const m = last?.music
        if (m && typeof m.id === 'string' && /^[\w-]{11}$/.test(m.id)) {
          next[key] = { name: String(last?.name ?? 'Someone').slice(0, 40), id: m.id, title: String(m.title ?? 'YouTube video').slice(0, 120), startedAt: typeof m.startedAt === 'number' ? m.startedAt : null }
        }
      })
      setGroupListeners(next)
    }
    ch.on('presence', { event: 'sync' }, read).subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        groupChRef.current = ch
        groupChReadyRef.current = true
        void ch.track({ name: userName, music: myGroupMusicRef.current })
      }
    })
    return () => {
      groupChReadyRef.current = false
      groupChRef.current = null
      supabase.removeChannel(ch)
    }
  }, [openMusicGroupId, open, deviceId, userName])

  // tell the group (and only the group) when my song changes
  useEffect(() => {
    if (groupChReadyRef.current) void groupChRef.current?.track({ name: userNameRef.current, music: myGroupMusic })
  }, [myGroupMusic])
  const onlineIds = useMemo(() => new Set(onlineList.map((m) => m.id)), [onlineList])
  const typerNames = Object.values(typers)
  const typingLabel =
    typerNames.length === 0
      ? ''
      : typerNames.length === 1
        ? `${typerNames[0]} is typing`
        : typerNames.length === 2
          ? `${typerNames[0]} and ${typerNames[1]} are typing`
          : `${typerNames[0]}, ${typerNames[1]} and ${typerNames.length - 2} ${typerNames.length - 2 === 1 ? 'other' : 'others'} are typing`

  /* ---------- @mentions ---------- */

  const mentionCandidates = useMemo(() => {
    if (!mentionQuery) return []
    const q = mentionQuery.query.toLowerCase()
    const pool = activeConv ? (activeConv.kind === 'dm' ? [] : allMembers.filter((m) => activeConv.members.includes(m.deviceId))) : allMembers
    const others = pool.filter((m) => m.deviceId !== deviceId)
    const starts = others.filter((m) => m.name.toLowerCase().startsWith(q))
    const contains = others.filter((m) => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q))
    return [...starts, ...contains].slice(0, 8)
  }, [mentionQuery, allMembers, deviceId, activeConv])

  const mentionMenuOpen = mentionQuery !== null && mentionCandidates.length > 0

  const updateMentionQuery = (value: string, caret: number) => {
    const before = value.slice(0, caret)
    const match = /(?:^|\s)@([^@\n]{0,20})$/.exec(before)
    if (!match || match[1].startsWith(' ')) {
      setMentionQuery(null)
      return
    }
    const query = match[1]
    const start = caret - query.length - 1
    setMentionQuery((cur) => {
      if (!cur || cur.query !== query || cur.start !== start) setMentionIndex(0)
      return { start, query }
    })
  }

  const insertMention = (member: LoungeMember) => {
    if (!mentionQuery) return
    const end = mentionQuery.start + 1 + mentionQuery.query.length
    const before = inputText.slice(0, mentionQuery.start)
    let after = inputText.slice(end)
    if (after.startsWith(' ')) after = after.slice(1)
    const inserted = `@${member.name} `
    const next = before + inserted + after
    const caret = before.length + inserted.length
    setInputText(next)
    setMentionQuery(null)
    notifyTyping(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputText(value)
    updateMentionQuery(value, e.target.selectionStart ?? value.length)
    notifyTyping(value)
  }

  /* ---------- reply / edit / react ---------- */

  const cancelComposerMode = () => {
    setReplyingTo(null)
    setEditingId(null)
    setInputText('')
    setMentionQuery(null)
    sendTyping(false)
  }

  const startReply = (m: Message) => {
    setEditingId(null)
    setReplyingTo(m)
    setPickerFor(null)
    setActiveMsgId(null)
    inputRef.current?.focus()
  }

  const startEdit = (m: Message) => {
    setReplyingTo(null)
    setEditingId(m.id)
    setInputText(m.text)
    setPickerFor(null)
    setActiveMsgId(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const togglePinChat = (id: string) => {
    if (!pinnedConvs.includes(id) && pinnedConvs.filter((x) => conversationsRef.current.some((c) => c.id === x)).length >= MAX_PINNED_CHATS) {
      showToast(`You can pin up to ${MAX_PINNED_CHATS} chats. Unpin one first.`)
      return
    }
    const next = pinnedConvs.includes(id) ? pinnedConvs.filter((x) => x !== id) : [...pinnedConvs, id]
    setPinnedConvs(next)
    try {
      localStorage.setItem(PINNED_CONVS_KEY, JSON.stringify(next))
    } catch {
      /* storage unavailable: the pin lasts for this session */
    }
  }

  const submitEdit = async (id: string, newText: string) => {
    const original = rawMessages.find((m) => m.id === id)
    setEditingId(null)
    setInputText('')
    if (!original || original.text === newText) return

    // Optimistic update
    setRawMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: newText, edited_at: new Date().toISOString() } : m)),
    )

    beginWrite()
    const { error } = await supabase
      .from('lounge_messages')
      .update({ text: newText, edited_at: new Date().toISOString() })
      .eq('id', id)
      .eq('device_id', deviceId)
    endWrite()

    if (error) {
      console.error('Error editing message:', error.message)
      showToast(`Couldn't save your edit: ${error.message}`)
    }
    fetchData()
  }

  const toggleReaction = async (messageId: string, emoji: string) => {
    setPickerFor(null)
    setActiveMsgId(null)
    const existing = rawReactions.find(
      (r) => r.message_id === messageId && r.device_id === deviceId && r.emoji === emoji,
    )

    beginWrite()
    if (existing) {
      setRawReactions((prev) => prev.filter((r) => !sameReaction(r, existing)))
      const { error } = await supabase
        .from('lounge_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('device_id', deviceId)
        .eq('emoji', emoji)
      if (error) showToast(`Couldn't remove reaction: ${error.message}`)
    } else {
      setRawReactions((prev) => [...prev, { message_id: messageId, device_id: deviceId, emoji }])
      const { error } = await supabase
        .from('lounge_reactions')
        .insert([{ message_id: messageId, device_id: deviceId, emoji }])
      if (error) {
        console.error('Error adding reaction:', error.message)
        showToast(`Couldn't add reaction: ${error.message}`)
      }
    }
    endWrite()
    fetchData()
  }

  const jumpToMessage = (id: string) => {
    const el = document.getElementById(`lounge-msg-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('is-flash')
    setTimeout(() => el.classList.remove('is-flash'), 1400)
  }

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault()
    const textToSend = inputText.trim()
    if (!textToSend || sending) return

    if (!userName) {
      showToast('Pick a name first to start chatting.')
      return
    }

    // Music commands (/play lofi, /skip, ...) run the player instead of sending a message
    if (!editingId && textToSend.startsWith('/') && (activeMusic && activeConv ? groupMusicCommandRef : musicCommandRef).current(textToSend)) {
      setInputText('')
      setMentionQuery(null)
      lastTypingSent.current = 0
      sendTyping(false)
      return
    }

    sounds.initializeAudio() // Initialize audio context on user interaction
    sounds.playSfx('click')

    if (editingId) {
      await submitEdit(editingId, textToSend)
      return
    }

    const replyId = replyingTo?.id ?? null
    const convId = activeChatRef.current === 'global' ? null : activeChatRef.current
    setMentionQuery(null)
    lastTypingSent.current = 0
    sendTyping(false)
    const tempId = `tmp_${Date.now()}`
    setSending(true)
    setInputText('')
    setReplyingTo(null)

    // Optimistic: show the message instantly, roll back if the insert fails
    setRawMessages((prev) => [
      ...prev,
      {
        id: tempId,
        author: userName,
        location: 'Manila, PH',
        text: textToSend,
        avatar_seed: `${userName}-${avatarSalt}`,
        device_id: deviceId,
        reply_to: replyId,
        conversation_id: convId,
        created_at: new Date().toISOString(),
      },
    ])

    const row: Record<string, unknown> = {
      author: userName,
      location: 'Manila, PH',
      text: textToSend,
      avatar_seed: `${userName}-${avatarSalt}`,
      device_id: deviceId,
    }
    if (replyId) row.reply_to = replyId
    if (convId) row.conversation_id = convId

    beginWrite()
    const { data: saved, error } = await supabase.from('lounge_messages').insert([row]).select().single()
    endWrite()

    if (!error && saved) {
      // Swap the optimistic message for the real saved row (the realtime echo is de-duplicated by id)
      setRawMessages((prev) => {
        const rest = prev.filter((m) => m.id !== tempId)
        return rest.some((m) => m.id === saved.id) ? rest : [...rest, saved].sort(byCreatedAt)
      })
    }

    if (error) {
      console.error('Error sending message:', error.message)
      setRawMessages((prev) => prev.filter((m) => m.id !== tempId))
      setInputText(textToSend)
      if (replyId) setReplyingTo(messages.find((m) => m.id === replyId) ?? null)
      showToast(chatsNotSetUp(error) ? 'Chats need lounge_chats.sql run in Supabase first.' : `Message not sent: ${error.message}`)
    }
    setSending(false)
    fetchData()
    inputRef.current?.focus()
  }

  /* ---------- community game ---------- */

  const announceScore = (score: number, correct: number, game: string = 'Dev Trivia') => {
    const ch = channelRef.current
    if (!ch || !channelReadyRef.current) return
    ch.send({
      type: 'broadcast',
      event: 'game-score',
      payload: { deviceId: deviceIdRef.current, name: userNameRef.current, score, correct, game },
    })
  }

  // Small pipe the arcade games use to talk to another player over the lounge channel
  const duelBus = useMemo<DuelBus>(
    () => ({
      send: (payload) => {
        const ch = channelRef.current
        if (!ch || !channelReadyRef.current) return
        ch.send({
          type: 'broadcast',
          event: 'duel',
          payload: { ...payload, from: deviceIdRef.current, fromName: userNameRef.current },
        })
      },
      subscribe: (fn) => {
        duelListeners.current.add(fn)
        return () => {
          duelListeners.current.delete(fn)
        }
      },
    }),
    [],
  )

  const shareToChat = async (text: string) => {
    if (!userName) return
    beginWrite()
    const { data: saved, error } = await supabase
      .from('lounge_messages')
      .insert([
        {
          author: userName,
          location: 'Manila, PH',
          text,
          avatar_seed: `${userName}-${avatarSalt}`,
          device_id: deviceId,
          ...(activeChatRef.current !== 'global' ? { conversation_id: activeChatRef.current } : {}),
        },
      ])
      .select()
      .single()
    endWrite()

    if (error) {
      showToast(`Couldn't share: ${error.message}`)
      return
    }
    if (saved) setRawMessages((prev) => (prev.some((m) => m.id === saved.id) ? prev : [...prev, saved].sort(byCreatedAt)))
    fetchData()
  }

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // keep global shortcuts / dismiss handlers from swallowing typing keys
    e.stopPropagation()

    // Mention picker captures navigation keys while it's open
    if (mentionMenuOpen && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => (i + 1) % mentionCandidates.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mentionCandidates[Math.min(mentionIndex, mentionCandidates.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSendMessage()
      return
    }
    if (e.key === 'Escape' && (editingId || replyingTo)) {
      cancelComposerMode()
      return
    }
    // ArrowUp on an empty box edits your latest message
    if (e.key === 'ArrowUp' && !inputText && !editingId) {
      const last = [...messages].reverse().find((m) => m.isMe && !m.id.startsWith('tmp_'))
      if (last) {
        e.preventDefault()
        startEdit(last)
      }
    }
  }

  /* ---------- chats: switch, create a group, open a DM ---------- */

  const switchChat = (id: string) => {
    if (id === activeChatRef.current) return
    cancelComposerMode() // also tells the old chat I stopped typing
    setActiveChat(id)
    setUnread((u) => (u[id] ? { ...u, [id]: 0 } : u))
    setTypers({})
    setActiveMsgId(null)
    setPickerFor(null)
    setWhoFor(null)
    lastMsgId.current = null
    setTimeout(() => {
      feedEndRef.current?.scrollIntoView({ behavior: 'auto' })
      inputRef.current?.focus()
    }, 50)
  }

  const openChatSheet = (kind: 'group' | 'dm') => {
    setChatSheet(kind)
    setGroupName('')
    setGroupIcon(GROUP_ICONS[0])
    setGroupPick([])
    setMemberQuery('')
  }
  const closeChatSheet = () => setChatSheet(null)

  const createGroup = async () => {
    const name = groupName.trim().slice(0, 24)
    if (!name || groupPick.length < 1 || !deviceId) return
    const row = {
      id: `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      kind: 'group',
      name,
      icon: groupIcon,
      created_by: deviceId,
      members: Array.from(new Set([deviceId, ...groupPick])),
    }
    beginWrite()
    const { error } = await supabase.from('lounge_conversations').insert([row])
    endWrite()
    if (error) {
      showToast(chatsNotSetUp(error) ? 'Group chats need lounge_chats.sql run in Supabase first.' : `Couldn't create the group: ${error.message}`)
      return
    }
    setRawConvs((prev) => [...prev, { ...row, created_at: new Date().toISOString() }])
    const addedNames = groupPick.map((id) => memberByDevice.get(id)?.name ?? 'Member')
    closeChatSheet()
    switchChat(row.id)
    fetchData()
    void postGroupNotice(row.id, `${userName} created the group and added ${joinNames(addedNames)}`)
  }

  const openDm = async (member: LoungeMember) => {
    if (!deviceId || member.deviceId === deviceId) return
    const id = dmId(deviceId, member.deviceId)
    if (!conversationsRef.current.some((c) => c.id === id)) {
      const row = { id, kind: 'dm', name: null, icon: null, created_by: deviceId, members: [deviceId, member.deviceId].sort() }
      beginWrite()
      const { error } = await supabase.from('lounge_conversations').insert([row])
      endWrite()
      // 23505 = this DM already exists (they opened it first), which is fine
      if (error && (error as any).code !== '23505') {
        showToast(chatsNotSetUp(error) ? 'Direct messages need lounge_chats.sql run in Supabase first.' : `Couldn't open the chat: ${error.message}`)
        return
      }
      setRawConvs((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, { ...row, created_at: new Date().toISOString() }]))
      fetchData()
    }
    closeChatSheet()
    switchChat(id)
  }

  const peopleList = (() => {
    const map = new Map<string, LoungeMember>()
    allMembers.forEach((m) => map.set(m.deviceId, m))
    if (deviceId && userName && !map.has(deviceId)) map.set(deviceId, { deviceId, name: userName, avatarSeed: `${userName}-${avatarSalt}` })
    const rows = Array.from(map.values()).map((m) => ({ ...m, isOnline: onlineIds.has(m.deviceId), isMe: m.deviceId === deviceId }))
    return rows.sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.name.localeCompare(b.name))
  })()
  // ---------- group members: admin, add, kick, approval requests ----------
  const groupInfo = groupInfoOpen && activeConv && activeConv.kind === 'group' ? activeConv : null
  const iAmAdmin = !!groupInfo && groupInfo.createdBy === deviceId
  const nameOf = (id: string) => (id === deviceId ? 'You' : memberByDevice.get(id)?.name ?? 'Member')
  // In a group a nickname wins; without one the person's username shows.
  const nickIn = (conv: Conversation | null | undefined, id: string) => (conv && conv.kind === 'group' ? (conv.nicknames[id] ?? '').trim() : '')
  const shownName = (id: string, fallback: string) => nickIn(activeConv, id) || fallback
  const saveNickname = async (conv: Conversation, id: string) => {
    const nick = nickInput.trim().replace(/\s+/g, ' ').slice(0, 20)
    if (id !== deviceId && conv.createdBy !== deviceId) return // you set your own; the admin can set anyone's
    const next = { ...conv.nicknames }
    if (nick) next[id] = nick
    else delete next[id]
    setNickFor(null)
    const ok = await updateConv(conv.id, { nicknames: next })
    if (ok) showToast(nick ? 'Nickname saved' : 'Nickname reset to the username')
  }
  const closeGroupInfo = () => {
    setOptionsFor(null)
    setNickFor(null)
    setGroupInfoOpen(false)
    setGroupInfoView('list')
    setAddPick([])
    setAddQuery('')
    setKickConfirm(null)
  }
  const updateConv = async (id: string, patch: Record<string, unknown>) => {
    beginWrite()
    const { data, error } = await supabase.from('lounge_conversations').update(patch).eq('id', id).select('id')
    endWrite()
    if (error) {
      showToast(chatsNotSetUp(error) ? 'Run lounge_group_admin.sql in Supabase first.' : `Couldn't update the group: ${error.message}`)
      return false
    }
    if (!data || data.length === 0) {
      showToast('Not allowed. Check the update policy on lounge_conversations.')
      return false
    }
    setRawConvs((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    fetchData()
    return true
  }
  // Posts a centered notice into the group chat for everyone to see
  const postGroupNotice = async (convId: string, text: string) => {
    console.log('[lounge] posting group notice:', text)
    if (!deviceId || !userName) {
      showToast('Notice not posted: your profile is not loaded yet')
      return
    }
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const full = SYS_PREFIX + text
    // show it instantly for the person who did the action
    setRawMessages((prev) => [
      ...prev,
      {
        id: tempId,
        author: userName,
        location: 'Manila, PH',
        text: full,
        avatar_seed: `${userName}-${avatarSalt}`,
        device_id: deviceId,
        conversation_id: convId,
        created_at: new Date().toISOString(),
      },
    ])
    beginWrite()
    const { data: saved, error } = await supabase
      .from('lounge_messages')
      .insert([
        {
          author: userName,
          location: 'Manila, PH',
          text: full,
          avatar_seed: `${userName}-${avatarSalt}`,
          device_id: deviceId,
          conversation_id: convId,
        },
      ])
      .select()
      .single()
    endWrite()
    if (error) {
      console.error('Could not post group notice:', error)
      setRawMessages((prev) => prev.filter((m) => m.id !== tempId))
      showToast(`Notice not posted: ${error.message}`)
      return
    }
    console.log('[lounge] group notice saved:', saved?.id)
    if (saved) {
      setRawMessages((prev) => {
        const rest = prev.filter((m) => m.id !== tempId)
        return rest.some((m) => m.id === saved.id) ? rest : [...rest, saved].sort(byCreatedAt)
      })
    }
    fetchData()
  }
  // Real name for a notice (everyone reads it, so never "You")
  const noticeName = (conv: Conversation, id: string) =>
    nickIn(conv, id) || (id === deviceId ? userName : memberByDevice.get(id)?.name) || 'Member'
  const joinNames = (names: string[]) =>
    names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

  const kickMember = async (conv: Conversation, id: string) => {
    if (conv.createdBy !== deviceId || id === conv.createdBy) return
    setKickConfirm(null)
    const kickedName = noticeName(conv, id)
    const ok = await updateConv(conv.id, { members: conv.members.filter((m) => m !== id) })
    if (ok) {
      showToast(`${nameOf(id)} was removed from ${conv.name}`)
      void postGroupNotice(conv.id, `${noticeName(conv, deviceId)} removed ${kickedName} from the group`)
    }
  }
  const removeRequest = (conv: Conversation, id: string) => conv.requests.filter((r) => r.deviceId !== id)
  const approveRequest = async (conv: Conversation, id: string) => {
    if (conv.createdBy !== deviceId) return
    const members = conv.members.includes(id) ? conv.members : [...conv.members, id]
    const req = conv.requests.find((r) => r.deviceId === id)
    const ok = await updateConv(conv.id, { members, join_requests: removeRequest(conv, id) })
    if (ok) {
      const who = noticeName(conv, id)
      const by = req && req.by !== deviceId ? ` (added by ${noticeName(conv, req.by)})` : ''
      void postGroupNotice(conv.id, `${noticeName(conv, deviceId)} accepted ${who} into the group${by}`)
    }
  }
  const rejectRequest = async (conv: Conversation, id: string) => {
    if (conv.createdBy !== deviceId) return
    const req = conv.requests.find((r) => r.deviceId === id)
    const ok = await updateConv(conv.id, { join_requests: removeRequest(conv, id) })
    if (ok) {
      const by = req && req.by !== deviceId ? ` (added by ${noticeName(conv, req.by)})` : ''
      void postGroupNotice(conv.id, `${noticeName(conv, deviceId)} declined ${noticeName(conv, id)}'s request to join${by}`)
    }
  }
  const submitAddMembers = async (conv: Conversation) => {
    if (!deviceId || addPick.length === 0) return
    const fresh = addPick.filter((id) => !conv.members.includes(id))
    if (fresh.length === 0) return
    if (conv.createdBy === deviceId) {
      // the admin adds people straight away
      const ok = await updateConv(conv.id, {
        members: Array.from(new Set([...conv.members, ...fresh])),
        join_requests: conv.requests.filter((r) => !fresh.includes(r.deviceId)),
      })
      if (ok) {
        showToast(`Added ${fresh.length} ${fresh.length === 1 ? 'member' : 'members'}`)
        void postGroupNotice(conv.id, `${noticeName(conv, deviceId)} added ${joinNames(fresh.map((id) => noticeName(conv, id)))} to the group`)
      }
    } else {
      // a member can only ask: the admin has to approve
      const at = new Date().toISOString()
      const asked = fresh.filter((id) => !conv.requests.some((r) => r.deviceId === id)).map((id): JoinRequest => ({ deviceId: id, by: deviceId, at }))
      if (asked.length === 0) {
        showToast('Those people are already waiting for approval')
      } else {
        const ok = await updateConv(conv.id, { join_requests: [...conv.requests, ...asked] })
        if (ok) {
          showToast('Request sent. An admin needs to approve it.')
          void postGroupNotice(conv.id, `${noticeName(conv, deviceId)} wants to add ${joinNames(asked.map((r) => noticeName(conv, r.deviceId)))}. Waiting for admin approval`)
        }
      }
    }
    setAddPick([])
    setAddQuery('')
    setGroupInfoView('list')
  }
  const addCandidates = groupInfo
    ? allMembers.filter(
        (m) =>
          !groupInfo.members.includes(m.deviceId) &&
          !groupInfo.requests.some((r) => r.deviceId === m.deviceId) &&
          m.name.toLowerCase().includes(addQuery.trim().toLowerCase()),
      )
    : []

  const renderMemberRow = (conv: Conversation, id: string) => {
    const who = memberByDevice.get(id)
    const username = id === deviceId ? userName || who?.name || 'You' : who?.name ?? 'Member'
    const nick = nickIn(conv, id)
    const isAdminRow = id === conv.createdBy
    const canNick = id === deviceId || iAmAdmin
    const canKick = iAmAdmin && id !== deviceId && !isAdminRow
    const hasOptions = canNick || canKick
    const seed = who?.avatarSeed ?? (id === deviceId ? `${userName}-${avatarSalt}` : id)
    return (
      <li key={`row-${id}`}>
        <div className="lounge-chatsheet__row lounge-people__row lounge-ginfo__row">
          <LoungeAvatar seed={seed} size={32} />
          {nickFor === id ? (
            <form
              className="lounge-ginfo__nick"
              onSubmit={(e) => {
                e.preventDefault()
                void saveNickname(conv, id)
              }}
            >
              <input
                type="text"
                value={nickInput}
                maxLength={20}
                placeholder={username}
                onChange={(e) => setNickInput(e.target.value)}
                aria-label={`Nickname for ${username}`}
                autoFocus
              />
              <button type="submit" className="lounge-ginfo__btn is-accept" aria-label="Save nickname" title="Save">
                ✓
              </button>
              <button type="button" className="lounge-ginfo__btn" onClick={() => setNickFor(null)} aria-label="Cancel" title="Cancel">
                ✕
              </button>
            </form>
          ) : (
            <>
              <span className="lounge-ginfo__who">
                <span className="lounge-chatsheet__who">
                  {nick || username}
                  {id === deviceId ? ' (You)' : ''}
                </span>
                {nick && <small>@{username}</small>}
              </span>
              {isAdminRow && <span className="lounge-ginfo__badge">Admin</span>}
              {kickConfirm === id ? (
                <span className="lounge-ginfo__actions">
                  <button type="button" className="lounge-ginfo__kick is-sure" onClick={() => kickMember(conv, id)}>
                    Remove
                  </button>
                  <button type="button" className="lounge-ginfo__kick" onClick={() => setKickConfirm(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                hasOptions && (
                  <button
                    type="button"
                    className={`lounge-ginfo__dots${optionsFor === id ? ' is-open' : ''}`}
                    onClick={() => setOptionsFor((cur) => (cur === id ? null : id))}
                    aria-label={`Options for ${username}`}
                    aria-expanded={optionsFor === id}
                    title="Options"
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                )
              )}
            </>
          )}
        </div>
        {optionsFor === id && nickFor !== id && kickConfirm !== id && (
          <div className="lounge-ginfo__menu" role="menu">
            {canNick && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNickInput(nick)
                  setNickFor(id)
                  setOptionsFor(null)
                }}
              >
                {nick ? 'Change nickname' : 'Set nickname'}
              </button>
            )}
            {canNick && nick && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOptionsFor(null)
                  const next = { ...conv.nicknames }
                  delete next[id]
                  void updateConv(conv.id, { nicknames: next })
                }}
              >
                Reset nickname
              </button>
            )}
            {canKick && (
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  setOptionsFor(null)
                  setKickConfirm(id)
                }}
              >
                Remove from group
              </button>
            )}
          </div>
        )}
      </li>
    )
  }
  const sheetMembers = allMembers.filter(
    (m) => m.deviceId !== deviceId && m.name.toLowerCase().includes(memberQuery.trim().toLowerCase()),
  )

  if (typeof document === 'undefined') return null

  const ctxTarget = editingId
    ? messages.find((m) => m.id === editingId)
    : replyingTo

  // The player is portaled straight to <body>, outside the modal, so it keeps playing after the lounge closes
  const musicEl = createPortal(
    chillPlayer ? null : <LoungeMusic open={!!open} away={hidePill} suppressed={!!open && activeMusic} covered={!!open && (needsRegistration || isChoosingAvatar || isNoteModalOpen || !!chatSheet || peopleOpen || groupInfoOpen || !!viewNoteId)} others={musicOthers} onNowPlaying={handleNowPlaying} commandRef={musicCommandRef} slotRef={musicSlotRef} />,
    document.body,
  )

  return (
    <>
      {musicEl}
      {createPortal(
    <div className={`lounge-overlay${open ? ' is-open' : ''}`} ref={rootRef} aria-hidden={!open}>
      <div className="lounge-modal" role="dialog" aria-modal="true" aria-label="Dev Lounge" tabIndex={-1} ref={panelRef}>
        {needsRegistration && (
          <div className="lounge-sheet">
            <h3 className="lounge-sheet__title">Welcome to Dev Lounge</h3>
            <p className="lounge-sheet__sub">Pick a name so the others know who's talking.</p>
            <form onSubmit={handleRegisterUser} className="lounge-sheet__form">
              <input
                type="text"
                placeholder="Your name"
                maxLength={20}
                value={registrationInput}
                onChange={(e) => setRegistrationInput(e.target.value)}
                autoFocus
              />
              <button type="submit">Join lounge</button>
            </form>
          </div>
        )}

        {isChoosingAvatar && (
          <div className="lounge-sheet">
            <h3 className="lounge-sheet__title">Choose your avatar</h3>
            <p className="lounge-sheet__sub">Pick any one you like.</p>
            <div className="lounge-avatar-grid lounge-avatar-grid--all">
              {AVATAR_SALTS.map((salt) => (
                <button
                  type="button"
                  key={salt}
                  onClick={() => selectNewAvatar(salt)}
                  className={`lounge-avatar-choice${avatarSalt === salt ? ' is-selected' : ''}`}
                  aria-label="Use this avatar"
                >
                  <LoungeAvatar seed={`${userName}-${salt}`} size={52} />
                </button>
              ))}
            </div>
            <button type="button" className="lounge-sheet__cancel" onClick={() => setIsChoosingAvatar(false)}>
              Cancel
            </button>
          </div>
        )}

        {viewNoteId && (() => {
          const vs = stories.find((x) => x.id === viewNoteId)
          const at = vs ? (vs.isMe ? userNoteUpdatedAt : vs.noteAt) : null
          const text = vs ? (vs.isMe ? userNote : vs.note) : ''
          const live = !!vs && isNoteLive(text, at)
          const close = () => setViewNoteId(null)
          return (
            <div
              className="lounge-note-modal-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) close()
              }}
            >
              <div className="lounge-note-modal lounge-noteview" role="dialog" aria-label={vs ? `${vs.name}'s note` : 'Note'}>
                <div className="lounge-note-modal__header">
                  <h3>{vs?.isMe ? 'Your note' : `${vs?.name ?? 'Someone'}'s note`}</h3>
                  <button type="button" className="lounge-close" onClick={close} aria-label="Close">
                    <X size={14} weight="bold" />
                  </button>
                </div>
                {vs && live ? (
                  <div className="lounge-noteview__body">
                    <div className="lounge-noteview__bubble">
                      {text}
                      <NoteReacts items={noteReactionsFor(vs.deviceId, at)} />
                    </div>
                    <div className="lounge-ring lounge-ring--live">
                      <div className="lounge-ring__inner">
                        <LoungeAvatar seed={vs.avatarSeed} size={46} />
                      </div>
                    </div>
                    <div className="lounge-note-modal__name">{vs.name}</div>
                    <div className="lounge-noteview__meta">Posted {formatTimeAgo(at ?? undefined)}</div>
                    {(() => {
                      const got = noteReactionsFor(vs.deviceId, at)
                      return (
                        <div className="lounge-notereact">
                          <div className="lounge-notereact__picker" role="group" aria-label="React to this note">
                            {QUICK_REACTIONS.map((emoji) => {
                              const mine = got.some((g) => g.emoji === emoji && g.mine)
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`lounge-notereact__btn${mine ? ' is-mine' : ''}`}
                                  onClick={() => toggleNoteReaction(vs.deviceId, at, emoji)}
                                  aria-pressed={mine}
                                  aria-label={`React with ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}
                    <p className="lounge-noteview__hint">Notes disappear 24 hours after they are posted.</p>
                  </div>
                ) : (
                  <p className="lounge-chatsheet__empty">This note has expired.</p>
                )}
              </div>
            </div>
          )
        })()}

        {isNoteModalOpen && (
          <div className="lounge-note-modal-backdrop">
            <div className="lounge-note-modal" role="dialog" aria-label="Your note">
              <div className="lounge-note-modal__header">
                <h3>Your note</h3>
                <button type="button" className="lounge-close" onClick={() => setIsNoteModalOpen(false)} aria-label="Close">
                  <X size={14} weight="bold" />
                </button>
              </div>

              <p className="lounge-note-modal__sub">Share a thought or status. It disappears after 24 hours.</p>

              <div className="lounge-note-modal__body">
                <div className="lounge-note-modal__bubble-preview">
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="Say something..."
                    value={noteModalInput}
                    onChange={(e) => setNoteModalInput(e.target.value)}
                    autoFocus
                  />
                  {isNoteLive(userNote, userNoteUpdatedAt) && <NoteReacts items={noteReactionsFor(deviceId, userNoteUpdatedAt)} />}
                </div>

                <div className="lounge-ring lounge-ring--live lounge-note-modal__avatar-wrap">
                  <div className="lounge-ring__inner">
                    <LoungeAvatar seed={`${userName}-${avatarSalt}`} size={46} />
                  </div>
                </div>

                <div className="lounge-note-modal__name">{userName}</div>
                <div className="lounge-note-modal__time-label">
                  {isNoteLive(userNote, userNoteUpdatedAt) ? formatTimeAgo(userNoteUpdatedAt) : ''}
                </div>
                <div className="lounge-note-modal__count">{noteModalInput.length}/20</div>
              </div>

              <div className="lounge-note-modal__footer">
                <button type="button" className="lounge-btn-remove" onClick={handleRemoveNote}>
                  Remove
                </button>
                <div className="lounge-note-modal__footer-right">
                  <button type="button" className="lounge-btn-cancel" onClick={() => setIsNoteModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="lounge-btn-post" onClick={handleSaveNote}>
                    Post note
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {groupInfo && (
          <div
            className="lounge-note-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeGroupInfo()
            }}
          >
            <div className="lounge-note-modal lounge-chatsheet lounge-people lounge-ginfo" role="dialog" aria-label={`Members of ${groupInfo.name}`}>
              <div className="lounge-note-modal__header">
                <h3>
                  <span className="lounge-ginfo__icon" aria-hidden="true">
                    {groupInfo.icon}
                  </span>{' '}
                  {groupInfoView === 'add' ? 'Add members' : groupInfo.name}
                </h3>
                <button type="button" className="lounge-close" onClick={closeGroupInfo} aria-label="Close">
                  <X size={14} weight="bold" />
                </button>
              </div>

              {groupInfoView === 'add' ? (
                <>
                  <p className="lounge-note-modal__sub">
                    {iAmAdmin ? 'Pick people to add to the group.' : 'Pick people to suggest. An admin has to approve them first.'}
                  </p>
                  <input
                    type="text"
                    className="lounge-chatsheet__search"
                    placeholder="Search members…"
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    autoFocus
                  />
                  <ul className="lounge-chatsheet__list">
                    {addCandidates.length === 0 && <li className="lounge-chatsheet__empty">No one left to add.</li>}
                    {addCandidates.map((m) => {
                      const picked = addPick.includes(m.deviceId)
                      return (
                        <li key={m.deviceId}>
                          <button
                            type="button"
                            className={`lounge-chatsheet__row${picked ? ' is-picked' : ''}`}
                            onClick={() => setAddPick((p) => (picked ? p.filter((x) => x !== m.deviceId) : [...p, m.deviceId]))}
                          >
                            <LoungeAvatar seed={m.avatarSeed} size={32} />
                            <span className="lounge-chatsheet__who">{m.name}</span>
                            <span className={`lounge-chatsheet__live${onlineIds.has(m.deviceId) ? '' : ' is-offline'}`}>{onlineIds.has(m.deviceId) ? 'online' : 'offline'}</span>
                            <span className="lounge-chatsheet__check" aria-hidden="true">
                              {picked ? '✓' : ''}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="lounge-note-modal__footer">
                    <span className="lounge-chatsheet__count">{addPick.length} selected</span>
                    <div className="lounge-note-modal__footer-right">
                      <button type="button" className="lounge-btn-cancel" onClick={() => { setGroupInfoView('list'); setAddPick([]); setAddQuery('') }}>
                        Back
                      </button>
                      <button type="button" className="lounge-btn-post" onClick={() => submitAddMembers(groupInfo)} disabled={addPick.length === 0}>
                        {iAmAdmin ? 'Add' : 'Send request'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="lounge-note-modal__sub">
                    {groupInfo.members.length} {groupInfo.members.length === 1 ? 'member' : 'members'}
                  </p>
                  <button type="button" className="lounge-ginfo__add" onClick={() => setGroupInfoView('add')}>
                    <Plus size={14} weight="bold" />
                    Add members
                  </button>

                  <ul className="lounge-chatsheet__list">
                    {groupInfo.requests.length > 0 && (
                      <>
                        <li className="lounge-people__label" aria-hidden="true">
                          Waiting for approval ({groupInfo.requests.length})
                        </li>
                        {groupInfo.requests.map((r) => {
                          const who = memberByDevice.get(r.deviceId)
                          return (
                            <li key={`req-${r.deviceId}`}>
                              <div className="lounge-chatsheet__row lounge-people__row lounge-ginfo__req">
                                <LoungeAvatar seed={who?.avatarSeed ?? r.deviceId} size={32} />
                                <span className="lounge-ginfo__who">
                                  <span className="lounge-chatsheet__who">{who?.name ?? 'Member'}</span>
                                  <small>added by {nameOf(r.by)}</small>
                                </span>
                                {iAmAdmin ? (
                                  <span className="lounge-ginfo__actions">
                                    <button type="button" className="lounge-ginfo__btn is-accept" onClick={() => approveRequest(groupInfo, r.deviceId)} aria-label={`Accept ${who?.name ?? 'member'}`} title="Accept">
                                      ✓
                                    </button>
                                    <button type="button" className="lounge-ginfo__btn is-reject" onClick={() => rejectRequest(groupInfo, r.deviceId)} aria-label={`Reject ${who?.name ?? 'member'}`} title="Reject">
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <span className="lounge-chatsheet__live is-offline">pending</span>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </>
                    )}

                    <li className="lounge-people__label" aria-hidden="true">
                      Admin
                    </li>
                    {groupInfo.members.filter((id) => id === groupInfo.createdBy).map((id) => renderMemberRow(groupInfo, id))}

                    <li className="lounge-people__label" aria-hidden="true">
                      Members
                    </li>
                    {groupInfo.members.filter((id) => id !== groupInfo.createdBy).length === 0 && <li className="lounge-chatsheet__empty">No other members.</li>}
                    {groupInfo.members.filter((id) => id !== groupInfo.createdBy).map((id) => renderMemberRow(groupInfo, id))}
                  </ul>
                </>
              )}
            </div>
          </div>
        )}

        {peopleOpen && (
          <div
            className="lounge-note-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPeopleOpen(false)
            }}
          >
            <div className="lounge-note-modal lounge-chatsheet lounge-people" role="dialog" aria-label="Members online and offline">
              <div className="lounge-note-modal__header">
                <h3>Members</h3>
                <button type="button" className="lounge-close" onClick={() => setPeopleOpen(false)} aria-label="Close">
                  <X size={14} weight="bold" />
                </button>
              </div>
              <p className="lounge-note-modal__sub">
                {onlineCount} online · {Math.max(peopleList.length - onlineCount, 0)} offline
              </p>
              <ul className="lounge-chatsheet__list">
                {peopleList.length === 0 && <li className="lounge-chatsheet__empty">No members yet.</li>}
                {peopleList.map((m, i) => (
                  <Fragment key={m.deviceId}>
                    {(i === 0 || peopleList[i - 1].isOnline !== m.isOnline) && (
                      <li className="lounge-people__label" aria-hidden="true">
                        {m.isOnline ? 'Online' : 'Offline'}
                      </li>
                    )}
                    <li>
                      <div className={`lounge-chatsheet__row lounge-people__row${m.isOnline ? '' : ' is-offline'}`}>
                        <LoungeAvatar seed={m.avatarSeed} size={32} />
                        <span className="lounge-chatsheet__who">
                          {m.name}
                          {m.isMe ? ' (You)' : ''}
                        </span>
                        <span className={`lounge-chatsheet__live${m.isOnline ? '' : ' is-offline'}`}>{m.isOnline ? 'online' : 'offline'}</span>
                      </div>
                    </li>
                  </Fragment>
                ))}
              </ul>
            </div>
          </div>
        )}

        {chatSheet && (
          <div
            className="lounge-note-modal-backdrop"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeChatSheet()
            }}
          >
            <div className="lounge-note-modal lounge-chatsheet" role="dialog" aria-label={chatSheet === 'group' ? 'Create group chat' : 'New direct message'}>
              <div className="lounge-note-modal__header">
                <h3>{chatSheet === 'group' ? 'New group chat' : 'New message'}</h3>
                <button type="button" className="lounge-close" onClick={closeChatSheet} aria-label="Close">
                  <X size={14} weight="bold" />
                </button>
              </div>
              <p className="lounge-note-modal__sub">
                {chatSheet === 'group' ? 'Name it, pick an icon, then add people.' : 'Pick someone to message directly.'}
              </p>

              {chatSheet === 'group' && (
                <>
                  <div className="lounge-chatsheet__name">
                    <span className="lounge-group-icon is-lg" style={groupTint(`pick-${groupIcon}`)} aria-hidden="true">
                      {groupIcon}
                    </span>
                    <input type="text" maxLength={24} placeholder="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} autoFocus />
                  </div>
                  <div className="lounge-chatsheet__icons" role="radiogroup" aria-label="Group icon">
                    {GROUP_ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        role="radio"
                        aria-checked={groupIcon === ic}
                        className={`lounge-chatsheet__icon${groupIcon === ic ? ' is-selected' : ''}`}
                        onClick={() => setGroupIcon(ic)}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <input
                type="text"
                className="lounge-chatsheet__search"
                placeholder="Search members…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                autoFocus={chatSheet === 'dm'}
              />
              <ul className="lounge-chatsheet__list">
                {sheetMembers.length === 0 && (
                  <li className="lounge-chatsheet__empty">{allMembers.length <= 1 ? 'No other members yet. Invite a friend!' : 'No one matches that search.'}</li>
                )}
                {sheetMembers.map((m) => {
                  const picked = groupPick.includes(m.deviceId)
                  return (
                    <li key={m.deviceId}>
                      <button
                        type="button"
                        className={`lounge-chatsheet__row${picked ? ' is-picked' : ''}`}
                        onClick={() =>
                          chatSheet === 'dm'
                            ? openDm(m)
                            : setGroupPick((p) => (picked ? p.filter((x) => x !== m.deviceId) : [...p, m.deviceId]))
                        }
                      >
                        <LoungeAvatar seed={m.avatarSeed} size={32} />
                        <span className="lounge-chatsheet__who">{m.name}</span>
                        <span className={`lounge-chatsheet__live${online[m.deviceId] ? '' : ' is-offline'}`}>{online[m.deviceId] ? 'online' : 'offline'}</span>
                        {chatSheet === 'group' && (
                          <span className="lounge-chatsheet__check" aria-hidden="true">
                            {picked ? '✓' : ''}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>

              {chatSheet === 'group' && (
                <div className="lounge-note-modal__footer">
                  <span className="lounge-chatsheet__count">{groupPick.length} selected</span>
                  <div className="lounge-note-modal__footer-right">
                    <button type="button" className="lounge-btn-cancel" onClick={closeChatSheet}>
                      Cancel
                    </button>
                    <button type="button" className="lounge-btn-post" onClick={createGroup} disabled={!groupName.trim() || groupPick.length < 1}>
                      Create group
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <header className="lounge-header">
          <div className="lounge-header__left">
            <div>
              <h2 className="lounge-header__title">Dev Lounge</h2>
              <p className="lounge-header__sub">Chat, unwind and out-quiz the crew</p>
            </div>
          </div>
          <div className="lounge-header__right">
            <div className="lounge-header__chats" role="group" aria-label="Chats">
              <button
                type="button"
                className={`lounge-iconbtn${activeChat === 'global' && !showGames && !chatSheet && navFocus === 'lounge' ? ' is-active' : ''}`}
                onClick={() => {
                  setNavFocus('lounge')
                  setGamesOpen(false)
                  closeChatSheet()
                  switchChat('global')
                }}
                aria-pressed={activeChat === 'global' && !showGames && !chatSheet && navFocus === 'lounge'}
                aria-label="Global chat"
                title="Global chat"
              >
                <GlobeIcon />
                {(unread.global ?? 0) > 0 && <i className="lounge-chip__dot" aria-label="New messages" />}
              </button>
              <button type="button" className={`lounge-iconbtn${chatSheet === 'group' ? ' is-active' : ''}`} onClick={() => openChatSheet('group')} aria-pressed={chatSheet === 'group'} aria-label="New group chat" title="New group chat">
                <UsersIcon />
              </button>
              <button type="button" className={`lounge-iconbtn lounge-iconbtn--add${chatSheet === 'dm' ? ' is-active' : ''}`} onClick={() => openChatSheet('dm')} aria-pressed={chatSheet === 'dm'} aria-label="New direct message" title="New direct message">
                <Plus size={14} weight="bold" />
              </button>
            </div>
            <div className={`lounge-music-slot${activeMusic ? ' is-collapsed' : ''}${hidePill ? ' is-radio-hidden' : ''}`} ref={musicSlotRef} aria-hidden="true" />
            <div className={`lounge-group-music-slot${hidePill ? ' is-radio-hidden' : ''}`} ref={setGroupMusicSlot} />
            <button
              type="button"
              className={`lounge-iconbtn lounge-chill-toggle${!chillHidden && !showGames ? ' is-active' : ''}`}
              onClick={() => {
                // opens / closes the Chill Zone (the radio pill is shown while it is closed; music keeps playing)
                if (showGames) { setGamesOpen(false); setChillHidden(false) }
                else setChillHidden((v) => !v)
              }}
              aria-pressed={!chillHidden && !showGames}
              aria-label="Show or hide Chill Zone"
              title="Show or hide Chill Zone"
            >
              ☕
            </button>
            <button
              type="button"
              className={`lounge-iconbtn lounge-games-toggle${showGames ? ' is-active' : ''}`}
              onClick={() => setGamesOpen((v) => !v)}
              aria-pressed={showGames}
              aria-label={showGames ? 'Hide games' : 'Show games'}
              title={showGames ? 'Hide games' : 'Show games'}
            >
              🎮
            </button>
            <button
              type="button"
              className="lounge-bgm-toggle"
              onClick={handleBgmToggle}
              aria-label={isPlayingBgm ? 'Turn off background music' : 'Turn on background music'}
              title={isPlayingBgm ? 'BGM: ON' : 'BGM: OFF'}
            >
              {isPlayingBgm ? '🔊' : '🔇'}
            </button>
            <button
              type="button"
              className={`lounge-live-badge lounge-live-badge--btn${channelReady ? '' : ' is-offline'}`}
              title="See who's online"
              aria-haspopup="dialog"
              aria-expanded={peopleOpen}
              onClick={() => setPeopleOpen(true)}
            >
              <span className="lounge-live-dot" />
              <b>{onlineCount}</b> online
              {memberCount > 0 && <span className="lounge-live-badge__total">· {memberCount} members</span>}
            </button>
            <button type="button" className="lounge-close" onClick={() => handleClose('button')} aria-label="Close lounge">
              <X size={14} weight="bold" />
            </button>
          </div>
        </header>

        <div className={`lounge-split${showSide ? '' : ' is-solo'}${showSide && !showGames ? ' has-chill' : ''}`}>
        <section className="lounge-chat" aria-label="Chat">
        <div className="lounge-stories" ref={storiesRef}>
          {stories.map((s) => {
            const noteAt = s.isMe ? userNoteUpdatedAt : s.noteAt
            const hasNote = isNoteLive(s.isMe ? userNote : s.note, noteAt)
            const note = hasNote ? (s.isMe ? userNote : s.note) : ''
            const openNote = () => {
              setNoteModalInput(note)
              setIsNoteModalOpen(true)
            }
            return (
              <div key={s.id} className={`lounge-story-item${s.isMe ? ' is-me' : ''}`}>
                {s.isMe ? (
                  <button type="button" className={`lounge-note-bubble${hasNote ? '' : ' is-empty'}`} onClick={openNote}>
                    <span>{hasNote ? note : 'Add note'}</span>
                    {hasNote && <NoteReacts items={noteReactionsFor(s.deviceId, noteAt)} />}
                  </button>
                ) : (
                  hasNote && (
                    <button
                      type="button"
                      className="lounge-note-bubble"
                      onClick={() => setViewNoteId(s.id)}
                      aria-label={`${s.name}'s note: ${note}`}
                    >
                      <span>{note}</span>
                      <NoteReacts items={noteReactionsFor(s.deviceId, noteAt)} />
                    </button>
                  )
                )}

                <div
                  className={`lounge-ring${hasNote ? ' lounge-ring--live' : s.isMe ? ' lounge-ring--add' : ''}`}
                  onClick={s.isMe ? openNote : undefined}
                  style={{ cursor: s.isMe ? 'pointer' : 'default' }}
                >
                  <div className="lounge-ring__inner">
                    <LoungeAvatar seed={s.avatarSeed} size={40} />
                  </div>
                  <span
                    className={`lounge-avatar-badge${onlineIds.has(s.deviceId) ? ' is-online' : ' is-offline'}`}
                    role="img"
                    aria-label={onlineIds.has(s.deviceId) ? 'Online' : 'Offline'}
                    title={onlineIds.has(s.deviceId) ? 'Online' : 'Offline'}
                  />
                </div>
                <span className="lounge-story-name">{s.isMe ? 'You' : s.name}</span>
                <span className="lounge-story-time">{hasNote ? formatTimeAgo(noteAt ?? undefined) : ''}</span>
              </div>
            )
          })}

          <button type="button" className="lounge-stories-scroll" onClick={scrollStories} aria-label="Scroll stories">
            <CaretRight size={14} weight="bold" />
          </button>
        </div>

        {(conversations.length > 0 || activeConv) && (
        <div className="lounge-chats" aria-label="Chats">
          <div className="lounge-chats__actions">
            {conversations.length > 0 && (
              <>
                <div className="lounge-chats__rail" role="group" aria-label="Your groups and direct messages">
                  {conversations.map((c) => {
                    const count = unread[c.id] ?? 0
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`lounge-chat-av${activeChat === c.id ? ' is-active' : ''}`}
                        onClick={() => switchChat(c.id)}
                        title={c.name}
                        aria-label={`${c.kind === 'dm' ? 'Message' : 'Group'} ${c.name}${count ? `, ${count} new` : ''}`}
                        aria-pressed={activeChat === c.id}
                      >
                        <span className="lounge-chat-av__img">
                          <span className="lounge-chat-av__inner">
                            {c.kind === 'dm' ? (
                              <LoungeAvatar seed={c.avatarSeed} size={32} />
                            ) : (
                              <span className="lounge-group-icon" style={groupTint(c.id)} aria-hidden="true">
                                {c.icon}
                              </span>
                            )}
                          </span>
                          {c.kind === 'dm' && <span className={`lounge-chat-av__online${online[c.otherId] ? '' : ' is-offline'}`} aria-hidden="true" />}
                          {count > 0 && <b className="lounge-chat-av__badge">{count > 9 ? '9+' : count}</b>}
                          {c.pinned && (
                            <i className="lounge-chat-av__pin" aria-hidden="true">
                              <PinIcon />
                            </i>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {activeConv && (
            <div className="lounge-chat-head">
            <div className="lounge-chat-title" aria-live="polite">
              {activeConv.kind === 'dm' ? (
                <LoungeAvatar seed={activeConv.avatarSeed} size={20} />
              ) : (
                <span className="lounge-group-icon is-sm" style={groupTint(activeConv.id)} aria-hidden="true">
                  {activeConv.icon}
                </span>
              )}
              <b>{activeConv.name}</b>
              {activeConv.kind === 'dm' ? (
                <span className={`lounge-status ${online[activeConv.otherId] ? 'is-online' : 'is-offline'}`}>
                  {online[activeConv.otherId] ? 'Online' : 'Offline'}
                </span>
              ) : (
                <button
                  type="button"
                  className="lounge-chat-title__members"
                  onClick={() => {
                    setGroupInfoView('list')
                    setGroupInfoOpen(true)
                  }}
                  title="See members"
                  aria-haspopup="dialog"
                >
                  <UsersIcon />
                  {activeConv.members.length} members
                  {activeConv.createdBy === deviceId && activeConv.requests.length > 0 && (
                    <i className="lounge-chat-title__pending" aria-label={`${activeConv.requests.length} pending requests`}>
                      {activeConv.requests.length}
                    </i>
                  )}
                </button>
              )}
            </div>
            <div className="lounge-chat-head__right">
              <button
                type="button"
                className={`lounge-chip lounge-chip--icon-only${activeConv.pinned ? ' is-active' : ''}`}
                onClick={() => togglePinChat(activeConv.id)}
                aria-pressed={activeConv.pinned}
                aria-label={activeConv.pinned ? 'Unpin this chat' : 'Pin this chat'}
                title={activeConv.pinned ? 'Unpin chat' : 'Pin chat to the top'}
              >
                <PinIcon />
              </button>
            </div>
            </div>
          )}
        </div>
        )}

        {/* The group's music player is drawn up in the header, beside the speaker button.
            It is still rendered by this component, so its queue, volume and playback are untouched. */}
        {activeMusic && activeConv && (chillPlayer ? chillMusicSlot : groupMusicSlot) &&
          createPortal(
            <>
              <LoungeMusic
                key={activeConv.id}
                variant="group"
                storageKey={`lounge_music_group_${activeConv.id}`}
                open={!!open}
                covered={needsRegistration || isChoosingAvatar || isNoteModalOpen || !!chatSheet || peopleOpen || groupInfoOpen || !!viewNoteId}
                others={groupMusicOthers}
                liveLabel={activeConv.kind === 'dm' ? 'Playing in this chat' : 'Playing in this group'}
                onNowPlaying={(t) => handleGroupNowPlaying(activeConv.id, t)}
                commandRef={groupMusicCommandRef}
                pinned={chillPlayer}
              />
            </>,
            (chillPlayer ? chillMusicSlot : groupMusicSlot) as HTMLDivElement,
          )}

        {/* Global chat on desktop: the Chill Zone plays the lounge music (same queue and /play commands) */}
        {chillPlayer && !activeConv && chillMusicSlot &&
          createPortal(
            <LoungeMusic
              key="global"
              variant="group"
              storageKey={MUSIC_KEY}
              open={!!open}
              covered={needsRegistration || isChoosingAvatar || isNoteModalOpen || !!chatSheet || peopleOpen || groupInfoOpen || !!viewNoteId}
              others={musicOthers}
              onNowPlaying={handleNowPlaying}
              commandRef={musicCommandRef}
              pinned
            />,
            chillMusicSlot,
          )}

        <div className="lounge-feed" onClick={() => { setActiveMsgId(null); setPickerFor(null); setWhoFor(null) }}>
          {messages.length === 0 && (
            <div className="lounge-empty">{activeConv ? `This is the start of your chat with ${activeConv.name}. Say hi!` : 'No messages yet. Say hi and start the conversation.'}</div>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1]
            if (m.system) {
              return (
                <div key={m.id} id={`lounge-msg-${m.id}`} className="lounge-sys" role="status">
                  <span>{m.text}</span>
                </div>
              )
            }
            const showHead =
              !prev ||
              prev.system ||
              prev.author !== m.author ||
              !!m.replyTo ||
              new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60000
            const parent = m.replyTo ? messages.find((x) => x.id === m.replyTo) : null
            const showActions = activeMsgId === m.id || pickerFor === m.id
            const { nodes: textNodes, mentionsMe } = renderMessageText(m.text)
            const whoReaction = whoFor?.messageId === m.id ? m.reactions.find((r) => r.emoji === whoFor.emoji) : undefined

            return (
              <div
                key={m.id}
                id={`lounge-msg-${m.id}`}
                className={`lounge-msg${m.isMe ? ' lounge-msg--me' : ''}${showHead ? '' : ' is-stacked'}${showActions ? ' is-active' : ''}`}
              >
                <div className="lounge-msg__avatar">
                  {showHead && <LoungeAvatar seed={m.avatarSeed} size={30} />}
                </div>

                <div className="lounge-msg__content">
                  {showHead && (
                    <div className="lounge-msg__meta">
                      <span className="lounge-msg__author">{m.isMe ? 'You' : shownName(m.authorId, m.author)}</span>
                      <span className="lounge-msg__time">{m.time}</span>
                    </div>
                  )}

                  <div className="lounge-msg__body">
                    <div className="lounge-actions" onClick={(e) => e.stopPropagation()}>
                      {pickerFor === m.id ? (
                        QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="lounge-actions__emoji"
                            onClick={() => toggleReaction(m.id, emoji)}
                            aria-label={`React with ${emoji}`}
                          >
                            {emoji}
                          </button>
                        ))
                      ) : (
                        <>
                          <button type="button" onClick={() => setPickerFor(m.id)} aria-label="Add reaction" title="React">
                            <SmileIcon />
                          </button>
                          <button type="button" onClick={() => startReply(m)} aria-label="Reply" title="Reply">
                            <ReplyIcon />
                          </button>
                          {m.isMe && (
                            <button type="button" onClick={() => startEdit(m)} aria-label="Edit message" title="Edit">
                              <PencilIcon />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div
                      className={`lounge-msg__bubble${mentionsMe && !m.isMe ? ' has-mention-me' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPickerFor(null)
                        setActiveMsgId((cur) => (cur === m.id ? null : m.id))
                      }}
                    >
                      {m.replyTo && (
                        <button
                          type="button"
                          className="lounge-quote"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (parent) jumpToMessage(parent.id)
                          }}
                        >
                          <b>{parent ? (parent.isMe ? 'You' : shownName(parent.authorId, parent.author)) : 'Message'}</b>
                          <span>{parent ? parent.text : 'Original message unavailable'}</span>
                        </button>
                      )}
                      {textNodes}
                      {m.edited && <span className="lounge-msg__edited">edited</span>}
                    </div>
                  </div>

                  {m.reactions.length > 0 && (
                    <div className="lounge-reactions">
                      {m.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          className={`lounge-reaction${r.mine ? ' is-mine' : ''}${whoReaction?.emoji === r.emoji ? ' is-open' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setPickerFor(null)
                            setActiveMsgId(null)
                            setWhoFor((cur) =>
                              cur?.messageId === m.id && cur.emoji === r.emoji ? null : { messageId: m.id, emoji: r.emoji },
                            )
                          }}
                          aria-expanded={whoReaction?.emoji === r.emoji}
                          aria-label={`${r.emoji} ${r.count}${r.mine ? ', you reacted' : ''}. Show who reacted`}
                        >
                          <span>{r.emoji}</span>
                          <span className="lounge-reaction__count">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {whoReaction && (
                    <div className="lounge-who" role="dialog" aria-label={`People who reacted ${whoReaction.emoji}`} onClick={(e) => e.stopPropagation()}>
                      <div className="lounge-who__head">
                        <span className="lounge-who__emoji">{whoReaction.emoji}</span>
                        <span className="lounge-who__title">
                          {whoReaction.count} {whoReaction.count === 1 ? 'reaction' : 'reactions'}
                        </span>
                        <button type="button" className="lounge-who__close" onClick={() => setWhoFor(null)} aria-label="Close">
                          <X size={11} weight="bold" />
                        </button>
                      </div>
                      <ul className="lounge-who__list">
                        {whoReaction.users.map((u) => (
                          <li key={u.deviceId} className="lounge-who__user">
                            <LoungeAvatar seed={u.avatarSeed} size={24} />
                            <span className="lounge-who__name">{u.isMe ? 'You' : u.name}</span>
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="lounge-who__toggle" onClick={() => toggleReaction(m.id, whoReaction.emoji)}>
                        {whoReaction.mine ? 'Remove your reaction' : `React ${whoReaction.emoji} too`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={feedEndRef} />
        </div>

        {toast && (
          <div className="lounge-toast" role="alert">
            {toast}
          </div>
        )}

        <div className="lounge-bottom">
          {ctxTarget && (
            <div className={`lounge-ctx${editingId ? ' is-edit' : ''}`}>
              <div className="lounge-ctx__text">
                <b>{editingId ? 'Editing message · Enter to save, Esc to cancel' : `Replying to ${ctxTarget.isMe ? 'yourself' : ctxTarget.author}`}</b>
                {!editingId && <span>{ctxTarget.text}</span>}
              </div>
              <button type="button" className="lounge-ctx__close" onClick={cancelComposerMode} aria-label="Cancel">
                <X size={12} weight="bold" />
              </button>
            </div>
          )}

          <div className={`lounge-typing${typingLabel ? ' is-visible' : ''}`} aria-live="polite">
            {typingLabel && (
              <>
                <span className="lounge-typing__dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="lounge-typing__text">{typingLabel}…</span>
              </>
            )}
          </div>

          <div className="lounge-bottom__meta">
            <span className="lounge-name-btn">
              as <b>{userName || 'Loading...'}</b>
            </span>
            <button type="button" className="lounge-avatar-change-btn" onClick={openAvatarPicker}>
              Change avatar
            </button>
          </div>

          <div className="lounge-form-wrap">
            {mentionMenuOpen && (
              <div className="lounge-mention-menu" role="listbox" aria-label="Mention someone">
                <div className="lounge-mention-menu__label">Mention a member</div>
                {mentionCandidates.map((member, i) => (
                  <button
                    key={member.deviceId}
                    type="button"
                    role="option"
                    aria-selected={i === mentionIndex}
                    className={`lounge-mention-item${i === mentionIndex ? ' is-active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setMentionIndex(i)}
                    onClick={() => insertMention(member)}
                  >
                    <LoungeAvatar seed={member.avatarSeed} size={26} />
                    <span className="lounge-mention-item__name">{member.name}</span>
                  </button>
                ))}
              </div>
            )}

          <form className="lounge-form" onSubmit={handleSendMessage}>
            <input
              ref={inputRef}
              type="text"
              className="lounge-input"
              placeholder={editingId ? 'Fix your message, then press Enter' : replyingTo ? 'Write a reply...' : activeConv ? `Message ${activeConv.name}...` : 'Say something nice...'}
              enterKeyHint="send"
              autoComplete="off"
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                  updateMentionQuery(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)
                }
              }}
              onBlur={() => {
                // small delay so a click on the menu still registers
                setTimeout(() => setMentionQuery(null), 120)
                sendTyping(false)
                lastTypingSent.current = 0
              }}
            />
            <button
              type="button"
              className={`lounge-send-btn${inputText.trim() ? ' is-active' : ''}${editingId ? ' is-edit' : ''}`}
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || sending}
              aria-label={editingId ? 'Save edit' : 'Send'}
            >
              {editingId ? 'Save' : 'Send'}
            </button>
          </form>
          </div>
        </div>
        </section>

        <aside className={`lounge-side${showSide ? '' : ' is-hidden'}`} aria-label={showGames ? 'Games' : 'Chill zone'}>
          {!showGames && (
            <ChillZone
              members={chillMembers}
              renderAvatar={(seed, size) => <LoungeAvatar seed={seed} size={size} />}
              onShare={shareToChat}
              shareActivity={shareActivity}
              onToggleActivity={toggleShareActivity}
              onOpenGames={() => setGamesOpen(true)}
              onHide={() => setChillHidden(true)}
              musicSlot={chillPlayer ? <div className="lounge-chill-music-slot" ref={setChillMusicSlot} /> : null}
            />
          )}
          <div className={`lounge-games${showGames ? '' : ' is-hidden'}`}>
            <LoungeGames
              deviceId={deviceId}
              userName={userName}
              avatarSalt={avatarSalt}
              refreshKey={gameRefresh}
              members={allMembers}
              bus={duelBus}
              triviaBank={TRIVIA_BANK}
              onShare={shareToChat}
              onAnnounce={(game, score) => announceScore(score, 0, game)}
              open={open}
              onPlayingChange={setGamePlaying}
              trivia={
                <DevTrivia
                  deviceId={deviceId}
                  userName={userName}
                  avatarSalt={avatarSalt}
                  refreshKey={gameRefresh}
                  onFinished={(score, correct) => announceScore(score, correct)}
                  onShare={shareToChat}
                />
              }
            />
          </div>
        </aside>
        </div>
      </div>
    </div>,
    document.body,
  )}
    </>
  )
}
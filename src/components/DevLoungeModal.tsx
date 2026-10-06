import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, CaretRight, Plus } from '@/components/slab'
import { useDismiss, type DismissReason } from '@/hooks/useDismiss'
import { supabase } from '@/lib/supabase'

export const LOUNGE_OPEN_EVENT = 'lounge:open'

export function openDevLounge(target?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(LOUNGE_OPEN_EVENT, { detail: target }))
}

// Every avatar a member can pick (fixed list, no shuffling)
const AVATAR_SALTS = Array.from({ length: 48 }, (_, i) => `av${String(i + 1).padStart(2, '0')}`)

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '😮', '🙏']

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
  replyTo?: string | null
  edited?: boolean
  reactions: Reaction[]
}

interface StoryUser {
  id: string
  name: string
  updatedAt: string
  time: string
  note: string
  avatarSeed: string
  isMe?: boolean
}

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
const PencilIcon = () => (
  <svg {...iconProps}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

function LoungeAvatar({ seed, size = 36 }: { seed: string; size?: number }) {
  const avatarUrl = `https://api.dicebear.com/10.x/micah/svg?seed=${encodeURIComponent(seed)}`

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

/* ---------- Community game: Daily Dev Trivia ----------
   Everyone gets the same 8 questions each day (seeded by the date), so the
   leaderboard is a fair fight. Scores live in `lounge_scores` (see lounge_scores.sql);
   if that table isn't set up the game still works, it just can't rank people. */

interface TriviaItem {
  q: string
  a: string // the correct answer
  w: string[] // three wrong answers
}

const TRIVIA_BANK: TriviaItem[] = [
  { q: 'Which HTML tag defines the largest heading?', a: '<h1>', w: ['<h6>', '<head>', '<header>'] },
  { q: 'What does CSS stand for?', a: 'Cascading Style Sheets', w: ['Computer Style Sheets', 'Creative Style System', 'Colorful Style Syntax'] },
  { q: 'In JavaScript, what does typeof null return?', a: '"object"', w: ['"null"', '"undefined"', '"number"'] },
  { q: 'Which operator compares both value and type in JavaScript?', a: '===', w: ['==', '=', '!='] },
  { q: 'Which HTTP status code means "Not Found"?', a: '404', w: ['401', '403', '500'] },
  { q: 'What does JSON stand for?', a: 'JavaScript Object Notation', w: ['Java Standard Object Naming', 'JavaScript Online Network', 'Joined Script Object Node'] },
  { q: 'Which React hook runs side effects after render?', a: 'useEffect', w: ['useState', 'useMemo', 'useRef'] },
  { q: 'What is the time complexity of binary search?', a: 'O(log n)', w: ['O(n)', 'O(1)', 'O(n²)'] },
  { q: 'Which data structure follows LIFO order?', a: 'Stack', w: ['Queue', 'Heap', 'Graph'] },
  { q: 'What is the default port for HTTPS?', a: '443', w: ['80', '21', '8080'] },
  { q: 'Which of these is NOT a primitive type in JavaScript?', a: 'Array', w: ['String', 'Boolean', 'Symbol'] },
  { q: 'What does git stash do?', a: 'Shelves uncommitted changes for later', w: ['Deletes your last commit', 'Pushes to the remote', 'Creates a new branch'] },
  { q: 'Which CSS property controls the stacking order of positioned elements?', a: 'z-index', w: ['order', 'layer', 'stack-level'] },
  { q: 'What does DOM stand for?', a: 'Document Object Model', w: ['Data Object Mapping', 'Dynamic Output Method', 'Document Order Markup'] },
  { q: 'What does Array.prototype.map() return?', a: 'A new array', w: ['The original array, mutated', 'A single value', 'undefined'] },
  { q: 'What does console.log(0.1 + 0.2 === 0.3) print in JavaScript?', a: 'false', w: ['true', 'undefined', 'NaN'] },
  { q: 'Which company created TypeScript?', a: 'Microsoft', w: ['Google', 'Meta', 'Oracle'] },
  { q: 'What does API stand for?', a: 'Application Programming Interface', w: ['Applied Program Integration', 'Automated Process Instruction', 'Application Protocol Index'] },
  { q: 'What is the time complexity of reading an array element by index?', a: 'O(1)', w: ['O(log n)', 'O(n)', 'O(n log n)'] },
  { q: 'Which CSS declaration makes an element a flex container?', a: 'display: flex', w: ['flex: container', 'position: flex', 'float: flex'] },
  { q: 'HTTP status codes in the 5xx range mean what?', a: 'Server errors', w: ['Redirects', 'Client errors', 'Success'] },
  { q: 'Which SQL clause filters groups after GROUP BY?', a: 'HAVING', w: ['WHERE', 'FILTER', 'ORDER BY'] },
  { q: 'What is a .gitignore file for?', a: 'Telling Git which files not to track', w: ['Storing commit messages', 'Listing remote branches', 'Encrypting secrets'] },
  { q: 'Which symbol starts a CSS class selector?', a: '. (dot)', w: ['# (hash)', '@ (at)', '* (star)'] },
  { q: 'Which HTTP method is meant to fully replace a resource?', a: 'PUT', w: ['GET', 'HEAD', 'OPTIONS'] },
  { q: 'What does async/await make easier to work with?', a: 'Promises', w: ['CSS animations', 'Web fonts', 'Git merges'] },
  { q: 'In Python, which creates an empty dictionary?', a: '{}', w: ['[]', '()', '<>'] },
  { q: 'Which command installs the dependencies listed in package.json?', a: 'npm install', w: ['npm publish', 'npm init', 'npm audit'] },
  { q: 'In SOLID, what does the "S" stand for?', a: 'Single Responsibility', w: ['Static Typing', 'Separation of Services', 'Shared State'] },
  { q: 'Which keyword declares a block-scoped constant in JavaScript?', a: 'const', w: ['var', 'static', 'final'] },
  { q: 'What does "5" + 3 evaluate to in JavaScript?', a: '"53"', w: ['8', '"8"', 'NaN'] },
]

const TRIVIA_ROUND = 8
const TRIVIA_SECONDS = 15
const MEDALS = ['🥇', '🥈', '🥉']

const triviaDay = () => new Date().toISOString().slice(0, 10) // UTC, so everyone shares one "day"

function hashSeed(s: string) {
  let h = 1779033703 ^ s.length
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

interface TriviaQuestion {
  q: string
  options: string[]
  answer: number
}

function buildRound(day: string): TriviaQuestion[] {
  const rand = mulberry32(hashSeed(`lounge-trivia-${day}`))
  return seededShuffle(TRIVIA_BANK, rand)
    .slice(0, TRIVIA_ROUND)
    .map((item) => {
      const options = seededShuffle([item.a, ...item.w], rand)
      return { q: item.q, options, answer: options.indexOf(item.a) }
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
  correct >= 7 ? 'Dev legend 🏆' : correct >= 5 ? 'Solid work 💪' : correct >= 3 ? 'Getting there 🌱' : 'Warm-up round 😅'

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
  const [session, setSession] = useState(() => {
    const day = triviaDay()
    return { day, round: buildRound(day) }
  })
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>('intro')
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [streak, setStreak] = useState(0)
  const [picked, setPicked] = useState<number | null>(null) // -1 = ran out of time
  const [gain, setGain] = useState(0)
  const [timeLeft, setTimeLeft] = useState(TRIVIA_SECONDS)
  const [best, setBest] = useState(() => readBest(triviaDay()))
  const [shared, setShared] = useState(false)
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [boardState, setBoardState] = useState<'loading' | 'ok' | 'offline'>('loading')

  const deadlineRef = useRef(0)
  const advanceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (advanceRef.current) clearTimeout(advanceRef.current)
    },
    [],
  )

  const loadBoard = useCallback(async () => {
    const { data, error } = await supabase
      .from('lounge_scores')
      .select('device_id, name, avatar_salt, score')
      .eq('day', session.day)
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
  }, [session.day])

  useEffect(() => {
    loadBoard()
  }, [loadBoard, refreshKey])

  const finish = async (finalScore: number, finalCorrect: number) => {
    setPhase('done')
    const prevBest = readBest(session.day)
    if (finalScore > prevBest) saveBest(session.day, finalScore)
    setBest(Math.max(prevBest, finalScore))
    if (!userName) return

    const { error } = await supabase.from('lounge_scores').insert([
      { device_id: deviceId, name: userName, avatar_salt: avatarSalt, score: finalScore, correct: finalCorrect, day: session.day },
    ])
    onFinished(finalScore, finalCorrect)
    if (error) setBoardState('offline')
    else loadBoard()
  }

  const answer = (choice: number) => {
    if (phase !== 'playing' || picked !== null) return
    const q = session.round[index]
    const ok = choice === q.answer
    const left = choice === -1 ? 0 : Math.max(0, (deadlineRef.current - Date.now()) / 1000)

    let gained = 0
    let nextStreak = 0
    if (ok) {
      nextStreak = streak + 1
      // 100 for being right + up to 50 for speed + a small streak bonus
      gained = 100 + Math.round((left / TRIVIA_SECONDS) * 50) + Math.min(nextStreak - 1, 5) * 10
    }
    const newScore = score + gained
    const newCorrect = correct + (ok ? 1 : 0)

    setStreak(nextStreak)
    setScore(newScore)
    setCorrect(newCorrect)
    setGain(gained)
    setPicked(choice)

    advanceRef.current = setTimeout(() => {
      if (index + 1 >= session.round.length) {
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
    const day = triviaDay()
    if (day !== session.day) {
      setSession({ day, round: buildRound(day) })
      setBest(readBest(day))
    }
    setIndex(0)
    setScore(0)
    setCorrect(0)
    setStreak(0)
    setGain(0)
    setPicked(null)
    setShared(false)
    setPhase('playing')
  }

  const myIdx = board.findIndex((r) => r.deviceId === deviceId)

  const boardEl = (
    <section className="lounge-board" aria-label="Today's leaderboard">
      <div className="lounge-board__head">
        <h4>Today's leaderboard</h4>
        <span>Resets daily</span>
      </div>
      {boardState === 'loading' && <p className="lounge-game__note">Loading scores…</p>}
      {boardState === 'offline' && (
        <p className="lounge-game__note">The leaderboard is offline right now. You can still play and share your score in chat.</p>
      )}
      {boardState === 'ok' && board.length === 0 && (
        <p className="lounge-game__note">No scores yet today. Be the first on the board!</p>
      )}
      {boardState === 'ok' && board.length > 0 && (
        <ol className="lounge-board__list">
          {board.slice(0, 10).map((r, i) => (
            <li key={r.deviceId} className={`lounge-board__row${r.deviceId === deviceId ? ' is-me' : ''}`}>
              <span className="lounge-board__rank">{MEDALS[i] ?? i + 1}</span>
              <LoungeAvatar seed={r.avatarSeed} size={28} />
              <span className="lounge-board__name">{r.deviceId === deviceId ? 'You' : r.name}</span>
              <span className="lounge-board__score">{r.score}</span>
            </li>
          ))}
          {myIdx >= 10 && (
            <li className="lounge-board__row is-me">
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

  if (phase === 'playing') {
    const q = session.round[index]
    const low = timeLeft <= 5
    return (
      <div className="lounge-game">
        <div className="lounge-game__hud">
          <span className="lounge-game__progress">
            Question {index + 1} / {session.round.length}
          </span>
          <span className="lounge-game__score">
            {streak >= 2 && <span className="lounge-game__streak">🔥 {streak}</span>}
            {score} pts
          </span>
        </div>

        <div className={`lounge-game__timer${low ? ' is-low' : ''}`} aria-hidden="true">
          <i style={{ transform: `scaleX(${picked === null ? timeLeft / TRIVIA_SECONDS : 0})` }} />
        </div>

        <h3 className="lounge-game__q">{q.q}</h3>

        <div className="lounge-game__opts">
          {q.options.map((opt, i) => {
            const state =
              picked === null ? '' : i === q.answer ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim'
            return (
              <button
                key={opt}
                type="button"
                className={`lounge-game__opt${state}`}
                onClick={() => answer(i)}
                disabled={picked !== null}
              >
                <span className="lounge-game__key">{i + 1}</span>
                <span>{opt}</span>
              </button>
            )
          })}
        </div>

        <div className="lounge-game__feedback" aria-live="polite">
          {picked === -1 && <span className="is-bad">Time's up! The answer was {q.options[q.answer]}</span>}
          {picked !== null && picked !== -1 && picked === q.answer && <span className="is-good">Correct! +{gain}</span>}
          {picked !== null && picked !== -1 && picked !== q.answer && (
            <span className="is-bad">Not quite. The answer was {q.options[q.answer]}</span>
          )}
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const shareText = `🧠 I scored ${score} on today's Dev Trivia (${correct}/${session.round.length} correct). Think you can beat me?`
    return (
      <>
        <div className="lounge-game lounge-game--center">
          <div className="lounge-game__verdict">{verdictFor(correct)}</div>
          <div className="lounge-game__big">{score}</div>
          <p className="lounge-game__sub">
            {correct} of {session.round.length} correct
            {myIdx >= 0 && boardState === 'ok' ? ` · you're #${myIdx + 1} today` : ''}
          </p>
          <div className="lounge-game__actions">
            <button
              type="button"
              className="lounge-game__btn"
              onClick={() => {
                onShare(shareText)
                setShared(true)
              }}
              disabled={shared || !userName}
            >
              {shared ? 'Shared ✓' : 'Share to chat'}
            </button>
            <button type="button" className="lounge-game__btn is-ghost" onClick={start}>
              Play again
            </button>
          </div>
          <p className="lounge-game__note">Same questions all day. Only your best score counts.</p>
        </div>
        {boardEl}
      </>
    )
  }

  return (
    <>
      <div className="lounge-game lounge-game--center">
        <span className="lounge-game__eyebrow">Your daily challenge</span>
        <h3 className="lounge-game__title">Daily Dev Trivia</h3>
        <p className="lounge-game__sub">
          {TRIVIA_ROUND} questions, {TRIVIA_SECONDS}s each. Everyone in the lounge gets the same set today. Answer fast and keep a streak for bonus points.
        </p>
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
  const deviceIdRef = useRef('')
  const userNameRef = useRef('')
  const lastTypingSent = useRef(0)
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
  const [userNoteUpdatedAt, setUserNoteUpdatedAt] = useState<string>(new Date().toISOString())
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

  // Everyone who has joined, keyed by device so reactions can show real names
  const memberByDevice = useMemo(() => {
    const map = new Map<string, LoungeMember>()
    allMembers.forEach((m) => map.set(m.deviceId, m))
    return map
  }, [allMembers])

  // One regex that recognises "@Name" for every known member (names may contain spaces)
  const mentionSource = useMemo(() => {
    const names = Array.from(new Set([...allMembers.map((m) => m.name), userName].filter(Boolean)))
    if (!names.length) return null
    names.sort((a, b) => b.length - a.length)
    return names.map(escapeRegExp).join('|')
  }, [allMembers, userName])

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
    const diffMins = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 60000)
    if (diffMins < 1) return 'just now'
    if (diffMins === 1) return '1m ago'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  // Live ticker for time strings
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const formattedMsgs: Message[] = rawMessages.map((m: any) => {
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
        location: m.location,
        createdAt: m.created_at,
        time: formatTimeAgo(m.created_at),
        text: m.text,
        avatarSeed: m.avatar_seed,
        // Prefer device ownership; fall back to name for messages sent before device_id existed
        isMe: m.device_id ? m.device_id === deviceId : m.author === userName,
        replyTo: m.reply_to ?? null,
        edited: !!m.edited_at,
        reactions: Array.from(grouped.values()),
      }
    })
    setMessages(formattedMsgs)
  }, [rawMessages, rawReactions, userName, deviceId, memberByDevice])

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
      if (seenMsgIds.current.has(m.id)) return
      seenMsgIds.current.add(m.id)
      const mine = m.device_id ? m.device_id === deviceId : m.author === userName
      if (!mine && mentionRe?.test(m.text ?? '')) showToast(`${m.author} mentioned you`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMessages])

  useEffect(() => {
    const formattedStories: StoryUser[] = rawProfiles.map((p: any) => {
      const isSelf = p.device_id === deviceId
      const timestamp = p.created_at || new Date().toISOString()
      if (isSelf) {
        if (!skipNextTimestampUpdate.current) {
          setUserNoteUpdatedAt(timestamp)
        }
        skipNextTimestampUpdate.current = false
      }
      return {
        id: p.id,
        name: p.name,
        updatedAt: timestamp,
        time: formatTimeAgo(timestamp),
        note: p.note,
        avatarSeed: `${p.name}-${p.avatar_salt}`,
        isMe: isSelf,
      }
    })

    // Always put the current user first
    formattedStories.sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : 0))

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
        const rest = prev.filter((m) => !(isTmp(m.id) && m.device_id === row.device_id && m.text === row.text))
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

    const channel = supabase
      .channel('public-lounge')
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        if (!payload || payload.deviceId === deviceIdRef.current) return
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
        showToast(`${payload.name} scored ${payload.score} in Dev Trivia`)
      })
      // Messages (new messages, replies, edits) are applied straight from the event payload,
      // so they show up instantly without another round-trip to the database.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_messages' }, applyMessageChange)
      // Reactions too — counts and "who reacted" update live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_reactions' }, applyReactionChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_profiles' }, () => {
        realtimeAliveRef.current = true
        fetchData()
      })
      .subscribe((status: string, err?: Error) => {
        channelReadyRef.current = status === 'SUBSCRIBED'
        if (status === 'SUBSCRIBED') {
          // (Re)connected — catch up on anything missed while offline / before subscribing
          fetchData()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[lounge] realtime problem:', status, err)
        }
      })

    channelRef.current = channel

    return () => {
      channelReadyRef.current = false
      channelRef.current = null
      Object.values(typingTimers.current).forEach(clearTimeout)
      supabase.removeChannel(channel)
    }
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
      setUserNoteUpdatedAt(data.created_at || new Date().toISOString())
      setAvatarSalt(data.avatar_salt)
      setNeedsRegistration(false)
      fetchData()
    }
  }

  const fetchData = async () => {
    const seq = ++fetchSeq.current
    const epoch = writeEpoch.current
    lastFetchAt.current = Date.now()

    const [msgRes, profileRes, memberRes, reactionRes]: any[] = await Promise.all([
      supabase.from('lounge_messages').select('*').order('created_at', { ascending: true }),
      supabase.from('lounge_profiles').select('*').order('created_at', { ascending: false }).limit(10),
      // Full member list (the stories rail only keeps the 10 newest) — used for @mentions & reaction names
      supabase.from('lounge_profiles').select('device_id, name, avatar_salt').order('name', { ascending: true }),
      supabase.from('lounge_reactions').select('*'),
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
      .update({ note: cleaned })
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
      .update({ note: '' })
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
      payload: { deviceId: deviceIdRef.current, name: userNameRef.current, typing },
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
    const others = allMembers.filter((m) => m.deviceId !== deviceId)
    const starts = others.filter((m) => m.name.toLowerCase().startsWith(q))
    const contains = others.filter((m) => !m.name.toLowerCase().startsWith(q) && m.name.toLowerCase().includes(q))
    return [...starts, ...contains].slice(0, 8)
  }, [mentionQuery, allMembers, deviceId])

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

    if (editingId) {
      await submitEdit(editingId, textToSend)
      return
    }

    const replyId = replyingTo?.id ?? null
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
      showToast(`Message not sent: ${error.message}`)
    }
    setSending(false)
    fetchData()
    inputRef.current?.focus()
  }

  /* ---------- community game ---------- */

  const announceScore = (score: number, correct: number) => {
    const ch = channelRef.current
    if (!ch || !channelReadyRef.current) return
    ch.send({
      type: 'broadcast',
      event: 'game-score',
      payload: { deviceId: deviceIdRef.current, name: userNameRef.current, score, correct },
    })
  }

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

  if (typeof document === 'undefined') return null

  const ctxTarget = editingId
    ? messages.find((m) => m.id === editingId)
    : replyingTo

  return createPortal(
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
                </div>

                <div className="lounge-ring lounge-ring--live lounge-note-modal__avatar-wrap">
                  <div className="lounge-ring__inner">
                    <LoungeAvatar seed={`${userName}-${avatarSalt}`} size={46} />
                  </div>
                </div>

                <div className="lounge-note-modal__name">{userName}</div>
                <div className="lounge-note-modal__time-label">{formatTimeAgo(userNoteUpdatedAt)}</div>
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

        <header className="lounge-header">
          <h2 className="lounge-header__title">Dev Lounge</h2>
          <div className="lounge-header__right">
            <span className="lounge-live-badge">
              <span className="lounge-live-dot" />
              Live · {memberCount} {memberCount === 1 ? 'member' : 'members'} hanging out
            </span>
            <button type="button" className="lounge-close" onClick={() => handleClose('button')} aria-label="Close lounge">
              <X size={14} weight="bold" />
            </button>
          </div>
        </header>

        <div className="lounge-split">
        <section className="lounge-chat" aria-label="Chat">
        <div className="lounge-stories" ref={storiesRef}>
          {stories.map((s) => {
            const note = s.isMe ? userNote : s.note
            const hasNote = !!note
            const openNote = () => {
              setNoteModalInput(userNote)
              setIsNoteModalOpen(true)
            }
            return (
              <div key={s.id} className={`lounge-story-item${s.isMe ? ' is-me' : ''}`}>
                {s.isMe ? (
                  <button type="button" className={`lounge-note-bubble${hasNote ? '' : ' is-empty'}`} onClick={openNote}>
                    <span>{hasNote ? note : 'Add note'}</span>
                  </button>
                ) : (
                  hasNote && (
                    <div className="lounge-note-bubble">
                      <span>{note}</span>
                    </div>
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
                  {s.isMe && (
                    <span className="lounge-avatar-badge">
                      <Plus size={10} weight="bold" />
                    </span>
                  )}
                </div>
                <span className="lounge-story-name">{s.isMe ? 'You' : s.name}</span>
                <span className="lounge-story-time">{s.isMe ? formatTimeAgo(userNoteUpdatedAt) : s.time}</span>
              </div>
            )
          })}

          <button type="button" className="lounge-stories-scroll" onClick={scrollStories} aria-label="Scroll stories">
            <CaretRight size={14} weight="bold" />
          </button>
        </div>

        <div className="lounge-feed" onClick={() => { setActiveMsgId(null); setPickerFor(null); setWhoFor(null) }}>
          {messages.length === 0 && (
            <div className="lounge-empty">No messages yet. Say hi and start the conversation.</div>
          )}

          {messages.length > 0 && <div className="lounge-day">Today</div>}

          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const showHead =
              !prev ||
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
                      <span className="lounge-msg__author">{m.isMe ? 'You' : m.author}</span>
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
                          <b>{parent ? (parent.isMe ? 'You' : parent.author) : 'Message'}</b>
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

          <div className="lounge-bottom__meta">
            <span className="lounge-name-btn">
              as <b>{userName || 'Loading...'}</b>
            </span>
            <button type="button" className="lounge-avatar-change-btn" onClick={openAvatarPicker}>
              Change avatar
            </button>
          </div>

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
              placeholder={editingId ? 'Fix your message, then press Enter' : replyingTo ? 'Write a reply...' : 'Say something nice...'}
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

        <aside className="lounge-side" aria-label="Games">
          <div className="lounge-games">
            <DevTrivia
              deviceId={deviceId}
              userName={userName}
              avatarSalt={avatarSalt}
              refreshKey={gameRefresh}
              onFinished={announceScore}
              onShare={shareToChat}
            />
          </div>
        </aside>
        </div>
      </div>
    </div>,
    document.body,
  )
}
import { useState, useRef, useEffect, useCallback, useMemo, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

/* ===================================================================
   Dev Lounge arcade
   Every game here is self-contained. Scores go to `lounge_game_scores`
   (see lounge_games.sql); if that table isn't set up the games still
   work, they just can't rank people.
   =================================================================== */

/* ---------- shared types ---------- */

export interface DuelBus {
  send: (payload: Record<string, unknown>) => void
  subscribe: (fn: (payload: any) => void) => () => void
}

export interface TriviaItemLike {
  c: string
  q: string
  a: string
  w: string[]
}

export interface GameMember {
  deviceId: string
  name: string
  avatarSeed: string
}

interface GameCtx {
  deviceId: string
  userName: string
  avatarSalt: string
  refreshKey: number
  onShare: (text: string) => void
  onAnnounce: (game: string, score: number) => void
}

/* ---------- shared helpers ---------- */

const DAY_MS = 24 * 60 * 60 * 1000
const MANILA_OFFSET = 8 * 60 * 60 * 1000 // UTC+8, same reset moment as Dev Trivia
const MEDALS = ['🥇', '🥈', '🥉']

const gameDay = () => new Date(Date.now() + MANILA_OFFSET).toISOString().slice(0, 10)
const msUntilReset = () => DAY_MS - ((Date.now() + MANILA_OFFSET) % DAY_MS)
const formatReset = (ms: number) => {
  const mins = Math.max(1, Math.ceil(ms / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const readLS = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const writeLS = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode): the game still works for this session */
  }
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Same seed => same shuffle on every device (used so both duelists get identical questions)
function seededShuffle<T>(items: T[], seed: number): T[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Prefers items you haven't been dealt yet; starts over once the whole bank has been used
function pickFresh<T>(bank: T[], n: number, storeKey: string, idOf: (item: T) => string): T[] {
  let seen: Set<string>
  try {
    const parsed = JSON.parse(readLS(storeKey) || '[]')
    seen = new Set(Array.isArray(parsed) ? parsed.filter((x: unknown): x is string => typeof x === 'string') : [])
  } catch {
    seen = new Set()
  }
  const fresh = bank.filter((i) => !seen.has(idOf(i)))
  let chosen: T[]
  if (fresh.length >= n) {
    chosen = shuffle(fresh).slice(0, n)
  } else {
    const used = bank.filter((i) => seen.has(idOf(i)))
    chosen = [...shuffle(fresh), ...shuffle(used)].slice(0, n)
    seen.clear()
  }
  chosen.forEach((i) => seen.add(idOf(i)))
  writeLS(storeKey, JSON.stringify(Array.from(seen)))
  return shuffle(chosen)
}

// Window key handlers must never steal keys from the chat box or any other field
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)

function Avatar({ seed, size = 28 }: { seed: string; size?: number }) {
  return (
    <img
      src={`https://api.dicebear.com/10.x/micah/svg?seed=${encodeURIComponent(seed)}`}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '50%', backgroundColor: '#E2E8F0', objectFit: 'cover', display: 'block' }}
    />
  )
}

/* ===================================================================
   QUESTION BANKS
   =================================================================== */

interface ChoiceSource {
  tag: string
  q: string
  code?: string
  big?: string
  a: string // correct answer
  w: string[] // three wrong answers
  note?: string
}

// Every snippet below was run in Node to confirm the printed output.
const OUTPUT_BANK: ChoiceSource[] = [
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(typeof null)', a: 'object', w: ['null', 'undefined', 'number'], note: 'A famous bug from the first version of JavaScript that can never be fixed.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(0.1 + 0.2 === 0.3)', a: 'false', w: ['true', 'NaN', '0.3'], note: 'Floating point: 0.1 + 0.2 is 0.30000000000000004.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([] + [])', a: "'' (empty string)", w: ['[]', '0', 'undefined'], note: 'Both arrays turn into empty strings, then get joined.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log('5' - 2)", a: '3', w: ['52', 'NaN', "'3'"], note: 'The minus operator always converts to numbers.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log('5' + 2)", a: '52', w: ['7', 'NaN', '3'], note: 'The plus operator prefers string concatenation if either side is a string.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(typeof NaN)', a: 'number', w: ['NaN', 'undefined', 'object'], note: 'NaN literally means "Not-a-Number", and its type is number.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([1, 2, 3].indexOf(4))', a: '-1', w: ['0', 'undefined', 'null'], note: 'indexOf returns -1 when nothing matches.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(!!"false")', a: 'true', w: ['false', '"false"', 'undefined'], note: 'Any non-empty string is truthy, even the text "false".' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([10, 9, 1].sort())', a: '[ 1, 10, 9 ]', w: ['[ 1, 9, 10 ]', '[ 10, 9, 1 ]', '[ 9, 10, 1 ]'], note: 'sort() compares as strings by default, so "10" comes before "9".' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(1 < 2 < 3, 3 > 2 > 1)', a: 'true false', w: ['true true', 'false false', 'false true'], note: '3 > 2 is true, and true > 1 is false (true becomes 1).' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'const a = [1, 2, 3]\nconst b = a\nb.push(4)\nconsole.log(a.length)', a: '4', w: ['3', '1', 'undefined'], note: 'b is not a copy, it points at the same array as a.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log(null ?? 'x', 0 ?? 'x')", a: 'x 0', w: ['x x', 'null 0', '0 x'], note: '?? only falls back for null or undefined, so 0 is kept.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log(null || 'x', 0 || 'x')", a: 'x x', w: ['x 0', 'null 0', '0 x'], note: '|| falls back for every falsy value, including 0.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log("b" + "a" + +"a" + "a")', a: 'baNaNa', w: ['baaa', 'ba0a', 'NaN'], note: 'The unary + turns "a" into NaN, which is then joined as text.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(typeof undefined, typeof [])', a: 'undefined object', w: ['undefined array', 'object object', 'null array'], note: 'Arrays are objects. Use Array.isArray() to tell them apart.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(a)\nvar a = 5', a: 'undefined', w: ['5', 'ReferenceError', 'null'], note: 'var is hoisted: the declaration moves up but the value does not.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([1, 2, 3].map(parseInt))', a: '[ 1, NaN, NaN ]', w: ['[ 1, 2, 3 ]', '[ 1, 2, NaN ]', '[ NaN, NaN, NaN ]'], note: 'map passes the index as parseInt\'s radix: parseInt("2", 1) is NaN.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(Math.max())', a: '-Infinity', w: ['0', 'Infinity', 'NaN'], note: 'With no arguments, max starts from the lowest possible value.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log(2 ** 3 ** 2)', a: '512', w: ['64', '36', '26'], note: '** is right-associative: 3 ** 2 = 9, then 2 ** 9 = 512.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log(Boolean([]), Boolean(''))", a: 'true false', w: ['false false', 'true true', 'false true'], note: 'An empty array is truthy, an empty string is falsy.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([1, 2, 3].at(-1))', a: '3', w: ['1', 'undefined', '-1'], note: 'at() accepts negative numbers to count from the end.' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log(Number('12px'), parseInt('12px'))", a: 'NaN 12', w: ['12 12', 'NaN NaN', '12 NaN'], note: 'Number() is strict, parseInt() reads until it hits a non-digit.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([1, [2, [3]]].flat().length)', a: '3', w: ['2', '4', '1'], note: 'flat() only goes one level deep by default: [1, 2, [3]].' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log({} + [])', a: '[object Object]', w: ['0', 'NaN', '[]'], note: 'Both sides become strings: "[object Object]" + "".' },
  { tag: 'JavaScript', q: 'What does this print?', code: "console.log('10' > '9', 10 > 9)", a: 'false true', w: ['true true', 'true false', 'false false'], note: 'Two strings are compared character by character: "1" is less than "9".' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'let x = 1\n{\n  let x = 2\n}\nconsole.log(x)', a: '1', w: ['2', 'undefined', 'ReferenceError'], note: 'let is block-scoped, so the inner x is a different variable.' },
  { tag: 'JavaScript', q: 'What does this print?', code: 'console.log([..."hey"].reverse().join(""))', a: 'yeh', w: ['hey', 'y,e,h', 'undefined'], note: 'Spread splits the string into letters, reverse flips them.' },
  { tag: 'Async', q: 'In what order are these printed?', code: "setTimeout(() => console.log('a'), 0)\nPromise.resolve().then(() => console.log('b'))\nconsole.log('c')", a: 'c b a', w: ['a b c', 'c a b', 'b c a'], note: 'Sync code first, then promise callbacks (microtasks), then timers.' },
]

interface BugSource {
  tag: string
  lines: string[]
  bug: number // index of the buggy line
  why: string
}

const BUG_BANK: BugSource[] = [
  { tag: 'JavaScript', lines: ['function sum(arr) {', '  let total = 0', '  for (let i = 0; i <= arr.length; i++) {', '    total += arr[i]', '  }', '  return total', '}'], bug: 2, why: '<= reads one past the end, so the last step adds undefined and the sum becomes NaN.' },
  { tag: 'JavaScript', lines: ["const user = { name: 'Ana' }", "if (user.role = 'admin') {", '  grantAccess()', '}'], bug: 1, why: 'A single = assigns instead of compares, so everyone becomes an admin. Use ===.' },
  { tag: 'JavaScript', lines: ['async function load() {', "  const res = fetch('/api/items')", '  const data = await res.json()', '  return data', '}'], bug: 1, why: 'fetch() returns a promise. Without await, res.json is not a function yet.' },
  { tag: 'CSS', lines: ['.card {', '  display: flex', '  gap: 12px;', '  padding: 16px;', '}'], bug: 1, why: 'The missing semicolon makes "flex gap: 12px" one invalid declaration, so both are dropped.' },
  { tag: 'HTML', lines: ['<label for="email">Email</label>', '<input id="mail" type="email">'], bug: 1, why: 'The label points at "email" but the input id is "mail", so clicking the label does nothing.' },
  { tag: 'React', lines: ['function Counter() {', '  const [n, setN] = useState(0)', '  return <button onClick={setN(n + 1)}>{n}</button>', '}'], bug: 2, why: 'setN(n + 1) runs during render and triggers an endless loop. Pass a function: () => setN(n + 1).' },
  { tag: 'JavaScript', lines: ['const nums = [1, 2, 3]', 'const doubled = nums.map(n => {', '  n * 2', '})'], bug: 2, why: 'A block body needs an explicit return, so this is an array of undefined.' },
  { tag: 'TypeScript', lines: ['function first<T>(items: T[]): T {', '  return items[0]', '}', 'const x: string = first([1, 2, 3])'], bug: 3, why: 'first([1, 2, 3]) is a number, which cannot be assigned to a string.' },
  { tag: 'JavaScript', lines: ['for (var i = 0; i < 3; i++) {', '  setTimeout(() => console.log(i), 100)', '}'], bug: 0, why: 'var is shared across iterations, so this prints 3, 3, 3. Use let.' },
  { tag: 'Python', lines: ['def add_item(item, items=[]):', '    items.append(item)', '    return items'], bug: 0, why: 'The default list is created once and shared between calls. Use None and create it inside.' },
  { tag: 'JavaScript', lines: ['const total = items.reduce((sum, item) => {', '  return sum + item.price', '})'], bug: 2, why: 'There is no initial value, so the first item itself is used as the starting sum. Add , 0.' },
  { tag: 'SQL', lines: ['SELECT name, COUNT(*)', 'FROM orders', 'WHERE COUNT(*) > 5', 'GROUP BY name;'], bug: 2, why: 'Aggregates cannot be filtered in WHERE. Use HAVING after GROUP BY.' },
  { tag: 'JavaScript', lines: ["const settings = { theme: 'light' }", 'const copy = settings', "copy.theme = 'dark'", '// settings must stay unchanged'], bug: 1, why: 'This copies the reference, not the object. Use { ...settings } to make a real copy.' },
  { tag: 'React', lines: ['useEffect(() => {', '  fetchUser(id)', '}, [])'], bug: 2, why: 'id is missing from the dependency array, so the effect never re-runs when it changes.' },
  { tag: 'HTML', lines: ['<button type="submit" disabled="false">', '  Save', '</button>'], bug: 0, why: 'The disabled attribute only needs to be present. disabled="false" still disables the button.' },
  { tag: 'JavaScript', lines: ["const price = '19.99'", 'const total = price + 1', 'console.log(total) // expected 20.99'], bug: 1, why: 'price is a string, so + joins the text and gives "19.991". Convert with Number() first.' },
]

const EMOJI_BANK: ChoiceSource[] = [
  { tag: 'Emoji', q: 'What does this represent?', big: '🐍', a: 'Python', w: ['Ruby', 'Swift', 'Perl'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🐳', a: 'Docker', w: ['Kubernetes', 'Vagrant', 'Terraform'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🦀', a: 'Rust', w: ['Go', 'Zig', 'Crystal'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '⚛️', a: 'React', w: ['Redux', 'Svelte', 'Angular'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🐧', a: 'Linux', w: ['Ubuntu only', 'macOS', 'Android'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '☕', a: 'Java', w: ['JavaScript', 'Kotlin', 'C#'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🐙🐱', a: 'GitHub', w: ['GitLab', 'Bitbucket', 'Jira'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '💎', a: 'Ruby', w: ['Elm', 'Elixir', 'Julia'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🍃', a: 'MongoDB', w: ['Redis', 'MySQL', 'SQLite'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🔥🦊', a: 'Firefox', w: ['Brave', 'Opera', 'Safari'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🐹', a: 'Go', w: ['Rust', 'Dart', 'Nim'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🐛', a: 'A bug', w: ['A feature', 'A deploy', 'A merge conflict'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🧱🔥', a: 'A firewall', w: ['A load balancer', 'A VPN', 'A proxy'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '☁️', a: 'Cloud hosting', w: ['A CDN edge', 'A cron job', 'A webhook'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🔑🔒', a: 'Encryption', w: ['Compression', 'Caching', 'Minification'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '📦', a: 'A package (npm)', w: ['A commit', 'A container log', 'A pull request'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🌿', a: 'A Git branch', w: ['A Git tag', 'A stash', 'A fork'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🔀', a: 'A Git merge', w: ['A rebase', 'A revert', 'A cherry-pick'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🔁', a: 'A loop', w: ['A function', 'A callback', 'A ternary'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🧪', a: 'A unit test', w: ['A linter', 'A build step', 'A migration'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🗄️', a: 'A database', w: ['A cache', 'A queue', 'A log file'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🎨', a: 'CSS', w: ['SVG', 'A canvas API', 'JSON'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '📱💻', a: 'Responsive design', w: ['Progressive enhancement', 'Cross-compiling', 'Hot reloading'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🚀', a: 'Deploying to production', w: ['Refactoring', 'Code review', 'Debugging'] },
  { tag: 'Emoji', q: 'What does this represent?', big: '🧊', a: 'Object.freeze (immutable data)', w: ['A memory leak', 'A deadlock', 'Garbage collection'] },
]

/* Higher or Lower: pairs always come from the same deck */
interface HiLoItem {
  n: string
  v: number
}
interface HiLoDeck {
  id: 'year' | 'port'
  ask: string
  hi: string
  lo: string
  fmt: (v: number) => string
  items: HiLoItem[]
}

const HILO_DECKS: HiLoDeck[] = [
  {
    id: 'year',
    ask: 'Was it first released later or earlier?',
    hi: 'Later',
    lo: 'Earlier',
    fmt: (v) => String(v),
    items: [
      { n: 'Fortran', v: 1957 }, { n: 'Lisp', v: 1958 }, { n: 'COBOL', v: 1959 }, { n: 'C', v: 1972 }, { n: 'SQL', v: 1974 },
      { n: 'Perl', v: 1987 }, { n: 'Haskell', v: 1990 }, { n: 'Python', v: 1991 }, { n: 'Linux', v: 1991 }, { n: 'Lua', v: 1993 },
      { n: 'Java', v: 1995 }, { n: 'PHP', v: 1995 }, { n: 'C#', v: 2000 }, { n: 'Scala', v: 2004 }, { n: 'Git', v: 2005 },
      { n: 'jQuery', v: 2006 }, { n: 'GitHub', v: 2008 }, { n: 'Node.js', v: 2009 }, { n: 'Go', v: 2009 }, { n: 'Rust', v: 2010 },
      { n: 'npm', v: 2010 }, { n: 'Kotlin', v: 2011 }, { n: 'TypeScript', v: 2012 }, { n: 'Docker', v: 2013 }, { n: 'React', v: 2013 },
      { n: 'Vue', v: 2014 }, { n: 'Swift', v: 2014 }, { n: 'Kubernetes', v: 2014 }, { n: 'VS Code', v: 2015 }, { n: 'Tailwind CSS', v: 2017 },
      { n: 'Deno', v: 2018 }, { n: 'Vite', v: 2020 },
    ],
  },
  {
    id: 'port',
    ask: 'Is its default port number higher or lower?',
    hi: 'Higher',
    lo: 'Lower',
    fmt: (v) => `:${v}`,
    items: [
      { n: 'FTP', v: 21 }, { n: 'SSH', v: 22 }, { n: 'Telnet', v: 23 }, { n: 'SMTP', v: 25 }, { n: 'DNS', v: 53 },
      { n: 'HTTP', v: 80 }, { n: 'POP3', v: 110 }, { n: 'IMAP', v: 143 }, { n: 'HTTPS', v: 443 }, { n: 'MySQL', v: 3306 },
      { n: 'PostgreSQL', v: 5432 }, { n: 'Redis', v: 6379 }, { n: 'MongoDB', v: 27017 },
    ],
  },
]

const TYPING_SNIPPETS = [
  'const sum = (a, b) => a + b;',
  'git commit -m "fix: typo"',
  '<div className="card"></div>',
  'npm install --save-dev vite',
  'SELECT * FROM users WHERE id = 1;',
  'if (!ok) { return null }',
  'docker run -p 3000:3000 app',
  '.box { display: grid; gap: 8px; }',
  'fetch(url).then(r => r.json())',
  'for (const x of list) log(x)',
  'export default function App() {}',
  'const [on, setOn] = useState(false)',
  'git checkout -b feature/login',
  'arr.filter(Boolean).map(String)',
]

const WORD_BANK = Array.from(
  new Set(
    (
      'ARRAY ASYNC AWAIT BATCH BLOCK BRACE BUILD BYTES CACHE CATCH CHAIN CLASS CLONE CLOSE CLOUD CRASH DEBUG DEPTH ' +
      'EMAIL ERROR EVENT FETCH FIELD FLAGS FLOAT FRAME FRONT GRAPH HOOKS INDEX INPUT LAYER LINUX LOGIC LOGIN LOOPS ' +
      'MACRO MERGE MODAL MODEL MOUNT NODES PARSE PATCH PIXEL PROPS PROXY QUERY QUEUE REACT REDIS REDUX REGEX ROUTE ' +
      'SCOPE SHARD SHELL SLICE SPLIT STACK STATE STORE STYLE SWIFT TABLE TOKEN TRACE TUPLE UNION VALUE WHILE YIELD ' +
      'AGILE SCRUM FLASK RAILS MYSQL MONGO STUBS PIPES TIMER ALIAS BASIC CLICK DRAFT'
    ).split(' '),
  ),
).filter((w) => w.length === 5)

/* Would You Rather prompts. Votes are shared through `lounge_game_votes`. */
const WYR_BANK: { id: string; a: string; b: string }[] = [
  { id: 'tabs', a: 'Tabs', b: 'Spaces' },
  { id: 'theme', a: 'Light mode forever', b: 'Dark mode forever' },
  { id: 'stack', a: 'Only ever work on the frontend', b: 'Only ever work on the backend' },
  { id: 'editor', a: 'Vim for the rest of your career', b: 'A mouse-only editor for the rest of your career' },
  { id: 'semi', a: 'Semicolons everywhere', b: 'No semicolons anywhere' },
  { id: 'arch', a: 'A giant monolith', b: '200 tiny microservices' },
  { id: 'debug', a: 'Debug with console.log only', b: 'Debug with a real debugger only' },
  { id: 'rewrite', a: 'Rewrite the whole app from scratch', b: 'Refactor the old code one piece at a time' },
  { id: 'friday', a: 'Deploy on a Friday afternoon', b: 'Never deploy again' },
  { id: 'docs', a: 'Write all the documentation', b: 'Write all the tests' },
  { id: 'types', a: 'Strict types everywhere', b: 'No types at all' },
  { id: 'pair', a: 'Pair programming all day', b: 'Solo, no meetings, no help' },
  { id: 'monitors', a: 'One huge ultrawide monitor', b: 'Three small monitors' },
  { id: 'keyboard', a: 'A loud mechanical keyboard', b: 'A silent laptop keyboard' },
  { id: 'bug', a: 'Fix a bug at 2 AM', b: 'Ship with a known bug and sleep' },
  { id: 'names', a: 'camelCase everywhere', b: 'snake_case everywhere' },
  { id: 'remote', a: 'Work from home forever', b: 'A great office with free food' },
  { id: 'ai', a: 'Never use Stack Overflow again', b: 'Never use AI autocomplete again' },
]

/* ===================================================================
   LEADERBOARD
   =================================================================== */

interface BoardRow {
  deviceId: string
  name: string
  avatarSeed: string
  score: number
}

type BoardState = 'loading' | 'ok' | 'offline'

// agg 'best' keeps each player's best score of the day; 'sum' adds every score up (used for duel wins)
function useBoard(game: string, refreshKey: number, agg: 'best' | 'sum' = 'best') {
  const [day, setDay] = useState(gameDay)
  const [rows, setRows] = useState<BoardRow[]>([])
  const [state, setState] = useState<BoardState>('loading')
  const [resetIn, setResetIn] = useState(msUntilReset)

  useEffect(() => {
    const timer = setInterval(() => {
      setResetIn(msUntilReset())
      const today = gameDay()
      setDay((prev) => (prev === today ? prev : today))
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const load = useCallback(
    async (forDay: string = day) => {
      const { data, error } = await supabase
        .from('lounge_game_scores')
        .select('device_id, name, avatar_salt, score')
        .eq('game', game)
        .eq('day', forDay)
        .order('score', { ascending: false })
        .limit(300)
      if (error || !data) {
        setState('offline')
        return
      }
      const map = new Map<string, BoardRow>()
      for (const r of data as any[]) {
        const prev = map.get(r.device_id)
        if (!prev) {
          map.set(r.device_id, { deviceId: r.device_id, name: r.name, avatarSeed: `${r.name}-${r.avatar_salt}`, score: r.score })
        } else if (agg === 'sum') {
          prev.score += r.score
        }
      }
      setRows(Array.from(map.values()).sort((a, b) => b.score - a.score))
      setState('ok')
    },
    [game, day, agg],
  )

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const submit = useCallback(
    async (p: { deviceId: string; name: string; avatarSalt: string; score: number }) => {
      const today = gameDay()
      const { error } = await supabase
        .from('lounge_game_scores')
        .insert([{ game, device_id: p.deviceId, name: p.name, avatar_salt: p.avatarSalt, score: p.score, day: today }])
      if (error) {
        setState('offline')
        return false
      }
      await load(today)
      return true
    },
    [game, load],
  )

  return { day, rows, state, resetIn, load, submit }
}

interface BoardProps {
  rows: BoardRow[]
  state: BoardState
  resetIn: number
  deviceId: string
  subtitle: string
  unit?: string
}

function Board({ rows, state, resetIn, deviceId, subtitle, unit }: BoardProps) {
  const myIdx = rows.findIndex((r) => r.deviceId === deviceId)
  const top = rows[0]?.score || 1
  const rowStyle = (score: number) => ({ '--pct': `${Math.max(6, Math.round((score / top) * 100))}%` }) as CSSProperties
  const fmt = (n: number) => (unit ? `${n} ${unit}` : String(n))

  return (
    <section className="lounge-board" aria-label="Today's leaderboard">
      <div className="lounge-board__head">
        <div>
          <h4>Leaderboard</h4>
          <p>{subtitle}</p>
        </div>
        <span className="lounge-board__reset" title="The leaderboard refreshes every 24 hours">
          Resets in {formatReset(resetIn)}
        </span>
      </div>
      {state === 'loading' && <p className="lounge-game__note">Loading scores…</p>}
      {state === 'offline' && (
        <p className="lounge-game__note">The leaderboard is offline right now. You can still play and share your score in chat.</p>
      )}
      {state === 'ok' && rows.length === 0 && <p className="lounge-game__note">Fresh board, no scores yet. Be the first one on it!</p>}
      {state === 'ok' && rows.length > 0 && (
        <ol className="lounge-board__list">
          {rows.slice(0, 10).map((r, i) => (
            <li
              key={r.deviceId}
              className={`lounge-board__row${r.deviceId === deviceId ? ' is-me' : ''}${i < 3 ? ` is-top is-top-${i + 1}` : ''}`}
              style={rowStyle(r.score)}
            >
              <span className="lounge-board__rank">{MEDALS[i] ?? i + 1}</span>
              <Avatar seed={r.avatarSeed} size={28} />
              <span className="lounge-board__name">{r.deviceId === deviceId ? 'You' : r.name}</span>
              <span className="lounge-board__score">{fmt(r.score)}</span>
            </li>
          ))}
          {myIdx >= 10 && (
            <li className="lounge-board__row is-me" style={rowStyle(rows[myIdx].score)}>
              <span className="lounge-board__rank">{myIdx + 1}</span>
              <Avatar seed={rows[myIdx].avatarSeed} size={28} />
              <span className="lounge-board__name">You</span>
              <span className="lounge-board__score">{fmt(rows[myIdx].score)}</span>
            </li>
          )}
        </ol>
      )}
    </section>
  )
}

/* ===================================================================
   ARCADE SHELL: intro -> playing -> result, plus the daily leaderboard
   =================================================================== */

interface ArcadeResult {
  score: number
  verdict: string
  sub: string
  stats: [string, string | number][]
  shareText: string
}

interface ArcadeProps {
  game: string
  ctx: GameCtx
  icon: string
  title: string
  eyebrow: string
  blurb: string
  facts: ReactNode[]
  announceName: string
  unit?: string
  daily?: boolean // one scored attempt per day
  startLabel?: string
  autoStart?: boolean // skip the intro card and start playing right away
  onBack?: () => void // adds a "Change mode" button on the result screen
  renderPlay: (finish: (r: ArcadeResult) => void) => ReactNode
}

function Arcade(props: ArcadeProps) {
  const { game, ctx, icon, title, eyebrow, blurb, facts, announceName, unit, daily, renderPlay } = props
  const board = useBoard(game, ctx.refreshKey)
  const [phase, setPhase] = useState<'intro' | 'playing' | 'done'>(props.autoStart ? 'playing' : 'intro')
  const [result, setResult] = useState<ArcadeResult | null>(null)
  const [run, setRun] = useState(0)
  const [shared, setShared] = useState(false)

  const bestKey = `lounge_arcade_best_${game}_${board.day}`
  const dailyKey = `lounge_arcade_daily_${game}_${board.day}`
  const [best, setBest] = useState(() => Number(readLS(bestKey)) || 0)
  useEffect(() => {
    setBest(Number(readLS(bestKey)) || 0)
  }, [bestKey])

  const finish = async (r: ArcadeResult) => {
    setResult(r)
    setShared(false)
    setPhase('done')
    const prev = Number(readLS(bestKey)) || 0
    if (r.score > prev) writeLS(bestKey, String(r.score))
    setBest(Math.max(prev, r.score))
    if (daily) {
      if (readLS(dailyKey)) return
      writeLS(dailyKey, JSON.stringify(r))
    }
    if (!ctx.userName || r.score <= 0) return
    const ok = await board.submit({ deviceId: ctx.deviceId, name: ctx.userName, avatarSalt: ctx.avatarSalt, score: r.score })
    if (ok) ctx.onAnnounce(announceName, r.score)
  }
  const finishRef = useRef(finish)
  finishRef.current = finish
  const stableFinish = useCallback((r: ArcadeResult) => finishRef.current(r), [])

  const start = () => {
    if (daily) {
      const saved = readLS(dailyKey)
      if (saved) {
        try {
          setResult(JSON.parse(saved) as ArcadeResult)
          setShared(false)
          setPhase('done')
          return
        } catch {
          /* corrupt entry: just let them play */
        }
      }
    }
    setRun((n) => n + 1)
    setPhase('playing')
  }

  const boardEl = (
    <Board
      rows={board.rows}
      state={board.state}
      resetIn={board.resetIn}
      deviceId={ctx.deviceId}
      subtitle={daily ? 'Today\'s result' : 'Best score of the day'}
      unit={unit}
    />
  )

  if (phase === 'playing') {
    return <div key={run}>{renderPlay(stableFinish)}</div>
  }

  if (phase === 'done' && result) {
    const myIdx = board.rows.findIndex((r) => r.deviceId === ctx.deviceId)
    return (
      <>
        <div className="lounge-game lounge-game--result">
          <span className="lounge-game__verdict">{result.verdict}</span>
          <div className="lounge-game__big">
            {result.score}
            {unit && <small>{unit}</small>}
          </div>
          <p className="lounge-game__sub">
            {result.sub}
            {myIdx >= 0 && board.state === 'ok' ? ` · you're #${myIdx + 1} today` : ''}
          </p>
          <div className="lounge-game__stats">
            {result.stats.map(([label, value]) => (
              <div key={label}>
                <b>{value}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="lounge-game__actions">
            {!daily && (
              <button type="button" className="lounge-game__btn" onClick={start}>
                Play again
              </button>
            )}
            <button
              type="button"
              className="lounge-game__btn is-ghost"
              onClick={() => {
                ctx.onShare(result.shareText)
                setShared(true)
              }}
              disabled={shared || !ctx.userName}
            >
              {shared ? 'Shared ✓' : 'Share to chat'}
            </button>
            {props.onBack && (
              <button type="button" className="lounge-game__btn is-ghost" onClick={props.onBack}>
                Change mode
              </button>
            )}
          </div>
          {daily && <p className="lounge-game__note">One try per day. A new puzzle drops when the board resets.</p>}
        </div>
        {boardEl}
      </>
    )
  }

  const playedToday = daily && !!readLS(dailyKey)
  return (
    <>
      <div className="lounge-game lounge-game--center lounge-game--intro">
        <div className="lounge-game__glow" aria-hidden="true" />
        <div className="lounge-game__badge" aria-hidden="true">
          {icon}
        </div>
        <span className="lounge-game__eyebrow">{eyebrow}</span>
        <h3 className="lounge-game__title">{title}</h3>
        <p className="lounge-game__sub">{blurb}</p>
        <ul className="lounge-game__facts">
          {facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
        {best > 0 && (
          <div className="lounge-game__chip">
            <span>Your best today</span>
            <b>{unit ? `${best} ${unit}` : best}</b>
          </div>
        )}
        <div className="lounge-game__actions">
          <button type="button" className="lounge-game__btn" onClick={start} disabled={!ctx.userName}>
            {playedToday ? "See today's result" : props.startLabel ?? (best > 0 ? 'Play again' : 'Start playing')}
          </button>
        </div>
      </div>
      {boardEl}
    </>
  )
}

/* ===================================================================
   QUIZ RUNNER: timed rounds shared by Output, Bug Hunt, Emoji and Quiz Duel
   =================================================================== */

type StepResult = 'right' | 'wrong' | 'skip'

const RING_R = 18
const RING_C = 2 * Math.PI * RING_R

interface QuizItem {
  tag: string
  answer: number
}

interface QuizSummary {
  score: number
  correct: number
  bestStreak: number
  total: number
  log: StepResult[]
}

interface QuizRunnerProps<T extends QuizItem> {
  items: T[]
  seconds: number
  view: (item: T, picked: number | null, pick: (choice: number) => void) => ReactNode
  reveal: (item: T) => string
  explain?: (item: T) => string | undefined
  numberKeys?: boolean
  onProgress?: (answered: number) => void
  onDone: (summary: QuizSummary) => void
}

function QuizRunner<T extends QuizItem>(props: QuizRunnerProps<T>) {
  const { items, seconds, view, reveal, explain, numberKeys } = props
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [log, setLog] = useState<StepResult[]>([])
  const [gain, setGain] = useState(0)
  const [hud, setHud] = useState({ score: 0, streak: 0 })

  const totals = useRef({ score: 0, correct: 0, streak: 0, best: 0, log: [] as StepResult[] })
  const locked = useRef(false)
  const deadline = useRef(0)
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doneRef = useRef(props.onDone)
  doneRef.current = props.onDone
  const progressRef = useRef(props.onProgress)
  progressRef.current = props.onProgress

  useEffect(
    () => () => {
      if (advance.current) clearTimeout(advance.current)
    },
    [],
  )

  const item = items[index]

  const answer = (choice: number) => {
    if (locked.current || !item) return
    locked.current = true
    const t = totals.current
    const ok = choice === item.answer
    const left = choice === -1 ? 0 : Math.max(0, (deadline.current - Date.now()) / 1000)
    let gained = 0
    if (ok) {
      t.streak += 1
      t.correct += 1
      // 100 for being right + up to 50 for speed + a small streak bonus (same formula as Dev Trivia)
      gained = 100 + Math.round((left / seconds) * 50) + Math.min(t.streak - 1, 5) * 10
    } else {
      t.streak = 0
    }
    t.best = Math.max(t.best, t.streak)
    t.score += gained
    t.log = [...t.log, ok ? 'right' : choice === -1 ? 'skip' : 'wrong']

    setGain(gained)
    setPicked(choice)
    setHud({ score: t.score, streak: t.streak })
    setLog(t.log)
    progressRef.current?.(index + 1)

    const hasNote = !!(explain && explain(item))
    advance.current = setTimeout(
      () => {
        if (index + 1 >= items.length) {
          doneRef.current({ score: t.score, correct: t.correct, bestStreak: t.best, total: items.length, log: t.log })
        } else {
          locked.current = false
          setIndex(index + 1)
          setPicked(null)
        }
      },
      hasNote ? 2600 : ok ? 1100 : 1700,
    )
  }
  const answerRef = useRef(answer)
  answerRef.current = answer

  // Countdown for the current question
  useEffect(() => {
    if (picked !== null) return
    deadline.current = Date.now() + seconds * 1000
    setTimeLeft(seconds)
    const timer = setInterval(() => {
      const left = Math.max(0, (deadline.current - Date.now()) / 1000)
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(timer)
        answerRef.current(-1)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [index, picked, seconds])

  // Keys 1-4 pick an answer (never while typing in the chat box)
  useEffect(() => {
    if (!numberKeys) return
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= 4) answerRef.current(n - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [numberKeys])

  if (!item) return null
  const low = timeLeft <= 5
  const frac = Math.min(1, Math.max(0, timeLeft / seconds))
  const note = picked !== null ? explain?.(item) : undefined

  return (
    <div className="lounge-game lounge-game--play" key={`q-${index}`}>
      <div className="lounge-game__top">
        <div className="lounge-game__meta">
          <span className="lounge-game__cat">{item.tag}</span>
          <span className="lounge-game__count">
            Round {index + 1} of {items.length}
          </span>
        </div>
        <div className={`lounge-game__ring${low && picked === null ? ' is-low' : ''}`} role="timer" aria-label={`${Math.ceil(timeLeft)} seconds left`}>
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle className="lounge-game__ring-bg" cx="22" cy="22" r={RING_R} />
            <circle className="lounge-game__ring-fg" cx="22" cy="22" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
          </svg>
          <b>{Math.ceil(timeLeft)}</b>
        </div>
      </div>

      <div className="lounge-game__steps" aria-hidden="true">
        {items.map((_, i) => (
          <i key={i} className={`is-${log[i] ?? (i === index ? 'current' : 'todo')}`} />
        ))}
      </div>

      {view(item, picked, answer)}

      <div className="lounge-game__feedback" aria-live="polite">
        {picked === -1 && <span className="is-bad">Time's up! {reveal(item)}</span>}
        {picked !== null && picked !== -1 && picked === item.answer && (
          <span className="is-good">
            Correct! <b>+{gain}</b>
          </span>
        )}
        {picked !== null && picked !== -1 && picked !== item.answer && <span className="is-bad">Not quite. {reveal(item)}</span>}
      </div>
      {note && <p className="lounge-game__why">{note}</p>}

      <div className="lounge-game__foot">
        <span className="lounge-game__score">⚡ {hud.score} pts</span>
        {hud.streak >= 2 && <span className="lounge-game__streak">🔥 {hud.streak} in a row</span>}
      </div>
    </div>
  )
}

/* ---------- views + builders for the quiz-style games ---------- */

interface ChoiceItem extends QuizItem {
  q: string
  code?: string
  big?: string
  options: string[]
  note?: string
}

function toChoice(src: ChoiceSource, options: string[]): ChoiceItem {
  return { tag: src.tag, q: src.q, code: src.code, big: src.big, options, answer: options.indexOf(src.a), note: src.note }
}

function dealChoices(bank: ChoiceSource[], n: number, seenKey: string): ChoiceItem[] {
  return pickFresh(bank, n, seenKey, (i) => i.code ?? i.big ?? i.q).map((src) => toChoice(src, shuffle([src.a, ...src.w])))
}

function ChoiceView({ item, picked, pick }: { item: ChoiceItem; picked: number | null; pick: (i: number) => void }) {
  return (
    <>
      {item.big && <div className="lounge-emoji-big">{item.big}</div>}
      {item.code && (
        <pre className="lounge-code" tabIndex={0}>
          <code>{item.code}</code>
        </pre>
      )}
      <h3 className="lounge-game__q">{item.q}</h3>
      <div className="lounge-game__opts">
        {item.options.map((opt, i) => {
          const state = picked === null ? '' : i === item.answer ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim'
          return (
            <button
              key={i}
              type="button"
              className={`lounge-game__opt${state}`}
              style={{ '--i': i } as CSSProperties}
              onClick={() => pick(i)}
              disabled={picked !== null}
            >
              <span className="lounge-game__key">{i + 1}</span>
              <span className="lounge-game__opt-text">{opt}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}

const choiceReveal = (item: ChoiceItem) => `The answer was ${item.options[item.answer]}`

function quizVerdict(correct: number, total: number, tiers: [string, string, string, string]) {
  const r = total ? correct / total : 0
  return r >= 0.9 ? tiers[0] : r >= 0.65 ? tiers[1] : r >= 0.35 ? tiers[2] : tiers[3]
}

function quizResult(label: string, emoji: string, s: QuizSummary, tiers: [string, string, string, string]): ArcadeResult {
  return {
    score: s.score,
    verdict: quizVerdict(s.correct, s.total, tiers),
    sub: `${s.correct} of ${s.total} correct`,
    stats: [
      ['Accuracy', `${s.total ? Math.round((s.correct / s.total) * 100) : 0}%`],
      ['Best streak', s.bestStreak],
      ['Correct', `${s.correct}/${s.total}`],
    ],
    shareText: `${emoji} I scored ${s.score} on ${label} (${s.correct}/${s.total} correct). Think you can beat me?`,
  }
}

/* ===================================================================
   GAME: Guess the Output
   =================================================================== */

function OutputRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const items = useMemo(() => dealChoices(OUTPUT_BANK, 8, 'lounge_output_seen'), [])
  return (
    <QuizRunner
      items={items}
      seconds={20}
      numberKeys
      view={(item, picked, pick) => <ChoiceView item={item} picked={picked} pick={pick} />}
      reveal={choiceReveal}
      explain={(item) => item.note}
      onDone={(s) => finish(quizResult("today's Guess the Output", '🔮', s, ['Human compiler 🏆', 'Sharp eyes 💪', 'Getting there 🌱', 'The console fooled you 😅']))}
    />
  )
}

function OutputGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="output"
      ctx={ctx}
      icon="🔮"
      title="Guess the Output"
      eyebrow="Daily challenge"
      blurb="Read the snippet, then say what it prints. JavaScript loves a plot twist, so trust nothing."
      facts={[<><b>8</b> snippets</>, <><b>20s</b> each</>, <><b>New</b> set every play</>]}
      announceName="Guess the Output"
      renderPlay={(finish) => <OutputRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Emoji Decoder
   =================================================================== */

function EmojiRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const items = useMemo(() => dealChoices(EMOJI_BANK, 10, 'lounge_emoji_seen'), [])
  return (
    <QuizRunner
      items={items}
      seconds={12}
      numberKeys
      view={(item, picked, pick) => <ChoiceView item={item} picked={picked} pick={pick} />}
      reveal={choiceReveal}
      onDone={(s) => finish(quizResult("today's Emoji Decoder", '🎭', s, ['Fluent in emoji 🏆', 'Nicely decoded 💪', 'Warming up 🌱', 'Lost in translation 😅']))}
    />
  )
}

function EmojiGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="emoji"
      ctx={ctx}
      icon="🎭"
      title="Emoji Decoder"
      eyebrow="Quick play"
      blurb="Guess the tool, language or dev concept from a few emojis. No code reading needed."
      facts={[<><b>10</b> rounds</>, <><b>12s</b> each</>, <><b>New</b> set every play</>]}
      announceName="Emoji Decoder"
      renderPlay={(finish) => <EmojiRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Bug Hunt
   =================================================================== */

interface BugItem extends QuizItem {
  lines: string[]
  why: string
}

function BugView({ item, picked, pick }: { item: BugItem; picked: number | null; pick: (i: number) => void }) {
  return (
    <>
      <h3 className="lounge-game__q">Tap the line that has the bug</h3>
      <div className="lounge-codelines" role="group" aria-label="Code, one button per line">
        {item.lines.map((ln, i) => {
          const state = picked === null ? '' : i === item.answer ? ' is-correct' : i === picked ? ' is-wrong' : ' is-dim'
          return (
            <button key={i} type="button" className={`lounge-codeline${state}`} onClick={() => pick(i)} disabled={picked !== null}>
              <span className="lounge-codeline__n">{i + 1}</span>
              <code>{ln}</code>
            </button>
          )
        })}
      </div>
    </>
  )
}

function BugRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const items = useMemo<BugItem[]>(
    () => pickFresh(BUG_BANK, 8, 'lounge_bug_seen', (b) => b.lines.join('\n')).map((b) => ({ tag: b.tag, lines: b.lines, answer: b.bug, why: b.why })),
    [],
  )
  return (
    <QuizRunner
      items={items}
      seconds={25}
      view={(item, picked, pick) => <BugView item={item} picked={picked} pick={pick} />}
      reveal={(item) => `The bug was on line ${item.answer + 1}`}
      explain={(item) => item.why}
      onDone={(s) => finish(quizResult("today's Bug Hunt", '🐛', s, ['Bug exterminator 🏆', 'Good eyes 💪', 'Still debugging 🌱', 'The bugs won 😅']))}
    />
  )
}

function BugGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="bug"
      ctx={ctx}
      icon="🐛"
      title="Bug Hunt"
      eyebrow="Daily challenge"
      blurb="Every snippet hides one bug. Tap the guilty line before the timer runs out."
      facts={[<><b>8</b> snippets</>, <><b>25s</b> each</>, <><b>HTML</b> CSS JS TS SQL</>]}
      announceName="Bug Hunt"
      renderPlay={(finish) => <BugRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Higher or Lower (streak game)
   =================================================================== */

function pickOther(deck: HiLoDeck, not: HiLoItem): HiLoItem {
  const pool = deck.items.filter((i) => i.v !== not.v)
  return pool[Math.floor(Math.random() * pool.length)]
}

function HiLoRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const deck = useMemo(() => HILO_DECKS[Math.floor(Math.random() * HILO_DECKS.length)], [])
  const [current, setCurrent] = useState<HiLoItem>(() => deck.items[Math.floor(Math.random() * deck.items.length)])
  const [next, setNext] = useState<HiLoItem>(() => pickOther(deck, current))
  const [streak, setStreak] = useState(0)
  const [reveal, setReveal] = useState<'right' | 'wrong' | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const guess = (higher: boolean) => {
    if (reveal) return
    const ok = higher ? next.v > current.v : next.v < current.v
    setReveal(ok ? 'right' : 'wrong')
    const newStreak = ok ? streak + 1 : streak
    if (ok) setStreak(newStreak)
    timer.current = setTimeout(
      () => {
        if (!ok) {
          finish({
            score: newStreak * 100,
            verdict: newStreak >= 10 ? 'Walking encyclopedia 🏆' : newStreak >= 6 ? 'Great memory 💪' : newStreak >= 3 ? 'Not bad 🌱' : 'Tricky one 😅',
            sub: `${newStreak} correct in a row`,
            stats: [
              ['Streak', newStreak],
              ['Deck', deck.id === 'year' ? 'Release years' : 'Ports'],
              ['Points', newStreak * 100],
            ],
            shareText: `📈 I got a ${newStreak} streak on Dev Higher or Lower (${deck.id === 'year' ? 'release years' : 'port numbers'}). Think you can beat me?`,
          })
          return
        }
        setCurrent(next)
        setNext(pickOther(deck, next))
        setReveal(null)
      },
      ok ? 1100 : 1500,
    )
  }

  return (
    <div className="lounge-game lounge-game--play">
      <div className="lounge-game__top">
        <div className="lounge-game__meta">
          <span className="lounge-game__cat">{deck.id === 'year' ? 'Release years' : 'Default ports'}</span>
          <span className="lounge-game__count">One wrong guess ends the run</span>
        </div>
        <div className="lounge-hl__streak" aria-label={`Streak ${streak}`}>
          <b>{streak}</b>
          <span>streak</span>
        </div>
      </div>

      <h3 className="lounge-game__q">{deck.ask}</h3>

      <div className="lounge-hl">
        <div className="lounge-hl__card">
          <span className="lounge-hl__name">{current.n}</span>
          <span className="lounge-hl__val">{deck.fmt(current.v)}</span>
        </div>
        <div className={`lounge-hl__card${reveal ? ` is-${reveal}` : ' is-hidden'}`}>
          <span className="lounge-hl__name">{next.n}</span>
          <span className="lounge-hl__val">{reveal ? deck.fmt(next.v) : '?'}</span>
        </div>
      </div>

      <div className="lounge-hl__btns">
        <button type="button" className="lounge-game__btn" onClick={() => guess(true)} disabled={reveal !== null}>
          ▲ {deck.hi}
        </button>
        <button type="button" className="lounge-game__btn is-ghost" onClick={() => guess(false)} disabled={reveal !== null}>
          ▼ {deck.lo}
        </button>
      </div>

      <div className="lounge-game__feedback" aria-live="polite">
        {reveal === 'right' && <span className="is-good">Correct! Keep going</span>}
        {reveal === 'wrong' && (
          <span className="is-bad">
            Nope, {next.n} is {deck.fmt(next.v)}
          </span>
        )}
      </div>
    </div>
  )
}

function HiLoGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="hilo"
      ctx={ctx}
      icon="📈"
      title="Higher or Lower"
      eyebrow="Streak game"
      blurb="Compare release years and port numbers of languages and tools. How long can your streak survive?"
      facts={[<><b>100</b> pts per streak</>, <><b>1</b> life</>, <><b>Random</b> deck</>]}
      announceName="Higher or Lower"
      renderPlay={(finish) => <HiLoRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Typing Sprint
   =================================================================== */

const TYPING_SECONDS = 45

function TypingRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const target = useMemo(() => shuffle(TYPING_SNIPPETS).slice(0, 5).join(' '), [])
  const [typed, setTyped] = useState('')
  const [started, setStarted] = useState(0)
  const [left, setLeft] = useState(TYPING_SECONDS)
  const stats = useRef({ keys: 0, mistakes: 0 })
  const doneRef = useRef(false)
  const typedRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)

  const end = useCallback(
    (finalTyped: string, elapsedMs: number) => {
      if (doneRef.current) return
      doneRef.current = true
      let correct = 0
      for (let i = 0; i < finalTyped.length; i++) if (finalTyped[i] === target[i]) correct++
      const minutes = Math.max(elapsedMs, 3000) / 60000
      const wpm = Math.round(correct / 5 / minutes)
      const { keys, mistakes } = stats.current
      const accuracy = keys ? Math.max(0, 1 - mistakes / keys) : 0
      const score = Math.round(wpm * accuracy * 10)
      finish({
        score,
        verdict: wpm >= 70 ? 'Keyboard wizard 🏆' : wpm >= 45 ? 'Fast fingers 💪' : wpm >= 25 ? 'Warming up 🌱' : 'Slow and steady 🐢',
        sub: `${wpm} WPM at ${Math.round(accuracy * 100)}% accuracy`,
        stats: [
          ['WPM', wpm],
          ['Accuracy', `${Math.round(accuracy * 100)}%`],
          ['Chars', correct],
        ],
        shareText: `⌨️ I typed ${wpm} WPM at ${Math.round(accuracy * 100)}% accuracy in Typing Sprint (score ${score}). Think you can beat me?`,
      })
    },
    [finish, target],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Clock only starts on the first keystroke
  useEffect(() => {
    if (!started) return
    const timer = setInterval(() => {
      const elapsed = Date.now() - started
      const remaining = Math.max(0, TYPING_SECONDS - elapsed / 1000)
      setLeft(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        end(typedRef.current, TYPING_SECONDS * 1000)
      }
    }, 100)
    return () => clearInterval(timer)
  }, [started, end])

  const onChange = (value: string) => {
    if (doneRef.current) return
    const next = value.slice(0, target.length)
    if (!started && next.length > 0) setStarted(Date.now())
    if (next.length > typedRef.current.length) {
      for (let i = typedRef.current.length; i < next.length; i++) {
        stats.current.keys++
        if (next[i] !== target[i]) stats.current.mistakes++
      }
    }
    typedRef.current = next
    setTyped(next)
    if (next.length >= target.length) end(next, started ? Date.now() - started : 3000)
  }

  const frac = Math.min(1, Math.max(0, left / TYPING_SECONDS))

  return (
    <div className="lounge-game lounge-game--play" onClick={() => inputRef.current?.focus()}>
      <div className="lounge-game__top">
        <div className="lounge-game__meta">
          <span className="lounge-game__cat">Typing Sprint</span>
          <span className="lounge-game__count">{started ? 'Keep going!' : 'The clock starts when you type'}</span>
        </div>
        <div className={`lounge-game__ring${left <= 10 && started ? ' is-low' : ''}`} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle className="lounge-game__ring-bg" cx="22" cy="22" r={RING_R} />
            <circle className="lounge-game__ring-fg" cx="22" cy="22" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={RING_C * (1 - frac)} />
          </svg>
          <b>{Math.ceil(left)}</b>
        </div>
      </div>

      <div className="lounge-type__text" aria-hidden="true">
        {target.split('').map((ch, i) => {
          const state = i < typed.length ? (typed[i] === ch ? 'ok' : 'bad') : i === typed.length ? 'cur' : ''
          return (
            <span key={i} className={state}>
              {ch}
            </span>
          )
        })}
      </div>

      <input
        ref={inputRef}
        className="lounge-type__input"
        value={typed}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => e.preventDefault()}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Type the code shown above"
        placeholder="Start typing here…"
      />
    </div>
  )
}

function TypingGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="typing"
      ctx={ctx}
      icon="⌨️"
      title="Typing Sprint"
      eyebrow="Quick play"
      blurb="Type real code as fast and cleanly as you can. Brackets, quotes and arrows included."
      facts={[<><b>{TYPING_SECONDS}s</b> sprint</>, <><b>Score</b> = WPM × accuracy</>, <><b>No</b> pasting</>]}
      announceName="Typing Sprint"
      renderPlay={(finish) => <TypingRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Dev Word (daily, same word for everyone)
   =================================================================== */

const WORD_TRIES = 6
const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

type Mark = 'hit' | 'near' | 'miss'

function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill('miss')
  const pool: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = 'hit'
    else pool[answer[i]] = (pool[answer[i]] || 0) + 1
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === 'hit') continue
    if (pool[guess[i]] > 0) {
      marks[i] = 'near'
      pool[guess[i]]--
    }
  }
  return marks
}

const dailyWord = (day: string) => WORD_BANK[hashStr(`devword-${day}`) % WORD_BANK.length]

const MARK_EMOJI: Record<Mark, string> = { hit: '🟩', near: '🟨', miss: '⬛' }

function WordRound({ finish }: { finish: (r: ArcadeResult) => void }) {
  const day = gameDay()
  const answer = useMemo(() => dailyWord(day), [day])
  const storeKey = `lounge_word_${day}`
  const [guesses, setGuesses] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(readLS(storeKey) || '[]')
      return Array.isArray(parsed) ? parsed.filter((g: unknown): g is string => typeof g === 'string' && g.length === 5) : []
    } catch {
      return []
    }
  })
  const [current, setCurrent] = useState('')
  const [msg, setMsg] = useState('')
  const [shake, setShake] = useState(false)
  const finishedRef = useRef(false)

  const marksFor = useMemo(() => guesses.map((g) => scoreGuess(g, answer)), [guesses, answer])
  const solved = guesses.includes(answer)
  const over = solved || guesses.length >= WORD_TRIES

  const letterState = useMemo(() => {
    const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 }
    const out: Record<string, Mark> = {}
    guesses.forEach((g, gi) =>
      g.split('').forEach((ch, i) => {
        const m = marksFor[gi][i]
        if (!out[ch] || rank[m] > rank[out[ch]]) out[ch] = m
      }),
    )
    return out
  }, [guesses, marksFor])

  const conclude = useCallback(
    (list: string[]) => {
      if (finishedRef.current) return
      finishedRef.current = true
      const ok = list.includes(answer)
      const used = list.length
      const grid = list.map((g) => scoreGuess(g, answer).map((m) => MARK_EMOJI[m]).join('')).join('\n')
      // Short pause so the last row can be seen before the result card replaces it
      setTimeout(() => {
        finish({
          score: ok ? (WORD_TRIES + 1 - used) * 100 : 0,
          verdict: ok ? (used <= 2 ? 'Mind reader 🏆' : used <= 4 ? 'Nicely solved 💪' : 'Phew, just made it 😅') : `The word was ${answer} 🙈`,
          sub: ok ? `Solved in ${used} of ${WORD_TRIES}` : 'Better luck tomorrow',
          stats: [
            ['Guesses', `${used}/${WORD_TRIES}`],
            ['Solved', ok ? 'Yes' : 'No'],
            ['Points', ok ? (WORD_TRIES + 1 - used) * 100 : 0],
          ],
          shareText: `🟩 Dev Word ${day} ${ok ? used : 'X'}/${WORD_TRIES}\n${grid}`,
        })
      }, 900)
    },
    [answer, day, finish],
  )

  // If they come back to a puzzle that is already finished, go straight to the result
  useEffect(() => {
    if (over) conclude(guesses)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = () => {
    if (over) return
    if (current.length < 5) {
      setMsg('Not enough letters')
      setShake(true)
      setTimeout(() => setShake(false), 400)
      return
    }
    const next = [...guesses, current]
    setGuesses(next)
    writeLS(storeKey, JSON.stringify(next))
    setCurrent('')
    setMsg('')
    if (next.includes(answer) || next.length >= WORD_TRIES) conclude(next)
  }

  const press = (key: string) => {
    if (over) return
    setMsg('')
    if (key === 'ENTER') submit()
    else if (key === 'BACK') setCurrent((c) => c.slice(0, -1))
    else if (/^[A-Z]$/.test(key)) setCurrent((c) => (c.length < 5 ? c + key : c))
  }
  const pressRef = useRef(press)
  pressRef.current = press

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Enter') pressRef.current('ENTER')
      else if (e.key === 'Backspace') pressRef.current('BACK')
      else if (/^[a-zA-Z]$/.test(e.key)) pressRef.current(e.key.toUpperCase())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="lounge-game lounge-game--play">
      <div className="lounge-game__top">
        <div className="lounge-game__meta">
          <span className="lounge-game__cat">Dev Word</span>
          <span className="lounge-game__count">
            Guess {Math.min(guesses.length + 1, WORD_TRIES)} of {WORD_TRIES}
          </span>
        </div>
      </div>

      <div className="lounge-word" role="grid" aria-label="Dev Word board">
        {Array.from({ length: WORD_TRIES }, (_, row) => {
          const isCurrent = row === guesses.length && !over
          const text = row < guesses.length ? guesses[row] : isCurrent ? current : ''
          return (
            <div key={row} className={`lounge-word__row${isCurrent && shake ? ' is-shake' : ''}`} role="row">
              {Array.from({ length: 5 }, (_, i) => {
                const mark = row < guesses.length ? marksFor[row][i] : null
                const cls = mark ? ` is-${mark}` : text[i] ? ' is-filled' : ''
                return (
                  <span key={i} className={`lounge-word__cell${cls}`} style={{ '--i': i } as CSSProperties} role="gridcell">
                    {text[i] ?? ''}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="lounge-game__feedback" aria-live="polite">
        {msg && <span className="is-bad">{msg}</span>}
      </div>

      <div className="lounge-kb">
        {KB_ROWS.map((row, ri) => (
          <div className="lounge-kb__row" key={row}>
            {ri === 2 && (
              <button type="button" className="lounge-kb__key is-wide" onClick={() => press('ENTER')}>
                Enter
              </button>
            )}
            {row.split('').map((ch) => (
              <button key={ch} type="button" className={`lounge-kb__key${letterState[ch] ? ` is-${letterState[ch]}` : ''}`} onClick={() => press(ch)}>
                {ch}
              </button>
            ))}
            {ri === 2 && (
              <button type="button" className="lounge-kb__key is-wide" onClick={() => press('BACK')} aria-label="Backspace">
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function WordGame({ ctx }: { ctx: GameCtx }) {
  return (
    <Arcade
      game="word"
      ctx={ctx}
      icon="🟩"
      title="Dev Word"
      eyebrow="Daily puzzle"
      blurb="Everyone gets the same five-letter dev word today. Green is right, yellow is in the word, gray is not."
      facts={[<><b>6</b> guesses</>, <><b>1</b> word a day</>, <><b>Share</b> your grid</>]}
      announceName="Dev Word"
      daily
      renderPlay={(finish) => <WordRound finish={finish} />}
    />
  )
}

/* ===================================================================
   GAME: Would You Rather (daily prompts, shared vote counts)
   =================================================================== */

type Side = 'a' | 'b'
type Tally = Record<string, { a: number; b: number }>

function WouldYouRather({ ctx }: { ctx: GameCtx }) {
  const day = gameDay()
  const prompts = useMemo(() => {
    const start = hashStr(`wyr-${day}`) % WYR_BANK.length
    return [0, 1, 2].map((i) => WYR_BANK[(start + i * 5) % WYR_BANK.length])
  }, [day])

  const mineKey = `lounge_wyr_${day}`
  const [mine, setMine] = useState<Record<string, Side>>(() => {
    try {
      return JSON.parse(readLS(mineKey) || '{}') as Record<string, Side>
    } catch {
      return {}
    }
  })
  const [tally, setTally] = useState<Tally>({})
  const [offline, setOffline] = useState(false)

  const load = useCallback(async () => {
    const ids = prompts.map((p) => p.id)
    const { data, error } = await supabase
      .from('lounge_game_votes')
      .select('prompt_id, choice, device_id')
      .eq('day', day)
      .in('prompt_id', ids)
      .limit(5000)
    if (error || !data) {
      setOffline(true)
      return
    }
    setOffline(false)
    const next: Tally = {}
    const remembered: Record<string, Side> = {}
    for (const r of data as any[]) {
      const t = (next[r.prompt_id] ||= { a: 0, b: 0 })
      if (r.choice === 'a' || r.choice === 'b') t[r.choice as Side]++
      if (r.device_id === ctx.deviceId && (r.choice === 'a' || r.choice === 'b')) remembered[r.prompt_id] = r.choice
    }
    setTally(next)
    if (Object.keys(remembered).length) setMine((m) => ({ ...remembered, ...m }))
  }, [day, prompts, ctx.deviceId])

  useEffect(() => {
    load()
    const poll = setInterval(load, 20000)
    return () => clearInterval(poll)
  }, [load])

  const vote = async (id: string, side: Side) => {
    if (mine[id] || !ctx.userName) return
    const nextMine = { ...mine, [id]: side }
    setMine(nextMine)
    writeLS(mineKey, JSON.stringify(nextMine))
    setTally((t) => {
      const cur = t[id] ?? { a: 0, b: 0 }
      return { ...t, [id]: { ...cur, [side]: cur[side] + 1 } }
    })
    const { error } = await supabase.from('lounge_game_votes').insert([{ day, prompt_id: id, device_id: ctx.deviceId, choice: side }])
    // 23505 = you already voted from this device, which is fine
    if (error && (error as any).code !== '23505') setOffline(true)
    else load()
  }

  return (
    <>
      <div className="lounge-game lounge-game--center lounge-game--intro">
        <div className="lounge-game__glow" aria-hidden="true" />
        <div className="lounge-game__badge" aria-hidden="true">
          🗳️
        </div>
        <span className="lounge-game__eyebrow">Daily poll</span>
        <h3 className="lounge-game__title">Would You Rather</h3>
        <p className="lounge-game__sub">Three dev dilemmas a day. Vote to see how the rest of the lounge splits.</p>
      </div>

      {prompts.map((p) => {
        const t = tally[p.id] ?? { a: 0, b: 0 }
        const total = t.a + t.b
        const picked = mine[p.id]
        return (
          <div className="lounge-game lounge-wyr" key={p.id}>
            <h4 className="lounge-wyr__q">Would you rather…</h4>
            {(['a', 'b'] as Side[]).map((side) => {
              const pct = total ? Math.round((t[side] / total) * 100) : 0
              return (
                <button
                  key={side}
                  type="button"
                  className={`lounge-wyr__opt${picked === side ? ' is-mine' : ''}${picked && picked !== side ? ' is-other' : ''}`}
                  style={{ '--pct': `${picked ? pct : 0}%` } as CSSProperties}
                  onClick={() => vote(p.id, side)}
                  disabled={!!picked || !ctx.userName}
                >
                  <span className="lounge-wyr__text">{side === 'a' ? p.a : p.b}</span>
                  {picked && (
                    <span className="lounge-wyr__pct">
                      {pct}%<small>{t[side]}</small>
                    </span>
                  )}
                </button>
              )
            })}
            {picked && (
              <p className="lounge-game__note">
                {offline ? 'Live results are offline, so these numbers only include your vote.' : `${total} ${total === 1 ? 'vote' : 'votes'} so far`}
              </p>
            )}
          </div>
        )
      })}
      <p className="lounge-game__note">New dilemmas arrive when the day resets.</p>
    </>
  )
}

/* ===================================================================
   DUELS: Tic-Tac-Toe and Quiz Duel (live, over the lounge channel)
   =================================================================== */

type DuelGame = 'ttt' | 'quiz'

interface Match {
  id: string
  game: DuelGame
  seed: number
  host: boolean
  opp: { id: string; name: string }
}

interface Outgoing {
  matchId: string
  game: DuelGame
  seed: number
  to: string
  name: string
}

interface Invite {
  matchId: string
  game: DuelGame
  seed: number
  from: string
  fromName: string
}

const DUEL_LABEL: Record<DuelGame, string> = { ttt: 'Tic-Tac-Toe', quiz: 'Quiz Duel' }

const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function tttResult(cells: (string | null)[]): { mark: string; line: number[] } | 'draw' | null {
  for (const line of TTT_LINES) {
    const [a, b, c] = line
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return { mark: cells[a] as string, line }
  }
  return cells.every(Boolean) ? 'draw' : null
}

interface MatchProps {
  ctx: GameCtx
  bus: DuelBus
  match: Match
  onWin: () => void
  onLeave: () => void
}

function TicTacToe({ ctx, bus, match, onWin, onLeave }: MatchProps) {
  const me = match.host ? 'X' : 'O'
  const [state, setState] = useState<{ cells: (string | null)[]; turn: string }>({ cells: Array(9).fill(null), turn: 'X' })
  const [gone, setGone] = useState(false)
  const [shared, setShared] = useState(false)
  const wonRef = useRef(false)
  const result = tttResult(state.cells)

  const apply = (cell: number, who: string) =>
    setState((s) => {
      if (s.cells[cell] || s.turn !== who || tttResult(s.cells)) return s
      const cells = [...s.cells]
      cells[cell] = who
      return { cells, turn: who === 'X' ? 'O' : 'X' }
    })

  useEffect(
    () =>
      bus.subscribe((p) => {
        if (!p || p.matchId !== match.id || p.to !== ctx.deviceId) return
        if (p.t === 'move' && Number.isInteger(p.cell) && p.cell >= 0 && p.cell < 9) apply(p.cell, me === 'X' ? 'O' : 'X')
        else if (p.t === 'leave') setGone(true)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bus, match.id],
  )

  useEffect(() => {
    if (result && result !== 'draw' && result.mark === me && !wonRef.current) {
      wonRef.current = true
      onWin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const play = (i: number) => {
    if (result || gone || state.turn !== me || state.cells[i]) return
    apply(i, me)
    bus.send({ t: 'move', to: match.opp.id, matchId: match.id, cell: i })
  }

  const status = result
    ? result === 'draw'
      ? "It's a draw 🤝"
      : result.mark === me
        ? 'You won! 🎉'
        : `${match.opp.name} won`
    : gone
      ? `${match.opp.name} left the match`
      : state.turn === me
        ? 'Your turn'
        : `${match.opp.name} is thinking…`
  const won = !!result && result !== 'draw' && result.mark === me

  return (
    <div className="lounge-game lounge-game--play">
      <div className="lounge-duel__vs">
        <span>
          <b>You</b> · {me}
        </span>
        <i>vs</i>
        <span>
          <b>{match.opp.name}</b> · {me === 'X' ? 'O' : 'X'}
        </span>
      </div>

      <div className="lounge-ttt" role="grid" aria-label="Tic-Tac-Toe board">
        {state.cells.map((c, i) => {
          const hot = result && result !== 'draw' && result.line.includes(i)
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className={`lounge-ttt__cell${c ? ` is-${c}` : ''}${hot ? ' is-win' : ''}`}
              onClick={() => play(i)}
              disabled={!!c || !!result || gone || state.turn !== me}
              aria-label={c ? `Cell ${i + 1}: ${c}` : `Cell ${i + 1}: empty`}
            >
              {c}
            </button>
          )
        })}
      </div>

      <div className="lounge-game__feedback" aria-live="polite">
        <span className={won ? 'is-good' : ''}>{status}</span>
      </div>

      <div className="lounge-game__actions">
        {won && (
          <button
            type="button"
            className="lounge-game__btn is-ghost"
            disabled={shared || !ctx.userName}
            onClick={() => {
              ctx.onShare(`❌⭕ I just beat ${match.opp.name} at Tic-Tac-Toe in the lounge!`)
              setShared(true)
            }}
          >
            {shared ? 'Shared ✓' : 'Share to chat'}
          </button>
        )}
        <button type="button" className="lounge-game__btn" onClick={onLeave}>
          {result || gone ? 'Back to lobby' : 'Leave match'}
        </button>
      </div>
    </div>
  )
}

const DUEL_ROUNDS = 5

function QuizDuel({ ctx, bus, match, bank, onWin, onLeave }: MatchProps & { bank: TriviaItemLike[] }) {
  // Same seed on both screens => identical questions in identical order
  const items = useMemo<ChoiceItem[]>(
    () =>
      seededShuffle(bank, match.seed)
        .slice(0, DUEL_ROUNDS)
        .map((src, idx) => {
          const options = seededShuffle([src.a, ...src.w], match.seed + idx + 1)
          return { tag: src.c, q: src.q, options, answer: options.indexOf(src.a) }
        }),
    [bank, match.seed],
  )
  const [mine, setMine] = useState<QuizSummary | null>(null)
  const [opp, setOpp] = useState<{ done: number; final: { score: number; correct: number } | null }>({ done: 0, final: null })
  const [gone, setGone] = useState(false)
  const [shared, setShared] = useState(false)
  const wonRef = useRef(false)

  useEffect(
    () =>
      bus.subscribe((p) => {
        if (!p || p.matchId !== match.id || p.to !== ctx.deviceId) return
        if (p.t === 'prog') setOpp((o) => ({ ...o, done: Math.min(DUEL_ROUNDS, Number(p.done) || 0) }))
        else if (p.t === 'final') setOpp({ done: DUEL_ROUNDS, final: { score: Number(p.score) || 0, correct: Number(p.correct) || 0 } })
        else if (p.t === 'leave') setGone(true)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bus, match.id],
  )

  const bothDone = !!mine && !!opp.final
  const iWon = bothDone && mine!.score > opp.final!.score

  useEffect(() => {
    if (iWon && !wonRef.current) {
      wonRef.current = true
      onWin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iWon])

  if (!mine) {
    return (
      <>
        <div className="lounge-duel__vs">
          <span>
            <b>You</b>
          </span>
          <i>vs</i>
          <span>
            <b>{match.opp.name}</b> · {gone ? 'left' : `${opp.done}/${DUEL_ROUNDS} answered`}
          </span>
        </div>
        <QuizRunner
          items={items}
          seconds={12}
          numberKeys
          view={(item, picked, pick) => <ChoiceView item={item} picked={picked} pick={pick} />}
          reveal={choiceReveal}
          onProgress={(n) => bus.send({ t: 'prog', to: match.opp.id, matchId: match.id, done: n })}
          onDone={(s) => {
            setMine(s)
            bus.send({ t: 'final', to: match.opp.id, matchId: match.id, score: s.score, correct: s.correct })
          }}
        />
      </>
    )
  }

  const headline = bothDone ? (iWon ? 'You won! 🎉' : mine.score === opp.final!.score ? "It's a tie 🤝" : `${match.opp.name} won`) : gone ? `${match.opp.name} left` : 'Waiting for the other player…'

  return (
    <div className="lounge-game lounge-game--result">
      <span className="lounge-game__verdict">{headline}</span>
      <div className="lounge-duel__scores">
        <div className={iWon ? 'is-winner' : ''}>
          <b>{mine.score}</b>
          <span>You · {mine.correct}/{DUEL_ROUNDS}</span>
        </div>
        <div className={bothDone && !iWon && mine.score !== opp.final!.score ? 'is-winner' : ''}>
          <b>{opp.final ? opp.final.score : `${opp.done}/${DUEL_ROUNDS}`}</b>
          <span>
            {match.opp.name}
            {opp.final ? ` · ${opp.final.correct}/${DUEL_ROUNDS}` : ' · answering'}
          </span>
        </div>
      </div>
      <div className="lounge-game__actions">
        {iWon && (
          <button
            type="button"
            className="lounge-game__btn is-ghost"
            disabled={shared || !ctx.userName}
            onClick={() => {
              ctx.onShare(`⚔️ I just beat ${match.opp.name} ${mine.score} to ${opp.final!.score} in a Quiz Duel!`)
              setShared(true)
            }}
          >
            {shared ? 'Shared ✓' : 'Share to chat'}
          </button>
        )}
        <button type="button" className="lounge-game__btn" onClick={onLeave}>
          {bothDone || gone ? 'Back to lobby' : 'Leave match'}
        </button>
      </div>
    </div>
  )
}

interface DuelState {
  match: Match | null
  outgoing: Outgoing | null
  notice: string
  challenge: (member: GameMember, game: DuelGame) => void
  cancel: () => void
  leave: () => void
}

function Duels({ ctx, bus, members, bank, duel }: { ctx: GameCtx; bus: DuelBus; members: GameMember[]; bank: TriviaItemLike[]; duel: DuelState }) {
  const board = useBoard('duels', ctx.refreshKey, 'sum')
  const [game, setGame] = useState<DuelGame>('ttt')
  const [query, setQuery] = useState('')

  // Each win is worth 100 on the "duel wins today" board
  const recordWin = useCallback(() => {
    if (!ctx.userName) return
    board.submit({ deviceId: ctx.deviceId, name: ctx.userName, avatarSalt: ctx.avatarSalt, score: 100 })
  }, [board, ctx.deviceId, ctx.userName, ctx.avatarSalt])

  const boardEl = (
    <Board rows={board.rows} state={board.state} resetIn={board.resetIn} deviceId={ctx.deviceId} subtitle="Duel points today (100 per win)" unit="pts" />
  )

  if (duel.match) {
    const props: MatchProps = { ctx, bus, match: duel.match, onWin: recordWin, onLeave: duel.leave }
    return (
      <>
        {duel.match.game === 'ttt' ? <TicTacToe key={duel.match.id} {...props} /> : <QuizDuel key={duel.match.id} {...props} bank={bank} />}
        {boardEl}
      </>
    )
  }

  const others = members
    .filter((m) => m.deviceId !== ctx.deviceId && m.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <>
      <div className="lounge-game lounge-game--intro">
        <div className="lounge-game__glow" aria-hidden="true" />
        <div className="lounge-game__badge" aria-hidden="true">
          ⚔️
        </div>
        <span className="lounge-game__eyebrow">Live 1v1</span>
        <h3 className="lounge-game__title">Duels</h3>
        <p className="lounge-game__sub">Pick a game, then challenge someone. They get a prompt on their screen if the lounge is open.</p>

        <div className="lounge-seg" role="radiogroup" aria-label="Duel game">
          {(['ttt', 'quiz'] as DuelGame[]).map((g) => (
            <button key={g} type="button" role="radio" aria-checked={game === g} className={game === g ? 'is-active' : ''} onClick={() => setGame(g)}>
              {g === 'ttt' ? '❌⭕ Tic-Tac-Toe' : '🧠 Quiz Duel'}
            </button>
          ))}
        </div>
        <p className="lounge-game__note" style={{ textAlign: 'left' }}>
          {game === 'ttt' ? 'Classic 3x3. The challenger plays X and goes first.' : `The same ${DUEL_ROUNDS} trivia questions for both of you. Highest score wins.`}
        </p>

        {duel.outgoing && (
          <div className="lounge-duel__waiting" aria-live="polite">
            <span>
              Waiting for <b>{duel.outgoing.name}</b> to accept {DUEL_LABEL[duel.outgoing.game]}…
            </span>
            <button type="button" onClick={duel.cancel}>
              Cancel
            </button>
          </div>
        )}
        {duel.notice && !duel.outgoing && <p className="lounge-duel__notice">{duel.notice}</p>}

        {members.length > 8 && (
          <input className="lounge-type__input" placeholder="Search members…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search members" />
        )}
        <ul className="lounge-members">
          {others.length === 0 && <li className="lounge-game__note">{members.length <= 1 ? 'No other members yet. Invite a friend to the lounge!' : 'No one matches that search.'}</li>}
          {others.map((m) => (
            <li key={m.deviceId} className="lounge-members__row">
              <Avatar seed={m.avatarSeed} size={30} />
              <span className="lounge-members__name">{m.name}</span>
              <button type="button" className="lounge-members__btn" disabled={!ctx.userName || !!duel.outgoing} onClick={() => duel.challenge(m, game)}>
                Challenge
              </button>
            </li>
          ))}
        </ul>
      </div>
      {boardEl}
    </>
  )
}

/* ===================================================================
   HUB: tab bar, challenge inbox and routing between games
   =================================================================== */

/* ===================================================================
   GAME: Last Letter (this used to be "Word Chain")
   Each word must start with the last letter of the one before it.
   Any English word counts. No repeats.

   Four ways to play:
     - Duel vs Bot ......... solo, 3 lives, best score of the day on the board
     - 2 / 3 / 4 / 7 players live battle. One person opens a lobby, the others join,
                             and the match does NOT start until every seat is filled.
                             Miss your turn and you're out. Last player standing wins.

   Words are checked with the free Dictionary API (api.dictionaryapi.dev, no key).
   The bot learns its vocabulary from Datamuse (api.datamuse.com, no key) and falls back
   to a small built-in list if the network is down.
   =================================================================== */

const LL_TURN_SECONDS = 20
const LL_MIN_SECONDS = 8 // multiplayer turns shrink by 1s every full round, down to this
const LL_LIVES = 3
const LL_MIN_LEN = 3
const LL_SIZES = [2, 3, 4, 7] as const
type LLSize = (typeof LL_SIZES)[number]
const LL_START_LETTERS = 'abcdefghilmnoprstw'
const LL_DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/'
const LL_DATAMUSE_URL = 'https://api.datamuse.com/words'

// Offline safety net for the bot (and a shortcut: these never need a dictionary lookup)
const LL_FALLBACK: string[] = Array.from(
  new Set(
    `apple anchor animal answer artist autumn attic arrow actor advice airport almond amber angel ankle april avenue
banana basket beach bridge butter button bottle branch breeze brother bubble budget buffalo bamboo bicycle blanket
candle castle cherry circle cloud coffee copper cotton cousin crystal canyon camera carpet carrot cactus cabin
dancer desert dinner dolphin donkey dragon drawer dream dollar doctor diamond dentist dinosaur
eagle earth engine empire energy evening export eleven elbow elephant eraser easel
feather finger flower forest friend frozen fabric falcon farmer fiddle fossil future fireplace
garden ginger glass golden guitar gravity ground giraffe galaxy garlic gadget gentle
hammer harbor helmet honey horizon hunter hobby hockey hotel hurdle hazel history
island insect igloo iceberg ivory invent indigo iron idea
jacket jungle jelly jewel journey jigsaw jaguar juggle justice
kitchen kettle kitten knight kingdom knife koala kayak ketchup
ladder lantern lemon letter library lizard lobster lumber lunch legend
magnet marble meadow mirror monkey mountain muffin museum mystery mango
napkin needle nectar neighbor nickel noodle notebook nature novel nurse
ocean olive orange orbit otter oxygen oyster object office outlet
paddle palace parrot pencil pepper pillow planet pocket pumpkin puzzle pirate
quartz quest quiet quilt quarter queen question quiver
rabbit radish rainbow river rocket rubber ribbon rhythm rooster ranch
salmon silver sunset spider spring summer statue stream stone sugar sailor
table tiger timber tomato tunnel turtle teacher thunder toast trophy
umbrella unicorn uncle uniform upgrade utensil
valley velvet violin volcano vessel village vinegar voyage
walnut window winter wizard wallet whistle wonder wagon willow walrus
xenon xerox xylophone
yellow yogurt yacht yawn yonder
zebra zipper zodiac zombie zenith`
      .split(/\s+/)
      .filter((w) => /^[a-z]{3,}$/.test(w)),
  ),
)
const LL_FALLBACK_SET = new Set(LL_FALLBACK)
const LL_FALLBACK_BY_LETTER: Record<string, string[]> = {}
LL_FALLBACK.forEach((w) => {
  ;(LL_FALLBACK_BY_LETTER[w[0]] ||= []).push(w)
})

const llLast = (w: string) => w[w.length - 1]
const llRand = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

// Roughly how many everyday words start with each letter (higher = easier to answer).
// The bot uses this to be kind early on and to end on X, Z, Q... later in the game.
const LL_EASE: Record<string, number> = {
  s: 10, c: 9, p: 9, a: 8, b: 8, m: 8, d: 8, t: 8, r: 7, f: 7, e: 7, i: 6, h: 6, g: 6, l: 6, w: 6, o: 6, n: 5, u: 5,
  v: 3, k: 3, j: 3, y: 2, q: 1, z: 1, x: 1,
}
const llEase = (l: string) => LL_EASE[l] ?? 5

async function llFetch(url: string, ms = 2500): Promise<Response | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { signal: ctl.signal })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// Common words per first letter, filled in by llLoadLetter. A word found here is accepted instantly.
const llPoolSets = new Map<string, Set<string>>()

// Is this a real English word? Cached, and checked the fastest way available:
//   1. built-in list / already-loaded common words: instant, no network
//   2. otherwise Datamuse and the dictionary are asked AT THE SAME TIME and the first "yes" wins
const llChecked = new Map<string, boolean>()
const llInflight = new Map<string, Promise<boolean>>()

function llLookup(word: string): Promise<boolean> {
  return new Promise((resolve) => {
    const results: (boolean | null)[] = []
    const settle = (r: boolean | null) => {
      if (r === true) {
        llChecked.set(word, true)
        resolve(true)
        return
      }
      results.push(r)
      if (results.length < 2) return
      if (results.includes(false)) {
        llChecked.set(word, false)
        resolve(false)
      } else {
        resolve(true) // both services are down: give the player the benefit of the doubt
      }
    }
    llFetch(LL_DICT_URL + encodeURIComponent(word), 2500).then((res) => settle(res?.ok ? true : res?.status === 404 ? false : null))
    llFetch(`${LL_DATAMUSE_URL}?sp=${encodeURIComponent(word)}&max=1`, 2500).then(async (res) => {
      if (!res?.ok) return settle(null)
      try {
        const rows = await res.json()
        settle(Array.isArray(rows) && rows[0]?.word === word)
      } catch {
        settle(null)
      }
    })
  })
}

function llIsWord(word: string): Promise<boolean> {
  const known = llChecked.get(word)
  if (known !== undefined) return Promise.resolve(known)
  if (LL_FALLBACK_SET.has(word) || llPoolSets.get(word[0])?.has(word)) {
    llChecked.set(word, true)
    return Promise.resolve(true)
  }
  let p = llInflight.get(word)
  if (!p) {
    p = llLookup(word).finally(() => llInflight.delete(word))
    llInflight.set(word, p)
  }
  return p
}

// Common words that start with `letter` (cached per letter)
const llPools = new Map<string, Promise<string[]>>()
function llLoadLetter(letter: string): Promise<string[]> {
  let pool = llPools.get(letter)
  if (!pool) {
    pool = (async () => {
      const base = LL_FALLBACK_BY_LETTER[letter] ?? []
      const res = await llFetch(`${LL_DATAMUSE_URL}?sp=${letter}*&md=f&max=1000`, 6000)
      if (!res?.ok) {
        llPools.delete(letter) // try again next time
        return base
      }
      try {
        const rows: { word: string; tags?: string[] }[] = await res.json()
        const ranked = rows
          .filter((r) => /^[a-z]{3,10}$/.test(r.word))
          .map((r) => ({ w: r.word, f: Number((r.tags ?? []).find((t) => t.startsWith('f:'))?.slice(2)) || 0 }))
          .filter((x) => x.f >= 1)
          .sort((a, b) => b.f - a.f)
          .slice(0, 400)
          .map((x) => x.w)
        const all = Array.from(new Set([...ranked, ...base]))
        llPoolSets.set(letter, new Set(all))
        return all
      } catch {
        llPools.delete(letter)
        return base
      }
    })()
    llPools.set(letter, pool)
  }
  return pool
}

// Start loading the common-word list for a letter so answers starting with it are accepted instantly
const llWarm = (l: string) => {
  if (/^[a-z]$/.test(l)) void llLoadLetter(l)
}

// Puts the cursor in the word box the moment it becomes usable (your turn, bot done, dictionary check over),
// and typing a letter anywhere in the lounge sends you back to it. No clicking needed.
function useAutoFocus(ref: { readonly current: HTMLInputElement | null }, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const focus = () => {
      const el = ref.current
      if (!el || el.disabled) return
      const a = document.activeElement
      if (a === el) return
      // don't interrupt a half-written chat message
      if ((a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) && a.value) return
      el.focus()
    }
    focus()
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[a-zA-Z]$/.test(e.key)) focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ref, enabled])
}

// While the player types, look the word up in the background so Enter feels instant
function useWordPrefetch(value: string, letter: string) {
  useEffect(() => {
    const w = value.trim().toLowerCase()
    if (w.length < LL_MIN_LEN || w[0] !== letter) return
    const t = setTimeout(() => {
      void llIsWord(w)
    }, 150)
    return () => clearTimeout(t)
  }, [value, letter])
}

// The bot answers with a word starting with `letter`, or null if it is stumped.
async function llBotPick(letter: string, used: Set<string>, depth: number): Promise<string | null> {
  const free = (await llLoadLetter(letter)).filter((w) => !used.has(w))
  if (!free.length) return null
  const hard = Math.random() < Math.min(0.8, depth / 16)
  const ranked = free.map((w) => ({ w, e: llEase(llLast(w)) }))
  let pick = ranked.filter((x) => (hard ? x.e <= 3 : x.e >= 6))
  if (!pick.length) pick = ranked
  for (let i = 0; i < 4 && pick.length; i++) {
    const candidate = llRand(pick).w
    if (await llIsWord(candidate)) return candidate
    pick = pick.filter((x) => x.w !== candidate)
  }
  return free.find((w) => LL_FALLBACK_SET.has(w)) ?? null
}

// A brand-new opening word that leaves the player something easy to answer with
function llFresh(used: Set<string>): string {
  const pool = LL_FALLBACK.filter((w) => !used.has(w) && llEase(llLast(w)) >= 6)
  return llRand(pool.length ? pool : LL_FALLBACK)
}

const llTurnMs = (moves: number, players: number) =>
  Math.max(LL_MIN_SECONDS, LL_TURN_SECONDS - Math.floor(moves / players)) * 1000

function LlWord({ word }: { word: string }) {
  return (
    <>
      {word.slice(0, -1)}
      <b className="lounge-chain__tail">{word.slice(-1)}</b>
    </>
  )
}

const llVerdict = (n: number) =>
  n >= 12 ? 'Chain master 🏆' : n >= 8 ? 'On a roll 🔥' : n >= 4 ? 'Nice links 🔗' : 'Just getting started 🌱'

/* ---------- The table: every player (people AND robots) sits around it and takes turns ---------- */

interface LLSeat {
  id: string
  name: string
  seed?: string
  bot?: boolean
  me?: boolean
  host?: boolean
  out?: boolean
  turn?: boolean
  low?: boolean // timer is almost up
  thinking?: boolean // somebody else is picking their word
  status?: string // pill under the name: "Thinking…", "Your turn", "Out" or the last word played
  empty?: boolean
  pct?: number // 0-100: how much of the turn timer is left (only for the seat whose turn it is)
  said?: string // the last word this player played
  action?: { label: string; title: string; onClick: () => void }
}

const LL_SEAT_COLORS = ['#4f7cff', '#a855f7', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f97316']

function LLTable({ seats, center, label }: { seats: LLSeat[]; center: ReactNode; label: string }) {
  const n = seats.length
  const meIdx = Math.max(0, seats.findIndex((s) => s.me))
  return (
    <div className={`lounge-lltable${n > 4 ? ' is-big' : ''}`} role="group" aria-label={label}>
      <div className="lounge-lltable__felt" aria-hidden="true" />
      <div className="lounge-lltable__center">{center}</div>
      {seats.map((s, i) => {
        // you always sit at the bottom; everyone else is spread evenly around the table
        const angle = ((90 + (((i - meIdx + n) % n) * 360) / n) * Math.PI) / 180
        const style = {
          left: `${50 + 38 * Math.cos(angle)}%`,
          top: `${50 + 41 * Math.sin(angle)}%`,
          '--p': Math.max(0, Math.min(100, s.pct ?? 0)),
          '--c': LL_SEAT_COLORS[i % LL_SEAT_COLORS.length],
        } as CSSProperties
        const cls = [
          'lounge-lltable__seat',
          s.me && 'is-me',
          s.bot && 'is-bot',
          s.out && 'is-out',
          s.turn && !s.out && 'is-turn',
          s.low && 'is-low',
          s.empty && 'is-empty',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div key={s.id} className={cls} style={style}>
            {s.empty ? (
              <span className="lounge-lltable__ava is-empty" aria-hidden="true">
                +
              </span>
            ) : (
              <span className="lounge-lltable__ava">
                <Avatar seed={s.seed ?? s.id} size={50} />
                {s.bot && (
                  <i className="lounge-lltable__badge" title="Bot">
                    🤖
                  </i>
                )}
                {s.host && (
                  <i className="lounge-lltable__badge is-host" title="Host">
                    👑
                  </i>
                )}
              </span>
            )}
            <span className="lounge-lltable__name">{s.empty ? 'Open seat' : s.me ? 'You' : s.name}</span>
            {s.status || (s.said && !s.out) ? (
              <span className={`lounge-lltable__said${s.thinking ? ' is-think' : ''}${s.turn && !s.thinking ? ' is-live' : ''}${s.out ? ' is-out' : ''}`}>
                {s.status ?? s.said}
              </span>
            ) : null}
            {s.action && (
              <button type="button" className="lounge-lltable__act" title={s.action.title} onClick={s.action.onClick}>
                {s.action.label}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// What sits in the middle of the table while a match is on: the letter you need and the word before it
function LLCenter({ letter, word, note }: { letter: string; word?: string; note?: string }) {
  return (
    <>
      <span className="lounge-lltable__label">Next letter</span>
      <span className="lounge-lltable__tile" aria-label={`Next word starts with ${letter.toUpperCase()}`}>
        {letter ? letter.toUpperCase() : '·'}
      </span>
      <span className="lounge-lltable__word">{word ? <LlWord word={word} /> : ' '}</span>
      {note ? <span className="lounge-lltable__note">{note}</span> : null}
    </>
  )
}

/* ---------- The stage: header, table scene and the word dock ----------
   Every Last Letter mode (bots, live battles, lobbies) is drawn on this same game stage. */

function LLStage({
  mode,
  sub,
  onBack,
  backLabel,
  stat,
  tools,
  dock,
  onClick,
  children,
}: {
  mode: string
  sub: string
  onBack: () => void
  backLabel: string
  stat?: ReactNode
  tools?: ReactNode
  dock?: ReactNode
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <div className="lounge-stage" onClick={onClick}>
      <header className="lounge-stage__top">
        <button type="button" className="lounge-stage__back" onClick={onBack} aria-label={backLabel} title={backLabel}>
          <svg {...stageIcon}>
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
        <div className="lounge-stage__titles">
          <div className="lounge-stage__pill">
            <span className="lounge-stage__bolt" aria-hidden="true">
              ⚡
            </span>
            <b>LAST LETTER</b>
            <i>{mode}</i>
          </div>
          <p>{sub}</p>
        </div>
        {stat && <div className="lounge-stage__stat">{stat}</div>}
      </header>
      <div className="lounge-stage__table">{children}</div>
      {tools}
      {dock}
    </div>
  )
}

const stageIcon = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function LLHearts({ lives }: { lives: number }) {
  return (
    <span className="lounge-stage__hearts" role="img" aria-label={`${lives} lives left`}>
      {Array.from({ length: LL_LIVES }, (_, i) => (
        <span key={i} className={i < lives ? '' : 'is-lost'} aria-hidden="true">
          ♥
        </span>
      ))}
    </span>
  )
}

// Bottom dock: one slot per letter you type (the first slot is the letter you must start with), then the word box
function LLDock({
  letter,
  value,
  onChange,
  onSubmit,
  locked,
  placeholder,
  inputRef,
  shake,
  msg,
}: {
  letter: string
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  locked: boolean
  placeholder: string
  inputRef: { readonly current: HTMLInputElement | null }
  shake: number
  msg?: string
}) {
  const L = letter.toUpperCase()
  const slots = Math.max(7, value.length + 1)
  return (
    <div className="lounge-dock">
      {msg ? (
        <p className="lounge-dock__msg" role="alert">
          {msg}
        </p>
      ) : null}
      <div className="lounge-dock__slots" aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={`lounge-dock__slot${i === 0 ? ' is-first' : ''}${value[i] ? ' is-filled' : ''}`}>
            {value[i] ?? (i === 0 ? L : '')}
          </span>
        ))}
      </div>
      <form
        key={shake}
        className={`lounge-dock__form${shake ? ' is-shake' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (!locked) onSubmit()
        }}
      >
        <input
          ref={inputRef}
          className="lounge-dock__input"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 24))}
          disabled={locked}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-label="Type your word"
          placeholder={placeholder}
        />
        <button type="submit" className="lounge-dock__send" aria-label="Send word" disabled={locked || !value.trim()}>
          <svg {...stageIcon} width={20} height={20}>
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </button>
      </form>
    </div>
  )
}

/* ---------- Mode 1: You vs the bot ----------
   Two seats: you and the Lounge Bot, taking turns. If the bot can't find a word you score
   and the round restarts on a new letter. You have 3 lives. */

const LL_BOT_CAST = ['Lounge Bot']

function LastLetterBotRound({ ctx, finish }: { ctx: GameCtx; finish: (r: ArcadeResult) => void }) {
  const players = useMemo<LLPlayer[]>(
    () => [
      { id: 'me', name: ctx.userName || 'You', seed: `${ctx.userName}-${ctx.avatarSalt}` },
      ...LL_BOT_CAST.map((name, i) => ({ id: `b${i}`, name, seed: `bot-${name}`, bot: true })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [turn, setTurn] = useState('')
  const [letter, setLetter] = useState('')
  const [alive, setAlive] = useState<string[]>(() => players.map((p) => p.id))
  const [said, setSaid] = useState<Record<string, string>>({})
  const [lastWord, setLastWord] = useState('')
  const [input, setInput] = useState('')
  const [lives, setLives] = useState(LL_LIVES)
  const [score, setScore] = useState(0)
  const [mine, setMine] = useState(0)
  const [timeLeft, setTimeLeft] = useState(LL_TURN_SECONDS)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const [shake, setShake] = useState(0)
  const [hint, setHint] = useState('')
  const [banner, setBanner] = useState('')
  useWordPrefetch(input, letter)

  // mutable game state (read from timers, so it lives in refs)
  const used = useRef<Set<string>>(new Set())
  const st = useRef({ score: 0, lives: LL_LIVES, mine: 0, stumps: 0, moves: 0, longest: '', hinted: false, alive: players.map((p) => p.id) })
  const turnRef = useRef('')
  const busy = useRef(true)
  const done = useRef(false)
  const deadline = useRef(0)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }
  const addScore = (n: number) => {
    st.current.score = Math.max(0, st.current.score + n)
    setScore(st.current.score)
  }
  const nextAfter = (id: string) => {
    const i = players.findIndex((p) => p.id === id)
    for (let k = 1; k <= players.length; k++) {
      const nid = players[(i + k) % players.length].id
      if (st.current.alive.includes(nid)) return nid
    }
    return id
  }

  const end = (won = false) => {
    if (done.current) return
    done.current = true
    busy.current = true
    timers.current.forEach(clearTimeout)
    const s = st.current
    finish({
      score: s.score,
      verdict: won ? 'Table champion 🏆' : llVerdict(s.mine),
      sub: `${s.mine} ${s.mine === 1 ? 'word' : 'words'} chained · bot stumped ${s.stumps}x`,
      stats: [
        ['Words', s.mine],
        ['Bot stumped', s.stumps],
        ['Longest', s.longest || '-'],
      ],
      shareText: `🔤 I scored ${s.score} against the bot in Last Letter: ${s.mine} words chained${s.stumps ? `, stumped it ${s.stumps}x` : ''}. Think you can beat me?`,
    })
  }

  // Hands the turn to `id`, who has to start their word with `ltr`
  const give = (id: string, ltr: string, note?: string) => {
    if (done.current) return
    turnRef.current = id
    setTurn(id)
    setLetter(ltr)
    llWarm(ltr)
    if (note) setBanner(note)
    if (id === 'me') {
      deadline.current = Date.now() + LL_TURN_SECONDS * 1000
      setTimeLeft(LL_TURN_SECONDS)
      st.current.hinted = false
      setHint('')
      busy.current = false
      inputRef.current?.focus()
      return
    }
    busy.current = true
    later(async () => {
      if (done.current || turnRef.current !== id) return
      const word = await llBotPick(ltr, used.current, st.current.moves)
      if (done.current || turnRef.current !== id) return
      if (!word) return stump(id, ltr)
      used.current.add(word)
      st.current.moves++
      setSaid((s) => ({ ...s, [id]: word }))
      setLastWord(word)
      setBanner('')
      give(nextAfter(id), llLast(word))
    }, 1000 + Math.random() * 900)
  }

  // A bot with nothing to say is out of the game
  const stump = (id: string, ltr: string) => {
    const s = st.current
    const name = players.find((p) => p.id === id)?.name ?? 'A bot'
    s.stumps++
    addScore(50)
    // the only bot at the table stays seated: you score and everyone restarts on a new letter
    if (s.alive.filter((x) => x !== 'me').length <= 1) {
      give('me', llRand(LL_START_LETTERS.split('')), `You stumped ${name}! +50 · new letter`)
      return
    }
    s.alive = s.alive.filter((x) => x !== id)
    setAlive([...s.alive])
    if (!s.alive.some((x) => x !== 'me')) {
      addScore(150)
      setBanner(`${name} is out. You win!`)
      end(true)
      return
    }
    give(nextAfter(id), ltr, `${name} is stumped and out! +50`)
  }

  const loseLife = (reason: string) => {
    if (done.current || busy.current || turnRef.current !== 'me') return
    const left = st.current.lives - 1
    st.current.lives = left
    setLives(left)
    setInput('')
    setMsg('')
    if (left <= 0) {
      end(false)
      return
    }
    busy.current = true
    give(nextAfter('me'), llRand(LL_START_LETTERS.split('')), `${reason} ${left} ${left === 1 ? 'life' : 'lives'} left. New letter!`)
  }
  const loseLifeRef = useRef(loseLife)
  loseLifeRef.current = loseLife

  useEffect(() => {
    // anyone can open the game, so the table picks a random seat to go first
    give(players[Math.floor(Math.random() * players.length)].id, llRand(LL_START_LETTERS.split('')))
    const tick = setInterval(() => {
      if (busy.current || done.current || turnRef.current !== 'me') return
      const left = Math.max(0, (deadline.current - Date.now()) / 1000)
      setTimeLeft(left)
      if (left <= 0) loseLifeRef.current("Time's up!")
    }, 100)
    return () => {
      clearInterval(tick)
      timers.current.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reject = (text: string) => {
    setMsg(text)
    setShake((n) => n + 1)
  }

  const submit = async () => {
    if (done.current || busy.current || turnRef.current !== 'me') return
    const word = input.trim().toLowerCase()
    if (word.length < LL_MIN_LEN) return reject(`Use at least ${LL_MIN_LEN} letters.`)
    if (word[0] !== letter) return reject(`It has to start with ${letter.toUpperCase()}.`)
    if (used.current.has(word)) return reject('That word is already in the chain.')

    // The timer pauses while the dictionary looks the word up, so a slow connection never costs a life
    busy.current = true
    setChecking(true)
    const t0 = Date.now()
    const ok = await llIsWord(word)
    if (done.current) return
    deadline.current += Date.now() - t0
    busy.current = false
    setChecking(false)
    if (!ok) return reject(`"${word}" isn't in the dictionary. Try another!`)

    const left = Math.max(0, (deadline.current - Date.now()) / 1000)
    const pts = 10 + word.length * 2 + Math.round((left / LL_TURN_SECONDS) * 10)
    used.current.add(word)
    st.current.mine++
    st.current.moves++
    if (word.length > st.current.longest.length) st.current.longest = word
    setMine(st.current.mine)
    addScore(pts)
    setSaid((s) => ({ ...s, me: word }))
    setLastWord(word)
    setBanner('')
    setInput('')
    setMsg('')
    busy.current = true
    give(nextAfter('me'), llLast(word))
  }

  const giveHint = async () => {
    if (done.current || busy.current || st.current.hinted) return
    st.current.hinted = true
    setHint('…')
    const free = (await llLoadLetter(letter)).filter((w) => !used.current.has(w))
    if (!free.length || done.current) {
      st.current.hinted = false
      setHint('')
      return
    }
    const long = free.filter((w) => w.length >= 5)
    const w = llRand(long.length ? long : free)
    addScore(-10)
    setHint(`${w.slice(0, 2).toUpperCase()}${'•'.repeat(w.length - 2)}`)
    inputRef.current?.focus()
  }

  const myTurn = turn === 'me'
  const frac = Math.min(1, Math.max(0, timeLeft / LL_TURN_SECONDS))
  const locked = !myTurn || checking
  useAutoFocus(inputRef, !locked)

  const seats: LLSeat[] = players.map((p) => {
    const out = !alive.includes(p.id)
    const isTurn = turn === p.id && !out
    const isMe = p.id === 'me'
    return {
      id: p.id,
      name: p.name,
      seed: p.seed,
      bot: p.bot,
      me: isMe,
      out,
      turn: isTurn,
      low: isTurn && isMe && timeLeft <= 6,
      pct: isTurn && isMe ? frac * 100 : undefined,
      thinking: isTurn && !isMe,
      status: out ? 'Out' : isTurn ? (isMe ? (checking ? 'Checking…' : 'Your turn') : 'Thinking…') : said[p.id],
    }
  })

  return (
    <LLStage
      mode="VS BOT"
      sub="Think fast. Type the next word that starts with the last letter!"
      onBack={() => end(false)}
      backLabel="Leave the table"
      onClick={() => inputRef.current?.focus()}
      stat={
        <>
          <span className="lounge-stage__links">
            <b>{mine}</b> {mine === 1 ? 'link' : 'links'} so far
          </span>
          <LLHearts lives={lives} />
        </>
      }
      tools={
        <div className="lounge-stage__tools">
          <button type="button" onClick={giveHint} disabled={locked || st.current.hinted}>
            💡 {hint ? hint : 'Hint'} {!hint && <small>-10</small>}
          </button>
          <button type="button" onClick={() => loseLife('Skipped.')} disabled={locked}>
            ⏭ Skip <small>-1 ♥</small>
          </button>
          <span className="lounge-stage__score">⚡ {score} pts</span>
        </div>
      }
      dock={
        <LLDock
          letter={letter}
          value={input}
          onChange={(v) => {
            setInput(v)
            setMsg('')
          }}
          onSubmit={submit}
          locked={locked}
          shake={shake}
          msg={msg}
          inputRef={inputRef}
          placeholder={myTurn ? `Type a word starting with ${letter.toUpperCase()}…` : 'Wait for your turn…'}
        />
      }
    >
      <LLTable seats={seats} label="Last Letter table" center={<LLCenter letter={letter} word={lastWord} note={banner} />} />
    </LLStage>
  )
}

/* ---------- Modes 2-4: live battles for 3, 4 or 7 players ----------
   One player (the host) owns the match. Everyone else sends their word to the host, the host
   checks it and broadcasts the result. All of it travels over the same lounge channel as Duels. */

interface LLPlayer {
  id: string
  name: string
  seed: string
  bot?: boolean // a robot sitting at the table: it takes its turns like everyone else
}

interface LLRoom {
  id: string
  size: LLSize
  hostId: string
  players: LLPlayer[]
  status: 'lobby' | 'full' | 'playing'
  seen: number // when we last heard from the host
}

interface LLEntry {
  id: number
  by: string // player id, or '' for a system line
  word: string
}

interface LLGame {
  roomId: string
  size: LLSize
  hostId: string
  players: LLPlayer[] // turn order
  alive: string[]
  chain: LLEntry[]
  letter: string
  turn: string
  turnMs: number
  turnAt: number
  winner: string | null // player id, or 'none' if the match was abandoned
  note: string
  lastEvent: number
}

const LL_BOT_NAMES = ['Botley', 'Chainbot', 'Wordy', 'Linky', 'Lexi-Bot', 'Robo Rick', 'Beepa']

const LL_BEAT_MS = 2500
const LL_STALE_MS = 9000

const llNextAlive = (players: LLPlayer[], afterId: string, alive: string[]) => {
  const i = players.findIndex((p) => p.id === afterId)
  for (let k = 1; k <= players.length; k++) {
    const id = players[(i + k) % players.length].id
    if (alive.includes(id)) return id
  }
  return alive[0] ?? ''
}

const llCleanPlayer = (x: any): LLPlayer => ({
  id: String(x?.id ?? ''),
  name: String(x?.name ?? 'Player').slice(0, 20),
  seed: String(x?.seed ?? x?.id ?? '').slice(0, 80),
  bot: x?.bot === true,
})

function useLastLetter(ctx: GameCtx, bus: DuelBus, open: boolean, onEnter: () => void) {
  const board = useBoard('lastletter', ctx.refreshKey, 'sum')
  const boardRef = useRef(board)
  boardRef.current = board

  const me = useMemo<LLPlayer>(
    () => ({ id: ctx.deviceId, name: ctx.userName, seed: `${ctx.userName}-${ctx.avatarSalt}` }),
    [ctx.deviceId, ctx.userName, ctx.avatarSalt],
  )
  const meRef = useRef(me)
  meRef.current = me
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter

  const [lobbies, setLobbies] = useState<Record<string, LLRoom>>({})
  const [room, setRoomState] = useState<LLRoom | null>(null)
  const [game, setGameState] = useState<LLGame | null>(null)
  const [notice, setNotice] = useState('')
  const [shake, setShake] = useState(0)
  const [checking, setChecking] = useState(false)
  const [joining, setJoiningState] = useState<string | null>(null)

  // Refs mirror the state so timers and bus callbacks always see the latest values
  const roomRef = useRef<LLRoom | null>(null)
  const gameRef = useRef<LLGame | null>(null)
  const joiningRef = useRef<string | null>(null)
  const idRef = useRef(0)
  const recorded = useRef('')
  // Only the host uses this
  const host = useRef({
    used: new Set<string>(),
    seen: {} as Record<string, number>,
    moves: 0,
    validating: false,
    turnTimer: null as ReturnType<typeof setTimeout> | null,
    startTimer: null as ReturnType<typeof setTimeout> | null,
    botTimer: null as ReturnType<typeof setTimeout> | null,
  })

  const setRoom = (r: LLRoom | null) => {
    roomRef.current = r
    setRoomState(r)
  }
  const setGame = (g: LLGame | null) => {
    gameRef.current = g
    setGameState(g)
  }
  const setJoining = (id: string | null) => {
    joiningRef.current = id
    setJoiningState(id)
  }
  const send = (p: Record<string, unknown>) => bus.send(p)
  const iAmHost = () => !!roomRef.current && roomRef.current.hostId === meRef.current.id
  const fail = (reason: string) => {
    setNotice(reason)
    setShake((n) => n + 1)
    setChecking(false)
  }
  const clearTimers = () => {
    const h = host.current
    if (h.turnTimer) clearTimeout(h.turnTimer)
    if (h.startTimer) clearTimeout(h.startTimer)
    if (h.botTimer) clearTimeout(h.botTimer)
    h.turnTimer = null
    h.startTimer = null
    h.botTimer = null
  }
  const pushRoom = (r: LLRoom) =>
    send({ t: 'll_room', room: { id: r.id, size: r.size, hostId: r.hostId, players: r.players, status: r.status } })
  const dropLobby = (id: string) =>
    setLobbies((prev) => {
      if (!prev[id]) return prev
      const { [id]: _gone, ...rest } = prev
      return rest
    })

  /* ----- what every player does when the host announces something ----- */

  const applyStart = (r: LLRoom, order: LLPlayer[], letter: string, turnMs: number) => {
    llWarm(letter)
    const first = order[0]
    const m = meRef.current
    setGame({
      roomId: r.id,
      size: r.size,
      hostId: r.hostId,
      players: order,
      alive: order.map((p) => p.id),
      chain: [
        {
          id: ++idRef.current,
          by: '',
          word: `Starting letter: ${letter.toUpperCase()}. ${first.id === m.id ? 'You go' : `${first.name} goes`} first!`,
        },
      ],
      letter,
      turn: first.id,
      turnMs,
      turnAt: Date.now(),
      winner: null,
      note: '',
      lastEvent: Date.now(),
    })
    setRoom({ ...r, players: order, status: 'playing', seen: Date.now() })
    dropLobby(r.id)
    setNotice('')
    setChecking(false)
    onEnterRef.current()
  }

  const applyMove = (ev: { word: string; by: string; next: string; letter: string; turnMs: number }) => {
    llWarm(ev.letter)
    const g = gameRef.current
    if (!g || g.winner) return
    setGame({
      ...g,
      chain: [...g.chain.slice(-60), { id: ++idRef.current, by: ev.by, word: ev.word }],
      letter: ev.letter,
      turn: ev.next,
      turnMs: ev.turnMs,
      turnAt: Date.now(),
      lastEvent: Date.now(),
    })
    setNotice('')
    setChecking(false)
  }

  const recordWin = (roomId: string) => {
    if (recorded.current === roomId) return
    recorded.current = roomId
    const c = ctxRef.current
    if (!c.userName) return
    boardRef.current.submit({ deviceId: c.deviceId, name: c.userName, avatarSalt: c.avatarSalt, score: 100 })
  }

  const applyOut = (ev: { id: string; reason: string; next: string; turnMs: number; winner: string | null }) => {
    const g = gameRef.current
    if (!g || g.winner) return
    const m = meRef.current
    const who = ev.id === m.id ? 'You are' : `${g.players.find((p) => p.id === ev.id)?.name ?? 'Someone'} is`
    setGame({
      ...g,
      alive: g.alive.filter((x) => x !== ev.id),
      chain: [...g.chain.slice(-60), { id: ++idRef.current, by: '', word: `${who} out: ${ev.reason}` }],
      turn: ev.next || g.turn,
      turnMs: ev.turnMs,
      turnAt: Date.now(),
      winner: ev.winner,
      lastEvent: Date.now(),
    })
    setNotice('')
    setChecking(false)
    if (ev.winner === m.id) recordWin(g.roomId)
  }

  /* ----- host only: run the match ----- */

  const armTurn = (ms: number) => {
    const h = host.current
    if (h.turnTimer) clearTimeout(h.turnTimer)
    h.turnTimer = setTimeout(onTurnTimeout, ms + 1200) // a little grace for network lag
  }

  const onTurnTimeout = () => {
    const h = host.current
    h.turnTimer = null
    const g = gameRef.current
    if (!g || g.winner) return
    if (h.validating) {
      h.turnTimer = setTimeout(onTurnTimeout, 1500)
      return
    }
    eliminate(g.turn, 'ran out of time')
  }

  const eliminate = (id: string, reason: string) => {
    const g = gameRef.current
    const h = host.current
    if (!g || g.winner || !g.alive.includes(id)) return
    const alive = g.alive.filter((x) => x !== id)
    const winner = alive.length <= 1 ? alive[0] ?? 'none' : null
    const wasTurn = g.turn === id
    const next = winner ? '' : wasTurn ? llNextAlive(g.players, id, alive) : g.turn
    const turnMs = llTurnMs(h.moves, g.players.length)
    const ev = { roomId: g.roomId, id, reason, next, turnMs, winner }
    send({ t: 'll_out', ...ev })
    applyOut(ev)
    if (winner) {
      if (h.turnTimer) clearTimeout(h.turnTimer)
      if (h.botTimer) clearTimeout(h.botTimer)
      h.turnTimer = null
      h.botTimer = null
    } else if (wasTurn) {
      armTurn(turnMs)
      maybeBotTurn()
    }
  }

  // A bot at the table plays on the host's device, through exactly the same checks as a human move
  const maybeBotTurn = () => {
    const h = host.current
    if (h.botTimer) clearTimeout(h.botTimer)
    h.botTimer = null
    const g = gameRef.current
    if (!g || g.winner || g.hostId !== meRef.current.id) return
    const p = g.players.find((x) => x.id === g.turn)
    if (!p?.bot || !g.alive.includes(p.id)) return
    const { roomId, turn, letter } = g
    h.botTimer = setTimeout(async () => {
      h.botTimer = null
      const word = await llBotPick(letter, h.used, h.moves)
      const cur = gameRef.current
      if (!cur || cur.winner || cur.roomId !== roomId || cur.turn !== turn) return
      if (word) await hostWord(turn, word, true)
      else eliminate(turn, 'ran out of words')
    }, 1400 + Math.random() * 1600)
  }

  // `trusted` = the player's own device already checked the word, so the host skips the lookup
  const hostWord = async (by: string, raw: string, trusted = false) => {
    const g = gameRef.current
    const h = host.current
    if (!g || g.winner || g.turn !== by || h.validating) return
    const reject = (reason: string) => {
      if (by === meRef.current.id) fail(reason)
      else send({ t: 'll_reject', roomId: g.roomId, to: by, reason })
    }
    const word = String(raw).trim().toLowerCase()
    if (!/^[a-z]+$/.test(word) || word.length < LL_MIN_LEN || word.length > 24) return reject(`Use one word, at least ${LL_MIN_LEN} letters.`)
    if (word[0] !== g.letter) return reject(`It has to start with ${g.letter.toUpperCase()}.`)
    if (h.used.has(word)) return reject('That word is already in the chain.')

    h.validating = true
    const ok = trusted || (await llIsWord(word))
    h.validating = false
    const cur = gameRef.current
    if (!cur || cur.winner || cur.roomId !== g.roomId || cur.turn !== by) return
    if (!ok) return reject(`"${word}" isn't in the dictionary. Try another!`)

    h.used.add(word)
    h.moves++
    const ev = {
      roomId: cur.roomId,
      word,
      by,
      next: llNextAlive(cur.players, by, cur.alive),
      letter: llLast(word),
      turnMs: llTurnMs(h.moves, cur.players.length),
    }
    send({ t: 'll_move', ...ev })
    applyMove(ev)
    armTurn(ev.turnMs)
    maybeBotTurn()
  }

  const startGame = (r: LLRoom) => {
    const h = host.current
    h.used = new Set()
    h.moves = 0
    h.validating = false
    const order = [...r.players].sort(() => Math.random() - 0.5)
    const letter = llRand(LL_START_LETTERS.split(''))
    const turnMs = LL_TURN_SECONDS * 1000
    send({ t: 'll_start', roomId: r.id, players: order, letter, turnMs })
    applyStart(r, order, letter, turnMs)
    armTurn(turnMs)
    maybeBotTurn()
  }

  const scheduleStart = () => {
    const h = host.current
    if (h.startTimer) clearTimeout(h.startTimer)
    h.startTimer = setTimeout(() => {
      h.startTimer = null
      const r = roomRef.current
      // the match only begins if the lobby is still full a moment later
      if (r && r.hostId === meRef.current.id && r.status === 'full' && r.players.length >= r.size) startGame(r)
    }, 2500)
  }

  const hostJoin = (from: string, fromName: string, p: any) => {
    const r = roomRef.current
    if (!r || r.hostId !== meRef.current.id || r.id !== p?.roomId || r.status === 'playing') return
    host.current.seen[from] = Date.now()
    if (r.players.some((x) => x.id === from)) {
      pushRoom(r)
      return
    }
    if (r.players.length >= r.size) return // lobby already full
    const player = llCleanPlayer({ id: from, name: p?.player?.name || fromName, seed: p?.player?.seed })
    const players = [...r.players, player]
    const next: LLRoom = { ...r, players, status: players.length >= r.size ? 'full' : 'lobby' }
    setRoom(next)
    pushRoom(next)
    if (next.status === 'full') scheduleStart()
  }

  const hostLeave = (from: string, p: any) => {
    const r = roomRef.current
    if (!r || r.hostId !== meRef.current.id || r.id !== p?.roomId) return
    if (r.status === 'playing') {
      eliminate(from, 'left the match')
      return
    }
    const players = r.players.filter((x) => x.id !== from)
    if (players.length === r.players.length) return
    const h = host.current
    if (h.startTimer) clearTimeout(h.startTimer)
    h.startTimer = null
    const next: LLRoom = { ...r, players, status: 'lobby' }
    setRoom(next)
    pushRoom(next)
  }

  /* ----- incoming messages ----- */

  const onMsg = (p: any) => {
    if (!p || typeof p.t !== 'string' || !p.t.startsWith('ll_')) return
    const from = String(p.from ?? '')
    const m = meRef.current
    if (!from || !m.id || from === m.id) return
    const g = gameRef.current

    switch (p.t) {
      case 'll_room': {
        const raw = p.room
        if (!raw || raw.hostId !== from || typeof raw.id !== 'string' || !Array.isArray(raw.players)) return
        if (!(LL_SIZES as readonly number[]).includes(raw.size)) return
        const r: LLRoom = {
          id: raw.id,
          size: raw.size as LLSize,
          hostId: from,
          players: raw.players.slice(0, 7).map(llCleanPlayer),
          status: raw.status === 'full' ? 'full' : 'lobby',
          seen: Date.now(),
        }
        const mine = r.players.some((x) => x.id === m.id)
        setLobbies((prev) => ({ ...prev, [r.id]: r }))
        if (joiningRef.current === r.id && mine) {
          setJoining(null)
          setNotice('')
          setRoom(r)
          onEnterRef.current()
        } else if (roomRef.current?.id === r.id && roomRef.current.status !== 'playing') {
          if (mine) setRoom(r)
          else {
            setRoom(null)
            setNotice('You are no longer in that lobby.')
          }
        }
        return
      }
      case 'll_close': {
        dropLobby(String(p.roomId))
        const r = roomRef.current
        if (r && r.id === p.roomId && from === r.hostId) {
          if (g && g.roomId === r.id) {
            if (!g.winner) setGame({ ...g, winner: 'none', note: 'The host left, so the match ended.' })
          } else {
            setRoom(null)
            setNotice('The host closed the lobby.')
          }
        }
        return
      }
      case 'll_join':
        hostJoin(from, String(p.fromName ?? ''), p)
        return
      case 'll_leave':
        hostLeave(from, p)
        return
      case 'll_ping': {
        const r = roomRef.current
        if (r && r.hostId === m.id && r.id === p.roomId) host.current.seen[from] = Date.now()
        return
      }
      case 'll_start': {
        const r = roomRef.current
        if (!r || r.id !== p.roomId || from !== r.hostId || !Array.isArray(p.players) || !p.players.length) return
        applyStart(r, p.players.map(llCleanPlayer), String(p.letter ?? 'a').slice(0, 1), Number(p.turnMs) || LL_TURN_SECONDS * 1000)
        return
      }
      case 'll_word':
        if (g && g.roomId === p.roomId && g.hostId === m.id) hostWord(from, String(p.word ?? ''), p.v === 1)
        return
      case 'll_move':
        if (g && g.roomId === p.roomId && from === g.hostId) {
          applyMove({
            word: String(p.word ?? ''),
            by: String(p.by ?? ''),
            next: String(p.next ?? ''),
            letter: String(p.letter ?? '').slice(0, 1),
            turnMs: Number(p.turnMs) || LL_TURN_SECONDS * 1000,
          })
        }
        return
      case 'll_out':
        if (g && g.roomId === p.roomId && from === g.hostId) {
          applyOut({
            id: String(p.id ?? ''),
            reason: String(p.reason ?? 'out'),
            next: String(p.next ?? ''),
            turnMs: Number(p.turnMs) || LL_TURN_SECONDS * 1000,
            winner: p.winner ? String(p.winner) : null,
          })
        }
        return
      case 'll_reject':
        if (g && g.roomId === p.roomId && from === g.hostId && p.to === m.id) fail(String(p.reason ?? 'That word was not accepted.'))
        return
    }
  }
  const onMsgRef = useRef(onMsg)
  onMsgRef.current = onMsg

  useEffect(() => bus.subscribe((p) => onMsgRef.current(p)), [bus])

  // Heartbeat: the host keeps the lobby alive, members ping the host, stale things disappear
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      setLobbies((prev) => {
        const keep = Object.values(prev).filter((r) => now - r.seen < LL_STALE_MS)
        return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep.map((r) => [r.id, r]))
      })
      const r = roomRef.current
      if (!r) return
      const m = meRef.current
      if (r.hostId === m.id) {
        if (r.status === 'playing') return
        // drop members who went silent
        const players = r.players.filter((p) => p.bot || p.id === m.id || now - (host.current.seen[p.id] ?? 0) < LL_STALE_MS)
        let next = r
        if (players.length !== r.players.length) {
          if (host.current.startTimer) clearTimeout(host.current.startTimer)
          host.current.startTimer = null
          next = { ...r, players, status: 'lobby' }
          setRoom(next)
        }
        pushRoom(next)
      } else if (r.status !== 'playing') {
        send({ t: 'll_ping', roomId: r.id })
        if (now - r.seen > LL_STALE_MS) {
          setRoom(null)
          setNotice('The host went quiet, so the lobby closed.')
        }
      } else {
        const g = gameRef.current
        if (g && !g.winner && now - g.lastEvent > g.turnMs + LL_STALE_MS) {
          setGame({ ...g, winner: 'none', note: 'Lost connection to the host.' })
        }
      }
    }, LL_BEAT_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => clearTimers(), [])

  /* ----- what the screens call ----- */

  const create = (size: LLSize) => {
    const m = meRef.current
    if (!m.name || roomRef.current || joiningRef.current) return
    const h = host.current
    h.used = new Set()
    h.moves = 0
    h.validating = false
    h.seen = { [m.id]: Date.now() }
    const r: LLRoom = {
      id: `ll_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      size,
      hostId: m.id,
      players: [m],
      status: 'lobby',
      seen: Date.now(),
    }
    setGame(null)
    setNotice('')
    setRoom(r)
    pushRoom(r)
    onEnterRef.current()
  }

  // Host only: put a robot in an empty seat. It plays every turn like a person would.
  const changeSeats = (players: LLPlayer[]) => {
    const r = roomRef.current
    if (!r) return
    const h = host.current
    if (h.startTimer) clearTimeout(h.startTimer)
    h.startTimer = null
    const next: LLRoom = { ...r, players, status: players.length >= r.size ? 'full' : 'lobby' }
    setRoom(next)
    pushRoom(next)
    if (next.status === 'full') scheduleStart()
  }

  const addBot = () => {
    const r = roomRef.current
    if (!r || r.hostId !== meRef.current.id || r.status !== 'lobby' || r.players.length >= r.size) return
    const taken = new Set(r.players.map((p) => p.name))
    const name = LL_BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${r.players.length}`
    const bot: LLPlayer = { id: `bot_${Math.random().toString(36).slice(2, 8)}`, name, seed: `bot-${name}`, bot: true }
    changeSeats([...r.players, bot])
  }

  const fillBots = () => {
    const r = roomRef.current
    if (!r || r.hostId !== meRef.current.id || r.status !== 'lobby') return
    const players = [...r.players]
    const taken = new Set(players.map((p) => p.name))
    while (players.length < r.size) {
      const name = LL_BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${players.length}`
      taken.add(name)
      players.push({ id: `bot_${Math.random().toString(36).slice(2, 8)}`, name, seed: `bot-${name}`, bot: true })
    }
    changeSeats(players)
  }

  const removeBot = (id: string) => {
    const r = roomRef.current
    if (!r || r.hostId !== meRef.current.id || r.status === 'playing') return
    const players = r.players.filter((p) => !(p.id === id && p.bot))
    if (players.length === r.players.length) return
    changeSeats(players)
  }

  const join = (roomId: string) => {
    if (!meRef.current.name || roomRef.current || joiningRef.current) return
    setNotice('')
    setJoining(roomId)
    send({ t: 'll_join', roomId, player: meRef.current })
    setTimeout(() => {
      if (joiningRef.current === roomId && !roomRef.current) {
        setJoining(null)
        setNotice("Couldn't join. The lobby may be full or closed.")
      }
    }, 4000)
  }

  const leave = () => {
    const r = roomRef.current
    const m = meRef.current
    if (r) send(r.hostId === m.id ? { t: 'll_close', roomId: r.id } : { t: 'll_leave', roomId: r.id })
    clearTimers()
    host.current.validating = false
    setRoom(null)
    setGame(null)
    setJoining(null)
    setChecking(false)
    setNotice('')
  }

  // Closing the lounge means leaving the lobby or match
  useEffect(() => {
    if (!open && (roomRef.current || joiningRef.current)) leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = async (raw: string) => {
    const g = gameRef.current
    const m = meRef.current
    if (!g || g.winner || g.turn !== m.id || checking) return
    const word = raw.trim().toLowerCase()
    if (word.length < LL_MIN_LEN) return fail(`Use at least ${LL_MIN_LEN} letters.`)
    if (word[0] !== g.letter) return fail(`It has to start with ${g.letter.toUpperCase()}.`)
    if (g.chain.some((e) => e.by && e.word === word)) return fail('That word is already in the chain.')
    setNotice('')
    setChecking(true)
    if (iAmHost()) {
      await hostWord(m.id, word)
      setChecking(false)
    } else {
      // Check on this device first (usually already cached from typing), then the host only has to accept it
      if (!(await llIsWord(word))) return fail(`"${word}" isn't in the dictionary. Try another!`)
      send({ t: 'll_word', roomId: g.roomId, word, v: 1 })
      setTimeout(() => setChecking(false), 9000) // safety net if the host never answers
    }
  }

  const openLobbies = Object.values(lobbies)
    .filter((r) => r.hostId !== me.id && r.status === 'lobby' && r.players.length < r.size)
    .sort((a, b) => a.size - b.size)

  return { board, lobbies: openLobbies, room, game, notice, shake, checking, joining, create, join, leave, submit, addBot, fillBots, removeBot }
}

type LL = ReturnType<typeof useLastLetter>

/* ---------- screens ---------- */

function LLLobby({ ctx, ll, room }: { ctx: GameCtx; ll: LL; room: LLRoom }) {
  const [invited, setInvited] = useState(false)
  const isHost = room.hostId === ctx.deviceId
  const missing = room.size - room.players.length
  const canEdit = isHost && room.status === 'lobby'

  const seats: LLSeat[] = Array.from({ length: room.size }, (_, i) => {
    const p = room.players[i]
    if (!p) {
      return {
        id: `empty-${i}`,
        name: '',
        empty: true,
        action: canEdit ? { label: '🤖 Add bot', title: 'Seat a bot here. It plays every turn.', onClick: ll.addBot } : undefined,
      }
    }
    return {
      id: p.id,
      name: p.name,
      seed: p.seed,
      bot: p.bot,
      me: p.id === ctx.deviceId,
      host: p.id === room.hostId,
      action: canEdit && p.bot ? { label: '✕ Remove', title: `Remove ${p.name}`, onClick: () => ll.removeBot(p.id) } : undefined,
    }
  })

  return (
    <LLStage
      mode={`${room.size} PLAYERS`}
      sub={
        room.status === 'full'
          ? 'Table full! Starting…'
          : `Waiting for ${missing} more ${missing === 1 ? 'player' : 'players'}. ${isHost ? 'Invite people or seat a bot. Bots play every turn too.' : 'The match starts when every seat is filled.'}`
      }
      onBack={ll.leave}
      backLabel={isHost ? 'Close table' : 'Leave table'}
      stat={
        <span className="lounge-stage__links" aria-label={`${room.players.length} of ${room.size} players`}>
          <b>{room.players.length}</b>/{room.size} seated
        </span>
      }
      dock={
        <div className="lounge-dock">
          {ll.notice && (
            <p className="lounge-dock__msg" role="alert">
              {ll.notice}
            </p>
          )}
          <div className="lounge-dock__actions">
            {isHost && (
              <button
                type="button"
                className="lounge-dock__btn"
                disabled={invited || room.status === 'full'}
                onClick={() => {
                  ctx.onShare(`🔤 ${ctx.userName} opened a ${room.size}-player Last Letter table (${room.players.length}/${room.size}). Grab a seat from the Last Letter tab!`)
                  setInvited(true)
                }}
              >
                {invited ? 'Invite sent ✓' : 'Invite via chat'}
              </button>
            )}
            {canEdit && missing > 1 && (
              <button type="button" className="lounge-dock__btn is-ghost" onClick={ll.fillBots}>
                🤖 Fill with bots
              </button>
            )}
            <button type="button" className="lounge-dock__btn is-ghost" onClick={ll.leave}>
              {isHost ? 'Close table' : 'Leave table'}
            </button>
          </div>
        </div>
      }
    >
      <LLTable
        seats={seats}
        label="Last Letter lobby"
        center={
          <>
            <span className="lounge-lltable__label">{room.status === 'full' ? 'Get ready' : 'Lobby'}</span>
            <span className="lounge-lltable__count">
              <b>{room.players.length}</b>/{room.size}
            </span>
            <span className="lounge-lltable__note">{room.status === 'full' ? 'Starting…' : `${missing} seat${missing === 1 ? '' : 's'} open`}</span>
          </>
        }
      />
    </LLStage>
  )
}

function LLPlay({ ctx, ll, g }: { ctx: GameCtx; ll: LL; g: LLGame }) {
  const me = ctx.deviceId
  const [input, setInput] = useState('')
  const [now, setNow] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)

  useWordPrefetch(input, g.letter)
  const iAmOut = !g.alive.includes(me)
  const myTurn = g.turn === me && !iAmOut

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    setInput('')
    if (myTurn) inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.turn, g.alive.length])

  const timeLeft = Math.max(0, (g.turnAt + g.turnMs - now) / 1000)
  const frac = Math.min(1, timeLeft / (g.turnMs / 1000))
  const low = timeLeft <= 6
  const L = g.letter.toUpperCase()
  const locked = !myTurn || ll.checking
  useAutoFocus(inputRef, !locked)

  const words = g.chain.filter((e) => e.by)
  const lastWord = words[words.length - 1]?.word
  const said: Record<string, string> = {}
  words.forEach((e) => {
    said[e.by] = e.word
  })
  // a fresh "X is out" line stays on the table for a couple of moves, then fades away
  const note = g.chain.slice(-2).find((e) => !e.by)?.word

  const seats: LLSeat[] = g.players.map((p) => {
    const out = !g.alive.includes(p.id)
    const turn = p.id === g.turn && !out
    const isMe = p.id === me
    return {
      id: p.id,
      name: p.name,
      seed: p.seed,
      bot: p.bot,
      me: isMe,
      out,
      turn,
      low: turn && low,
      thinking: turn && !isMe && !!p.bot,
      pct: turn ? frac * 100 : undefined,
      status: out ? 'Out' : turn ? (isMe ? (ll.checking ? 'Checking…' : 'Your turn') : p.bot ? 'Thinking…' : 'Typing…') : said[p.id],
    }
  })

  return (
    <LLStage
      mode={`${g.size} PLAYERS`}
      sub={iAmOut ? "You're out. Watching the rest of the table." : `Any English word, no repeats, ${Math.round(g.turnMs / 1000)}s a turn.`}
      onBack={ll.leave}
      backLabel="Leave the match"
      onClick={() => inputRef.current?.focus()}
      stat={
        <>
          <span className="lounge-stage__links">
            <b>{words.length}</b> {words.length === 1 ? 'link' : 'links'}
          </span>
          <span className="lounge-stage__links" aria-label={`${g.alive.length} players left`}>
            <b>{g.alive.length}</b> left
          </span>
        </>
      }
      dock={
        <LLDock
          letter={g.letter}
          value={input}
          onChange={setInput}
          onSubmit={() => ll.submit(input)}
          locked={locked}
          shake={ll.shake}
          msg={ll.notice}
          inputRef={inputRef}
          placeholder={myTurn ? `Type a word starting with ${L}…` : iAmOut ? 'You are out' : 'Wait for your turn…'}
        />
      }
    >
      <LLTable seats={seats} label="Last Letter table" center={<LLCenter letter={g.letter} word={lastWord} note={note} />} />
    </LLStage>
  )
}

function LLResult({ ctx, ll, g }: { ctx: GameCtx; ll: LL; g: LLGame }) {
  const [shared, setShared] = useState(false)
  const won = g.winner === ctx.deviceId
  const winner = g.players.find((p) => p.id === g.winner)
  const words = g.chain.filter((e) => e.by)
  const longest = words.reduce((best, e) => (e.word.length > best.length ? e.word : best), '')

  return (
    <>
      <div className="lounge-game lounge-game--result">
        <span className="lounge-game__verdict">{won ? 'You won! 🏆' : winner ? `${winner.name} wins` : 'Match ended'}</span>
        {winner && (
          <div className="lounge-ll__winner">
            <Avatar seed={winner.seed} size={72} />
          </div>
        )}
        <p className="lounge-game__sub">{g.note || (winner ? 'Last player standing' : 'Nobody won this one')}</p>
        <div className="lounge-game__stats">
          <div>
            <b>{g.size}</b>
            <span>Players</span>
          </div>
          <div>
            <b>{words.length}</b>
            <span>Words</span>
          </div>
          <div>
            <b>{longest || '-'}</b>
            <span>Longest</span>
          </div>
        </div>
        <div className="lounge-game__actions">
          <button type="button" className="lounge-game__btn" onClick={ll.leave}>
            Back to Last Letter
          </button>
          {won && (
            <button
              type="button"
              className="lounge-game__btn is-ghost"
              disabled={shared || !ctx.userName}
              onClick={() => {
                ctx.onShare(`🔤 I won a ${g.size}-player Last Letter battle (${words.length} words chained)! Who's next?`)
                setShared(true)
              }}
            >
              {shared ? 'Shared ✓' : 'Share to chat'}
            </button>
          )}
        </div>
        {won && <p className="lounge-game__note">+100 on today's Last Letter board.</p>}
      </div>
      <Board rows={ll.board.rows} state={ll.board.state} resetIn={ll.board.resetIn} deviceId={ctx.deviceId} subtitle="Battle wins today (100 per win)" unit="pts" />
    </>
  )
}

function LLMenu({ ctx, ll, onBot }: { ctx: GameCtx; ll: LL; onBot: () => void }) {
  const modes: { key: string; icon: string; title: string; sub: string; go: () => void }[] = [
    { key: 'bot', icon: '🤖', title: 'Play vs Bot', sub: 'You vs 1 bot · 3 lives', go: onBot },
    ...LL_SIZES.map((n) => ({
      key: String(n),
      icon: n === 2 ? '⚔️' : n === 3 ? '👥' : n === 4 ? '👨‍👩‍👧‍👦' : '🏟️',
      title: n === 2 ? '2 Players' : `${n} Players`,
      sub: n === 2 ? 'Live 1v1 · a person or a bot across the table' : `Battle royale · ${n} seats, bots welcome`,
      go: () => ll.create(n),
    })),
  ]

  return (
    <>
      <div className="lounge-game lounge-game--intro">
        <div className="lounge-game__glow" aria-hidden="true" />
        <div className="lounge-game__badge" aria-hidden="true">
          🔤
        </div>
        <span className="lounge-game__eyebrow">Word battle</span>
        <h3 className="lounge-game__title">Last Letter</h3>
        <p className="lounge-game__sub">
          Each word must start with the last letter of the one before it. Any English word counts, but no repeats. Pick how you want to play.
        </p>

        <div className="lounge-ll__modes" role="group" aria-label="Pick a mode">
          {modes.map((m) => (
            <button key={m.key} type="button" className="lounge-ll__mode" onClick={m.go} disabled={!ctx.userName || !!ll.joining}>
              <span className="lounge-ll__mode-icon" aria-hidden="true">
                {m.icon}
              </span>
              <b>{m.title}</b>
              <span>{m.sub}</span>
            </button>
          ))}
        </div>

        <p className="lounge-game__note" style={{ textAlign: 'left' }}>
          Group battles use a table. Nobody plays until every seat is taken. Seat a bot in any empty chair and it plays like everyone else. Last player standing wins.
        </p>

        {ll.notice && <p className="lounge-duel__notice">{ll.notice}</p>}

        <h4 className="lounge-ll__h">Open tables</h4>
        <ul className="lounge-members">
          {ll.lobbies.length === 0 && (
            <li className="lounge-game__note">No open tables right now. Start a 2, 3, 4 or 7 player table and invite the lounge.</li>
          )}
          {ll.lobbies.map((r) => {
            const hostP = r.players.find((p) => p.id === r.hostId)
            return (
              <li key={r.id} className="lounge-members__row">
                <Avatar seed={hostP?.seed ?? r.hostId} size={30} />
                <span className="lounge-members__name">
                  {hostP?.name ?? 'Someone'}'s table <small className="lounge-ll__fill">{r.players.length}/{r.size}</small>
                </span>
                <button type="button" className="lounge-members__btn" disabled={!ctx.userName || !!ll.joining} onClick={() => ll.join(r.id)}>
                  {ll.joining === r.id ? 'Joining…' : 'Join'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <Board rows={ll.board.rows} state={ll.board.state} resetIn={ll.board.resetIn} deviceId={ctx.deviceId} subtitle="Battle wins today (100 per win)" unit="pts" />
    </>
  )
}

function LastLetterGame({ ctx, ll }: { ctx: GameCtx; ll: LL }) {
  const [view, setView] = useState<'menu' | 'bot'>('menu')

  // A lobby or a live match always takes over the screen
  if (ll.game) {
    return ll.game.winner ? <LLResult ctx={ctx} ll={ll} g={ll.game} /> : <LLPlay ctx={ctx} ll={ll} g={ll.game} />
  }
  if (ll.room) return <LLLobby ctx={ctx} ll={ll} room={ll.room} />

  if (view === 'bot') {
    return (
      <Arcade
        game="chain"
        ctx={ctx}
        icon="🔤"
        title="Last Letter"
        eyebrow="Duel the bot"
        blurb="Chain words with the lounge bot."
        facts={[]}
        announceName="Last Letter"
        autoStart
        onBack={() => setView('menu')}
        renderPlay={(finish) => <LastLetterBotRound ctx={ctx} finish={finish} />}
      />
    )
  }
  return <LLMenu ctx={ctx} ll={ll} onBot={() => setView('bot')} />
}

type TabId = 'trivia' | 'output' | 'bug' | 'word' | 'chain' | 'hilo' | 'typing' | 'emoji' | 'wyr' | 'duels'

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'trivia', icon: '🧠', label: 'Trivia' },
  { id: 'output', icon: '🔮', label: 'Output' },
  { id: 'bug', icon: '🐛', label: 'Bug Hunt' },
  { id: 'word', icon: '🟩', label: 'Dev Word' },
  { id: 'chain', icon: '🔤', label: 'Last Letter' },
  { id: 'hilo', icon: '📈', label: 'Hi-Lo' },
  { id: 'typing', icon: '⌨️', label: 'Typing' },
  { id: 'emoji', icon: '🎭', label: 'Emoji' },
  { id: 'wyr', icon: '🗳️', label: 'Rather' },
  { id: 'duels', icon: '⚔️', label: 'Duels' },
]

const INVITE_TTL = 30000

export interface LoungeGamesProps {
  deviceId: string
  userName: string
  avatarSalt: string
  refreshKey: number
  members: GameMember[]
  bus: DuelBus
  triviaBank: TriviaItemLike[]
  trivia: ReactNode // the existing Dev Trivia game
  onShare: (text: string) => void
  onAnnounce: (game: string, score: number) => void
  open?: boolean // the lounge is open; closing it leaves any Last Letter lobby or match
}

export default function LoungeGames(props: LoungeGamesProps) {
  const { deviceId, userName, avatarSalt, refreshKey, members, bus, triviaBank, trivia, onShare, onAnnounce, open = true } = props

  const [tab, setTabState] = useState<TabId>(() => {
    const saved = readLS('lounge_games_tab')
    return TABS.some((t) => t.id === saved) ? (saved as TabId) : 'trivia'
  })
  const setTab = (id: TabId) => {
    setTabState(id)
    writeLS('lounge_games_tab', id)
  }

  const [match, setMatch] = useState<Match | null>(null)
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null)
  const [invite, setInvite] = useState<Invite | null>(null)
  const [notice, setNotice] = useState('')
  const matchRef = useRef(match)
  matchRef.current = match
  const outgoingRef = useRef(outgoing)
  outgoingRef.current = outgoing

  // Challenge inbox: runs for as long as the lounge is open, whichever tab you are on
  useEffect(
    () =>
      bus.subscribe((p) => {
        if (!p || p.to !== deviceId) return
        if (p.t === 'invite') {
          const game: DuelGame = p.game === 'quiz' ? 'quiz' : 'ttt'
          if (matchRef.current) {
            bus.send({ t: 'decline', to: p.from, matchId: p.matchId, busy: true })
            return
          }
          setInvite({ matchId: String(p.matchId), game, seed: Number(p.seed) || 1, from: String(p.from), fromName: String(p.fromName || 'Someone') })
        } else if (p.t === 'accept') {
          const o = outgoingRef.current
          if (o && o.matchId === p.matchId) {
            setOutgoing(null)
            setNotice('')
            setMatch({ id: o.matchId, game: o.game, seed: o.seed, host: true, opp: { id: o.to, name: o.name } })
            setTab('duels')
          }
        } else if (p.t === 'decline') {
          const o = outgoingRef.current
          if (o && o.matchId === p.matchId) {
            setOutgoing(null)
            setNotice(p.busy ? `${o.name} is in another match right now.` : `${o.name} declined.`)
          }
        } else if (p.t === 'cancel') {
          setInvite((cur) => (cur && cur.matchId === p.matchId ? null : cur))
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bus, deviceId],
  )

  // Invitations and pending challenges expire on their own
  useEffect(() => {
    if (!invite) return
    const t = setTimeout(() => setInvite(null), INVITE_TTL)
    return () => clearTimeout(t)
  }, [invite])
  useEffect(() => {
    if (!outgoing) return
    const t = setTimeout(() => {
      setOutgoing(null)
      setNotice(`${outgoing.name} didn't answer. They may not have the lounge open.`)
    }, INVITE_TTL)
    return () => clearTimeout(t)
  }, [outgoing])

  const duel: DuelState = {
    match,
    outgoing,
    notice,
    challenge: (member, game) => {
      if (!userName || matchRef.current) return
      const o: Outgoing = {
        matchId: `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
        game,
        seed: Math.floor(Math.random() * 2147483646) + 1,
        to: member.deviceId,
        name: member.name,
      }
      setNotice('')
      setOutgoing(o)
      bus.send({ t: 'invite', to: o.to, matchId: o.matchId, game: o.game, seed: o.seed })
    },
    cancel: () => {
      if (outgoing) bus.send({ t: 'cancel', to: outgoing.to, matchId: outgoing.matchId })
      setOutgoing(null)
    },
    leave: () => {
      const m = matchRef.current
      if (m) bus.send({ t: 'leave', to: m.opp.id, matchId: m.id })
      setMatch(null)
    },
  }

  const acceptInvite = () => {
    if (!invite) return
    bus.send({ t: 'accept', to: invite.from, matchId: invite.matchId })
    setMatch({ id: invite.matchId, game: invite.game, seed: invite.seed, host: false, opp: { id: invite.from, name: invite.fromName } })
    setInvite(null)
    setNotice('')
    setTab('duels')
  }
  const declineInvite = () => {
    if (!invite) return
    bus.send({ t: 'decline', to: invite.from, matchId: invite.matchId })
    setInvite(null)
  }

  const ctx: GameCtx = { deviceId, userName, avatarSalt, refreshKey, onShare, onAnnounce }

  // Last Letter lobbies live here so they survive switching tabs
  const ll = useLastLetter(ctx, bus, open, () => setTab('chain'))

  return (
    <>
      <div className="lounge-gtabs" role="tablist" aria-label="Pick a game">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`lounge-gtab${tab === t.id ? ' is-active' : ''}${(t.id === 'duels' && (match || invite) && tab !== 'duels') || (t.id === 'chain' && ll.room && tab !== 'chain') ? ' has-dot' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {invite && (
        <div className="lounge-invite" role="alert">
          <span>
            ⚔️ <b>{invite.fromName}</b> challenges you to {DUEL_LABEL[invite.game]}
          </span>
          <div>
            <button type="button" className="is-accept" onClick={acceptInvite}>
              Accept
            </button>
            <button type="button" onClick={declineInvite}>
              Decline
            </button>
          </div>
        </div>
      )}

      {tab === 'trivia' && trivia}
      {tab === 'output' && <OutputGame ctx={ctx} />}
      {tab === 'bug' && <BugGame ctx={ctx} />}
      {tab === 'word' && <WordGame ctx={ctx} />}
      {tab === 'chain' && <LastLetterGame ctx={ctx} ll={ll} />}
      {tab === 'hilo' && <HiLoGame ctx={ctx} />}
      {tab === 'typing' && <TypingGame ctx={ctx} />}
      {tab === 'emoji' && <EmojiGame ctx={ctx} />}
      {tab === 'wyr' && <WouldYouRather ctx={ctx} />}
      {tab === 'duels' && <Duels ctx={ctx} bus={bus} members={members} bank={triviaBank} duel={duel} />}
    </>
  )
}
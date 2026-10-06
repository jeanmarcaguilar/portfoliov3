import { useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsPhone } from '@/hooks/useMediaQuery'
import botUrl from '@/assets/chatbot-bot.svg'

// The speech bubble that pops out next to the robot.
const BUBBLE_TEXT = 'How can I help?'
const BUBBLE_DELAY_MS = 1400 // wait after page load
const BUBBLE_TYPING_MS = 1000 // "typing..." dots before the text
const BUBBLE_VISIBLE_MS = 10000 // then it tucks itself away

// Routes rendered inside the App shell. Only these show the phone TabBar, so
// only on these does the launcher lift itself above it.
const SHELL_ROUTES = [
  '/',
  '/projects',
  '/services',
  '/showcase',
  '/testimonials',
  '/about',
  '/seminars',
  '/tech-stack',
  '/contact',
]

type BubbleState = 'hidden' | 'typing' | 'text'

/**
 * Floating chat launcher, mounted once in main.tsx outside <Routes> so it
 * appears on every page (shell pages and standalone pages alike).
 * For now the panel only says "In Development"; wire the real chat into
 * the marked spot below when the backend is ready.
 */
export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [bubble, setBubble] = useState<BubbleState>('hidden')
  const { pathname } = useLocation()
  const phone = useIsPhone()
  const panelId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const lifted = phone && SHELL_ROUTES.includes(pathname)

  // Timers read the live `open` through a ref so a late timer never pops the
  // bubble over an open chat.
  const openRef = useRef(open)
  openRef.current = open

  // Bubble sequence: dots -> text -> tuck away. Once per page load.
  useEffect(() => {
    const ids = [
      window.setTimeout(() => setBubble(openRef.current ? 'hidden' : 'typing'), BUBBLE_DELAY_MS),
      window.setTimeout(
        () => setBubble(openRef.current ? 'hidden' : 'text'),
        BUBBLE_DELAY_MS + BUBBLE_TYPING_MS,
      ),
      window.setTimeout(() => setBubble('hidden'), BUBBLE_DELAY_MS + BUBBLE_VISIBLE_MS),
    ]
    return () => ids.forEach(window.clearTimeout)
  }, [])

  // Opening the chat dismisses the bubble.
  useEffect(() => {
    if (open) setBubble('hidden')
  }, [open])

  // Keep the closed panel out of the tab order / a11y tree.
  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', !open)
  }, [open])

  // Escape closes and hands focus back to the launcher.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        launcherRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const bubbleVisible = bubble !== 'hidden'

  return (
    <div className="chatbot" data-open={open} data-lifted={lifted}>
      <section
        ref={panelRef}
        id={panelId}
        className="chatbot__panel"
        role="dialog"
        aria-label="Chat assistant"
        aria-hidden={!open}
      >
        <header className="chatbot__head">
          <span className="chatbot__avatar" aria-hidden="true">
            <img src={botUrl} alt="" draggable={false} />
          </span>
          <div className="chatbot__title">
            <strong>Assistant</strong>
            <span className="chatbot__status">In Development</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="chatbot__close"
            aria-label="Close chat"
            onClick={() => {
              setOpen(false)
              launcherRef.current?.focus()
            }}
          >
            <CloseIcon />
          </button>
        </header>

        {/* TODO: replace this body with the real message list. */}
        <div className="chatbot__body">
          <div className="chatbot__dev">
            <span className="chatbot__dev-dot" aria-hidden="true" />
            <p className="chatbot__dev-title">In Development</p>
            <p className="chatbot__dev-text">
              The chat assistant is not live yet. Check back soon.
            </p>
          </div>
        </div>

        {/* TODO: enable this composer once the chat works. */}
        <div className="chatbot__composer">
          <input type="text" placeholder="Chat is coming soon…" disabled aria-label="Message" />
          <button type="button" disabled aria-label="Send">
            <SendIcon />
          </button>
        </div>
      </section>

      {/* Speech bubble: typing dots, then the text. Click opens the chat. */}
      <button
        type="button"
        className="chatbot__bubble"
        data-state={bubble}
        tabIndex={bubbleVisible ? 0 : -1}
        aria-hidden={!bubbleVisible}
        onClick={() => setOpen(true)}
      >
        <span className="chatbot__bubble-text">{BUBBLE_TEXT}</span>
        <span className="chatbot__bubble-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      </button>

      <button
        ref={launcherRef}
        type="button"
        className="chatbot__launcher"
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chatbot__icon chatbot__icon--bot">
          <img src={botUrl} alt="" draggable={false} />
        </span>
        <span className="chatbot__icon chatbot__icon--close"><CloseIcon /></span>
      </button>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
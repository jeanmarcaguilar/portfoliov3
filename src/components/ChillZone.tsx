import { useMemo, useState, type ReactNode } from 'react'

/* ---------- Chill Zone ----------
   The calm side panel shown beside the chat when the games are closed. It is for people who want
   company without playing or chatting: who is here, what everyone is listening to, a little
   ambient motion, and an optional conversation starter. Everything is passive and optional. */

export interface ChillMember {
  deviceId: string
  name: string
  avatarSeed: string
  isMe: boolean
  /** the song this member is playing right now (null = not listening to anything) */
  track: { id: string; title: string } | null
}

const STARTERS = [
  'What are you building right now?',
  'What song is on repeat for you this week?',
  'Tabs or spaces? Defend your answer.',
  'What was the last thing you learned that surprised you?',
  'Which bug took you the longest to find?',
  'What is your favorite keyboard shortcut?',
  'What is your go-to coding snack?',
  'Dark mode or light mode, and why?',
  'What tool or library do you wish you had found sooner?',
  'What does your setup look like today?',
  'What is one small win you had recently?',
  'If you could master any language or framework overnight, which one?',
  'What is the best piece of dev advice you ever got?',
  'What do you listen to when you need to focus?',
  'What is something you want to learn next?',
  'What project are you proudest of?',
]

const MAX_VISIBLE = 8

function pickStarter(exclude?: string): string {
  const pool = STARTERS.filter((s) => s !== exclude)
  return pool[Math.floor(Math.random() * pool.length)]
}

interface ChillZoneProps {
  members: ChillMember[]
  renderAvatar: (seed: string, size: number) => ReactNode
  /** posts a message into the open chat */
  onShare: (text: string) => void | Promise<void>
  /** whether my own now-playing is shown to others */
  shareActivity: boolean
  onToggleActivity: () => void
  /** switch the side panel to the games */
  onOpenGames: () => void
  /** fold the whole side panel away (the chat takes the full width again) */
  onHide: () => void
  /** desktop: the music queue panel. When given, it replaces the conversation starter card. */
  musicSlot?: ReactNode
}

export default function ChillZone({ members, renderAvatar, onShare, shareActivity, onToggleActivity, onOpenGames, onHide, musicSlot }: ChillZoneProps) {
  const [starter, setStarter] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  // Group everyone who is listening by song, biggest group first
  const songs = useMemo(() => {
    const map = new Map<string, { id: string; title: string; listeners: ChillMember[] }>()
    members.forEach((m) => {
      if (!m.track) return
      const g = map.get(m.track.id) ?? { id: m.track.id, title: m.track.title, listeners: [] }
      g.listeners.push(m)
      map.set(m.track.id, g)
    })
    return Array.from(map.values()).sort((a, b) => b.listeners.length - a.listeners.length)
  }, [members])

  const top = songs[0]
  const others = songs.slice(1, 3)
  const listeningCount = members.filter((m) => m.track).length
  const visible = members.slice(0, MAX_VISIBLE)
  const hiddenCount = Math.max(0, members.length - visible.length)

  const spark = () => {
    setPosted(false)
    setStarter((prev) => pickStarter(prev ?? undefined))
  }
  const post = async () => {
    if (!starter) return
    await onShare(starter)
    setPosted(true)
  }

  return (
    <div className="lounge-chill" aria-label="Chill zone">
      {/* ambient background: CSS only, aria-hidden, paused for reduced motion */}
      <div className="lounge-chill__ambient" aria-hidden="true">
        <span className="lounge-chill__orb is-a" />
        <span className="lounge-chill__orb is-b" />
        <span className="lounge-chill__orb is-c" />
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="lounge-chill__mote" style={{ ['--i' as any]: i }} />
        ))}
      </div>

      <header className="lounge-chill__head">
        <div>
          <span className="lounge-chill__eyebrow">Chill zone</span>
          <h3 className="lounge-chill__title">Hang out, no pressure</h3>
        </div>
        <button type="button" className="lounge-chill__x" onClick={onHide} aria-label="Hide chill zone" title="Hide this panel">
          ×
        </button>
      </header>

      {/* Desktop: the music queue panel sits first, above who is here and what is playing */}
      {musicSlot}

      {/* Now playing */}
      <section className="lounge-chill__card" aria-label="Now playing">
        <div className="lounge-chill__row-head">
          <span className="lounge-chill__label">Now playing</span>
          {listeningCount > 0 && (
            <span className="lounge-chill__pill">
              {listeningCount} listening
            </span>
          )}
        </div>
        {top ? (
          <>
            <div className="lounge-chill__song">
              <span className="lounge-chill__eq" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <b className="lounge-chill__song-title" title={top.title}>
                {top.title}
              </b>
            </div>
            <div className="lounge-chill__listeners">
              <div className="lounge-chill__stack">
                {top.listeners.slice(0, 5).map((m) => (
                  <span key={m.deviceId} className="lounge-chill__stack-av" title={m.isMe ? 'You' : m.name}>
                    {renderAvatar(m.avatarSeed, 24)}
                  </span>
                ))}
              </div>
              <span className="lounge-chill__muted">
                {top.listeners.length === 1
                  ? `${top.listeners[0].isMe ? 'You are' : `${top.listeners[0].name} is`} listening`
                  : `${top.listeners.length} people listening together`}
              </span>
            </div>
            {others.length > 0 && (
              <ul className="lounge-chill__also">
                {others.map((s) => (
                  <li key={s.id} title={s.title}>
                    <span aria-hidden="true">♪</span> {s.title}
                    <em>{s.listeners.length}</em>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="lounge-chill__empty">
            It is quiet in here. Start something with <code>/play lofi</code> and it shows up for everyone.
          </p>
        )}
      </section>

      {/* Presence */}
      <section className="lounge-chill__card" aria-label="Who is here">
        <div className="lounge-chill__row-head">
          <span className="lounge-chill__label">Here now</span>
          <span className="lounge-chill__pill is-live">
            <span className="lounge-chill__dot" aria-hidden="true" />
            {members.length} online
          </span>
        </div>
        <ul className="lounge-chill__people">
          {visible.map((m) => (
            <li key={m.deviceId} className="lounge-chill__person">
              <span className="lounge-chill__av">
                {renderAvatar(m.avatarSeed, 30)}
                <span className="lounge-chill__dot is-badge" aria-hidden="true" />
              </span>
              <span className="lounge-chill__who">
                <b>{m.isMe ? `${m.name} (you)` : m.name}</b>
                <small title={m.track?.title}>{m.track ? `♪ ${m.track.title}` : 'Just hanging out'}</small>
              </span>
              {m.track && (
                <span className="lounge-chill__eq is-sm" aria-label="Listening">
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </li>
          ))}
        </ul>
        {hiddenCount > 0 && <p className="lounge-chill__more">+{hiddenCount} more here</p>}
      </section>

      {/* Optional conversation starter (only when there is no music panel) */}
      {!musicSlot && (
      <section className="lounge-chill__card" aria-label="Conversation starter">
        <div className="lounge-chill__row-head">
          <span className="lounge-chill__label">Conversation starter</span>
          {starter && (
            <button type="button" className="lounge-chill__link" onClick={() => setStarter(null)}>
              Dismiss
            </button>
          )}
        </div>
        {starter ? (
          <>
            <p className="lounge-chill__starter" key={starter}>
              “{starter}”
            </p>
            <div className="lounge-chill__actions">
              <button type="button" className="lounge-chill__btn" onClick={post} disabled={posted}>
                {posted ? 'Posted ✓' : 'Post to chat'}
              </button>
              <button type="button" className="lounge-chill__btn is-ghost" onClick={spark}>
                Shuffle
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lounge-chill__muted">Nothing to say yet? Grab a question, or just keep lurking.</p>
            <div className="lounge-chill__actions">
              <button type="button" className="lounge-chill__btn" onClick={spark}>
                Spark a chat
              </button>
            </div>
          </>
        )}
      </section>

      )}

      <footer className="lounge-chill__foot">
        <label className="lounge-chill__switch">
          <input type="checkbox" checked={shareActivity} onChange={onToggleActivity} />
          <span className="lounge-chill__track" aria-hidden="true" />
          <span>Show what I'm playing</span>
        </label>
        <button type="button" className="lounge-chill__link" onClick={onOpenGames}>
          🎮 Open games
        </button>
      </footer>
    </div>
  )
}
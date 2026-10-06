import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, CaretRight, Plus, PaperPlaneRight } from '@/components/slab'
import { useDismiss, type DismissReason } from '@/hooks/useDismiss'
import { supabase } from '@/lib/supabase'

export const LOUNGE_OPEN_EVENT = 'lounge:open'

export function openDevLounge(target?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(LOUNGE_OPEN_EVENT, { detail: target }))
}

interface Message {
  id: string
  author: string
  location: string
  createdAt: string
  time: string
  text: string
  avatarSeed: string
  isMe?: boolean
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
  const [avatarChoices, setAvatarChoices] = useState<string[]>([])

  // Live Data & Raw Timestamps
  const [rawMessages, setRawMessages] = useState<any[]>([])
  const [rawProfiles, setRawProfiles] = useState<any[]>([])

  const [messages, setMessages] = useState<Message[]>([])
  const [stories, setStories] = useState<StoryUser[]>([])
  const [inputText, setInputText] = useState('')

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
    const formattedMsgs: Message[] = rawMessages.map((m: any) => ({
      id: m.id,
      author: m.author,
      location: m.location,
      createdAt: m.created_at,
      time: formatTimeAgo(m.created_at),
      text: m.text,
      avatarSeed: m.avatar_seed,
      isMe: m.author === userName,
    }))
    setMessages(formattedMsgs)
  }, [rawMessages, userName])

  useEffect(() => {
    const formattedStories: StoryUser[] = rawProfiles.map((p: any) => {
      const isSelf = p.device_id === deviceId
      const timestamp = p.created_at || new Date().toISOString()
      if (isSelf) {
        setUserNoteUpdatedAt(timestamp)
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
    setStories(formattedStories)
  }, [rawProfiles, deviceId])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_messages' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lounge_profiles' }, () => {
        fetchData()
      })
      .subscribe()

    return () => {
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
    const { data: msgData } = await supabase
      .from('lounge_messages')
      .select('*')
      .order('created_at', { ascending: true })

    if (msgData) setRawMessages(msgData)

    const { data: profileData } = await supabase
      .from('lounge_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (profileData) setRawProfiles(profileData)
  }

  const handleRegisterUser = async (e: FormEvent) => {
    e.preventDefault()
    if (!registrationInput.trim()) return

    const name = registrationInput.trim()
    const randomSalt = Math.random().toString(36).substring(7)
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
      alert(`Registration failed: ${error.message}`)
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

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const scrollStories = () => {
    if (storiesRef.current) {
      storiesRef.current.scrollBy({ left: 140, behavior: 'smooth' })
    }
  }

  const openAvatarPicker = () => {
    const choices = Array.from({ length: 6 }, () => Math.random().toString(36).substring(7))
    setAvatarChoices(choices)
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
    setUserNoteUpdatedAt(nowIso)
    setIsNoteModalOpen(false)

    // Instantly update the Rail bubble without waiting for DB round-trip
    window.dispatchEvent(new CustomEvent('rail:note-updated', { detail: cleaned }))

    const { error } = await supabase
      .from('lounge_profiles')
      .update({ note: cleaned })
      .eq('device_id', deviceId)

    if (error) {
      console.error('Error saving note:', error.message)
      alert(`Could not save note: ${error.message}`)
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

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!inputText.trim()) return

    const textToSend = inputText.trim()
    setInputText('')

    const { error } = await supabase.from('lounge_messages').insert([
      {
        author: userName,
        location: 'Manila, PH',
        text: textToSend,
        avatar_seed: `${userName}-${avatarSalt}`,
      },
    ])

    if (error) console.error('Error sending message:', error.message)
    fetchData()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={`lounge-overlay${open ? ' is-open' : ''}`} ref={rootRef} aria-hidden={!open}>
      <div className="lounge-modal" role="dialog" aria-modal="true" aria-label="Dev Lounge" tabIndex={-1} ref={panelRef}>
        
        {needsRegistration && (
          <div className="lounge-reg-overlay" style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px'
          }}>
            <h3 style={{ color: '#fff', marginBottom: '6px', fontSize: '1.1rem' }}>Welcome to Dev Lounge ✨</h3>
            <p style={{ color: '#94A3B8', marginBottom: '16px', textAlign: 'center', fontSize: '0.85rem' }}>
              Please enter your name to join the community chat:
            </p>
            <form onSubmit={handleRegisterUser} style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '260px' }}>
              <input
                type="text"
                placeholder="Your name..."
                maxLength={20}
                value={registrationInput}
                onChange={(e) => setRegistrationInput(e.target.value)}
                autoFocus
                style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #475569', background: '#1E293B', color: '#fff', fontSize: '0.9rem' }}
              />
              <button type="submit" style={{ padding: '8px 14px', background: '#0D9488', color: '#fff', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                Join
              </button>
            </form>
          </div>
        )}

        {isChoosingAvatar && (
          <div className="lounge-reg-overlay" style={{
            position: 'absolute', inset: 0, background: 'rgba(6, 12, 26, 0.88)', zIndex: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px'
          }}>
            <h3 style={{ color: '#fff', marginBottom: '6px', fontSize: '1.1rem' }}>Choose your Avatar ✨</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
              {avatarChoices.map((salt) => (
                <div
                  key={salt}
                  onClick={() => selectNewAvatar(salt)}
                  style={{
                    cursor: 'pointer',
                    background: '#1E293B',
                    borderRadius: '50%',
                    padding: '6px',
                    border: avatarSalt === salt ? '2px solid var(--orange)' : '2px solid transparent',
                  }}
                >
                  <LoungeAvatar seed={`${userName}-${salt}`} size={52} />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsChoosingAvatar(false)}
              style={{ padding: '8px 14px', background: 'transparent', color: '#94A3B8', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {isNoteModalOpen && (
          <div className="lounge-note-modal-backdrop">
            <div className="lounge-note-modal" role="dialog" aria-label="Your note">
              <div className="lounge-note-modal__header">
                <h3>Your note</h3>
                <button type="button" className="lounge-close" onClick={() => setIsNoteModalOpen(false)}>
                  <X size={14} weight="bold" />
                </button>
              </div>

              <p className="lounge-note-modal__sub">share a thought or status (disappears after 24 hours)</p>

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

                <div className="lounge-note-modal__avatar-wrap">
                  <LoungeAvatar seed={`${userName}-${avatarSalt}`} size={46} />
                </div>

                <div className="lounge-note-modal__name">{userName}</div>
                <div className="lounge-note-modal__time-label">{formatTimeAgo(userNoteUpdatedAt)}</div>
                <div className="lounge-note-modal__count">{noteModalInput.length}/20</div>
              </div>

              <div className="lounge-note-modal__footer">
                <button type="button" className="lounge-btn-remove" onClick={handleRemoveNote}>remove</button>
                <div className="lounge-note-modal__footer-right">
                  <button type="button" className="lounge-btn-cancel" onClick={() => setIsNoteModalOpen(false)}>cancel</button>
                  <button type="button" className="lounge-btn-post" onClick={handleSaveNote}>post</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <header className="lounge-header">
          <div className="lounge-header__left">
            <h2 className="lounge-header__title">Dev Lounge</h2>
            <span className="lounge-live-badge">
              <span className="lounge-live-dot" />
              Live
            </span>
          </div>
          <button type="button" className="lounge-close" onClick={() => handleClose('button')}>
            <X size={14} weight="bold" />
          </button>
        </header>

        <div className="lounge-stories" ref={storiesRef}>
          {stories.map((s) => (
            <div key={s.id} className="lounge-story-item">
              {s.isMe ? (
                <button
                  type="button"
                  className="lounge-note-bubble"
                  onClick={() => {
                    setNoteModalInput(userNote)
                    setIsNoteModalOpen(true)
                  }}
                >
                  <span>{userNote || 'Add note'}</span>
                </button>
              ) : (
                <div className="lounge-note-bubble">
                  <span>{s.note}</span>
                </div>
              )}

              <div
                className="lounge-avatar-wrap"
                onClick={s.isMe ? () => {
                  setNoteModalInput(userNote)
                  setIsNoteModalOpen(true)
                } : undefined}
                style={{ cursor: s.isMe ? 'pointer' : 'default' }}
              >
                <LoungeAvatar seed={s.avatarSeed} size={36} />
                {s.isMe && (
                  <span className="lounge-avatar-badge">
                    <Plus size={10} weight="bold" />
                  </span>
                )}
              </div>
              <span className="lounge-story-name">{s.isMe ? 'You' : s.name}</span>
              <span className="lounge-story-time">{s.isMe ? formatTimeAgo(userNoteUpdatedAt) : s.time}</span>
            </div>
          ))}

          <button type="button" className="lounge-stories-scroll" onClick={scrollStories}>
            <CaretRight size={14} weight="bold" />
          </button>
        </div>

        <div className="lounge-feed">
          {messages.map((m) => (
            <div key={m.id} className={`lounge-msg${m.isMe ? ' lounge-msg--me' : ''}`}>
              <div className="lounge-msg__avatar">
                <LoungeAvatar seed={m.avatarSeed} size={30} />
              </div>
              <div className="lounge-msg__content">
                <div className="lounge-msg__meta">
                  <span className="lounge-msg__author">{m.author}</span>
                  <span className="lounge-msg__time">{m.time}</span>
                </div>
                <div className="lounge-msg__bubble">{m.text}</div>
              </div>
            </div>
          ))}
          <div ref={feedEndRef} />
        </div>

        <div className="lounge-bottom">
          <div className="lounge-bottom__meta">
            <span className="lounge-name-btn">
              as <b>{userName || 'Loading...'}</b>
            </span>
            <button type="button" className="lounge-avatar-change-btn" onClick={openAvatarPicker}>
              change avatar
            </button>
          </div>

          <form className="lounge-form" onSubmit={handleSendMessage}>
            <input
              ref={inputRef}
              type="text"
              className="lounge-input"
              placeholder="Say something nice..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" className={`lounge-send-btn${inputText.trim() ? ' is-active' : ''}`}>
              <PaperPlaneRight size={14} weight="bold" />
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  )
}
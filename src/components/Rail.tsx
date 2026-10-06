import { useEffect, useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { SealCheck } from '@/components/slab'
import ThemeGlyph from './ThemeGlyph'
import {
  HomeIcon,
  FolderIcon,
  StackIcon,
  UserIcon,
  MessageIcon,
} from './RailIcons'
import { getTheme, toggleTheme, type Theme } from '@/lib/theme'
import { profile } from '@/data/profile'
import { incrementVisits, formatVisits } from '@/lib/visits'
import WeatherRailButton from './WeatherRailButton'
import { supabase } from '@/lib/supabase'

export const RAIL_LINKS = [
  { label: 'Home', to: '/', Icon: HomeIcon },
  { label: 'About', to: '/about', Icon: UserIcon },
  { label: 'Project', to: '/projects', Icon: FolderIcon },
  { label: 'Gear', to: '/services', Icon: StackIcon },
  { label: 'Contact', to: '/contact', Icon: MessageIcon },
] as const

export default function Rail() {
  const [theme, setThemeState] = useState<Theme>('light')
  const [visits, setVisits] = useState<number>(0)
  const hasIncrementedVisits = useRef(false)

  // Live note from DB — reflects whatever is saved in DevLoungeModal
  const [currentNote, setCurrentNote] = useState<string>('')

  useEffect(() => setThemeState(getTheme()), [])

  useEffect(() => {
    if (!hasIncrementedVisits.current) {
      hasIncrementedVisits.current = true
      setVisits(incrementVisits())
    }
  }, [])

  // Fetch note from DB and subscribe to real-time changes
  useEffect(() => {
    const devId = localStorage.getItem('lounge_device_id')
    if (!devId) return

    // Initial fetch
    const fetchNote = async () => {
      const { data } = await supabase
        .from('lounge_profiles')
        .select('note')
        .eq('device_id', devId)
        .maybeSingle()
      if (data) setCurrentNote(data.note || '')
    }
    fetchNote()

    // Real-time subscription — fallback sync via Supabase
    const channel = supabase
      .channel('rail-note-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lounge_profiles' },
        async () => { fetchNote() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Instant update — fired directly by DevLoungeModal on post/remove (no refresh needed)
  useEffect(() => {
    const handleNoteUpdate = (e: Event) => {
      setCurrentNote((e as CustomEvent<string>).detail)
    }
    window.addEventListener('rail:note-updated', handleNoteUpdate)
    return () => window.removeEventListener('rail:note-updated', handleNoteUpdate)
  }, [])

  return (
    <aside className="rail" aria-label="Profile and site navigation">
      <div className="rail__inner">
        {/* Avatar container wrapper with the note bubble */}
        <div className="rail__avatar-wrapper">
          <span className="rail__avatar">
            <img
              src={profile.avatarSrc}
              alt={profile.name}
              width={120}
              height={120}
            />
          </span>

          {currentNote && (
            <div className="rail__note-bubble" role="status">
              <span className="rail__note-author">{profile.name}</span>
              <p className="rail__note-text">{currentNote}</p>
            </div>
          )}
        </div>

        <h2 className="rail__name">
          {profile.name}
          <SealCheck size={19} weight="fill" aria-label={profile.verifiedLabel} />
        </h2>
        <p className="rail__handle">
          {profile.handle}
          <span className="rail__visits">{formatVisits(visits)}</span>
        </p>

        <div className="rail__actions">
          <ul className="rail__socials" role="list" aria-label="Social profiles">
            {profile.socials.map(({ label, href, iconPath }) => (
              <li key={label}>
                <a
                  className="rail__social"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                >
                  <span
                    className="rail__social-icon"
                    style={{ ['--icon-url' as string]: `url('${iconPath}')` }}
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="rail__theme"
            onClick={(e) => setThemeState(toggleTheme(e.currentTarget))}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            <ThemeGlyph theme={theme} size={21} />
          </button>

          <WeatherRailButton />
        </div>

        <nav className="rail__nav" aria-label="Sections">
          <ul>
            {RAIL_LINKS.map(({ label, to, Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'} className="rail__link">
                  <Icon size={21} />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <p className="rail__copy">
          &copy; {new Date().getFullYear()}
          <br />
          {profile.name}. All rights reserved.
        </p>
      </div>
    </aside>
  )
}
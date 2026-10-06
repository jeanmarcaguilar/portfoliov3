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

export const RAIL_LINKS = [
  { label: 'Home', to: '/', Icon: HomeIcon },
  { label: 'About', to: '/about', Icon: UserIcon },
  { label: 'Project', to: '/projects', Icon: FolderIcon },
  { label: 'Gear', to: '/services', Icon: StackIcon },
  { label: 'Contact', to: '/contact', Icon: MessageIcon },
] as const

// 10 rotating thought items
const ROTATING_NOTES = [
  "Building cool stuff",
  " Debugging with focus",
  "Learning something new",
  "Designing clean UI/UX",
  "Shipping features",
  "Always coding",
  "Always Second Option...",
  "Backburner",
  "Take a change with me...",
  "Yearning",
]

export default function Rail() {
  const [theme, setThemeState] = useState<Theme>('light')
  const [visits, setVisits] = useState<number>(0)
  const hasIncrementedVisits = useRef(false)

  // Rotating note state
  const [currentNoteIndex, setCurrentNoteIndex] = useState(0)

  useEffect(() => setThemeState(getTheme()), [])

  useEffect(() => {
    if (!hasIncrementedVisits.current) {
      hasIncrementedVisits.current = true
      setVisits(incrementVisits())
    }
  }, [])

  // Rotate through the 10 notes every 4 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentNoteIndex((prevIndex) => (prevIndex + 1) % ROTATING_NOTES.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  const currentNote = ROTATING_NOTES[currentNoteIndex]

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
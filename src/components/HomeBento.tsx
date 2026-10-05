import type React from 'react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  FolderOpen,
  User,
  Robot,
  Medal,
  Stack,
  GithubLogo,
  MagnifyingGlass,
  PaintBrush,
  Code,
  PlugsConnected,
  Sparkle,
  RocketLaunch,
  type Icon,
} from '@/components/slab'
import { websiteFunnel, type Funnel } from '@/data/funnels'


import type { ContributionStats } from '@/lib/github'

import aboutCard1 from '../assets/images/about_card_1.jpg'
import aboutCard2 from '../assets/images/about_card_2.jpg'
import aboutCard3 from '../assets/images/about_card_3.jpg'
import forSeminar1 from '../assets/images/For Seminar 1.png'
import forSeminar2 from '../assets/images/For Seminar-2.png'
import cert1 from '../assets/images/Cert1.png'
import cert2 from '../assets/images/Cert2.png'

/**
 * Home's showcase: one card per rail view, each an index of what that view
 * holds, each built from content the portfolio already ships. Every card is
 * a link. Nothing here invents a fact - the funnels, the tools, the clients
 * and the credentials are the same records the views render in full.
 *
 * Motion is transform-only on a clipped inner track, so a card never adds
 * height and Home stays a single viewport.
 */

const thumbSrc = (f: Funnel) =>
  `/${f.dir ?? 'funnels'}/thumbs/${f.file.replace('.html', '.png')}`

const PROJECT_SHOTS = websiteFunnel.slice(0, 3)
const SEMINAR_SHOTS = [forSeminar1, forSeminar2, cert1, cert2]

const OFFERS = [
  {
    num: '01',
    title: 'Web Development',
    note: 'Modern, high-performance web applications.',
    iconPath:
      'M128,26A102,102,0,1,0,230,128,102.12,102.12,0,0,0,128,26Zm81.57,64H169.19a132.58,132.58,0,0,0-25.73-50.67A90.29,90.29,0,0,1,209.57,90ZM218,128a89.7,89.7,0,0,1-3.83,26H171.81a155.43,155.43,0,0,0,0-52h42.36A89.7,89.7,0,0,1,218,128Zm-90,87.83a110,110,0,0,1-15.19-19.45A124.24,124.24,0,0,1,99.35,166h57.3a124.24,124.24,0,0,1-13.46,30.38A110,110,0,0,1,128,215.83ZM96.45,154a139.18,139.18,0,0,1,0-52h63.1a139.18,139.18,0,0,1,0,52ZM38,128a89.7,89.7,0,0,1,3.83-26H84.19a155.43,155.43,0,0,0,0,52H41.83A89.7,89.7,0,0,1,38,128Zm90-87.83a110,110,0,0,1,15.19,19.45A124.24,124.24,0,0,1,156.65,90H99.35a124.24,124.24,0,0,1,13.46-30.38A110,110,0,0,1,128,40.17Zm-15.46-.84A132.58,132.58,0,0,0,86.81,90H46.43A90.29,90.29,0,0,1,112.54,39.33ZM46.43,166H86.81a132.58,132.58,0,0,0,25.73,50.67A90.29,90.29,0,0,1,46.43,166Zm97,50.67A132.58,132.58,0,0,0,169.19,166h40.38A90.29,90.29,0,0,1,143.46,216.67Z',
  },
  {
    num: '02',
    title: 'Full-Stack Development',
    note: 'End-to-end frontend and backend systems.',
    iconPath:
      'M67.84,92.61,25.37,128l42.47,35.39a6,6,0,1,1-7.68,9.22l-48-40a6,6,0,0,1,0-9.22l48-40a6,6,0,0,1,7.68,9.22Zm176,30.78-48-40a6,6,0,1,0-7.68,9.22L230.63,128l-42.47,35.39a6,6,0,1,0,7.68,9.22l48-40a6,6,0,0,0,0-9.22Zm-81.79-89A6,6,0,0,0,154.36,38l-64,176A6,6,0,0,0,94,221.64a6.15,6.15,0,0,0,2,.36,6,6,0,0,0,5.64-3.95l64-176A6,6,0,0,0,162.05,34.36Z',
  },
  {
    num: '03',
    title: 'Responsive Design',
    note: 'Fluid layouts for mobile, tablet, and desktop.',
    iconPath:
      'M224,74H206V64a22,22,0,0,0-22-22H40A22,22,0,0,0,18,64v96a22,22,0,0,0,22,22H154v10a22,22,0,0,0,22,22h48a22,22,0,0,0,22-22V96A22,22,0,0,0,224,74ZM40,170a10,10,0,0,1-10-10V64A10,10,0,0,1,40,54H184a10,10,0,0,1,10,10V74H176a22,22,0,0,0-22,22v74Zm194,22a10,10,0,0,1-10,10H176a10,10,0,0,1-10-10V96a10,10,0,0,1,10-10h48a10,10,0,0,1,10,10ZM134,208a6,6,0,0,1-6,6H88a6,6,0,0,1,0-12h40A6,6,0,0,1,134,208Zm80-96a6,6,0,0,1-6,6H192a6,6,0,0,1,0-12h16A6,6,0,0,1,214,112Z',
  },
  {
    num: '04',
    title: 'UI/UX Development',
    note: 'Intuitive user experiences and design systems.',
    iconPath:
      'M188.45,96A38,38,0,0,0,168,26H96A38,38,0,0,0,75.55,96,38,38,0,0,0,77,160.89,42,42,0,1,0,142,196V155.68A38,38,0,1,0,188.45,96ZM194,64a26,26,0,0,1-26,26H142V38h26A26,26,0,0,1,194,64ZM70,64A26,26,0,0,1,96,38h34V90H96A26,26,0,0,1,70,64Zm26,90a26,26,0,0,1,0-52h34v52H96Zm34,42a30,30,0,1,1-30-30h30Zm38-42a26,26,0,1,1,26-26A26,26,0,0,1,168,154Z',
  },
  {
    num: '05',
    title: 'API & Database Integration',
    note: 'RESTful API connections and scalable databases.',
    iconPath:
      'M128,26C75.29,26,34,49.72,34,80v96c0,30.28,41.29,54,94,54s94-23.72,94-54V80C222,49.72,180.71,26,128,26Zm0,12c44.45,0,82,19.23,82,42s-37.55,42-82,42S46,102.77,46,80,83.55,38,128,38Zm82,138c0,22.77-37.55,42-82,42s-82-19.23-82-42V154.79C62,171.16,92.37,182,128,182s66-10.84,82-27.21Zm0-48c0,22.77-37.55,42-82,42s-82-19.23-82-42V106.79C62,123.16,92.37,134,128,134s66-10.84,82-27.21Z',
  },
] as const

/* ---------- GitHub-style contribution graph ---------- */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['Mon', 'Wed', 'Fri']
const WEEKS = 52
const DAYS_PER_WEEK = 7

/**
 * Compute which week index each calendar month starts at, based on the
 * actual Sunday that opens the 52-week grid. This mirrors what GitHub does.
 */
function computeMonthLabels(weeks: number): { label: string; weekIndex: number }[] {
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - weeks * 7)
  // Snap back to the nearest Sunday
  start.setDate(start.getDate() - start.getDay())

  const labels: { label: string; weekIndex: number }[] = []
  let lastMonth = -1

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(start)
    weekStart.setDate(start.getDate() + w * 7)
    const month = weekStart.getMonth()
    if (month !== lastMonth) {
      labels.push({ label: MONTH_NAMES[month], weekIndex: w })
      lastMonth = month
    }
  }
  return labels
}

function ContributionLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  if (count <= 9) return 3
  return 4
}

const LEVEL_COLORS = [
  'var(--contrib-0)',
  'var(--contrib-1)',
  'var(--contrib-2)',
  'var(--contrib-3)',
  'var(--contrib-4)',
]

/** Contribution card — uses real scraped data baked into the bundle. */
function ContributionCard() {
  const [contribData, setContribData] = useState<ContributionStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadContributions() {
      // Always use the real hardcoded data — it was scraped directly from
      // GitHub and is more reliable than the CORS-proxy live fetch.
      const { generateFallbackContributions } = await import('@/lib/github')
      setContribData(generateFallbackContributions())
      setLoading(false)
    }
    loadContributions()
  }, [])


  if (loading || !contribData) {
    return (
      <Link to="/about" className="bento__card bento__card--contrib">
        <CardHead Icon={GithubLogo} title="Contributions" desc="Activity on GitHub this year." />
        <div className="bento__media bento__contrib" aria-hidden="true">
          <span className="bento__contrib-badge">Loading...</span>
        </div>
      </Link>
    )
  }

  const { grid, totalCommits, streak, bestDay } = contribData

  return (
    <Link to="/about" className="bento__card bento__card--contrib">
      <CardHead Icon={GithubLogo} title="Contributions" desc="Activity on GitHub this year." />
      <div className="bento__media bento__contrib" aria-hidden="true">
        <span className="bento__contrib-badge">
          {totalCommits.toLocaleString()} commits
        </span>
        <div className="bento__contrib-graph">
          <svg
            className="bento__contrib-svg"
            viewBox={`0 0 ${WEEKS * 14 + 30} ${DAYS_PER_WEEK * 14 + 24}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Month labels — dynamically positioned from real grid start date */}
            {computeMonthLabels(WEEKS).map(({ label, weekIndex }) => (
              <text
                key={`${label}-${weekIndex}`}
                x={30 + weekIndex * 14}
                y={10}
                className="bento__contrib-month"
              >
                {label}
              </text>
            ))}
            {/* Day-of-week labels along the left (Mon / Wed / Fri) */}
            {DAY_LABELS.map((d, i) => (
              <text
                key={d}
                x={26}
                y={24 + (i * 2 + 1) * 14 + 8}
                className="bento__contrib-day"
                textAnchor="end"
              >
                {d}
              </text>
            ))}
            {/* Grid cells — each week is a column, each day is a row */}
            {grid.map((week, w) =>
              week.map((count, d) => (
                <rect
                  key={`${w}-${d}`}
                  x={30 + w * 14}
                  y={18 + d * 14}
                  width={11}
                  height={11}
                  rx={2}
                  fill={LEVEL_COLORS[ContributionLevel(count)]}
                  className="bento__contrib-cell"
                />
              )),
            )}
          </svg>
        </div>
        <div className="bento__contrib-footer">
          <span className="bento__contrib-stat">
            Streak: <b>{streak}d</b>
          </span>
          <span className="bento__contrib-stat">
            Best day: <b>{bestDay}</b>
          </span>
          <span className="bento__contrib-legend">
            <span className="bento__contrib-legend-label">Less</span>
            {[0, 1, 2, 3, 4].map(l => (
              <span
                key={l}
                className="bento__contrib-legend-swatch"
                style={{ background: LEVEL_COLORS[l] }}
              />
            ))}
            <span className="bento__contrib-legend-label">More</span>
          </span>
        </div>
      </div>
    </Link>
  )
}

// Three photos of you, fanned. Small copies are fine - the fan shows them under 100px.
const PHOTOS = [aboutCard1, aboutCard2, aboutCard3]

/** Development workflow steps shown in the approach card. */
const WORKFLOW_STEPS: { step: string; title: string; desc: string; Icon: Icon }[] = [
  { step: '01', title: 'Understand', desc: 'Identify the problem and requirements.', Icon: MagnifyingGlass },
  { step: '02', title: 'Design', desc: 'Plan a clean and intuitive user experience.', Icon: PaintBrush },
  { step: '03', title: 'Develop', desc: 'Build reliable frontend and backend systems.', Icon: Code },
  { step: '04', title: 'Integrate', desc: 'Connect APIs, databases, and services.', Icon: PlugsConnected },
  { step: '05', title: 'Refine', desc: 'Test, optimize, and improve the solution.', Icon: Sparkle },
  { step: '06', title: 'Deliver', desc: 'Deploy a polished, production-ready result.', Icon: RocketLaunch },
]

function CardHead({
  Icon,
  title,
  desc,
}: {
  Icon: typeof FolderOpen
  title: string
  desc: string
}) {
  return (
    <header className="bento__head">
      <span className="bento__label">
        <span className="bento__icon">
          <Icon size={20} weight="fill" aria-hidden="true" />
        </span>
        <h3 className="bento__title">{title}</h3>
      </span>
      <p className="bento__desc">{desc}</p>
      <ArrowUpRight size={15} weight="bold" aria-hidden="true" className="bento__arrow" />
    </header>
  )
}

export default function HomeBento() {

  return (
    <nav className="bento" aria-label="Explore the portfolio">
      {/* Projects: the funnel thumbnails drift upward on a looped track. */}
      <Link to="/projects" className="bento__card bento__card--projects">
        <CardHead Icon={FolderOpen} title="Projects" desc="A collection of selected projects showcasing my creativity, skills, and passion for building meaningful digital experiences." />
        <div className="bento__media bento__reel" aria-hidden="true">
          <div className="bento__reel-track">
            {[...PROJECT_SHOTS, ...PROJECT_SHOTS].map((f, i) => (
              <span key={i} className="bento__shot">
                <img src={thumbSrc(f)} alt="" loading="lazy" decoding="async" />
              </span>
            ))}
          </div>
        </div>
      </Link>

      {/* About: a fanned stack of photos. */}
      <Link to="/about" className="bento__card bento__card--about">
        <CardHead Icon={User} title="About" desc="Who I am and how I work." />
        <div className="bento__media bento__fan" aria-hidden="true">
          {PHOTOS.map((src, i) => (
            <span key={src} className="bento__photo" style={{ ['--i' as string]: i }}>
              <img src={src} alt="" loading="lazy" decoding="async" />
            </span>
          ))}
        </div>
      </Link>

      {/* Development workflow: six steps displayed as a compact list. */}
      <Link to="/projects" className="bento__card bento__card--ai">
        <CardHead Icon={Robot} title="Development Approach" desc="How every project moves from idea to launch." />
        <ul className="bento__media bento__steps" role="list" aria-hidden="true">
          {WORKFLOW_STEPS.map(({ step, title, desc, Icon }, i) => (
            <li key={step} className="bento__step" style={{ '--i': i } as React.CSSProperties}>
              <span className="bento__step-num">{step}</span>
              <span className="bento__step-icon">
                <Icon size={15} weight="duotone" aria-hidden="true" />
              </span>
              <span className="bento__step-text">
                <span className="bento__step-title">{title}</span>
                <span className="bento__step-desc">{desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </Link>

      {/* Seminars: certificates and seminar photos drift upward on a looped track. */}
      <Link to="/about" className="bento__card bento__card--creds">
        <CardHead Icon={Medal} title="Seminars" desc="Certificates, workshops, and speaking engagements." />
        <div className="bento__media bento__reel" aria-hidden="true">
          <div className="bento__reel-track">
            {[...SEMINAR_SHOTS, ...SEMINAR_SHOTS].map((src, i) => (
              <span key={i} className="bento__shot">
                <img src={src} alt="Seminar or Certificate" loading="lazy" decoding="async" />
              </span>
            ))}
          </div>
        </div>
      </Link>

      {/* Services: the five offers as a compact index. */}
      <Link to="/services" className="bento__card bento__card--services">
        <CardHead Icon={Stack} title="Services" desc="Modern, high-performance web solutions." />
        <ul className="bento__media bento__offers" role="list">
          {OFFERS.map(({ num, title, note, iconPath }, i) => (
            <li key={title} className="bento__offer" style={{ '--i': i } as React.CSSProperties}>
              <span className="bento__offer-tile">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                  <path d={iconPath} />
                </svg>
              </span>
              <span className="bento__offer-text">
                <span className="bento__offer-title">{title}</span>
                <span className="bento__offer-note">{note}</span>
              </span>
              <span className="bento__offer-num" aria-hidden="true">
                {num}
              </span>
            </li>
          ))}
        </ul>
      </Link>

      {/* Contributions: GitHub-style contribution graph with real data. */}
      <ContributionCard />
    </nav>
  )
}

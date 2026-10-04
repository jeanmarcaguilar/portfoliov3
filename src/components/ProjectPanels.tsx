import { useEffect, useState, type ReactNode } from 'react'
import { Ticket, Robot, FlowArrow, ArrowLeft, type Icon } from '@/components/slab'
import { lazy, Suspense } from 'react'
import WorkflowSamples from './WorkflowSamples'
import AIStackGrid from './AIStackGrid'
import { AppsSection } from './Projects'
import { useFunnelModal } from './FunnelModal'
import { websiteFunnel } from '@/data/funnels'

const FunnelBarrel = lazy(() => import('./FunnelBarrel'))

/**
 * What the Projects dialogs show. Each panel is the work itself, on screen
 * the moment the dialog opens - no section chrome to read past and no second
 * dialog to click into.
 */

/** Only the strip of macOS windows, drifting on the backdrop. No window. */
export function AutomationsPanel() {
  return (
    <div className="ppanel ppanel--strip">
      <WorkflowSamples />
    </div>
  )
}

/** A plain mac window with a scrolling body, for the sections that are
 *  pages rather than frames. */
function SectionWindow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ppanel ppanel--window">
      <div className="ppanel__bar">
        <span className="ppanel__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="ppanel__url">
          <span className="ppanel__url-host">{label}</span>
        </span>
      </div>
      <div className="ppanel__scroll">{children}</div>
    </div>
  )
}

/** Only the barrel, spinning on the backdrop. Its own page preview still
 *  stacks above (z 9000). */
export function BarrelPanel() {
  const { openFull, modal } = useFunnelModal()
  return (
    <div className="ppanel ppanel--barrel">
      <Suspense fallback={<div className="funnels__barrel-skeleton" aria-hidden="true" />}>
        <FunnelBarrel funnels={websiteFunnel} onOpen={openFull} />
      </Suspense>
      {modal}
    </div>
  )
}

/** The systems as a logo-first grid, in a scrolling window. */
export function AIWindow() {
  return (
    <SectionWindow label="Your systems">
      <AIStackGrid />
    </SectionWindow>
  )
}
export function AppsWindow() {
  return (
    <SectionWindow label="Your apps">
      <AppsSection />
    </SectionWindow>
  )
}

type CapstoneProject = {
  id: string
  title: string
  subtitle: string
  badge: string
  image: string
  shortDescription: string
  description: string
  techStack: string[]
  features: string[]
  gallery: string[]
  repository: string
}

const CAPSTONE_PROJECTS: CapstoneProject[] = [
  {
    id: 'microfinancial',
    title: 'Microfinancial Administrative - Capstone III',
    subtitle: 'Capstone III',
    badge: 'FULL-STACK',
    image: '/placeholders/n.jpg',
    shortDescription: 'Centralized management of data. A web-based microfinance administrative system designed to streamline administrative operations, client management, and visitor monitoring through a QR code-based visitor registration system.',
    description: 'The Microfinance Administrative System is a centralized web application designed to help microfinance organizations manage administrative activities and maintain organized client and visitor records. The system provides tools for managing administrative information, monitoring daily activities, and maintaining accurate records through a structured digital platform. One of its key features is a QR code-based visitor management system, allowing visitors to quickly register by scanning a QR code using their mobile device. This reduces manual registration, improves data accuracy, and provides administrators with a convenient way to monitor and review visitor records. The project demonstrates the practical application of web development, database management, QR code technology, and administrative workflow automation in an organizational environment.',
    techStack: ['PHP BACKEND', 'MySQL DATABASE', 'HTML5 FRONTEND', 'CSS3 STYLING', 'Bootstrap FRAMEWORK', 'Hostinger HOSTING', 'JSON DATA', 'RESTful APIs INTEGRATION'],
    features: ['QR Code Visitor Registration — Allows visitors to quickly register by scanning a QR code using their mobile device, reducing manual data entry and making the registration process faster and more convenient.', 'Administrative & Client Record Management — Provides administrators with organized tools for managing client information, visitor records, and other important administrative data within a centralized system.', 'Visitor Monitoring & Activity Tracking — Maintains digital records of visitor activities and registration history, enabling administrators to easily monitor daily visits, review records, and maintain accurate organizational data.'],
    gallery: ['/placeholders/n.jpg', '/placeholders/n2.jpg', '/placeholders/n3.jpg', '/placeholders/n4.jpg'],
    repository: 'https://github.com/jeanmarcaguilar/Admin',
  },
  {
    id: 'sjdm',
    title: 'SJDM-Local Tour Guide & Booking System',
    subtitle: 'Tourism Platform',
    badge: 'BACK-END',
    image: '/placeholders/j.jpg',
    shortDescription: 'SJDM Local Tour Guide & Booking System is a web-based tourism platform designed to help visitors discover local attractions, explore tour destinations, and conveniently book local tour services in San Jose del Monte.',
    description: 'SJDM Local Tour Guide & Booking System is a tourism-focused web application developed to provide visitors with a convenient way to discover attractions, explore local destinations, and arrange guided tours within San Jose del Monte. The platform organizes information about tourist spots, local tour guides, available schedules, and booking services into a centralized digital system. Visitors can browse destinations, view tour details, select available schedules, and submit booking requests through an intuitive interface. On the administrative side, the system provides tools for managing destinations, tour guides, schedules, bookings, and visitor information. The project demonstrates how web technology can be used to support local tourism while improving the organization and accessibility of tour-related services',
    techStack: ['PHP BACKEND', 'HTML5 FRONTEND', 'CSS3 STYLING', 'JavaScript INTERACTIVITY', 'Hostinger HOSTING', 'RESTful APIs INTEGRATION'],
    features: ['Tourist Destination & Guide Directory — Provides visitors with organized information about local attractions, destinations, tour guides, and available tour services, making it easier to explore and discover places within San Jose del Monte.', 'Tour Schedule & Booking Management — Allows visitors to browse available tour schedules, view tour details, select preferred dates, and submit booking requests through a convenient and user-friendly interface.', 'Administrative Management & Booking Tracking — Enables administrators to manage destinations, tour guides, schedules, visitor information, and booking requests while keeping tourism-related records organized and accessible.'],
    gallery: ['/placeholders/j.jpg', '/placeholders/j2.jpg', '/placeholders/j3.jpg', '/placeholders/j4.jpg'],
    repository: 'https://github.com/christianbacay042504-coder/coderistyarn2',
  },
]

function CapstoneOverview({ project, onBack }: { project: CapstoneProject; onBack: () => void }) {
  return (
    <div
      className="capstone-overview"
      onWheel={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const target = e.currentTarget
        target.scrollTop += e.deltaY * 0.5
      }}
    >
      <button className="capstone-overview__back" onClick={onBack}>
        <ArrowLeft size={16} weight="bold" />
        Back to overview
      </button>
      <div className="capstone-overview__header">
        <span className="capstone-overview__label">Final-Year Team Project</span>
        <span className="capstone-overview__badge">{project.badge}</span>
      </div>
      <h1 className="capstone-overview__title">{project.title}</h1>
      <p className="capstone-overview__subtitle">{project.subtitle}</p>
      <div className="capstone-overview__hero">
        <img src={project.image} alt={project.title} />
      </div>
      <div className="capstone-overview__content">
        <p className="capstone-overview__desc">{project.description}</p>
        <div className="capstone-overview__section">
          <h2 className="capstone-overview__section-title">TECHNOLOGY STACK</h2>
          <div className="capstone-overview__tags">
            {project.techStack.map((tech) => (
              <span key={tech} className="capstone-overview__tag">{tech}</span>
            ))}
          </div>
        </div>
        <div className="capstone-overview__section">
          <h2 className="capstone-overview__section-title">KEY FEATURES</h2>
          <ul className="capstone-overview__features">
            {project.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
        <div className="capstone-overview__section">
          <h2 className="capstone-overview__section-title">PROJECT GALLERY</h2>
          <div className="capstone-overview__gallery">
            {project.gallery.map((img) => (
              <img key={img} src={img} alt="Gallery" />
            ))}
          </div>
        </div>
        <a href={project.repository} className="capstone-overview__repo" target="_blank" rel="noopener noreferrer">
          View Repository
        </a>
      </div>
    </div>
  )
}

/** The capstone panel with two containers for capstone projects. */
export function CapstoneWindow() {
  const [selectedProject, setSelectedProject] = useState<CapstoneProject | null>(null)

  if (selectedProject) {
    return (
      <SectionWindow label="Capstone Overview">
        <CapstoneOverview project={selectedProject} onBack={() => setSelectedProject(null)} />
      </SectionWindow>
    )
  }

  return (
    <SectionWindow label="Capstone Projects">
      <div className="capstone-section">
        <span className="projects__ext-eyebrow">Your capstone projects</span>
        <div className="capstone__containers">
          {CAPSTONE_PROJECTS.map((project) => (
            <div key={project.id} className="capstone__container" onClick={() => setSelectedProject(project)}>
              <div className="capstone__cover">
                <img src={project.image} alt={project.title} />
                <span className="capstone__badge">{project.badge}</span>
              </div>
              <div className="capstone__body">
                <h3 className="capstone__title">{project.title}</h3>
                <p className="capstone__desc">{project.shortDescription}</p>
                <div className="capstone__tags">
                  {project.techStack.slice(0, 4).map((tech) => (
                    <span key={tech} className="capstone__tag">{tech}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionWindow>
  )
}

/** The plan document, full height, straight away. */
export function PlanPanel() {
  return (
    <div className="ppanel ppanel--frame">
      <FrameBar
        host="yourdomain.com"
        path="/sample-plan"
      />
      <LiveFrame src="/placeholders/sample-plan.html" title="Sample document" />
    </div>
  )
}

/** `src` is a local page framed in the panel; `path` is what the fake
 *  address bar shows. Point these at your own pages. */
type Build = { id: string; label: string; src: string; path: string; Icon: Icon }

const BUILDS: Build[] = [
  { id: 'ticketing', label: 'Featured Project One', src: '/placeholders/sample-plan.html?doc=1', path: '/featured-one', Icon: Ticket },
  { id: 'framework', label: 'Featured Project Two', src: '/placeholders/sample-plan.html?doc=2', path: '/featured-two', Icon: Robot },
  { id: 'workflow', label: 'Featured Project Three', src: '/placeholders/sample-plan.html?doc=3', path: '/featured-three', Icon: FlowArrow },
]

/** One build, framed, open on arrival. */
function BuildPanel({ build }: { build: Build }) {
  return (
    <div className="ppanel ppanel--frame">
      <FrameBar host="yourdomain.com" path={build.path} />
      <LiveFrame src={build.src} title={build.label} />
    </div>
  )
}
export const TicketingPanel = () => <BuildPanel build={BUILDS[0]} />
export const FrameworkPanel = () => <BuildPanel build={BUILDS[1]} />
export const WorkflowPanel = () => <BuildPanel build={BUILDS[2]} />

function FrameBar({ host, path }: { host: string; path: string }) {
  return (
    <div className="ppanel__bar">
      <span className="ppanel__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="ppanel__url">
        <span className="ppanel__url-host">{host}</span>
        <span className="ppanel__url-path">{path}</span>
      </span>
    </div>
  )
}

/** Matches `pmodal-panel` (420ms). Same-site frames share the portfolio's
 *  main thread, so loading one mid-animation stalled the open by 100ms+. */
const FRAME_DELAY_MS = 440

function LiveFrame({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), FRAME_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div className="ppanel__stage">
      {!ready && <div className="ppanel__skeleton" aria-hidden="true" />}
      {mounted && <iframe
        className="ppanel__iframe"
        src={src}
        title={title}
        loading="eager"
        onLoad={() => setReady(true)}
        data-ready={ready ? 'true' : 'false'}
      />}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowUpRight, ChalkboardTeacher, Medal, Eye, X } from '@/components/slab'
import forSeminar1 from '@/assets/images/For Seminar 1.png'
import forSeminar2 from '@/assets/images/For Seminar-2.png'
import cert1 from '@/assets/images/Cert1.png'
import cert2 from '@/assets/images/Cert2.png'
import aboutCard1 from '@/assets/images/jims.png'

// ➕ Extra certificate images.
// Put the files in src/assets/images/ and list their EXACT file names below.
// Missing files are skipped, so the app never crashes while you add them.
const ALL_IMAGES = import.meta.glob('/src/assets/images/*.{png,jpg,jpeg,webp,PNG,JPG,JPEG,WEBP}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const extraImage = (fileName: string): string[] => {
  const hit = Object.entries(ALL_IMAGES).find(([path]) => path.endsWith('/' + fileName))
  return hit ? [hit[1]] : []
}

type Item = {
  id: string
  title: string
  date: string
  readTime: string
  role: string
  venue: string
  image: string
  certificateImage?: string
  certificateImages?: string[] // all images shown in the "View Certificate" modal (gallery)
  description: string | string[] // one string, or a list of paragraphs
  tags: string[]
}

// Accepts an array of paragraphs, or one string with blank lines between paragraphs.
const toParagraphs = (d: string | string[]) =>
  (Array.isArray(d) ? d : d.split(/\n\s*\n/)).map((p) => p.trim()).filter(Boolean)

const SEMINARS: Item[] = [
  {
    id: 'sem-1',
    title: 'Quantum Computing: Breaking The Limits. Generative AI & its Application',
    date: 'November 2024',
    readTime: '1 min read',
    role: 'Attendee',
    venue: 'Tech Summit Philippines',
    image: forSeminar1,
    certificateImage: forSeminar1,
    certificateImages: [forSeminar1, ...extraImage('For Seminar 1-B.png')],
    description:'The accelerated convergence of decentralized Web3 frameworks and spatial computing is redefining how users interact with digital environments and immersive applications. Throughout this interactive showcase, visionaries explored how theoretical spatial design principles can transform user engagement and bridge physical realities with virtual workspaces. Although widespread adoption of fully immersive hardware is still unfolding, creators can immediately leverage modular design systems and cross-platform compatibility standards to build future-ready, deeply engaging experiences. Crucial strategies highlighted included integrating real-time telemetry, deploying secure decentralized identity verification protocols, and engineering high-performance edge computing nodes to deliver zero-latency experiences globally.',
    tags: ['Cloud Computing', 'Web Engineering', 'API Design'],
  },
  {
    id: 'sem-2',
    title: 'BITZ 2023: Accelerating the Innovators Role in Digital Transformation',
    date: 'April 2023',
    readTime: '1 min read',
    role: 'Participant',
    venue: 'IT Conference & Academic Forum',
    image: forSeminar2,
    certificateImage: forSeminar2,
    certificateImages: [forSeminar2, ...extraImage('For Seminar-2-B.png')],
    description:
      'BITZ 2023 acted as a strategic catalyst highlighting how digital changemakers drive systemic reform across public sector administration, community infrastructure, and civic technology. Panels and collaborative workshops emphasized the empowering duty of modern technologists to dismantle bureaucratic bottlenecks using cloud-native infrastructures, transparent citizen engagement portals, and data-driven policy design—frameworks that directly shaped subsequent grassroots prototypes and municipal digital transformation initiatives.',
    tags: ['Digital Transformation', 'Software Engineering', 'IT Leadership'],
  },
]

const CERTIFICATIONS: Item[] = [
  {
    id: 'cert-1',
    title: 'Information Management in the Digital Age',
    date: 'Issued Sept 04, 2025 - October 31, 2025',
    readTime: 'Credential Verified',
    role: 'Recipient',
    venue: 'Singapore Institute of Multidisciplinary Professions & Bestlink College of the Philippines',
    image: cert1, // cover shown on the card and the modal banner
    certificateImage: cert1, // shown in the "View Certificate" modal
    certificateImages: [cert1, ...extraImage('Cert1-B.png')],
    // One string per paragraph. Prefix with '## ' for a heading or '### ' for a sub-heading.
    // Use backticks `like this` if the text contains an apostrophe (AI's, don't, etc).
    description: [
      'The Information Management in the Digital Age certificate program is a collaborative initiative by the Singapore Institute of Multidisciplinary Professions and Bestlink College of the Philippines, designed to bridge the gap between academic theory and corporate execution. This comprehensive program focuses on data governance, infrastructure security, and automated workflows, preparing professionals for the evolving digital landscape.',
      '## Featured Industry Expert: Marc Tonido',
      'A technical leader with over twenty years of experience in software engineering, global development management, and architecture across various high-growth sectors. He holds a Bachelor of Science in Computer Science from the University of the Philippines Visayas.',
      '## Core Program Modules & Learning Outcomes',
      '### 1. Artificial Intelligence Fundamentals & Impact',
      `Covers foundational concepts of machine learning models, algorithms, and AI's role in reshaping industry standards and large-scale information processing.`,
      '### 2. Practical AI Trends and Tools',
      'Explores cutting-edge AI technologies and strategies for integrating intelligent automation into professional workflows and business operations.',
      '### 3. Applied Python Programming',
      'Hands-on implementation of Python for building, scaling, and powering AI applications.',
      '### 4. Enterprise Cybersecurity',
      'Focuses on comprehensive defense strategies to protect digital infrastructure and enterprise assets against cyber threats.',
      '### 5. Cloud Security and Compliance',
      'Specializes in navigating security challenges, regulatory compliance standards, and risk mitigation in multi-tenant cloud environments.',
      '### 6. Web Application Security',
      'Provides advanced training on safeguarding web platforms, mitigating vulnerabilities, neutralizing injection flaws, and defending against common digital attack vectors.',
    ],
    tags: ['Information Management', 'Database Systems', 'Enterprise IT'],
  },
  {
    id: 'cert-2',
    title: 'Bachelor of Science in Information Technology',
    date: 'Issued May 06, 2026',
    readTime: 'Degree Confirmed',
    role: 'Graduate',
    venue: 'Bestlink College of the Philippines',
    image: cert2,
    certificateImage: cert2,
    certificateImages: [cert2, ...extraImage('Cert2.jpg')],
    // One string per paragraph (backticks so apostrophes and quotes are safe).
    description: [
      `Beyond celebrating the completion of coursework, a graduation ceremony embodies the profound transformation from dedicated students into capable, forward-thinking professionals equipped to shape tomorrow’s industries.`,
      `The 25th Commencement Exercises of the Bestlink College of the Philippines, held on May 06, 2026, at the historic Fiesta Pavillion Hall of the Manila Hotel, united graduates, families, faculty, and institutional leaders in a powerful celebration. Guided by the inspiring theme ”One Together: Stronger as One, Rising Above Challenges,” the ceremony served as a testament to the collective grit, solidarity, and relentless determination of the graduating batch.`,
      `As these emerging professionals transition into fast-paced corporate and technological environments, they carry forward the enduring principles of excellence and perseverance instilled by Bestlink College of the Philippines, poised to drive meaningful innovation in their respective careers.`,
    ],
    tags: ['Information Technology', 'Full-Stack Development', 'Computer Science'],
  },
]

/* Certificate modal styles live here (injected below) so the modal always looks
   right without touching the global stylesheet. Classes are prefixed `cm-`. */
const CERT_MODAL_CSS = `
button.seminar-detail-modal__cert-link { font: inherit; cursor: pointer; }

/* Long descriptions: the detail dialog scrolls, paragraphs get breathing room. */
.seminar-detail-modal .seminar-detail-modal__dialog {
  max-height: calc(100dvh - 48px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* Nothing inside the dialog may be squeezed when the text is long: the
   banner image keeps its natural height and the whole dialog scrolls. */
.seminar-detail-modal .seminar-detail-modal__dialog > * { flex-shrink: 0; }
.seminar-detail-modal .seminar-detail-modal__banner {
  flex: none;
  height: auto;
  min-height: 0;
  aspect-ratio: auto;
  overflow: hidden;
  border-radius: 14px;
}
.seminar-detail-modal .seminar-detail-modal__banner-img {
  display: block;
  position: static;
  width: 100%;
  height: auto;
  max-height: min(46dvh, 420px);
  object-fit: contain;
}
.seminar-detail-modal__body { display: flex; flex-direction: column; gap: 14px; }
.seminar-detail-modal__body .seminar-detail-modal__desc { margin: 0; }
.seminar-detail-modal__heading {
  margin: 10px 0 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: inherit;
}
.seminar-detail-modal__subheading {
  margin: 6px 0 -6px;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.35;
  color: #c2410c;
}
[data-theme='dark'] .seminar-detail-modal__subheading { color: #ff7a1a; }

.cm {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: grid;
  place-items: center;
  padding: clamp(12px, 3vw, 32px);
}
.cm__backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(900px 480px at 50% 0%, rgba(255, 122, 26, 0.18), transparent 62%),
    rgba(6, 12, 26, 0.80);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: cm-fade 0.22s ease both;
}
.cm__dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: 100%;
  border-radius: 20px;
  overflow: hidden;
  background: linear-gradient(180deg, #ffffff, #f5f7fc);
  box-shadow:
    0 0 0 1px rgba(11, 30, 63, 0.08),
    0 50px 100px -30px rgba(0, 0, 0, 0.65);
  animation: cm-pop 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Header */
.cm__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px 10px 16px;
  border-bottom: 1px solid rgba(11, 30, 63, 0.08);
}
.cm__badge {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: #ff7a1a;
  background: rgba(255, 122, 26, 0.14);
  box-shadow: inset 0 0 0 1px rgba(255, 122, 26, 0.28);
}
.cm__heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.cm__eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #c2410c;
}
.cm__title {
  margin: 0;
  font-size: clamp(13px, 1vw, 15px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: #0b1e3f;
  text-wrap: balance;
}
.cm__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: #0b1e3f;
  background: rgba(11, 30, 63, 0.07);
  transition: background 0.15s ease, transform 0.15s ease;
}
.cm__close:hover { background: rgba(11, 30, 63, 0.14); transform: rotate(90deg); }

/* Stage + framed certificate */
.cm__stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: clamp(10px, 1.5vw, 16px);
  background:
    radial-gradient(600px 260px at 50% 0%, rgba(24, 56, 140, 0.08), transparent 70%),
    #eef2f9;
}
.cm__frame {
  max-width: 100%;
  line-height: 0;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(11, 30, 63, 0.10),
    0 28px 56px -26px rgba(11, 30, 63, 0.5);
}
.cm__img {
  display: block;
  max-width: 100%;
  max-height: min(48dvh, calc(100dvh - 240px));
  width: auto;
  height: auto;
  object-fit: contain;
}

/* Gallery: prev/next arrows, counter, thumbnails */
.cm__frame-wrap { position: relative; max-width: 100%; display: flex; justify-content: center; }
.cm__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: #fff;
  background: rgba(11, 30, 63, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: background 0.15s ease, transform 0.15s ease;
}
.cm__nav:hover { background: rgba(255, 106, 0, 0.92); }
.cm__nav--prev { left: 8px; }
.cm__nav--next { right: 8px; }
.cm__nav--next svg { transform: rotate(180deg); }
.cm__nav:focus-visible, .cm__thumb:focus-visible { outline: 2px solid #ff7a1a; outline-offset: 2px; }
.cm__count {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(11, 30, 63, 0.66);
}
.cm__thumbs {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px 0;
  background: #eef2f9;
}
.cm__thumb {
  flex: none;
  width: 64px;
  height: 46px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  opacity: 0.6;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}
.cm__thumb:hover { opacity: 0.9; }
.cm__thumb--active { opacity: 1; border-color: #ff7a1a; }
.cm__thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
[data-theme='dark'] .cm__thumbs { background: rgba(255, 255, 255, 0.03); }

/* Footer */
.cm__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 10px 14px 12px 16px;
  border-top: 1px solid rgba(11, 30, 63, 0.08);
}
.cm__meta { min-width: 0; font-size: 12px; line-height: 1.4; color: #5b6b83; }
.cm__meta strong { color: #0b1e3f; font-weight: 700; }
.cm__actions { display: flex; align-items: center; gap: 8px; }
.cm__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.cm__btn svg { flex: none; }
.cm__btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #ff8a2b, #ff6a00);
  box-shadow: 0 10px 22px -10px rgba(255, 106, 0, 0.7);
}
.cm__btn--primary:hover { transform: translateY(-1px); box-shadow: 0 14px 26px -10px rgba(255, 106, 0, 0.8); }
.cm__btn--ghost { color: #0b1e3f; background: rgba(11, 30, 63, 0.07); }
.cm__btn--ghost:hover { background: rgba(11, 30, 63, 0.13); }
.cm__close:focus-visible, .cm__btn:focus-visible { outline: 2px solid #ff7a1a; outline-offset: 2px; }

/* Dark mode */
[data-theme='dark'] .cm__dialog {
  background: linear-gradient(180deg, #131b2e, #0e1424);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 50px 100px -30px rgba(0, 0, 0, 0.9);
}
[data-theme='dark'] .cm__head,
[data-theme='dark'] .cm__foot { border-color: rgba(255, 255, 255, 0.09); }
[data-theme='dark'] .cm__eyebrow { color: #ff7a1a; }
[data-theme='dark'] .cm__title,
[data-theme='dark'] .cm__meta strong { color: #edf0f6; }
[data-theme='dark'] .cm__meta { color: rgba(237, 240, 246, 0.62); }
[data-theme='dark'] .cm__close { color: #edf0f6; background: rgba(255, 255, 255, 0.08); }
[data-theme='dark'] .cm__close:hover { background: rgba(255, 255, 255, 0.16); }
[data-theme='dark'] .cm__stage {
  background:
    radial-gradient(600px 260px at 50% 0%, rgba(255, 122, 26, 0.10), transparent 70%),
    rgba(255, 255, 255, 0.03);
}
[data-theme='dark'] .cm__frame {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.10),
    0 28px 56px -26px rgba(0, 0, 0, 0.9);
}
[data-theme='dark'] .cm__btn--ghost { color: #edf0f6; background: rgba(255, 255, 255, 0.09); }
[data-theme='dark'] .cm__btn--ghost:hover { background: rgba(255, 255, 255, 0.16); }

@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cm-pop {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

@media (max-width: 560px) {
  .cm__dialog { border-radius: 18px; }
  .cm__img { max-height: min(42dvh, calc(100dvh - 280px)); }
  .cm__foot { flex-direction: column; align-items: stretch; }
  .cm__actions { justify-content: stretch; }
  .cm__btn { flex: 1; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) {
  .cm__backdrop, .cm__dialog { animation: none; }
  .cm__close:hover { transform: none; }
}
`

export default function SeminarsView() {
  const navigate = useNavigate()
  const [activeItem, setActiveItem] = useState<Item | null>(null)
  const [certOpen, setCertOpen] = useState(false)
  const [certIndex, setCertIndex] = useState(0)

  // All images for the current item's certificate modal (falls back to a single image).
  const certImages = activeItem
    ? activeItem.certificateImages?.length
      ? activeItem.certificateImages
      : [activeItem.certificateImage || activeItem.image]
    : []
  const currentCert = certImages[Math.min(certIndex, certImages.length - 1)]
  const goPrev = () => setCertIndex((i) => (i - 1 + certImages.length) % certImages.length)
  const goNext = () => setCertIndex((i) => (i + 1) % certImages.length)
  const openCert = () => {
    setCertIndex(0)
    setCertOpen(true)
  }

  // Closing the detail modal always closes the certificate modal with it.
  const closeDetail = () => {
    setCertOpen(false)
    setActiveItem(null)
  }

  useEffect(() => {
    if (!activeItem) return
    const onKey = (e: KeyboardEvent) => {
      if (certOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const n = activeItem.certificateImages?.length || 1
        setCertIndex((i) => (e.key === 'ArrowRight' ? (i + 1) % n : (i - 1 + n) % n))
        return
      }
      if (e.key !== 'Escape') return
      // Escape peels off the top-most modal first.
      if (certOpen) setCertOpen(false)
      else closeDetail()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItem, certOpen])

  return (
    <section
      className="seminars-page"
      aria-labelledby="seminars-title"
      onWheel={(e) => {
        // Forcefully intercept high-polling gaming mouse delta inputs and scroll the container directly
        e.preventDefault()
        e.stopPropagation()
        const target = e.currentTarget
        target.scrollTop += e.deltaY * 0.5
      }}
      style={{
        maxHeight: '100vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <style>{CERT_MODAL_CSS}</style>
      <div className="seminars-page__inner">
        {/* Top Back Action */}
        <div className="seminars-page__top">
          <button
            type="button"
            onClick={() => navigate('/about')}
            className="seminars__back-btn"
            aria-label="Back to About page"
          >
            <ArrowLeft size={15} weight="bold" />
            <span>Back</span>
          </button>
        </div>

        {/* Header */}
        <header className="seminars__header">
          <div className="seminars__eyebrow">
            <span className="seminars__eyebrow-dot" aria-hidden="true" />
            <span>Professional Growth</span>
          </div>
          <h1 id="seminars-title" className="seminars__title">
            Seminars &amp; <span className="seminars__title-accent">Certifications</span>
          </h1>
          <p className="seminars__lede">
            Continuous learning and practical workshops that expand my knowledge in modern engineering,
            architecture, and technology leadership.
          </p>
        </header>

        {/* Section 1: Seminars */}
        <section className="seminars__section" aria-labelledby="sec-seminars-title">
          <div className="seminars__sec-head">
            <span className="seminars__sec-icon seminars__sec-icon--blue" aria-hidden="true">
              <ChalkboardTeacher size={22} weight="bold" />
            </span>
            <div className="seminars__sec-info">
              <div className="seminars__sec-title-row">
                <h2 id="sec-seminars-title" className="seminars__sec-title">Seminars</h2>
                <span className="seminars__sec-badge">{SEMINARS.length}</span>
              </div>
              <p className="seminars__sec-sub">Industry talks and hands-on workshops I’ve attended.</p>
            </div>
          </div>

          <div className="seminars__grid">
            {SEMINARS.map((s) => (
              <article key={s.id} className="seminars-card">
                <div
                  className="seminars-card__image-wrap"
                  onClick={() => setActiveItem(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveItem(s)}
                  aria-label={`View full details for ${s.title}`}
                >
                  <img src={s.image} alt={s.title} className="seminars-card__image" loading="lazy" />
                  <span className="seminars-card__zoom-hint">
                    <Eye size={18} weight="bold" />
                  </span>
                </div>
                <div className="seminars-card__body">
                  <div className="seminars-card__meta">
                    <span className="seminars-card__date">{s.date}</span>
                    <h3 className="seminars-card__name">{s.title}</h3>
                    <p className="seminars-card__issuer">{s.venue}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(s)}
                    className="seminars-card__btn"
                  >
                    <Eye size={16} weight="bold" />
                    <span>Unlock Excellence</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Section 2: Certifications */}
        <section className="seminars__section" aria-labelledby="sec-certs-title">
          <div className="seminars__sec-head">
            <span className="seminars__sec-icon seminars__sec-icon--orange" aria-hidden="true">
              <Medal size={22} weight="bold" />
            </span>
            <div className="seminars__sec-info">
              <div className="seminars__sec-title-row">
                <h2 id="sec-certs-title" className="seminars__sec-title">Certifications</h2>
                <span className="seminars__sec-badge">{CERTIFICATIONS.length}</span>
              </div>
              <p className="seminars__sec-sub">Credentials that validate my technical skills.</p>
            </div>
          </div>

          <div className="seminars__grid">
            {CERTIFICATIONS.map((c) => (
              <article key={c.id} className="seminars-card">
                <div
                  className="seminars-card__image-wrap"
                  onClick={() => setActiveItem(c)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setActiveItem(c)}
                  aria-label={`View full details for ${c.title}`}
                >
                  <img src={c.image} alt={c.title} className="seminars-card__image" loading="lazy" />
                  <span className="seminars-card__zoom-hint">
                    <Eye size={18} weight="bold" />
                  </span>
                </div>
                <div className="seminars-card__body">
                  <div className="seminars-card__meta">
                    <span className="seminars-card__date">{c.date}</span>
                    <h3 className="seminars-card__name">{c.title}</h3>
                    <p className="seminars-card__issuer">{c.venue}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveItem(c)}
                    className="seminars-card__btn"
                  >
                    <Eye size={16} weight="bold" />
                    <span>Unlock Excellence</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      {/* Detail Modal with Forced Hardware Mouse Wheel Handler */}
      {activeItem &&
        createPortal(
          <div
            className="seminar-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
          >
            <div className="seminar-detail-modal__backdrop" onClick={closeDetail} />
            <div
              className="seminar-detail-modal__dialog"
              onClick={(e) => e.stopPropagation()}
              // The page <section> prevents default on wheel; without this the
              // modal's long text could not be scrolled with the mouse wheel.
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Top row: Meta and Close button */}
              <div className="seminar-detail-modal__top">
                <span className="seminar-detail-modal__meta">
                  {activeItem.date} • {activeItem.readTime}
                </span>
                <button
                  type="button"
                  className="seminar-detail-modal__close"
                  onClick={closeDetail}
                  aria-label="Close modal"
                >
                  <X size={16} weight="bold" />
                </button>
              </div>

              {/* Title */}
              <h2 id="detail-modal-title" className="seminar-detail-modal__title">
                {activeItem.title}
              </h2>

              {/* Author / Attendee row */}
              <div className="seminar-detail-modal__author">
                <img
                  src={aboutCard1}
                  alt="Jean Marc Aguilar"
                  className="seminar-detail-modal__author-img"
                />
                <div className="seminar-detail-modal__author-info">
                  <span className="seminar-detail-modal__author-name">Jean Marc Aguilar</span>
                  <span className="seminar-detail-modal__author-role">
                    {activeItem.role} • {activeItem.venue}
                  </span>
                </div>
              </div>

              <hr className="seminar-detail-modal__divider" />

              {/* Banner Image */}
              <div className="seminar-detail-modal__banner">
                <img
                  src={activeItem.image}
                  alt={activeItem.title}
                  className="seminar-detail-modal__banner-img"
                />
              </div>

              {/* Description */}
              <div className="seminar-detail-modal__body">
                {toParagraphs(activeItem.description).map((p, i) => {
                  // "## Title" = section heading, "### Title" = sub-heading, anything else = paragraph.
                  if (p.startsWith('### ')) {
                    return (
                      <h4 key={i} className="seminar-detail-modal__subheading">
                        {p.slice(4)}
                      </h4>
                    )
                  }
                  if (p.startsWith('## ')) {
                    return (
                      <h3 key={i} className="seminar-detail-modal__heading">
                        {p.slice(3)}
                      </h3>
                    )
                  }
                  return (
                    <p key={i} className="seminar-detail-modal__desc">
                      {p}
                    </p>
                  )
                })}
              </div>

              {/* Tags */}
              <div className="seminar-detail-modal__tags">
                {activeItem.tags.map((tag) => (
                  <span key={tag} className="seminar-detail-modal__tag">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Footer action */}
              <div className="seminar-detail-modal__footer">
                <button
                  type="button"
                  className="seminar-detail-modal__cert-link"
                  onClick={openCert}
                >
                  <span>View Certificate</span>
                  <ArrowUpRight size={15} weight="bold" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Certificate modal, stacked on top of the detail modal. */}
      {activeItem &&
        certOpen &&
        createPortal(
          <div className="cm" role="dialog" aria-modal="true" aria-labelledby="cert-modal-title">
            <div className="cm__backdrop" onClick={() => setCertOpen(false)} />
            <div className="cm__dialog" onClick={(e) => e.stopPropagation()}>
              <header className="cm__head">
                <span className="cm__badge" aria-hidden="true">
                  <Medal size={22} weight="duotone" />
                </span>
                <div className="cm__heading">
                  <span className="cm__eyebrow">Certificate</span>
                  <h3 id="cert-modal-title" className="cm__title">
                    {activeItem.title}
                  </h3>
                </div>
                <button
                  type="button"
                  className="cm__close"
                  onClick={() => setCertOpen(false)}
                  aria-label="Close certificate"
                >
                  <X size={16} weight="bold" />
                </button>
              </header>

              <div className="cm__stage">
                <div className="cm__frame-wrap">
                  <div className="cm__frame">
                    <img
                      key={currentCert}
                      src={currentCert}
                      alt={`Certificate ${certIndex + 1} of ${certImages.length}: ${activeItem.title}`}
                      className="cm__img"
                    />
                  </div>
                  {certImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        className="cm__nav cm__nav--prev"
                        onClick={goPrev}
                        aria-label="Previous certificate image"
                      >
                        <ArrowLeft size={16} weight="bold" />
                      </button>
                      <button
                        type="button"
                        className="cm__nav cm__nav--next"
                        onClick={goNext}
                        aria-label="Next certificate image"
                      >
                        <ArrowLeft size={16} weight="bold" />
                      </button>
                      <span className="cm__count">
                        {certIndex + 1} / {certImages.length}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {certImages.length > 1 && (
                <div className="cm__thumbs">
                  {certImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      className={`cm__thumb${i === certIndex ? ' cm__thumb--active' : ''}`}
                      onClick={() => setCertIndex(i)}
                      aria-label={`Show certificate image ${i + 1}`}
                    >
                      <img src={img} alt="" />
                    </button>
                  ))}
                </div>
              )}

              <footer className="cm__foot">
                <p className="cm__meta">
                  <strong>{activeItem.role}</strong> &middot; {activeItem.date}
                </p>
                <div className="cm__actions">
                  <button type="button" className="cm__btn cm__btn--ghost" onClick={() => setCertOpen(false)}>
                    Close
                  </button>
                  <a
                    href={currentCert}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cm__btn cm__btn--primary"
                  >
                    <span>Open full size</span>
                    <ArrowUpRight size={14} weight="bold" />
                  </a>
                </div>
              </footer>
            </div>
          </div>,
          document.body
        )}
    </section>
  )
}
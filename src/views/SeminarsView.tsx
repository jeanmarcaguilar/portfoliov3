import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ArrowLeft, ArrowUpRight, Medal, X } from '@/components/slab'
import forSeminar1 from '@/assets/images/For Seminar 1.png'
import forSeminar2 from '@/assets/images/For Seminar-2.png'
import cert1 from '@/assets/images/Cert1.png'
import cert2 from '@/assets/images/Cert2.png'
import mern from '@/assets/images/mern.jpg'
import ai from '@/assets/images/ai.jpg'
import html from '@/assets/images/html.jpg'
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

type Badge = 'Seminar' | 'Workshop' | 'Certification'

type Item = {
  id: string
  badge: Badge // small colored label on the card
  title: string
  date: string
  readTime: string
  role: string
  venue: string
  image: string
  certificateImage?: string
  certificateImages?: string[] // all images shown in the "View Certificate" modal (gallery)
  verifyUrl?: string // shows a "Verify Certificate" button in the detail modal (paste the credential link)
  brand?: string // short provider name for the logo card (defaults to venue)
  certLabel?: string // top label of the modal (defaults by badge)
  duration?: string // optional, shown in the certificate modal stats row (e.g. '1 Hour')
  description: string | string[] // one string, or a list of paragraphs
  tags: string[]
}

// Accepts an array of paragraphs, or one string with blank lines between paragraphs.
const toParagraphs = (d: string | string[]) =>
  (Array.isArray(d) ? d : d.split(/\n\s*\n/)).map((p) => p.trim()).filter(Boolean)

const SEMINARS: Item[] = [
  {
    id: 'sem-1',
    badge: 'Seminar',
    title: 'Quantum Computing: Breaking The Limits. Generative AI & its Application',
    date: 'November 2024',
    readTime: '1 min read',
    role: 'Attendee',
    venue: 'Tech Summit Philippines',
    brand: 'Tech Summit PH',
    image: forSeminar1,
    certificateImage: forSeminar1,
    certificateImages: [forSeminar1, ...extraImage('For Seminar 1-B.png')],
    description:'The accelerated convergence of decentralized Web3 frameworks and spatial computing is redefining how users interact with digital environments and immersive applications. Throughout this interactive showcase, visionaries explored how theoretical spatial design principles can transform user engagement and bridge physical realities with virtual workspaces. Although widespread adoption of fully immersive hardware is still unfolding, creators can immediately leverage modular design systems and cross-platform compatibility standards to build future-ready, deeply engaging experiences. Crucial strategies highlighted included integrating real-time telemetry, deploying secure decentralized identity verification protocols, and engineering high-performance edge computing nodes to deliver zero-latency experiences globally.',
    tags: ['Cloud Computing', 'Web Engineering', 'API Design'],
  },
  {
    id: 'sem-2',
    badge: 'Workshop',
    title: 'BITZ 2023: Accelerating the Innovators Role in Digital Transformation',
    date: 'April 2023',
    readTime: '1 min read',
    role: 'Participant',
    venue: 'IT Conference & Academic Forum',
    brand: 'BITZ 2023',
    image: forSeminar2,
    certificateImage: forSeminar2,
    certificateImages: [forSeminar2, ...extraImage('For Seminar-2-B.png')],
    description:
      'BITZ 2023 acted as a strategic catalyst highlighting how digital changemakers drive systemic reform across public sector administration, community infrastructure, and civic technology. Panels and collaborative workshops emphasized the empowering duty of modern technologists to dismantle bureaucratic bottlenecks using cloud-native infrastructures, transparent citizen engagement portals, and data-driven policy design—frameworks that directly shaped subsequent grassroots prototypes and municipal digital transformation initiatives.',
    tags: ['Digital Transformation', 'Software Engineering', 'IT Leadership'],
  },
  {
    id: 'sem-3',
    badge: 'Seminar',
    title: 'Research Forum 2025: Empowering the Future through Research',
    date: 'July 13, 2025',
    readTime: '1 min read',
    role: 'Attendee',
    venue: 'Bestlink College of the Philippines',
    brand: 'Bestlink College',
    // 👉 Put your image in src/assets/images/ named exactly "forum.png"
    // (until then the card falls back to the first seminar image so nothing breaks).
    image: extraImage('forum.png')[0] ?? forSeminar1,
    certificateImage: extraImage('forum.png')[0] ?? forSeminar1,
    certificateImages: extraImage('forum.png').length
      ? extraImage('forum.png')
      : [forSeminar1],
    description: [
      `Research continues to play a fundamental role in addressing societal concerns, fostering innovation, and creating meaningful solutions to emerging challenges. By encouraging critical thinking and evidence-based decision-making, academic institutions empower students and researchers to transform knowledge into practical initiatives that benefit communities and society.`,
      `On July 13, 2025, the Bestlink College of the Philippines Center for Research and Development hosted the Research Forum 2025, carrying the theme “Empowering the Future through Research: Local Solutions for Global Challenges.” The event provided an academic platform for exchanging ideas, presenting research perspectives, and exploring how locally developed solutions can contribute to addressing broader global concerns.`,
      `Guided by Joy Evelyn A. Ignacio, Ph.D., Director of the Center for Research and Development, and Charlie I. Cariño, Ph.D., Vice President of Academic Affairs, the forum highlighted the importance of collaborative inquiry, responsible innovation, and research-driven development. Through this initiative, participants were encouraged to strengthen their commitment to academic excellence and recognize research as a powerful instrument for creating sustainable solutions and shaping a better future.`,
    ],
    tags: ['Research', 'Innovation', 'Academic Forum'],
  },
]

const CERTIFICATIONS: Item[] = [
  {
    id: 'cert-1',
    badge: 'Certification',
    title: 'Information Management in the Digital Age',
    date: 'Issued Sept 04, 2025 - October 31, 2025',
    readTime: 'Credential Verified',
    role: 'Recipient',
    venue: 'Singapore Institute of Multidisciplinary Professions & Bestlink College of the Philippines',
    brand: 'SIMP × Bestlink',
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
    badge: 'Certification',
    title: 'Bachelor of Science in Information Technology',
    date: 'Issued May 06, 2026',
    readTime: 'Degree Confirmed',
    role: 'Graduate',
    venue: 'Bestlink College of the Philippines',
    brand: 'Bestlink College',
    certLabel: 'Diploma of Graduation',
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
  // ➕ 3 new certificate containers. Replace the TODO text and add the images
  // (mern.png, ai.png, html.png, plus the covers simpli.png and codecred.png) in src/assets/images/. Until the images exist,
  // each card falls back to the cert1 image so nothing breaks.
  {
    id: 'cert-3',
    badge: 'Certification',
    title: 'Fundamentals of MERN Stack', // TODO
    date: 'Octotber 2026', // TODO
    readTime: 'Credential Verified',
    role: 'Recipient',
    venue: 'Simplilearn', // TODO
    image: extraImage('simpli.png')[0] ?? extraImage('mern.png')[0] ?? mern, // cover: simpli.png
    certificateImage: extraImage('mern.png')[0] ?? cert1,
    certificateImages: extraImage('mern.png').length ? extraImage('mern.png') : [mern],
    verifyUrl: 'https://www.simplilearn.com/skillup-certificate-landing?token=eyJjb3Vyc2VfaWQiOiIzMzM3IiwiY2VydGlmaWNhdGVfdXJsIjoiaHR0cHM6XC9cL2NlcnRpZmljYXRlcy5zaW1wbGljZG4ubmV0XC9zaGFyZVwvMTA4NzcyOTJfMTEyMzU5MDlfMTc5MTc5MzM1MTgxNy5wbmciLCJ1c2VybmFtZSI6IkpFQU4gTUFSQyBhR1VJTEFSIn0%3D&utm_source=shared-certificate&utm_medium=lms&utm_campaign=shared-certificate-promotion&referrer=https%3A%2F%2Flms.simplilearn.com%2Fcourses%2F6129%2FIntroduction-to-MERN-Stack%2Fcertificate%2Fdownload-skillup&%24web_only=true&_branch_match_id=1623719201586985551&_branch_referrer=H4sIAAAAAAAAA8soKSkottLXL87MLcjJ1EssKNDLyczL1k%2FVN3QvdSnJN%2FVINE%2ByrytKTUstKsrMS49PKsovL04tsnXOKMrPTQUAqeS7RD8AAAA%3D', // TODO: paste your verification link here
    duration: '1 Hour',
    description: [
      `Strengthen your full-stack development skills through this free MERN Stack Course with Certificate. Explore the core technologies behind modern web applications—MongoDB, Express.js, React, and Node.js—and gain an understanding of how these tools work together to build responsive, dynamic, and scalable web solutions.`,
      `Designed for aspiring web developers, this one-hour course introduces the fundamentals of the MERN stack and provides a foundation for developing end-to-end web applications.`,
    ],
    tags: [],
  },
  {
    id: 'cert-4',
    badge: 'Certification',
    title: 'Introduction to Generative AI', // TODO
    date: 'Octotber 2026', // TODO
    readTime: 'Credential Verified',
    role: 'Recipient',
    venue: 'Simplilearn', // TODO
    image: extraImage('simpli.png')[0] ?? extraImage('ai.png')[0] ?? ai, // cover: simpli.png
    certificateImage: extraImage('ai.jpg')[0] ?? cert1,
    certificateImages: extraImage('ai.jpg').length ? extraImage('ai.jpg') : [ai],
    verifyUrl: 'https://simpli-web.app.link/e/27ED6KEUa7b', // TODO: paste your verification link here
    description: [
      'Explore the capabilities of Generative Artificial Intelligence and discover how AI-powered technologies are transforming the way people create content, generate images, and develop innovative solutions. This free course with certificate introduces the fundamentals of generative AI, its practical applications, and its growing impact across industries such as healthcare, education, and business.',
      ' Designed for beginners and aspiring technology professionals, the course provides an accessible introduction to AI concepts and their potential to support creativity, productivity, and digital innovation.',
    ],
    tags: [],
  },
  {
    id: 'cert-5',
    badge: 'Certification',
    title: 'HTML Fundamentals', // TODO
    date: 'October 2026', // TODO
    readTime: 'Credential Verified',
    role: 'Recipient',
    venue: 'CodeCred', // TODO
    image: extraImage('codecred.png')[0] ?? extraImage('html.png')[0] ?? html, // cover: codecred.png
    certificateImage: extraImage('html.png')[0] ?? cert1,
    certificateImages: extraImage('html.png').length ? extraImage('html.png') : [html],
    verifyUrl: 'https://www.codecred.dev/verify/eabadce3-dd40-43d7-9dff-d6fa60a8c05e', // TODO: paste your verification link here
    description: [
      'Building a strong foundation in web development begins with understanding the essential technologies that power the modern web. Completing a course in HTML fundamentals demonstrates a commitment to developing technical knowledge, strengthening practical skills, and preparing for more advanced web development challenges.',
      'On October 11, 2026, the completion of the HTML Fundamentals course through CodeCred marked another step forward in the journey toward becoming a skilled web developer. This achievement reflects the importance of continuous learning and mastering the building blocks of website development, including the structure and organization of web content.',
      'With this foundation established, the next step is to apply these concepts to real-world projects, refine development techniques, and continue expanding the skills needed to create functional, accessible, and well-structured websites.',
     ],
    tags: [],
  },
]


// Wording of the modal depends on the kind of item.
const labelFor = (i: Item) =>
  i.certLabel ??
  (i.badge === 'Seminar' ? 'Certificate of Attendance' : i.badge === 'Workshop' ? 'Certificate of Participation' : 'Certificate of Completion')
const aboutFor = (i: Item) =>
  i.badge === 'Seminar' ? 'About This Seminar' : i.badge === 'Workshop' ? 'About This Workshop' : 'About This Certificate'

// "Issued Sept 04, 2025 - October 31, 2025" -> "2025"
const yearOf = (d: string) => d.match(/\d{4}/g)?.slice(-1)[0] ?? d

// Title split for the certificate modal: last two words get the blue-purple gradient.
const splitTitle = (t: string) => {
  const w = t.trim().split(/\s+/)
  const k = Math.max(w.length - 2, 0)
  return { plain: w.slice(0, k).join(' '), accent: w.slice(k).join(' ') }
}

const Ico = ({ children, size = 20 }: { children: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)
const IcoCert = () => (<Ico size={26}><path d="M5 4h11a2 2 0 0 1 2 2v6" /><path d="M5 4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" /><path d="M7 9h8M7 13h4" /><circle cx="17" cy="17" r="3" /><path d="m15.8 19.8-.8 2 2-1 2 1-.8-2" /></Ico>)
const IcoCap = () => (<Ico size={24}><path d="m2 9 10-5 10 5-10 5L2 9Z" /><path d="M6 11.5V16c0 1.2 2.7 3 6 3s6-1.8 6-3v-4.5" /><path d="M22 9v6" /></Ico>)
const IcoClock = () => (<Ico size={22}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>)
const IcoShield = () => (<Ico size={22}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></Ico>)
const IcoLink = () => (<Ico size={22}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></Ico>)
const IcoExternal = () => (<Ico size={18}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Ico>)
const IcoArrow = () => (<Ico size={18}><path d="M5 12h14M13 6l6 6-6 6" /></Ico>)

// Provider logo card (top right of the certificate modal).
const ProviderBrand = ({ venue, brand }: { venue: string; brand?: string }) => {
  const simpli = /simplilearn/i.test(venue)
  return (
    <div className="cd-brand">
      <div className="cd-brand__card">
        {simpli ? (
          <span className="cd-brand__word">
            <span className="cd-brand__a">simpli</span>
            <span className="cd-brand__b">learn</span>
          </span>
        ) : (
          <span className="cd-brand__word cd-brand__word--plain">{brand ?? venue}</span>
        )}
      </div>
      {simpli && (
        <span className="cd-brand__tag">
          <span>SKILL</span><i>•</i><span>BUILD</span><i>•</i><span>GROW</span>
        </span>
      )}
    </div>
  )
}

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

/* Certificate viewer. Same language as the Projects dialog: dark scrim, raised
   paper sheet, 1px line borders, navy type, orange accents. Colours come from
   the global tokens (with fallbacks) so light/dark follow the rest of the site. */
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
  background: rgba(6, 12, 26, 0.86);
  animation: cm-fade 0.22s ease both;
}
.cm__dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: 100%;
  border-radius: 22px;
  overflow: hidden;
  background: var(--paper, #ffffff);
  border: 1px solid var(--line-strong, rgba(11, 30, 63, 0.14));
  box-shadow: 0 50px 110px -30px rgba(0, 0, 0, 0.75);
  animation: cm-pop 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* Header */
.cm__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 12px 18px;
  border-bottom: 1px solid var(--line, rgba(11, 30, 63, 0.08));
}
.cm__badge {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: var(--orange, #ff7a1a);
  background: var(--tint, #eef1f7);
  box-shadow: inset 0 0 0 1px var(--line, rgba(11, 30, 63, 0.08));
}
.cm__badge svg { width: 20px; height: 20px; }
.cm__heading { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cm__eyebrow {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--orange-ink, #c2410c);
}
.cm__title {
  margin: 0;
  font-size: clamp(13px, 1.2vw, 15px);
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--navy, #0b1e3f);
  text-wrap: balance;
}
.cm__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--navy, #0b1e3f);
  background: var(--white, #fff);
  border: 1px solid var(--line-strong, rgba(11, 30, 63, 0.14));
  transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.15s ease, color 0.15s ease;
}
.cm__close svg { width: 14px; height: 14px; }
.cm__close:hover { transform: rotate(90deg); border-color: var(--orange, #ff7a1a); color: var(--orange, #ff7a1a); }

/* Stage + framed certificate */
.cm__stage {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: clamp(12px, 2vw, 20px);
  background: var(--tint, #eef1f7);
}
.cm__frame {
  max-width: 100%;
  line-height: 0;
  padding: 6px;
  border-radius: 14px;
  background: var(--white, #fff);
  border: 1px solid var(--line-strong, rgba(11, 30, 63, 0.14));
  box-shadow: 0 24px 50px -28px rgba(6, 12, 26, 0.55);
}
.cm__img {
  display: block;
  max-width: 100%;
  max-height: min(50dvh, calc(100dvh - 250px));
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 9px;
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
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--navy, #0b1e3f);
  background: var(--paper, #fff);
  border: 1px solid var(--line-strong, rgba(11, 30, 63, 0.14));
  box-shadow: 0 8px 20px -10px rgba(6, 12, 26, 0.6);
  transition: transform 0.2s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.cm__nav svg { width: 15px; height: 15px; }
.cm__nav:hover { background: var(--navy, #0b1e3f); color: var(--orange, #ff7a1a); border-color: var(--navy, #0b1e3f); transform: translateY(-50%) scale(1.06); }
.cm__nav--prev { left: -12px; }
.cm__nav--next { right: -12px; }
.cm__nav--next svg { transform: rotate(180deg); }
.cm__nav:focus-visible, .cm__thumb:focus-visible { outline: 2px solid var(--orange, #ff7a1a); outline-offset: 2px; }
.cm__count {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.06em;
  color: var(--cream, #fff);
  background: var(--navy, #0b1e3f);
}
.cm__thumbs {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 0 14px 14px;
  background: var(--tint, #eef1f7);
}
.cm__thumb {
  flex: none;
  width: 60px;
  height: 42px;
  padding: 0;
  border: 1px solid var(--line-strong, rgba(11, 30, 63, 0.14));
  border-radius: 9px;
  overflow: hidden;
  cursor: pointer;
  background: var(--white, #fff);
  opacity: 0.55;
  transition: opacity 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.cm__thumb:hover { opacity: 0.9; transform: translateY(-1px); }
.cm__thumb--active { opacity: 1; border-color: var(--orange, #ff7a1a); box-shadow: 0 0 0 2px var(--orange, #ff7a1a); }
.cm__thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }

/* Footer */
.cm__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 12px 16px 14px 18px;
  border-top: 1px solid var(--line, rgba(11, 30, 63, 0.08));
}
.cm__meta { min-width: 0; font-size: 12px; line-height: 1.4; color: var(--muted, #5b6b83); }
.cm__meta strong { color: var(--navy, #0b1e3f); font-weight: 700; }
.cm__actions { display: flex; align-items: center; gap: 8px; }
.cm__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.15s ease;
}
.cm__btn svg { flex: none; }
.cm__btn--primary { color: var(--cream, #fff); background: var(--navy, #0b1e3f); }
.cm__btn--primary svg { color: var(--orange, #ff7a1a); }
.cm__btn--primary:hover { transform: translateY(-1px); box-shadow: 0 12px 24px -14px rgba(11, 30, 63, 0.85); }
.cm__btn--ghost {
  color: var(--navy, #0b1e3f);
  background: var(--white, #fff);
  box-shadow: inset 0 0 0 1px var(--line-strong, rgba(11, 30, 63, 0.14));
}
.cm__btn--ghost:hover { box-shadow: inset 0 0 0 1px var(--orange, #ff7a1a); }
.cm__close:focus-visible, .cm__btn:focus-visible { outline: 2px solid var(--orange, #ff7a1a); outline-offset: 2px; }

/* Dark mode: the navy button would vanish into the sheet, so flip it. */
[data-theme='dark'] .cm__btn--primary { color: var(--navy, #0b1e3f); background: var(--cream, #edf0f6); }
[data-theme='dark'] .cm__nav:hover { background: var(--cream, #edf0f6); color: var(--navy, #0b1e3f); border-color: var(--cream, #edf0f6); }
[data-theme='dark'] .cm__count { color: var(--navy, #0b1e3f); background: var(--cream, #edf0f6); }
[data-theme='dark'] .cm__eyebrow { color: #ff9a4d; }

@keyframes cm-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes cm-pop {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}

@media (max-width: 560px) {
  .cm__dialog { border-radius: 18px; }
  .cm__nav--prev { left: 6px; }
  .cm__nav--next { right: 6px; }
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
  const [showAllSeminars, setShowAllSeminars] = useState(false)
  const [showAllCerts, setShowAllCerts] = useState(false)
  const containerRef = useRef<HTMLElement>(null)

  // Credentials listed here appear under "Seminars" instead of "Certifications".
  const IN_SEMINARS = ['cert-1']
  const seminarList = [...SEMINARS, ...CERTIFICATIONS.filter((i) => IN_SEMINARS.includes(i.id))]
  const certList = CERTIFICATIONS.filter((i) => !IN_SEMINARS.includes(i.id))
  const LIMIT = 4
  const shownSeminars = showAllSeminars ? seminarList : seminarList.slice(0, LIMIT)
  const shownCerts = showAllCerts ? certList : certList.slice(0, LIMIT)

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

  // Handle wheel events with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      // Forcefully intercept high-polling gaming mouse delta inputs and scroll the container directly
      e.preventDefault()
      e.stopPropagation()
      container.scrollTop += e.deltaY * 0.5
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', onWheel)
    }
  }, [])

  const renderCard = (item: Item) => (
    <article key={item.id} className="seminars-card">
      <button
        type="button"
        className="seminars-card__image-wrap"
        onClick={() => setActiveItem(item)}
        aria-label={`View full details for ${item.title}`}
      >
        <img src={item.image} alt="" className="seminars-card__image" loading="lazy" />
      </button>
      <div className="seminars-card__body">
        <h3 className="seminars-card__name" title={item.title}>
          {item.title}
        </h3>
        <p className="seminars-card__meta">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 21h18" />
            <path d="M5 21V10l7-5 7 5v11" />
            <path d="M9 21v-5h6v5" />
          </svg>
          <span>{item.venue}</span>
        </p>
        <p className="seminars-card__meta">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
          <span>{yearOf(item.date)}</span>
        </p>
        <button
          type="button"
          className="seminars-card__link"
          onClick={() => setActiveItem(item)}
        >
          <span>View certificate</span>
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </article>
  )

  return (
    <section
      ref={containerRef}
      className="seminars-page"
      aria-labelledby="seminars-title"
      style={{
        maxHeight: '100vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <style>{CERT_MODAL_CSS}</style>
      <div className="seminars-page__inner">
        {/* Top bar */}
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
          <span className="seminars__eyebrow">
            <span className="seminars__eyebrow-line" aria-hidden="true" />
            Professional Growth
          </span>
        </div>

        {/* Header */}
        <header className="seminars__header">
          <h1 id="seminars-title" className="seminars__title">
            Seminars &amp; <span className="seminars__title-accent">Certifications</span>
          </h1>
          <p className="seminars__lede">
            Continuous learning and practical workshops that expand my knowledge in modern engineering,
            architecture, and technology leadership.
          </p>
        </header>

        <hr className="seminars__rule" />

        {/* Section 1: Seminars */}
        {seminarList.length > 0 && (
          <section className="seminars__section" aria-labelledby="sec-seminars-title">
            <div className="seminars__sec-head">
              <div className="seminars__sec-title-row">
                <h2 id="sec-seminars-title" className="seminars__sec-title">Seminars</h2>
                <span className="seminars__sec-badge">{seminarList.length}</span>
                <p className="seminars__sec-sub">Industry talks and hands-on workshops I&rsquo;ve attended.</p>
              </div>
              {seminarList.length > LIMIT && (
                <button type="button" className="seminars__viewall" onClick={() => setShowAllSeminars((v) => !v)}>
                  {showAllSeminars ? 'Show Less' : 'View All Seminars'}
                </button>
              )}
            </div>
            <div className="seminars__grid">{shownSeminars.map(renderCard)}</div>
          </section>
        )}

        {/* Section 2: Certifications */}
        {certList.length > 0 && (
          <section className="seminars__section" aria-labelledby="sec-certs-title">
            <div className="seminars__sec-head">
              <div className="seminars__sec-title-row">
                <h2 id="sec-certs-title" className="seminars__sec-title">Certifications</h2>
                <span className="seminars__sec-badge">{certList.length}</span>
                <p className="seminars__sec-sub">Credentials and degrees that validate my technical skills.</p>
              </div>
              {certList.length > LIMIT && (
                <button type="button" className="seminars__viewall" onClick={() => setShowAllCerts((v) => !v)}>
                  {showAllCerts ? 'Show Less' : 'View All Certifications'}
                </button>
              )}
            </div>
            <div className="seminars__grid">{shownCerts.map(renderCard)}</div>
          </section>
        )}

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
                className="seminar-detail-modal__dialog cd-dialog"
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <div className="cd-top">
                  <span className="cd-top__icon"><IcoCert /></span>
                  <div className="cd-top__meta">
                    <strong>{labelFor(activeItem)}</strong>
                    <span>{activeItem.date} • {activeItem.readTime}</span>
                  </div>
                  <button type="button" className="cd-close" onClick={closeDetail} aria-label="Close modal">
                    <X size={18} weight="bold" />
                  </button>
                </div>

                <div className="cd-hero">
                  <h2 id="detail-modal-title" className="cd-title">
                    {splitTitle(activeItem.title).plain && (
                      <span className="cd-title__plain">{splitTitle(activeItem.title).plain}</span>
                    )}
                    <span className="cd-title__accent">{splitTitle(activeItem.title).accent}</span>
                  </h2>
                  <ProviderBrand venue={activeItem.venue} brand={activeItem.brand} />
                </div>

                <div className="cd-author">
                  <span className="cd-author__ring">
                    <img src={aboutCard1} alt="Jean Marc Aguilar" className="cd-author__img" />
                  </span>
                  <div className="cd-author__info">
                    <strong>Jean Marc Aguilar</strong>
                    <span>{activeItem.role} • {activeItem.venue}</span>
                  </div>
                </div>

                <div className="cd-banner">
                  <img src={activeItem.image} alt={activeItem.title} />
                </div>

                <section className="cd-about">
                  <span className="cd-about__icon"><IcoCap /></span>
                  <div className="cd-about__body">
                    <h3>{aboutFor(activeItem)}</h3>
                    {toParagraphs(activeItem.description).map((p, i) => {
                      if (p.startsWith('### ')) return <h4 key={i}>{p.slice(4)}</h4>
                      if (p.startsWith('## ')) return <h4 key={i}>{p.slice(3)}</h4>
                      return <p key={i}>{p}</p>
                    })}
                  </div>
                </section>

                <div className="cd-stats">
                  {activeItem.duration && (
                    <div className="cd-stat">
                      <span className="cd-stat__icon"><IcoClock /></span>
                      <div><strong>{activeItem.duration}</strong><span>Course Duration</span></div>
                    </div>
                  )}
                  <div className="cd-stat">
                    <span className="cd-stat__icon cd-stat__icon--green"><IcoShield /></span>
                    <div><strong>Verified Certificate</strong><span>Authentic &amp; Trusted</span></div>
                  </div>
                  {activeItem.verifyUrl && (
                    <a
                      className="cd-stat cd-stat--link"
                      href={activeItem.verifyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="cd-stat__icon"><IcoLink /></span>
                      <div><strong>Verify Certificate</strong><span>Open in new tab</span></div>
                    </a>
                  )}
                </div>

                <button type="button" className="cd-cta" onClick={openCert}>
                  <IcoExternal />
                  <span>View Certificate</span>
                  <IcoArrow />
                </button>
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
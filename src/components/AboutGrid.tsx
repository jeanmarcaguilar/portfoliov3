import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, GraduationCap, Stack, Briefcase } from '@/components/slab'
import { profile } from '@/data/profile'
import aboutCard1 from '@/assets/images/about_card_1.jpg'
import aboutCard2 from '@/assets/images/about_card_2.jpg'
import aboutCard3 from '@/assets/images/about_card_3.jpg'
import aboutCard4 from '@/assets/images/about_card_4.png'

const SHUFFLE_PHOTOS = [aboutCard1, aboutCard2, aboutCard3, aboutCard4]

type ExperienceItem = {
  role: string
  company: string
  date: string
  bullets: string[]
  tags: string[]
}

const EXPERIENCES: ExperienceItem[] = [
  {
    role: 'On-the-Job Training — Administrative Division',
    company: 'Commission on Human Rights',
    date: 'Oct 2025 — Jan 2026',
    bullets: [
      'Provided basic IT support by troubleshooting software applications and resolving day-to-day technical issues.',
      'Assisted with handling records and documentation for the Administrative Division.',
      'Maintained digital assets and internal resources to keep office systems organized and accessible.',
      'Created visual materials such as flyers, posters, and presentations to support organizational communication.',
    ],
    tags: ['IT Support', 'Documentation', 'Graphic Design'],
  },
  {
    role: 'Full-Stack Developer',
    company: 'Microfinancial — Capstone | School Management System',
    date: '2025 — 2026',
    bullets: [
      'Developed two full stack web applications from database design through deployment.',
      'Built a School Management System using PHP, MySQL, JSON, and RESTful APIs.',
      'Delivered a Capstone Project on the Laravel framework using PHP, JSON, and RESTful APIs.',
    ],
    tags: ['PHP', 'Laravel', 'MySQL', 'RESTful APIs', 'JSON'],
  },
  {
    role: 'Full-Stack Developer',
    company: 'Bestlink College of the Philippines',
    date: '2024 — 2025',
    bullets: [
      'Developed full stack web applications, including a Parking Management System.',
      'Implemented database management and backend functionality using PHP, JSON, and MySQL.',
      'Integrated RESTful APIs to support system integration and data exchange.',
    ],
    tags: ['PHP', 'MySQL', 'RESTful APIs'],
  },
]

export default function AboutGrid() {
  const [photoIndex, setPhotoIndex] = useState(0)
  const [isFlipping, setIsFlipping] = useState(false)

  const handleShuffle = () => {
    setIsFlipping(true)
    setTimeout(() => {
      setPhotoIndex((prev) => (prev + 1) % SHUFFLE_PHOTOS.length)
      setIsFlipping(false)
    }, 140)
  }

  // Check if device has touch support (mobile)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  const handleWheel = (e: React.WheelEvent<HTMLElement>) => {
    // Forcefully intercept high-polling gaming mouse delta inputs and scroll the container directly
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    target.scrollTop += e.deltaY * 0.5
  }

  return (
    <section
      className="pgrid agrid"
      aria-labelledby="about-title"
      onWheel={!isTouchDevice ? handleWheel : undefined}
      style={{
        maxHeight: isTouchDevice ? 'none' : '100vh',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <header className="pgrid__head">
        <span className="pgrid__eyebrow">About</span>
        <h1 className="pgrid__title" id="about-title">
          {`Hi, I’m ${profile.firstName}.`}
        </h1>
        <p className="pgrid__lede">
          Full-Stack Web Developer crafting modern, scalable, and user-focused digital solutions.
        </p>
      </header>

      {/* Single Unified Container for About Main Content */}
      <div className="home__glass agrid__glass agrid__main-container">
        {/* Top Hero Section: Bio + Stats on Left, Shuffle Image on Right */}
        <div className="agrid__hero-split">
          <div className="agrid__hero-left">
            <p className="agrid__lead">
              As a Web Designer and Developer, I combine creative design with thoughtful development
              to create digital experiences that are both visually engaging and easy to use. I
              believe great websites should not only look good but also feel intuitive, perform
              smoothly, and communicate ideas clearly.
            </p>

            <p className="agrid__note">
              I enjoy turning concepts into responsive, functional, and polished digital products.
              From shaping the visual direction to building the final experience, I focus on every
              detail to ensure the result is reliable, accessible, and designed with the user in
              mind.
            </p>

            {/* Interactive Proof Stat Cards */}
            <div className="astats">
              <div className="astats__grid">
                <Link to="/projects" className="astats__card" aria-label="06+ Full-Stack Projects">
                  <div className="astats__card-top">
                    <span className="astats__num">06+</span>
                    <span className="astats__arrow" aria-hidden="true">
                      <ArrowUpRight size={14} weight="bold" />
                    </span>
                  </div>
                  <span className="astats__label">Full-Stack Projects</span>
                </Link>

                <Link to="/tech-stack" className="astats__card" aria-label="10+ Core Technologies">
                  <div className="astats__card-top">
                    <span className="astats__num">10+</span>
                    <span className="astats__arrow" aria-hidden="true">
                      <ArrowUpRight size={11} weight="bold" />
                    </span>
                  </div>
                  <span className="astats__label">Core Technologies</span>
                </Link>

                <a
                  href="https://github.com/jeanmarcaguilar"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="astats__card"
                  aria-label="270+ GitHub Contributions"
                >
                  <div className="astats__card-top">
                    <span className="astats__num">270+</span>
                    <span className="astats__arrow" aria-hidden="true">
                      <ArrowUpRight size={11} weight="bold" />
                    </span>
                  </div>
                  <span className="astats__label">GitHub Contributions</span>
                </a>

                <Link
                  to="/seminars"
                  className="astats__card astats__card--wide"
                  aria-label="03 Seminars Attended"
                >
                  <div className="astats__card-top">
                    <span className="astats__num">03</span>
                    <span className="astats__arrow" aria-hidden="true">
                      <ArrowUpRight size={11} weight="bold" />
                    </span>
                  </div>
                  <span className="astats__label">Seminars Attended</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Shuffle Image Card */}
          <div
            className="about-shuffle"
            onClick={handleShuffle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleShuffle()
              }
            }}
            aria-label="Click to shuffle pictures of Jean Marc"
          >
            <img
              key={photoIndex}
              src={SHUFFLE_PHOTOS[photoIndex]}
              alt={`Jean Marc - Photo ${photoIndex + 1}`}
              className={`about-shuffle__img ${isFlipping ? 'about-shuffle__img--exit' : 'about-shuffle__img--enter'}`}
              loading="eager"
            />
            <span className="about-shuffle__badge">
              <span>Click to shuffle</span>
            </span>
          </div>
        </div>

        {/* Education & Stack Grid */}
        <div className="about-grid-duo">
          {/* Education Card */}
          <div className="about-card">
            <div className="about-card__header">
              <div className="about-card__icon-badge" aria-hidden="true">
                <GraduationCap size={22} weight="bold" />
              </div>
              <div className="about-card__head-text">
                <h2 className="about-card__title">Education</h2>
                <span className="about-card__subtitle">Where the foundation was built.</span>
              </div>
            </div>
            <p className="about-card__body">
              My journey in technology is grounded in a Bachelor of Science in Information Technology,
              where I developed a strong foundation in software development, system design, and modern
              engineering practices. Through academic projects and hands-on experience, I transformed
              that foundation into practical skills for building reliable, user-focused digital
              solutions.
            </p>
          </div>

          {/* Stack Card */}
          <div className="about-card">
            <div className="about-card__header">
              <div className="about-card__icon-badge" aria-hidden="true">
                <Stack size={22} weight="bold" />
              </div>
              <div className="about-card__head-text">
                <h2 className="about-card__title">Stack</h2>
                <span className="about-card__subtitle">Tools I reach for every day.</span>
              </div>
            </div>
            <p className="about-card__body">
              I specialize in full-stack web development, working across React, JavaScript, PHP,
              Laravel, Blade, Tailwind CSS, MySQL, and RESTful APIs. From crafting responsive
              interfaces to engineering complete backend systems, I focus on creating scalable
              solutions that are performant, maintainable, and built around real-world user needs.
            </p>
          </div>
        </div>

        {/* Experience Section with Vertical Timeline */}
        <section className="about-experience" aria-labelledby="experience-title">
          <div className="about-experience__head">
            <div className="about-card__icon-badge" aria-hidden="true">
              <Briefcase size={22} weight="bold" />
            </div>
            <div className="about-experience__head-text">
              <h2 id="experience-title" className="about-experience__title">
                Experience
              </h2>
              <span className="about-experience__subtitle">
                Roles and projects that shaped how I build.
              </span>
            </div>
          </div>

          <div className="about-experience__timeline">
            {EXPERIENCES.map((exp, idx) => (
              <article key={idx} className="about-exp-item">
                <span className="about-exp-item__dot" aria-hidden="true" />
                <div className="about-exp-item__top">
                  <h3 className="about-exp-item__role">{exp.role}</h3>
                  <span className="about-exp-item__date">{exp.date}</span>
                </div>
                <p className="about-exp-item__company">{exp.company}</p>
                <ul className="about-exp-item__bullets">
                  {exp.bullets.map((bullet, bIdx) => (
                    <li key={bIdx} className="about-exp-item__bullet">
                      {bullet}
                    </li>
                  ))}
                </ul>
                <div className="about-exp-item__tags">
                  {exp.tags.map((tag) => (
                    <span key={tag} className="about-exp-item__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}
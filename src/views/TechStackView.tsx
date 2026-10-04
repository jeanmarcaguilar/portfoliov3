import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from '@/components/slab'

type Tech = {
  name: string
  desc: string
  icon: string
}

type TechSection = {
  title: string
  techs: Tech[]
}

const TECH_SECTIONS: TechSection[] = [
  {
    title: 'Design & Prototyping',
    techs: [
      { name: 'Figma', desc: 'Designing interfaces before I build them.', icon: 'https://cdn.simpleicons.org/figma' },
      { name: 'Framer', desc: 'Prototyping motion and interactive layouts.', icon: 'https://cdn.simpleicons.org/framer' },
    ],
  },
  {
    title: 'Frontend Development',
    techs: [
      { name: 'HTML5', desc: 'Semantic markup as the foundation of every page.', icon: 'https://cdn.simpleicons.org/html5' },
      { name: 'CSS3', desc: 'Styling, layout, and responsive design fundamentals.', icon: 'https://cdn.simpleicons.org/css3' },
      { name: 'JavaScript', desc: 'Core language for interactive, dynamic UI.', icon: 'https://cdn.simpleicons.org/javascript' },
      { name: 'TypeScript', desc: 'Type-safe JavaScript for fewer runtime surprises.', icon: 'https://cdn.simpleicons.org/typescript' },
      { name: 'React', desc: 'Building fast, component-driven interfaces.', icon: '/icons/ai/react.svg' },
      { name: 'Tailwind CSS', desc: 'Utility-first styling for rapid, consistent design.', icon: '/icons/ai/tailwindcss.svg' },
      { name: 'Vite', desc: 'Lightning-fast dev server and build tooling.', icon: '/icons/ai/vite.svg' },
    ],
  },
  {
    title: 'Backend & Database',
    techs: [
      { name: 'Node.js', desc: 'JavaScript runtime for backend services.', icon: '/icons/ai/nodedotjs.svg' },
      { name: 'Laravel', desc: 'Elegant MVC framework for robust backends.', icon: 'https://cdn.simpleicons.org/laravel' },
      { name: 'Python', desc: 'General-purpose language for scripting and backends.', icon: 'https://cdn.simpleicons.org/python' },
      { name: 'MySQL', desc: 'Relational database for structured, reliable data.', icon: 'https://cdn.simpleicons.org/mysql' },
      { name: 'Rest API', desc: 'Designing and consuming clean, scalable APIs.', icon: 'https://cdn.simpleicons.org/fastapi' },
    ],
  },
  {
    title: 'AI & Machine Learning',
    techs: [
      { name: 'ChatGPT', desc: 'Brainstorming, debugging, and drafting alongside AI.', icon: '/icons/openai.svg' },
      { name: 'Claude Code', desc: 'AI-assisted coding for faster, cleaner builds.', icon: '/icons/claude-code-logo.png' },
      { name: 'Hugging Face', desc: 'Exploring and experimenting with ML models.', icon: 'https://cdn.simpleicons.org/huggingface' },
      { name: 'Open AI', desc: 'Building and integrating AI-powered features.', icon: '/icons/openai.svg' },
    ],
  },
  {
    title: 'Productivity, Deployment & Tools',
    techs: [
      { name: 'Git', desc: 'Version control for tracking every change.', icon: 'https://cdn.simpleicons.org/git' },
      { name: 'GitHub', desc: 'Hosting, collaboration, and CI for my projects.', icon: '/icons/ai/github.svg' },
      { name: 'VS Code', desc: 'My daily driver for writing and debugging code.', icon: '/icons/vscode.svg' },
      { name: 'Discord', desc: 'Staying connected with dev communities.', icon: '/icons/discord.svg' },
    ],
  },
]

export default function TechStackView() {
  const navigate = useNavigate()

  return (
    <section
      className="techstack-page"
      aria-labelledby="techstack-title"
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
      <div className="techstack-page__inner">
        {/* Top nav */}
        <div className="techstack-page__top">
          <button
            type="button"
            onClick={() => navigate('/about')}
            className="techstack__back-btn"
            aria-label="Back to About page"
          >
            <ArrowLeft size={15} weight="bold" />
            <span>Back</span>
          </button>
          <div className="techstack__eyebrow">
            <span className="techstack__eyebrow-dot" aria-hidden="true" />
            <span>Technologies</span>
          </div>
        </div>

        {/* Header */}
        <header className="techstack__header">
          <h1 id="techstack-title" className="techstack__title">
            Tech <span className="techstack__title-accent">Stack</span>
          </h1>
          <p className="techstack__lede">
            The technologies, frameworks, and tools I reach for when designing and engineering full-stack digital products.
          </p>
        </header>

        {/* Sections */}
        <div className="techstack__sections">
          {TECH_SECTIONS.map((section, index) => (
            <section key={section.title} className="techstack__section" style={{ animationDelay: `${index * 0.15}s` } as React.CSSProperties}>
              <h2 className="techstack__sec-title">
                <span className="techstack__sec-bar" aria-hidden="true" />
                {section.title}
              </h2>
              <div className="techstack__grid">
                {section.techs.map((tech) => (
                  <div key={tech.name} className="tech-card">
                    <div className="tech-card__icon-wrap">
                      <img src={tech.icon} alt={tech.name} className="tech-card__icon" loading="lazy" decoding="async" />
                    </div>
                    <div className="tech-card__body">
                      <span className="tech-card__name">{tech.name}</span>
                      <span className="tech-card__desc">{tech.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  )
}

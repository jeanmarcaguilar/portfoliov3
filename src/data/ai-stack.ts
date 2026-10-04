/**
 * The systems tree shown in the Projects "systems" pop-up (and as chips on
 * Home and in the Projects bento card).
 *
 * This file is the ONLY place node copy lives. AIStack.tsx and AIStackGrid.tsx
 * render whatever shape they find here, so swapping in content is a data edit
 * and never a JSX edit. Keep the exported names and types stable.
 *
 * Every value below is a PLACEHOLDER. Shape rules:
 * - The root is you. Its children are the categories (branches).
 * - A branch with `status` is itself a system; a branch without one is a
 *   group whose children are the systems.
 * - Status is what the thing actually does today: "Live" (in use by others),
 *   "Internal" (works, you use it), "Beta".
 * - Logo marks in AIStackGrid.tsx are keyed by the node `id` below.
 */

import {
  Sparkle,
  Coffee,
  Robot,
  Article,
  FilmSlate,
  UsersThree,
  Database,
  ChatCircleDots,
  FlowArrow,
  Browser,
  Broadcast,
  Timer,
} from '@/components/slab'
import type { Icon } from '@/components/slab'
import { profile } from '@/data/profile'

export type StackStatus = 'Live' | 'Internal' | 'Beta'

/** A vendor mark, masked to a single ink colour so the row reads as one set
 *  rather than a rainbow of brand palettes. Only marks that already exist in
 *  public/icons are listed. */
export type StackLogo = { src: string; name: string }

export type StackNode = {
  id: string
  name: string
  /** One plain sentence a non-technical client understands. */
  what: string
  /** Real stack / model / where it runs. Rendered small and muted. */
  stack?: string
  status?: StackStatus
  /** Phosphor glyph for the card's mark tile. Every node has one. */
  Icon: Icon
  logos?: StackLogo[]
  children?: StackNode[]
}

/** Single root: you. Branches are the categories. */
export const aiStack: StackNode = {
  id: 'root',
  Icon: Sparkle,
  name: profile.name,
  what: 'Tools and technologies I work with for development and design.',
  stack: 'Development Stack',
  children: [
    { id: 'figma', Icon: Sparkle, name: 'Figma', what: 'Design and prototyping tool for UI/UX', status: 'Live' },
    { id: 'framer', Icon: Browser, name: 'Framer', what: 'Interactive design and animation platform', status: 'Live' },
    { id: 'html5', Icon: Article, name: 'HTML5', what: 'Markup language for web structure', status: 'Live' },
    { id: 'css3', Icon: Database, name: 'CSS3', what: 'Styling and layout for web pages', status: 'Live' },
    { id: 'javascript', Icon: Coffee, name: 'JavaScript', what: 'Dynamic web programming language', status: 'Live' },
    { id: 'typescript', Icon: Robot, name: 'TypeScript', what: 'Typed superset of JavaScript', status: 'Live' },
    { id: 'react', Icon: FlowArrow, name: 'React', what: 'Frontend JavaScript library', status: 'Live' },
    { id: 'tailwind', Icon: Timer, name: 'Tailwind CSS', what: 'Utility-first CSS framework', status: 'Live' },
    { id: 'vite', Icon: Broadcast, name: 'Vite', what: 'Fast build tool and dev server', status: 'Live' },
    { id: 'nodejs', Icon: UsersThree, name: 'Node.js', what: 'JavaScript runtime for backend', status: 'Live' },
    { id: 'laravel', Icon: FilmSlate, name: 'Laravel', what: 'PHP web application framework', status: 'Live' },
    { id: 'python', Icon: ChatCircleDots, name: 'Python', what: 'General-purpose programming language', status: 'Live' },
    { id: 'mysql', Icon: Database, name: 'MySQL', what: 'Relational database management system', status: 'Live' },
    { id: 'rest-api', Icon: FlowArrow, name: 'REST API', what: 'API architecture for web services', status: 'Live' },
    { id: 'chatgpt', Icon: Robot, name: 'ChatGPT', what: 'AI assistant for development and problem-solving', status: 'Live' },
    { id: 'claude-code', Icon: Sparkle, name: 'Claude Code', what: 'AI coding assistant for development', status: 'Live' },
    { id: 'hugging-face', Icon: Broadcast, name: 'Hugging Face', what: 'Platform for AI models and ML tools', status: 'Live' },
    { id: 'openai', Icon: Robot, name: 'Open AI', what: 'AI research and API platform', status: 'Live' },
    { id: 'git', Icon: FlowArrow, name: 'Git', what: 'Version control system', status: 'Live' },
    { id: 'github', Icon: UsersThree, name: 'GitHub', what: 'Code hosting and collaboration platform', status: 'Live' },
    { id: 'vscode', Icon: Article, name: 'VS Code', what: 'Code editor for development', status: 'Live' },
    { id: 'discord', Icon: ChatCircleDots, name: 'Discord', what: 'Communication and collaboration platform', status: 'Live' },
  ],
}

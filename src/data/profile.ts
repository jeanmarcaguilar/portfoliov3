/**
 * YOUR IDENTITY - start here.
 *
 * Everything that says who you are lives in this file: name, handle, photo,
 * socials, email and the Home headline. Every value below is a PLACEHOLDER.
 * Replace the text, or hand this file to your AI assistant and tell it what
 * to put in each field.
 *
 * Page-specific copy (projects, services, testimonials, FAQs) lives in the
 * other files in src/data/ and at the top of each view component.
 */

import { Briefcase, SealCheck, Clock, type Icon } from '@/components/slab'

export type SocialLink = {
  label: string
  href: string
  iconPath: string
}

/** A proof fact on the phone's Home: a glyph, a short value, a caption. */
export type Stat = { value: string; label: string; Icon: Icon }

export type Profile = {
  name: string
  /** First name, used in "Hi, I'm ___." on About. */
  firstName: string
  handle: string
  /** Short role line under the handle on phones. */
  role: string
  /** Square image. An SVG, WebP or PNG with a transparent background looks best. */
  avatarSrc: string
  /** Tooltip / screen-reader label on the verified tick next to your name. */
  verifiedLabel: string
  email: string
  location: string
  /** GitHub username for fetching contribution data */
  githubUsername: string
  /** Manual GitHub contribution stats (more accurate than API) */
  githubStats?: {
    totalCommits: number
    streak: number
    bestDay: number
  }
  /** Three short proof facts shown on phones under the Home lede. */
  stats: Stat[]
  displayName: { line1: string; line2: string }
  hero: {
    body: string
    portraitSrc: string
    portraitAlt: string
  }
  socials: SocialLink[]
}

export const profile: Profile = {
  name: 'Jean Marc Aguilar',
  firstName: 'Jean Marc',
  handle: '@jeanmarcdev',
  role: 'Web Designer & Developer',
  avatarSrc: '/jiim.png',
  verifiedLabel: 'PLACEHOLDER - what the tick means (e.g. a certification)',
  email: 'jeanmarcaguilar829@gmail.com',
  location: 'PLACEHOLDER - your city or timezone',
  githubUsername: 'jeanmarcaguilar',
  // Real contribution stats — scraped October 2026
  githubStats: {
    totalCommits: 233,
    streak: 8,
    bestDay: 20,
  },
  // Pick any icon from https://phosphoricons.com and import it above.
  stats: [
    { value: '2025-2026', label: 'Graduated', Icon: Briefcase },
    { value: 'BSIT', label: 'Degree', Icon: SealCheck },
    { value: 'GMT+8', label: 'Timezone', Icon: Clock },
  ],
  // The intro types this line, then flies it into the Home headline.
  // Keep it short: two halves, 5-8 words total.
  displayName: { line1: 'Code clean.', line2: 'Scale without limits.' },
  hero: {
    body: 'I craft intuitive digital experiences for modern brands and ambitious founders.',
    portraitSrc: '/images/about_card_1.jpg',
    portraitAlt: 'Jean Marc',
  },
  socials: [
    { label: 'Facebook profile', href: 'https://www.facebook.com/jiimmmmmmmmmmmmmmmmmmmmmmm/', iconPath: '/icons/facebook.svg' },
    { label: 'LinkedIn profile', href: 'https://www.linkedin.com/in/jiim/', iconPath: '/icons/linkedin.svg' },
    { label: 'Instagram profile', href: 'https://www.instagram.com/whotfisjiim/', iconPath: '/icons/instagram.svg' },
  ],
}

export type AppStat = { value: string; label: string }

export type AppProject = {
  name: string
  tagline: string
  description: string
  /** Optional - omit for gradient placeholder cards */
  imageSrc?: string
  /** CSS object-position override. Defaults to 'top center'. */
  imagePosition?: string
  /** External brand color - not a site token. Passed via --app-color inline prop. */
  accentColor: string
  stats: AppStat[]
  badge: string
}

/** @deprecated use AppProject */
export type MobileApp = AppProject

/**
 * Your apps. Every value is a PLACEHOLDER. Screenshots live in
 * public/placeholders/ - swap in your own (960x514 works well).
 */
const STATS: AppStat[] = [
  { value: '0', label: 'Stat one' },
  { value: '0', label: 'Stat two' },
  { value: '0', label: 'Stat three' },
]

const DESC = 'PLACEHOLDER - tell me what to put here: what the app does, who it is for, and where it is published.'

export const mobileApps: MobileApp[] = [
  {
    name: 'FleetFlow',
    tagline: 'Smart fleet tracking and dynamic route optimization.',
    description: 'Monitor vehicle locations in real time, cut unnecessary fuel consumption, and streamline daily dispatching across your entire fleet. Access predictive analytics, maintenance alerts, and driver performance metrics in a single, intuitive dashboard.',
    imageSrc: '/placeholders/FleetFlow.jpg',
    imagePosition: '50% 30%',
    accentColor: '#2563EB',
    stats: [
      { value: 'Android', label: 'PLATFORM' },
      { value: 'Play Store', label: 'OPEN BETA' },
      { value: 'PHP / MySQL', label: 'BACKEND' },
    ],
    badge: 'Beta',
  },
  {
    name: 'Cartly',
    tagline: 'Shop smarter. Curated local marketplace.',
    description: 'Cartly brings your favorite verified local merchants, flash collections, and seamless checkout into a refined, lightning-fast mobile experience. Track deliveries in real time with end-to-end order transparency.',
    imageSrc: '/placeholders/Cartly.png',
    accentColor: '#7C3AED',
    stats: [
      { value: 'React Native', label: 'FRAMEWORK' },
      { value: 'Multi-Vendor', label: 'ECOSYSTEM' },
      { value: 'Direct Pay', label: 'CHECKOUT' },
    ],
    badge: 'Beta',
  },
  {
    name: 'Sauyo Rescue',
    tagline: 'Emergency help, just one tap away.',
    description: 'Community-focused emergency response app designed for Barangay Sauyo, connecting residents with verified local responders during medical emergencies, fires, and disaster relief with one-tap SOS and live GPS beacon sharing.',
    imageSrc: '/placeholders/Rescue.png',
    accentColor: '#16A34A',
    stats: [
      { value: '1-Tap SOS', label: 'DISPATCH' },
      { value: 'Real-Time', label: 'GPS TELEMETRY' },
      { value: '100% Free', label: 'PUBLIC SAFETY' },
    ],
    badge: 'Community',
  },
]

export const webApps: AppProject[] = [
  {
    name: 'Web App One',
    tagline: 'PLACEHOLDER - one-line tagline.',
    description: DESC,
    accentColor: '#0EA5E9',
    stats: STATS,
    badge: 'Badge',
  },
  {
    name: 'Web App Two',
    tagline: 'PLACEHOLDER - one-line tagline.',
    description: DESC,
    accentColor: '#EF4444',
    stats: STATS,
    badge: 'Badge',
  },
  {
    name: 'Web App Three',
    tagline: 'PLACEHOLDER - one-line tagline.',
    description: DESC,
    imageSrc: '/placeholders/project-3.jpg',
    accentColor: '#0891B2',
    stats: STATS,
    badge: 'Badge',
  },
  {
    name: 'Web App Four',
    tagline: 'PLACEHOLDER - one-line tagline.',
    description: DESC,
    imageSrc: '/placeholders/project-4.jpg',
    accentColor: '#F59E0B',
    stats: STATS,
    badge: 'Badge',
  },
]

import { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useOutlet } from 'react-router-dom'
import TabBar from '@/components/TabBar'
import QuickMenu from '@/components/QuickMenu'
import Rail from '@/components/Rail'
import IntroOverlay from '@/components/IntroOverlay'
import CursorRing from '@/components/CursorRing'
import AccessMenu from '@/components/AccessMenu'
import WeatherModal from '@/components/WeatherModal'
import DevLoungeModal from '@/components/DevLoungeModal'
import { motionReduced } from '@/lib/a11y'
import { useLenis, SCROLLER_ID } from '@/hooks/useLenis'
import { useIsPhone } from '@/hooks/useMediaQuery'
import { getPerfTier, watchFrameHealth, PERF_TIER_EVENT } from '@/lib/perf'

// Lazy-load HeroCanvas so the 118KB Three.js bundle is fetched only
// when actually needed. Mobile + reduced-motion users skip the import
// entirely - the .hero-canvas CSS fallback (background:var(--cream))
// handles the visual baseline. PageSpeed showed Three.js had 76.6 KiB
// of unused JS; not loading it at all on mobile is the cleaner fix.
const HeroCanvas = lazy(() => import('@/components/HeroCanvasV2'))

/**
 * Page transition with no wait. The old page is cross-faded into the new one
 * the instant the route changes, using the View Transitions API (Chrome,
 * Edge, Safari 18+, Firefox 144+). Browsers without it swap instantly and
 * the new page fades in. The first load is skipped: the intro owns that.
 */
// Tab order, so the page can slide forward or back depending on where you go.
const ROUTE_ORDER = [
  '/',
  '/projects',
  '/services',
  '/showcase',
  '/testimonials',
  '/about',
  '/seminars',
  '/tech-stack',
  '/contact',
]

type VTDocument = Document & {
  startViewTransition?: (cb: () => void) => unknown
}

function PageTransition({ onSwap }: { onSwap: () => void }) {
  const { pathname } = useLocation()
  const outlet = useOutlet()
  const [shown, setShown] = useState({ path: pathname, outlet })
  const [fallbackIn, setFallbackIn] = useState(false)

  // Always the freshest route element, readable from callbacks.
  const latest = useRef({ path: pathname, outlet })
  latest.current = { path: pathname, outlet }

  useEffect(() => {
    if (pathname === shown.path) return

    const swap = () => {
      setShown(latest.current)
      onSwap()
    }

    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || motionReduced()
    const doc = document as VTDocument

    // Slide direction for the CSS: forward = towards a later tab.
    const from = ROUTE_ORDER.indexOf(shown.path)
    const to = ROUTE_ORDER.indexOf(pathname)
    const dir = from !== -1 && to !== -1 && to < from ? 'back' : 'forward'
    doc.documentElement.dataset.navDir = dir

    if (reduced) {
      swap()
    } else if (doc.startViewTransition) {
      // The browser snapshots the old page, runs this, then cross-fades to
      // the new DOM. flushSync makes React commit before the new snapshot.
      doc.startViewTransition(() => flushSync(swap))
    } else {
      swap()
      setFallbackIn(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Until the swap runs, keep showing the old page; afterwards the live one.
  const content = pathname === shown.path ? outlet : shown.outlet

  return (
    <div
      key={shown.path}
      className="page-transition"
      data-fallback-in={fallbackIn ? 'true' : undefined}
    >
      <Suspense fallback={null}>{content}</Suspense>
    </div>
  )
}

/**
 * The shell. It owns everything that outlives a route change: the contour
 * shader, the intro, the profile rail and the one scrolling panel. Each route
 * renders its view into that panel through PageTransition (an animated Outlet).
 *
 * Home is the route that shaped the layout: it is sized to the panel box and
 * must not scroll, which is what `data-fixed` switches off. Projects,
 * Testimonials, About and Contact are built to the same budget and join it.
 */
export default function App() {
  useLenis()

  const { pathname } = useLocation()
  const FIXED_ROUTES = ['/', '/projects', '/testimonials', '/contact']
  const isFixed = FIXED_ROUTES.includes(pathname)
  // Below the shell breakpoint the rail is gone: a bottom tab bar navigates,
  // the QuickMenu (theme + accessibility) floats top-right on every page but
  // Home (whose profile header carries it), and the visits widget folds into
  // that header.
  const phone = useIsPhone()
  const panelRef = useRef<HTMLElement>(null)

  // The panel is the scroller, so a route change has to reset it by hand.
  // PageTransition calls this at the moment the page swaps, while it is
  // invisible, so the jump is never seen.
  const resetScroll = () => panelRef.current?.scrollTo({ top: 0, behavior: 'auto' })

  // From the first route change on, a page that mounts rises into place
  // (mobile-pass.css). Not on the first load: the intro owns that arrival.
  // Layout effect: set before paint, or the new page shows for one frame at
  // full opacity and then jumps back to start its rise.
  const firstPath = useRef(pathname)
  useLayoutEffect(() => {
    if (pathname !== firstPath.current) document.documentElement.classList.add('has-navigated')
  }, [pathname])

  // The page measures its own frame health once the intro clears and steps
  // the design down if it cannot hold it - see lib/perf.ts. `low` is the tier
  // where the shader itself has to go.
  const [perfTier, setPerfTier] = useState(getPerfTier)
  useEffect(() => {
    const onTier = (e: Event) => setPerfTier((e as CustomEvent).detail)
    window.addEventListener(PERF_TIER_EVENT, onTier)
    void watchFrameHealth()
    return () => window.removeEventListener(PERF_TIER_EVENT, onTier)
  }, [])

  const [shouldLoadCanvas, setShouldLoadCanvas] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || motionReduced()
    const isMobile = window.matchMedia('(pointer: coarse) and (hover: none)').matches
    if (reduced || isMobile) return
    // Defer the Three.js fetch to idle time so it does not compete with
    // initial render / LCP. Falls back to setTimeout if requestIdleCallback
    // is unavailable (Safari).
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }
    // Wait for the load event too: the shader is decoration, and parsing
    // Three.js during boot was the bulk of the blocking time.
    const start = () => {
      if (w.requestIdleCallback) {
        w.requestIdleCallback(() => setShouldLoadCanvas(true), { timeout: 3000 })
      } else {
        window.setTimeout(() => setShouldLoadCanvas(true), 1500)
      }
    }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
  }, [])

  return (
    <>
      <IntroOverlay />
      <CursorRing />
      <a href={`#${SCROLLER_ID}`} className="skip-link">Skip to main content</a>
      {shouldLoadCanvas && perfTier !== 'low' && (
        <Suspense fallback={null}>
          <HeroCanvas />
        </Suspense>
      )}
      {phone && pathname !== '/' && <QuickMenu className="qmenu--float" />}
      <div className="shell">
        <Rail />
        <main
          ref={panelRef}
          id={SCROLLER_ID}
          className="shell__panel"
          data-fixed={isFixed ? 'true' : 'false'}
        >
          <PageTransition onSwap={resetScroll} />
        </main>
      </div>
      {phone && <TabBar />}
      <AccessMenu />
      <WeatherModal />
      <DevLoungeModal />
    </>
  )
}
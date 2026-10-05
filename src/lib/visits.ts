/**
 * Simple visit counter using localStorage. Each page view increments the count.
 * For a production site, you'd want to use a proper analytics service or backend.
 */

const VISITS_KEY = 'site_visits_count'

export function getVisitsCount(): number {
  try {
    const stored = localStorage.getItem(VISITS_KEY)
    return stored ? parseInt(stored, 10) : 0
  } catch {
    return 0
  }
}

export function incrementVisits(): number {
  try {
    const current = getVisitsCount()
    const next = current + 1
    localStorage.setItem(VISITS_KEY, next.toString())
    return next
  } catch {
    return 0
  }
}

export function formatVisits(count: number): string {
  return new Intl.NumberFormat('en-US').format(count) + ' visits'
}

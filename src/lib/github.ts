/**
 * GitHub contribution data — real data scraped from jeanmarcaguilar's profile
 * (Oct 2025 – Oct 2026, 233 contributions total).
 *
 * The live-fetch path tries the CORS proxy first and parses the modern GitHub
 * HTML format (td[data-date] + data-level attributes). On any failure it falls
 * back to the hardcoded real dataset below so the graph is always accurate.
 */

const WEEKS = 52
const DAYS_PER_WEEK = 7

export interface ContributionStats {
  grid: number[][]
  totalCommits: number
  streak: number
  bestDay: number
}

// ---------------------------------------------------------------------------
// Real contribution data for jeanmarcaguilar (scraped Oct 2026)
// Keys are ISO date strings; values are commit counts.
// ---------------------------------------------------------------------------
const REAL_CONTRIBUTIONS: Record<string, number> = {
  '2025-10-05': 1,
  '2025-10-25': 1,
  '2026-02-03': 5,
  '2026-02-04': 1,
  '2026-02-05': 20,
  '2026-02-06': 3,
  '2026-02-07': 2,
  '2026-02-11': 8,
  '2026-02-12': 1,
  '2026-02-13': 3,
  '2026-02-14': 1,
  '2026-02-15': 6,
  '2026-02-16': 11,
  '2026-02-19': 1,
  '2026-02-23': 3,
  '2026-02-27': 5,
  '2026-02-28': 3,
  '2026-03-02': 1,
  '2026-03-03': 5,
  '2026-03-09': 2,
  '2026-03-12': 1,
  '2026-03-13': 9,
  '2026-03-19': 2,
  '2026-03-20': 2,
  '2026-03-21': 2,
  '2026-03-22': 4,
  '2026-03-25': 1,
  '2026-03-27': 1,
  '2026-04-01': 1,
  '2026-04-02': 1,
  '2026-04-03': 1,
  '2026-04-04': 2,
  '2026-04-05': 4,
  '2026-04-07': 2,
  '2026-04-08': 2,
  '2026-04-29': 8,
  '2026-04-30': 1,
  '2026-05-01': 2,
  '2026-05-02': 2,
  '2026-05-22': 2,
  '2026-05-23': 4,
  '2026-05-24': 3,
  '2026-05-25': 1,
  '2026-05-26': 2,
  '2026-05-27': 2,
  '2026-06-28': 1,
  '2026-07-02': 3,
  '2026-07-03': 3,
  '2026-07-04': 1,
  '2026-07-05': 1,
  '2026-07-06': 1,
  '2026-07-11': 1,
  '2026-08-08': 3,
  '2026-08-10': 1,
  '2026-08-13': 4,
  '2026-08-14': 5,
  '2026-08-15': 4,
  '2026-08-23': 5,
  '2026-08-24': 2,
  '2026-08-25': 3,
  '2026-08-26': 4,
  '2026-08-27': 4,
  '2026-08-28': 2,
  '2026-08-29': 5,
  '2026-08-30': 6,
  '2026-09-01': 3,
  '2026-09-02': 3,
  '2026-09-03': 5,
  '2026-09-04': 1,
  '2026-09-05': 1,
  '2026-09-12': 3,
  '2026-09-20': 1,
  '2026-09-22': 1,
  '2026-10-04': 4,
  '2026-10-05': 7,
}

// ---------------------------------------------------------------------------
// Build a 52-week Sunday-first grid from a date→count map
// ---------------------------------------------------------------------------
function buildContributionGrid(dateCounts: Map<string, number>): number[][] {
  const grid: number[][] = []
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - WEEKS * 7)
  // Snap to previous Sunday
  startDate.setDate(startDate.getDate() - startDate.getDay())

  for (let w = 0; w < WEEKS; w++) {
    const week: number[] = []
    for (let d = 0; d < DAYS_PER_WEEK; d++) {
      const cur = new Date(startDate)
      cur.setDate(startDate.getDate() + w * 7 + d)
      const dateStr = cur.toISOString().split('T')[0]
      week.push(dateCounts.get(dateStr) ?? 0)
    }
    grid.push(week)
  }
  return grid
}

// ---------------------------------------------------------------------------
// Derive stats from a grid (streak = consecutive days with commits)
// ---------------------------------------------------------------------------
function calculateStats(grid: number[][]): Omit<ContributionStats, 'grid'> {
  let totalCommits = 0
  let maxStreak = 0
  let currentStreak = 0
  let bestDay = 0

  // Flatten column-major (week then day) to preserve calendar ordering
  for (let w = 0; w < grid.length; w++) {
    for (let d = 0; d < grid[w].length; d++) {
      const count = grid[w][d]
      totalCommits += count
      if (count > bestDay) bestDay = count
      if (count > 0) {
        currentStreak++
        if (currentStreak > maxStreak) maxStreak = currentStreak
      } else {
        currentStreak = 0
      }
    }
  }

  return { totalCommits, streak: maxStreak, bestDay }
}

// ---------------------------------------------------------------------------
// Real-data fallback — always returns accurate, pre-scraped contributions
// ---------------------------------------------------------------------------
export function generateFallbackContributions(): ContributionStats {
  const dateCounts = new Map<string, number>(Object.entries(REAL_CONTRIBUTIONS))
  const grid = buildContributionGrid(dateCounts)
  const stats = calculateStats(grid)
  return { grid, ...stats }
}

// ---------------------------------------------------------------------------
// Live fetch — tries the GitHub contributions endpoint via CORS proxy.
// Parses the modern <td data-date data-level> format.
// Falls back to real hardcoded data on any error.
// ---------------------------------------------------------------------------
export async function fetchGitHubContributions(
  username: string
): Promise<ContributionStats> {
  try {
    const target = `https://github.com/users/${username}/contributions`
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`
    const response = await fetch(proxyUrl, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })

    if (!response.ok) throw new Error(`Status ${response.status}`)

    const html = await response.text()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Modern GitHub format: <td data-date="…" data-level="N">
    // Pair each cell with its tooltip to get the real count.
    const cells = doc.querySelectorAll<HTMLElement>('td[data-date][data-level]')
    if (cells.length === 0) throw new Error('No contribution cells found')

    const dateCounts = new Map<string, number>()

    cells.forEach(cell => {
      const date = cell.getAttribute('data-date')
      if (!date) return

      const id = cell.getAttribute('id') ?? ''
      // Try to read exact count from the associated tool-tip element
      const tip = id ? doc.querySelector(`tool-tip[for="${id}"]`) : null
      if (tip) {
        const m = tip.textContent?.match(/^(\d+)/)
        if (m) {
          dateCounts.set(date, parseInt(m[1], 10))
          return
        }
      }

      // Fallback: approximate from data-level (0-4)
      const level = parseInt(cell.getAttribute('data-level') ?? '0', 10)
      dateCounts.set(date, level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 3 : level === 3 ? 6 : 10)
    })

    const grid = buildContributionGrid(dateCounts)
    const stats = calculateStats(grid)
    return { grid, ...stats }
  } catch (error) {
    console.warn('Live fetch failed, using real hardcoded contributions:', error)
    return generateFallbackContributions()
  }
}

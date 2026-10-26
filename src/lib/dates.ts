// Entry dates are YYYY-MM-DD strings in the user's local day (CLAUDE.md). Never timestamps.

const pad = (n: number) => String(n).padStart(2, '0')

export function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseLocalDate(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + days)
  return localDateISO(d)
}

export function relativeDay(iso: string, todayIso: string): 'today' | 'yesterday' | null {
  if (iso === todayIso) return 'today'
  if (iso === addDays(todayIso, -1)) return 'yesterday'
  return null
}

export function nowISO(): string {
  return new Date().toISOString()
}

const utc = (iso: string) => {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). DST-proof. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** Days from `from` to `to`, counting both, never below 1 (SPEC §5 "days remaining"). */
export function daysInclusive(from: string, to: string): number {
  return Math.max(1, daysBetween(from, to) + 1)
}

/** The first day of the week containing `iso`; weekStart 0 = Sunday … 6 = Saturday. */
export function weekStartOf(iso: string, weekStart: number): string {
  const dow = parseLocalDate(iso).getDay()
  return addDays(iso, -((dow - weekStart + 7) % 7))
}

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate() // m is 1-based

// Salary often lands a few days early (weekends, holidays). If this month's payday is this close,
// the salary just received is that payday's, so the plan runs to the following one.
const EARLY_SALARY_DAYS = 10

/** The payday this plan runs to: the next usual payday, skipping one that's 10 days away or less. */
export function nextPayday(todayIso: string, payday: number): string {
  const [y = 1970, m = 1, d = 1] = todayIso.split('-').map(Number)
  const day = (yy: number, mm: number) => Math.min(payday, daysInMonth(yy, mm))
  if (day(y, m) - d > EARLY_SALARY_DAYS) return `${y}-${pad(m)}-${pad(day(y, m))}`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${pad(nm)}-${pad(day(ny, nm))}`
}

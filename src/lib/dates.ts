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

/** The payday this plan runs to: the upcoming usual payday, skipped if it's 10 days away or less. */
export function nextPayday(todayIso: string, payday: number): string {
  const [y = 1970, m = 1, d = 1] = todayIso.split('-').map(Number)
  const at = (yy: number, mm: number) => `${yy}-${pad(mm)}-${pad(Math.min(payday, daysInMonth(yy, mm)))}`
  const after = (yy: number, mm: number): [number, number] => (mm === 12 ? [yy + 1, 1] : [yy, mm + 1])
  // Upcoming = this month's payday if it hasn't passed, else next month's (it may be in the next month).
  let [uy, um] = d <= Math.min(payday, daysInMonth(y, m)) ? [y, m] : after(y, m)
  if (daysBetween(todayIso, at(uy, um)) <= EARLY_SALARY_DAYS) [uy, um] = after(uy, um)
  return at(uy, um)
}

/** The most recent usual payday on or before today, clamped to short months. */
export function lastPayday(todayIso: string, payday: number): string {
  const [y = 1970, m = 1, d = 1] = todayIso.split('-').map(Number)
  const day = (yy: number, mm: number) => Math.min(payday, daysInMonth(yy, mm))
  if (d >= day(y, m)) return `${y}-${pad(m)}-${pad(day(y, m))}`
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${pad(pm)}-${pad(day(py, pm))}`
}

/**
 * Home's payday nudge (SPEC §7): payday has passed and no plan started in this pay
 * cycle (a salary taken up to 10 days early counts). Never before the first plan exists.
 */
export function salaryDue(todayIso: string, payday: number, planStarts: readonly string[]): boolean {
  if (planStarts.length === 0) return false
  const cycleStart = addDays(lastPayday(todayIso, payday), -EARLY_SALARY_DAYS)
  return !planStarts.some((start) => start >= cycleStart)
}

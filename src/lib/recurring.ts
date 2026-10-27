// SPEC §7 Recurring: an item falls on its day of the month inside the current period and is
// due from that date until posted. Nothing is ever posted on its own (rule 3).

export type Period = { start: string; end: string }

const pad = (n: number) => String(n).padStart(2, '0')
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate() // m is 1-based

/**
 * The period recurring items run in: the open plan, from its start to its payday (or to
 * today while the salary is late); with no plan, the calendar month.
 */
export function recurringPeriod(plan: { start_date: string; expected_end: string } | null, today: string): Period {
  if (plan) return { start: plan.start_date, end: plan.expected_end > today ? plan.expected_end : today }
  const [y = 1970, m = 1] = today.split('-').map(Number)
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(daysInMonth(y, m))}` }
}

/**
 * The item's dates inside the period: its day in each month (short months use their last
 * day). Usually one; two when a plan runs longer than a month.
 */
export function occurrences(period: Period, day: number): string[] {
  const dates: string[] = []
  let [y = 1970, m = 1] = period.start.split('-').map(Number)
  for (;;) {
    const date = `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
    if (`${y}-${pad(m)}-01` > period.end) return dates
    if (date >= period.start && date <= period.end) dates.push(date)
    ;[y, m] = m === 12 ? [y + 1, 1] : [y, m + 1]
  }
}

type PostedEntry = { recurring_id: string | null; date: string; deleted_at: string | null }

export type RecurringState =
  | { state: 'due'; date: string }
  | { state: 'posted'; date: string }
  | { state: 'upcoming'; date: string }
  | { state: 'none' }

/**
 * Due while fewer entries with its recurring_id sit in the period (from its first date on)
 * than its dates already reached (date = the first one not covered). Posted: the latest entry's date.
 */
export function recurringState(
  item: { id: string; day_of_month: number },
  period: Period,
  entries: readonly PostedEntry[],
  today: string,
): RecurringState {
  const dates = occurrences(period, item.day_of_month)
  const first = dates[0]
  // An entry pays a date on or before its own. The salary day ends one period and starts the
  // next, so a late bill posted that day must not count for the new plan's later date.
  const posted = entries
    .filter((e) => e.recurring_id === item.id && !e.deleted_at && first !== undefined && e.date >= first && e.date <= period.end)
    .map((e) => e.date)
    .sort()
  const reached = dates.filter((d) => d <= today)
  const firstOpen = reached[posted.length]
  if (firstOpen) return { state: 'due', date: firstOpen }
  const last = posted[posted.length - 1]
  if (last) return { state: 'posted', date: last }
  const next = dates.find((d) => d > today)
  return next ? { state: 'upcoming', date: next } : { state: 'none' }
}

/** Home's Due card: the due items, earliest date first, then by name. */
export function dueItems<T extends { id: string; name: string; day_of_month: number }>(
  items: readonly T[],
  period: Period,
  entries: readonly PostedEntry[],
  today: string,
): { item: T; date: string }[] {
  const due: { item: T; date: string }[] = []
  for (const item of items) {
    const s = recurringState(item, period, entries, today)
    if (s.state === 'due') due.push({ item, date: s.date })
  }
  return due.sort((a, b) => a.date.localeCompare(b.date) || a.item.name.localeCompare(b.item.name))
}

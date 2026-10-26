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

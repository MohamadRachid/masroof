import { addDays } from './dates'
import { formatMoney, normalizeDigits, toCents } from './money'

type EntryLike = {
  type: string
  amount: number
  account_id: string
  category_id: string
  date: string
  created_at: string
  note: string | null
  deleted_at: string | null
}

export type QuickTile = { type: 'in' | 'out'; category_id: string; account_id: string; amount: number; count: number }

const live = <T extends { deleted_at: string | null }>(list: readonly T[]) => list.filter((e) => !e.deleted_at)

/** SPEC §6 Add: top 6 (category, amount, account) combos from the last 30 days; hidden under 3 entries. */
export function quickTiles(entries: readonly EntryLike[], todayIso: string, limit = 6): QuickTile[] {
  const alive = live(entries)
  if (alive.length < 3) return []
  const since = addDays(todayIso, -30)
  const combos = new Map<string, QuickTile & { last: string }>()
  for (const e of alive) {
    if ((e.type !== 'in' && e.type !== 'out') || e.date < since) continue
    const key = `${e.type}|${e.category_id}|${e.account_id}|${toCents(e.amount)}`
    const hit = combos.get(key)
    if (hit) {
      hit.count += 1
      if (e.created_at > hit.last) hit.last = e.created_at
    } else {
      combos.set(key, { type: e.type, category_id: e.category_id, account_id: e.account_id, amount: e.amount, count: 1, last: e.created_at })
    }
  }
  return [...combos.values()]
    .sort((a, b) => b.count - a.count || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0))
    .slice(0, limit)
    .map(({ last: _last, ...tile }) => tile)
}

/** Defaults for the Add sheet: the account and category of the newest entry of this type. */
export function lastUsed(entries: readonly EntryLike[], type: 'in' | 'out'): { account_id: string; category_id: string } | null {
  let newest: EntryLike | null = null
  for (const e of live(entries)) {
    if (e.type === type && (!newest || e.created_at > newest.created_at)) newest = e
  }
  return newest ? { account_id: newest.account_id, category_id: newest.category_id } : null
}

export type DayGroup<T> = { date: string; entries: T[]; outTotals: Partial<Record<string, number>> }

/** History: newest day first, entries newest first, out totals per currency (no conversion). */
export function groupByDay<T extends EntryLike>(entries: readonly T[], currencyOf: (accountId: string) => string): DayGroup<T>[] {
  const sorted = live(entries).sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )
  const groups: DayGroup<T>[] = []
  const cents = new Map<DayGroup<T>, Record<string, number>>()
  for (const e of sorted) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== e.date) {
      g = { date: e.date, entries: [], outTotals: {} }
      groups.push(g)
      cents.set(g, {})
    }
    g.entries.push(e)
    if (e.type === 'out') {
      const totals = cents.get(g) ?? {}
      const cur = currencyOf(e.account_id)
      totals[cur] = (totals[cur] ?? 0) + toCents(e.amount)
      cents.set(g, totals)
    }
  }
  for (const g of groups) {
    for (const [cur, c] of Object.entries(cents.get(g) ?? {})) g.outTotals[cur] = c / 100
  }
  return groups
}

/** History search: note, category names (either language) or amount. */
export function matchesSearch(entry: Pick<EntryLike, 'note' | 'amount'>, categoryNames: readonly string[], query: string): boolean {
  const q = normalizeDigits(query.trim().toLowerCase())
  if (!q) return true
  if (entry.note?.toLowerCase().includes(q)) return true
  if (categoryNames.some((name) => name.toLowerCase().includes(q))) return true
  const qDigits = q.replace(/,/g, '')
  return formatMoney(entry.amount).replace(/,/g, '').includes(qDigits) || String(entry.amount).includes(qDigits)
}

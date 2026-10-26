import { addDays, daysBetween, daysInclusive, weekStartOf } from './dates'

// Money is a number in major units, rounded to 2 decimals. All arithmetic goes
// through integer cents here; never add raw amounts anywhere else.

export const MAX_AMOUNT = 999_999_999_999.99 // numeric(14,2)

/** Integer cents, half away from zero, immune to binary float drift (1.005 → 101). */
export function toCents(n: number): number {
  const abs = Math.abs(n)
  if (abs < 1e-6) return 0
  const cents = Math.round(Number(`${abs}e2`))
  return n < 0 ? -cents : cents
}

export function round2(n: number): number {
  return toCents(n) / 100
}

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٫': '.', '٬': ',',
}

/** Arabic-Indic / Persian digits and the Arabic decimal and thousands marks → Latin. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹٫٬]/g, (ch) => DIGITS[ch] ?? ch)
}

/** An unsigned number from what the user typed, rounded to cents; null if it isn't one. */
function readNumber(input: string): number | null {
  let s = normalizeDigits(input.trim().replace(/\s/g, ''))
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = round2(Number(s))
  return Number.isFinite(n) ? n : null
}

/**
 * What the user typed → a positive amount, or null. Accepts Arabic/Persian
 * digits, "12,5" (comma as decimal when it's the only separator) and "1,250.75".
 */
export function parseAmount(input: string): number | null {
  const n = readNumber(input)
  return n !== null && n > 0 && n <= MAX_AMOUNT ? n : null
}

/** Opening balances: empty means 0, may be negative (an overdrawn bank), never NaN or out of range. */
export function parseSignedAmount(input: string): number | null {
  const s = input.trim()
  if (s === '') return 0
  const negative = /^[-−]/.test(s)
  const n = readNumber(negative ? s.slice(1) : s)
  if (n === null || n > MAX_AMOUNT) return null
  return negative && n !== 0 ? -n : n
}

type BalanceAccount = { id: string; opening_balance: number }
type BalanceEntry = { type: string; amount: number; account_id: string; deleted_at: string | null }

/** SPEC §5: opening + Σ in − Σ out + Σ adjust, live entries only. */
export function balance(account: BalanceAccount, entries: readonly BalanceEntry[]): number {
  let cents = toCents(account.opening_balance)
  for (const e of entries) {
    if (e.account_id !== account.id || e.deleted_at) continue
    const c = toCents(e.amount)
    cents += e.type === 'out' ? -c : c
  }
  return cents / 100
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1,234.50", "−20.00": Latin digits in both languages, true minus sign. */
export function formatMoney(n: number): string {
  const r = round2(n)
  return r < 0 ? `−${fmt.format(-r)}` : fmt.format(r)
}

// ── Plan math (SPEC §5): envelopes, safe to spend, weekly limit ────────────

export type WeekStatus = 'good' | 'warn' | 'bad'

/** Green under warn %, orange from warn %, red from 100 %. */
export function weeklyStatus(spent: number, limit: number, warnPct: number): WeekStatus {
  if (limit <= 0) return spent > 0 ? 'bad' : 'good'
  const pct = (spent / limit) * 100
  return pct >= 100 ? 'bad' : pct >= warnPct ? 'warn' : 'good'
}

type PlanEntry = {
  type: string
  amount: number
  category_id: string
  account_id: string
  date: string
  deleted_at: string | null
  rate_usd_ghs: number
}

export type PlanInput = {
  plan: { start_date: string; expected_end: string; salary: number }
  envelopes: readonly { category_id: string; amount: number; deleted_at: string | null }[]
  categories: readonly { id: string; kind: string }[]
  entries: readonly PlanEntry[]
  today: string
  /** For a past plan: the next plan's start. The period then ends the day before. */
  nextStart?: string
  weekStart: number
  warnPct: number
  currencyOf: (accountId: string) => string
  /** Used only for USD entries that have no real frozen rate yet. */
  fallbackRate: number | null
}

export type EnvelopeStat = { category_id: string; kind: string; planned: number; spent: number; left: number }

export type PlanStats = {
  envelopes: EnvelopeStat[]
  allocated: number
  unallocated: number
  variableLeft: number
  daysRemaining: number
  safeToSpend: number
  warnPct: number
  week: { start: string; weeksRemaining: number; limit: number; spent: number; status: WeekStatus }
}

/** An entry's value in GHS cents; USD counts at the entry's own frozen rate. */
function ghsCents(e: PlanEntry, currencyOf: (id: string) => string, fallbackRate: number | null): number {
  if (currencyOf(e.account_id) !== 'USD') return toCents(e.amount)
  const rate = e.rate_usd_ghs > 0 && e.rate_usd_ghs !== 1 ? e.rate_usd_ghs : (fallbackRate ?? 1)
  return toCents(e.amount * rate)
}

export function planStats(input: PlanInput): PlanStats {
  const { plan, today, weekStart, warnPct, currencyOf, fallbackRate } = input
  const end = input.nextStart ? addDays(input.nextStart, -1) : today
  const kindOf = new Map(input.categories.map((c) => [c.id, c.kind]))
  const outs = input.entries.filter(
    (e) => !e.deleted_at && e.type === 'out' && e.date >= plan.start_date && e.date <= end,
  )

  const spent = new Map<string, number>()
  for (const e of outs) spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + ghsCents(e, currencyOf, fallbackRate))

  const envelopes: EnvelopeStat[] = input.envelopes
    .filter((x) => !x.deleted_at)
    .map((x) => {
      const s = spent.get(x.category_id) ?? 0
      return { category_id: x.category_id, kind: kindOf.get(x.category_id) ?? 'variable', planned: x.amount, spent: s / 100, left: (toCents(x.amount) - s) / 100 }
    })

  const allocatedCents = envelopes.reduce((sum, x) => sum + toCents(x.planned), 0)
  const variable = envelopes.filter((x) => x.kind === 'variable')
  const variableLeftCents = variable.reduce((sum, x) => sum + toCents(x.left), 0)
  const daysRemaining = daysInclusive(today, plan.expected_end)

  // Weekly limit: fixed and savings envelopes never count (SPEC §5).
  const start = weekStartOf(today, weekStart)
  const isVariable = (e: PlanEntry) => kindOf.get(e.category_id) === 'variable'
  const variablePlannedCents = variable.reduce((sum, x) => sum + toCents(x.planned), 0)
  const beforeWeekCents = outs.filter((e) => isVariable(e) && e.date < start).reduce((s, e) => s + ghsCents(e, currencyOf, fallbackRate), 0)
  const weeksRemaining = Math.max(1, Math.floor(daysBetween(start, plan.expected_end) / 7) + 1)
  const limitCents = Math.round((variablePlannedCents - beforeWeekCents) / weeksRemaining)
  const weekSpentCents = outs.filter((e) => isVariable(e) && e.date >= start).reduce((s, e) => s + ghsCents(e, currencyOf, fallbackRate), 0)

  return {
    envelopes,
    allocated: allocatedCents / 100,
    unallocated: (toCents(plan.salary) - allocatedCents) / 100,
    variableLeft: variableLeftCents / 100,
    daysRemaining,
    safeToSpend: Math.round(variableLeftCents / daysRemaining) / 100,
    warnPct,
    week: {
      start,
      weeksRemaining,
      limit: limitCents / 100,
      spent: weekSpentCents / 100,
      status: weeklyStatus(weekSpentCents / 100, limitCents / 100, warnPct),
    },
  }
}

export type Impact = {
  week?: { spent: number; limit: number; status: WeekStatus; over: number }
  envelope?: { left: number }
}

/** SPEC §6 Add: what this amount does to the week and to its envelope, before saving. */
export function impactOf(stats: PlanStats, add: { categoryId: string; kind: string; amountGhs: number }): Impact {
  const result: Impact = {}
  if (add.kind === 'variable') {
    const spent = round2(stats.week.spent + add.amountGhs)
    const limit = stats.week.limit
    result.week = { spent, limit, status: weeklyStatus(spent, limit, stats.warnPct), over: Math.max(0, round2(spent - limit)) }
  }
  const envelope = stats.envelopes.find((x) => x.category_id === add.categoryId)
  if (envelope) result.envelope = { left: round2(envelope.left - add.amountGhs) }
  return result
}

// Default shares for the first plan, by the seeded English category names (sum 100 %).
const DEFAULT_SHARES: Record<string, number> = {
  Rent: 30, Bills: 8, 'Data/Phone': 3, Food: 15, Groceries: 10, Transport: 8,
  Fun: 5, Health: 3, Family: 5, Buffer: 5, Savings: 8,
}

/**
 * First-plan envelope suggestions: the salary split by default shares, in tens,
 * with the rounding remainder in Buffer so the total equals the salary. Ali edits from here.
 */
export function suggestEnvelopes(
  categories: readonly { id: string; name_en: string; kind: string }[],
  salary: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  let usedCents = 0
  let buffer: string | null = null
  for (const c of categories) {
    if (c.kind === 'income') continue
    const share = DEFAULT_SHARES[c.name_en] ?? 0
    const amount = Math.floor((salary * share) / 100 / 10) * 10
    result[c.id] = amount
    usedCents += toCents(amount)
    if (c.name_en === 'Buffer') buffer = c.id
  }
  const remainder = toCents(salary) - usedCents
  const target = buffer ?? Object.keys(result)[0]
  if (target && remainder > 0) result[target] = (toCents(result[target] ?? 0) + remainder) / 100
  return result
}

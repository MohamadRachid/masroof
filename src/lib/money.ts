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

/** A drift or adjustment: "+34.45" extra, "−35.00" missing, "0.00" none. */
export function formatSigned(n: number): string {
  return round2(n) > 0 ? `+${formatMoney(n)}` : formatMoney(n)
}

// ── Plan math (SPEC §5): envelopes, safe to spend, weekly limit ────────────

export type WeekStatus = 'good' | 'warn' | 'bad'

/** Green under warn %, orange from warn %, red from 100 %. Compared in cents, so 80 % is exactly 80 %. */
export function weeklyStatus(spent: number, limit: number, warnPct: number): WeekStatus {
  const s = toCents(spent)
  const l = toCents(limit)
  if (l <= 0) return s > 0 ? 'bad' : 'good'
  return s >= l ? 'bad' : s * 100 >= warnPct * l ? 'warn' : 'good'
}

export type EnvelopeStatus = 'plain' | 'warn' | 'bad'

/**
 * Envelope colour: red only when spent goes past the plan. Day-to-day envelopes turn
 * orange from warn %; fixed bills and savings are meant to be used up, so never orange.
 */
export function envelopeStatus(kind: string, spent: number, planned: number, warnPct: number): EnvelopeStatus {
  const s = toCents(spent)
  const p = toCents(planned)
  if (s > p) return 'bad'
  if (kind !== 'variable' || p <= 0) return 'plain'
  return s * 100 >= warnPct * p ? 'warn' : 'plain'
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
  /** carry_in: leftover taken into this plan's Buffer; the budget is salary + carry_in. */
  plan: { start_date: string; expected_end: string; salary: number; carry_in?: number }
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
  /** limit never shows below 0; hasBudget = the plan has day-to-day money at all. */
  week: { start: string; weeksRemaining: number; limit: number; spent: number; status: WeekStatus; hasBudget: boolean }
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
  // Overspent before this week → nothing left for it: show 0 and red, not a negative limit.
  const limitCents = Math.max(0, Math.round((variablePlannedCents - beforeWeekCents) / weeksRemaining))
  const hasBudget = variablePlannedCents > 0
  const weekSpentCents = outs.filter((e) => isVariable(e) && e.date >= start).reduce((s, e) => s + ghsCents(e, currencyOf, fallbackRate), 0)

  return {
    envelopes,
    allocated: allocatedCents / 100,
    unallocated: (toCents(plan.salary) + toCents(plan.carry_in ?? 0) - allocatedCents) / 100,
    variableLeft: variableLeftCents / 100,
    daysRemaining,
    safeToSpend: Math.round(variableLeftCents / daysRemaining) / 100,
    warnPct,
    week: {
      start,
      weeksRemaining,
      limit: limitCents / 100,
      spent: weekSpentCents / 100,
      status: hasBudget && limitCents === 0 ? 'bad' : weeklyStatus(weekSpentCents / 100, limitCents / 100, warnPct),
      hasBudget,
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
    const status = stats.week.hasBudget && limit <= 0 ? 'bad' : weeklyStatus(spent, limit, stats.warnPct)
    result.week = { spent, limit, status, over: Math.max(0, round2(spent - limit)) }
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

// ── Salary received (SPEC §7) ─────────────────────────────────────────────

export type CloseSummary = { planned: number; spent: number; diff: number; leftover: number }

/** Closing a plan: total planned vs spent (diff < 0 = over), and the day-to-day money left (never below 0). */
export function closeSummary(stats: PlanStats): CloseSummary {
  const plannedCents = toCents(stats.allocated)
  const spentCents = stats.envelopes.reduce((sum, x) => sum + toCents(x.spent), 0)
  return {
    planned: plannedCents / 100,
    spent: spentCents / 100,
    diff: (plannedCents - spentCents) / 100,
    leftover: Math.max(0, toCents(stats.variableLeft)) / 100,
  }
}

/** The categories a plan has envelopes for: everything but income, archived left out. */
export function plannable<C extends { kind: string; archived: boolean }>(categories: readonly C[]): C[] {
  return categories.filter((c) => c.kind !== 'income' && !c.archived)
}

/** Where "Add to next Buffer" puts the leftover: the live Buffer category, if there is one. */
export function bufferCategory<C extends { name_en: string; kind: string; archived: boolean }>(categories: readonly C[]): C | undefined {
  return categories.find((c) => c.name_en === 'Buffer' && c.kind !== 'income' && !c.archived)
}

/**
 * The next plan's envelopes: the previous plan's amounts (new categories at 0), or the
 * default shares for the very first plan. Buffer: the previous plan's carry-over was a
 * one-off, so it comes back out; this plan's carry (leftover sent to Buffer) goes in.
 */
export function nextPlanAmounts(
  categories: readonly { id: string; name_en: string; kind: string }[],
  previous: { envelopes: readonly { category_id: string; amount: number; deleted_at: string | null }[]; carry_in: number } | null,
  salary: number,
  buffer?: { id: string; carry: number },
): Record<string, number> {
  let result: Record<string, number>
  if (previous) {
    const byCategory = new Map(previous.envelopes.filter((x) => !x.deleted_at).map((x) => [x.category_id, x.amount]))
    result = Object.fromEntries(categories.filter((c) => c.kind !== 'income').map((c) => [c.id, byCategory.get(c.id) ?? 0]))
  } else {
    result = suggestEnvelopes(categories, salary)
  }
  if (buffer && buffer.id in result) {
    const base = Math.max(0, toCents(result[buffer.id] ?? 0) - toCents(previous?.carry_in ?? 0))
    result[buffer.id] = (base + toCents(buffer.carry)) / 100
  }
  return result
}

// ── Reconcile (SPEC §7) ───────────────────────────────────────────────────

/** Drift = actual − computed: what the records missed (negative = money gone unrecorded). */
export function drift(actual: number, computed: number): number {
  return (toCents(actual) - toCents(computed)) / 100
}

/** Where a reconcile adjustment goes: the live category named Other, else the first live non-income one. */
export function adjustCategory<C extends { name_en: string; kind: string; archived: boolean }>(categories: readonly C[]): C | undefined {
  const live = categories.filter((c) => c.kind !== 'income' && !c.archived)
  return live.find((c) => c.name_en === 'Other') ?? live[0]
}

/** Editing an adjustment: its amount keeps its sign; empty or zero is not an adjustment. */
export function parseAdjustAmount(input: string): number | null {
  if (input.trim() === '') return null
  const n = parseSignedAmount(input)
  return n === null || n === 0 ? null : n
}

export type DriftTrend = { kind: 'clean' } | { kind: 'steady' } | { kind: 'shrinking' } | { kind: 'growing'; mostly: string }

type Check = { account_id: string; date: string; created_at: string; diff: number; deleted_at: string | null }

/**
 * SPEC §7 trend: each account's latest drift against the one before, by size (missing and
 * extra money both count), summed in GHS. null until some account has been checked twice.
 */
export function driftTrend(checks: readonly Check[], inGhs: (accountId: string, amount: number) => number): DriftTrend | null {
  const byAccount = new Map<string, Check[]>()
  for (const c of checks) {
    if (c.deleted_at) continue
    byAccount.set(c.account_id, [...(byAccount.get(c.account_id) ?? []), c])
  }
  let latestCents = 0
  let previousCents = 0
  let mostly: { account: string; cents: number } | null = null
  for (const [account, list] of byAccount) {
    if (list.length < 2) continue
    list.sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    const size = (c: Check | undefined) => Math.abs(toCents(inGhs(account, c?.diff ?? 0)))
    const latest = size(list[list.length - 1])
    latestCents += latest
    previousCents += size(list[list.length - 2])
    if (!mostly || latest > mostly.cents) mostly = { account, cents: latest }
  }
  if (!mostly) return null
  if (latestCents === 0) return { kind: 'clean' }
  if (latestCents === previousCents) return { kind: 'steady' }
  return latestCents < previousCents ? { kind: 'shrinking' } : { kind: 'growing', mostly: mostly.account }
}

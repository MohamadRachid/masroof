import { describe, expect, it } from 'vitest'
import { impactOf, planStats, round2, suggestEnvelopes, weeklyStatus } from './money'

// A plan worked through by hand:
// salary 5000 from Sun 25 Oct to Tue 24 Nov; today Wed 28 Oct; weeks start Monday.
const plan = { start_date: '2026-10-25', expected_end: '2026-11-24', salary: 5000 }
const categories = [
  { id: 'rent', kind: 'fixed' },
  { id: 'food', kind: 'variable' },
  { id: 'transport', kind: 'variable' },
  { id: 'savings', kind: 'savings' },
  { id: 'salary', kind: 'income' },
]
const envelopes = [
  { category_id: 'rent', amount: 1500, deleted_at: null },
  { category_id: 'food', amount: 900, deleted_at: null },
  { category_id: 'transport', amount: 300, deleted_at: null },
  { category_id: 'savings', amount: 500, deleted_at: null },
]
const e = (category_id: string, amount: number, date: string, extra: Partial<{ type: string; account_id: string; rate_usd_ghs: number; deleted_at: string | null }> = {}) => ({
  type: 'out', account_id: 'cash', rate_usd_ghs: 11.6, deleted_at: null, category_id, amount, date, ...extra,
})
const entries = [
  e('food', 100, '2026-10-25'), // in plan, before this week
  e('food', 50, '2026-10-27'), // this week
  e('transport', 10, '2026-10-28', { account_id: 'usd', rate_usd_ghs: 12 }), // $10 at its frozen 12 = 120 GHS
  e('rent', 1500, '2026-10-25'), // fixed: never in the weekly limit
  e('food', 30, '2026-10-20'), // before the plan
  e('salary', 5000, '2026-10-25', { type: 'in' }),
  e('food', 999, '2026-10-27', { deleted_at: '2026-10-27T10:00:00Z' }),
]
const currencyOf = (id: string) => (id === 'usd' ? 'USD' : 'GHS')
const base = { plan, envelopes, categories, entries, today: '2026-10-28', weekStart: 1, warnPct: 80, currencyOf, fallbackRate: 11.6 }

describe('planStats (SPEC §5)', () => {
  const s = planStats(base)

  it('envelope spent / left, USD at its frozen rate, only inside the plan', () => {
    const by = Object.fromEntries(s.envelopes.map((x) => [x.category_id, [x.planned, x.spent, x.left]]))
    expect(by).toEqual({ rent: [1500, 1500, 0], food: [900, 150, 750], transport: [300, 120, 180], savings: [500, 0, 500] })
  })

  it('allocated and unallocated against the salary', () => {
    expect(s.allocated).toBe(3200)
    expect(s.unallocated).toBe(1800)
  })

  it('variable left, days remaining (inclusive) and safe to spend today', () => {
    expect(s.variableLeft).toBe(930)
    expect(s.daysRemaining).toBe(28)
    expect(s.safeToSpend).toBe(33.21)
  })

  it('weekly limit from what was left at the week start, spread over the weeks remaining', () => {
    expect(s.week.start).toBe('2026-10-26')
    expect(s.week.weeksRemaining).toBe(5)
    expect(s.week.limit).toBe(220) // (1200 − 100) / 5
    expect(s.week.spent).toBe(170) // 50 + 120; rent is fixed
    expect(s.week.status).toBe('good') // 77%
  })

  it('days and weeks remaining never drop below 1 once payday has passed', () => {
    const late = planStats({ ...base, today: '2026-11-30' })
    expect(late.daysRemaining).toBe(1)
    expect(late.week.weeksRemaining).toBe(1)
  })

  it('a past plan stops the day before the next plan starts', () => {
    const past = planStats({ ...base, nextStart: '2026-10-27' })
    expect(past.envelopes.find((x) => x.category_id === 'food')?.spent).toBe(100)
  })
})

describe('weeklyStatus', () => {
  it('green under warn %, orange from warn %, red from 100 %', () => {
    expect(weeklyStatus(79, 100, 80)).toBe('good')
    expect(weeklyStatus(80, 100, 80)).toBe('warn')
    expect(weeklyStatus(100, 100, 80)).toBe('bad')
    expect(weeklyStatus(0, 0, 80)).toBe('good')
    expect(weeklyStatus(5, 0, 80)).toBe('bad')
  })
})

describe('impactOf (live line in Add, SPEC §6)', () => {
  const s = planStats(base)

  it('shows the week after this amount, and the envelope left', () => {
    expect(impactOf(s, { categoryId: 'food', kind: 'variable', amountGhs: 20 })).toEqual({
      week: { spent: 190, limit: 220, status: 'warn', over: 0 },
      envelope: { left: 730 },
    })
  })

  it('reports how far over the week goes', () => {
    expect(impactOf(s, { categoryId: 'food', kind: 'variable', amountGhs: 60 }).week).toEqual({ spent: 230, limit: 220, status: 'bad', over: 10 })
  })

  it('fixed categories only show their envelope, never the week', () => {
    expect(impactOf(s, { categoryId: 'rent', kind: 'fixed', amountGhs: 100 })).toEqual({ envelope: { left: -100 } })
  })

  it('no envelope and not variable → nothing to show', () => {
    expect(impactOf(s, { categoryId: 'salary', kind: 'income', amountGhs: 100 })).toEqual({})
  })
})

describe('suggestEnvelopes (first plan defaults)', () => {
  const cats = [
    { id: 'rent', name_en: 'Rent', kind: 'fixed' },
    { id: 'bills', name_en: 'Bills', kind: 'fixed' },
    { id: 'data', name_en: 'Data/Phone', kind: 'fixed' },
    { id: 'food', name_en: 'Food', kind: 'variable' },
    { id: 'groceries', name_en: 'Groceries', kind: 'variable' },
    { id: 'transport', name_en: 'Transport', kind: 'variable' },
    { id: 'fun', name_en: 'Fun', kind: 'variable' },
    { id: 'health', name_en: 'Health', kind: 'variable' },
    { id: 'family', name_en: 'Family', kind: 'variable' },
    { id: 'buffer', name_en: 'Buffer', kind: 'variable' },
    { id: 'savings', name_en: 'Savings', kind: 'savings' },
    { id: 'other', name_en: 'Other', kind: 'variable' },
    { id: 'salary', name_en: 'Salary', kind: 'income' },
    { id: 'gym', name_en: 'Gym', kind: 'variable' },
  ]

  it('splits the salary by the default shares, in tens, adding exactly to the salary', () => {
    const s = suggestEnvelopes(cats, 5000)
    expect(s).toMatchObject({ rent: 1500, bills: 400, data: 150, food: 750, groceries: 500, transport: 400, fun: 250, health: 150, family: 250, buffer: 250, savings: 400, other: 0, gym: 0 })
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(5000)
    expect(s).not.toHaveProperty('salary')
  })

  it('puts the rounding remainder in Buffer so the total still matches', () => {
    const s = suggestEnvelopes(cats, 4321)
    expect(Object.values(s).reduce((a, b) => round2(a + b), 0)).toBe(4321)
    expect(s.rent).toBe(1290)
  })
})

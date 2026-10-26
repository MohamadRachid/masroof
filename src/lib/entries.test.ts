import { describe, expect, it } from 'vitest'
import { groupByDay, lastUsed, matchesSearch, quickTiles } from './entries'

type E = {
  id: string
  type: string
  amount: number
  account_id: string
  category_id: string
  date: string
  created_at: string
  note: string | null
  deleted_at: string | null
}

let n = 0
function entry(p: Partial<E>): E {
  n += 1
  return {
    id: `e${n}`,
    type: 'out',
    amount: 10,
    account_id: 'cash',
    category_id: 'food',
    date: '2026-10-26',
    created_at: `2026-10-26T10:00:${String(n % 60).padStart(2, '0')}Z`,
    note: null,
    deleted_at: null,
    ...p,
  }
}

describe('quickTiles', () => {
  const today = '2026-10-26'

  it('is empty while fewer than 3 entries exist', () => {
    expect(quickTiles([entry({}), entry({})], today)).toEqual([])
  })

  it('ranks (type, category, account, amount) combos from the last 30 days by count, then recency', () => {
    const list = [
      entry({ category_id: 'transport', amount: 5 }),
      entry({ category_id: 'transport', amount: 5 }),
      entry({ category_id: 'transport', amount: 5 }),
      entry({ category_id: 'food', amount: 30 }),
      entry({ category_id: 'food', amount: 30 }),
      entry({ category_id: 'fun', amount: 50 }),
      entry({ category_id: 'old', amount: 1, date: '2026-09-20' }), // older than 30 days
    ]
    const tiles = quickTiles(list, today)
    expect(tiles.map((t) => `${t.category_id}:${t.amount}`)).toEqual(['transport:5', 'food:30', 'fun:50'])
  })

  it('skips deleted and adjust entries and caps at 6', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => entry({ category_id: `c${i}`, amount: i + 1 })),
      entry({ type: 'adjust', category_id: 'other', amount: 3 }),
      entry({ category_id: 'gone', deleted_at: '2026-10-26T11:00:00Z' }),
    ]
    const tiles = quickTiles(list, today)
    expect(tiles).toHaveLength(6)
    expect(tiles.some((t) => t.category_id === 'other' || t.category_id === 'gone')).toBe(false)
  })
})

describe('lastUsed', () => {
  it('returns the account and category of the most recently created entry of that type', () => {
    const list = [
      entry({ type: 'out', account_id: 'bank', category_id: 'rent', created_at: '2026-10-25T09:00:00Z' }),
      entry({ type: 'out', account_id: 'cash', category_id: 'food', created_at: '2026-10-26T09:00:00Z' }),
      entry({ type: 'in', account_id: 'bank', category_id: 'salary', created_at: '2026-10-26T12:00:00Z' }),
    ]
    expect(lastUsed(list, 'out')).toEqual({ account_id: 'cash', category_id: 'food' })
    expect(lastUsed(list, 'in')).toEqual({ account_id: 'bank', category_id: 'salary' })
  })

  it('ignores deleted entries and returns null when there is none', () => {
    expect(lastUsed([entry({ deleted_at: '2026-10-26T11:00:00Z' })], 'out')).toBeNull()
  })
})

describe('groupByDay', () => {
  it('groups newest day first with per-currency out totals', () => {
    const currency = (id: string) => (id === 'usd' ? 'USD' : 'GHS')
    const groups = groupByDay(
      [
        entry({ date: '2026-10-25', amount: 20 }),
        entry({ date: '2026-10-26', amount: 12.5 }),
        entry({ date: '2026-10-26', amount: 7.5, account_id: 'bank' }),
        entry({ date: '2026-10-26', amount: 3, account_id: 'usd' }),
        entry({ date: '2026-10-26', amount: 500, type: 'in' }),
        entry({ date: '2026-10-26', amount: 99, deleted_at: '2026-10-26T11:00:00Z' }),
      ],
      currency,
    )
    expect(groups.map((g) => g.date)).toEqual(['2026-10-26', '2026-10-25'])
    expect(groups[0]?.outTotals).toEqual({ GHS: 20, USD: 3 })
    expect(groups[0]?.entries).toHaveLength(4)
    expect(groups[1]?.outTotals).toEqual({ GHS: 20 })
  })
})

describe('matchesSearch', () => {
  const e = entry({ note: 'Trotro to Accra', amount: 1250.5 })

  it('matches note, category name and amount, case-insensitively', () => {
    expect(matchesSearch(e, ['Transport', 'مواصلات'], 'trotro')).toBe(true)
    expect(matchesSearch(e, ['Transport', 'مواصلات'], 'trans')).toBe(true)
    expect(matchesSearch(e, ['Transport', 'مواصلات'], 'مواص')).toBe(true)
    expect(matchesSearch(e, ['Transport'], '1250')).toBe(true)
    expect(matchesSearch(e, ['Transport'], '1,250.5')).toBe(true)
  })

  it('accepts Arabic digits in the query', () => {
    expect(matchesSearch(e, ['Transport'], '١٢٥٠')).toBe(true)
  })

  it('an empty query matches everything; a miss is false', () => {
    expect(matchesSearch(e, ['Transport'], '  ')).toBe(true)
    expect(matchesSearch(e, ['Transport'], 'rent')).toBe(false)
  })
})

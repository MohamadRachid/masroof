import { describe, expect, it } from 'vitest'
import { dueItems, occurrences, recurringPeriod, recurringState } from './recurring'

const plan = { start_date: '2026-10-25', expected_end: '2026-11-25' }
const period = { start: '2026-10-25', end: '2026-11-25' }
const posted = (recurring_id: string, date: string, deleted_at: string | null = null) => ({ recurring_id, date, deleted_at })

describe('recurringPeriod', () => {
  it('is the open plan, from its start to its payday', () => {
    expect(recurringPeriod(plan, '2026-10-27')).toEqual(period)
  })

  it('runs on to today while the salary is late', () => {
    expect(recurringPeriod(plan, '2026-11-28')).toEqual({ start: '2026-10-25', end: '2026-11-28' })
  })

  it('is the calendar month when there is no plan', () => {
    expect(recurringPeriod(null, '2026-10-27')).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(recurringPeriod(null, '2027-02-10')).toEqual({ start: '2027-02-01', end: '2027-02-28' })
  })
})

describe('occurrences', () => {
  it('finds the day inside the period, across the month boundary', () => {
    expect(occurrences(period, 1)).toEqual(['2026-11-01'])
    expect(occurrences(period, 28)).toEqual(['2026-10-28'])
  })

  it('counts a day twice when the period holds it twice (payday itself, or a long plan)', () => {
    expect(occurrences(period, 25)).toEqual(['2026-10-25', '2026-11-25'])
    expect(occurrences({ start: '2026-11-20', end: '2026-12-25' }, 22)).toEqual(['2026-11-22', '2026-12-22'])
  })

  it('uses the last day of short months for the 29th to 31st', () => {
    expect(occurrences({ start: '2027-01-25', end: '2027-03-01' }, 31)).toEqual(['2027-01-31', '2027-02-28'])
    expect(occurrences({ start: '2028-02-01', end: '2028-02-29' }, 30)).toEqual(['2028-02-29'])
  })

  it('crosses the year end, and finds nothing when the day misses a short period', () => {
    expect(occurrences({ start: '2026-12-20', end: '2027-01-25' }, 5)).toEqual(['2027-01-05'])
    expect(occurrences({ start: '2026-10-20', end: '2026-11-05' }, 10)).toEqual([])
  })
})

describe('recurringState', () => {
  const rent = { id: 'rent', day_of_month: 1 }

  it('is upcoming before its date and due from it', () => {
    expect(recurringState(rent, period, [], '2026-10-27')).toEqual({ state: 'upcoming', date: '2026-11-01' })
    expect(recurringState(rent, period, [], '2026-11-01')).toEqual({ state: 'due', date: '2026-11-01' })
    expect(recurringState(rent, period, [], '2026-11-20')).toEqual({ state: 'due', date: '2026-11-01' })
  })

  it('is posted once an entry with its recurring_id sits in the period', () => {
    expect(recurringState(rent, period, [posted('rent', '2026-11-03')], '2026-11-04')).toEqual({ state: 'posted', date: '2026-11-03' })
  })

  it('ignores deleted entries, other items and entries from an earlier period', () => {
    const entries = [posted('rent', '2026-11-02', '2026-11-02T10:00:00Z'), posted('internet', '2026-11-02'), posted('rent', '2026-10-01')]
    expect(recurringState(rent, period, entries, '2026-11-04')).toEqual({ state: 'due', date: '2026-11-01' })
  })

  it('a long plan holds the date twice: the second one is due after the first was posted', () => {
    const long = { start: '2026-10-25', end: '2026-11-28' }
    const item = { id: 'gym', day_of_month: 26 }
    expect(recurringState(item, long, [posted('gym', '2026-10-26')], '2026-11-28')).toEqual({ state: 'due', date: '2026-11-26' })
    expect(recurringState(item, long, [posted('gym', '2026-10-26'), posted('gym', '2026-11-27')], '2026-11-28')).toEqual({ state: 'posted', date: '2026-11-27' })
  })

  it('is none when its day misses the period', () => {
    expect(recurringState({ id: 'x', day_of_month: 10 }, { start: '2026-10-20', end: '2026-11-05' }, [], '2026-10-27')).toEqual({ state: 'none' })
  })
})

describe('dueItems', () => {
  it('lists only due items, earliest date first, then by name', () => {
    const items = [
      { id: 'b', name: 'Water', day_of_month: 1 },
      { id: 'a', name: 'Internet', day_of_month: 1 },
      { id: 'c', name: 'Gym', day_of_month: 26 },
      { id: 'd', name: 'Phone', day_of_month: 20 },
      { id: 'e', name: 'Paid', day_of_month: 1 },
    ]
    const result = dueItems(items, period, [posted('e', '2026-11-01')], '2026-11-02')
    expect(result.map((r) => [r.item.id, r.date])).toEqual([
      ['c', '2026-10-26'],
      ['a', '2026-11-01'],
      ['b', '2026-11-01'],
    ])
  })
})

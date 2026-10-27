import { describe, expect, it } from 'vitest'
import { addDays, daysInclusive, lastPayday, localDateISO, nextPayday, parseLocalDate, relativeDay, salaryDue, weekStartOf } from './dates'

describe('dates', () => {
  it('localDateISO uses the local calendar day, not UTC', () => {
    expect(localDateISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDateISO(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })

  it('parseLocalDate round-trips', () => {
    expect(localDateISO(parseLocalDate('2026-03-09'))).toBe('2026-03-09')
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2026-10-26', -30)).toBe('2026-09-26')
  })

  it('relativeDay names today and yesterday', () => {
    expect(relativeDay('2026-10-26', '2026-10-26')).toBe('today')
    expect(relativeDay('2026-10-25', '2026-10-26')).toBe('yesterday')
    expect(relativeDay('2026-10-20', '2026-10-26')).toBeNull()
  })
})

describe('plan dates', () => {
  it('daysInclusive counts both ends, never below 1', () => {
    expect(daysInclusive('2026-10-28', '2026-11-24')).toBe(28)
    expect(daysInclusive('2026-10-28', '2026-10-28')).toBe(1)
    expect(daysInclusive('2026-10-28', '2026-10-20')).toBe(1)
  })

  it('weekStartOf honours the week start setting (0 = Sunday, 1 = Monday)', () => {
    expect(weekStartOf('2026-10-28', 1)).toBe('2026-10-26') // Wednesday → Monday
    expect(weekStartOf('2026-10-26', 1)).toBe('2026-10-26') // Monday itself
    expect(weekStartOf('2026-10-25', 1)).toBe('2026-10-19') // Sunday belongs to the previous Mon–Sun week
    expect(weekStartOf('2026-10-28', 0)).toBe('2026-10-25')
    expect(weekStartOf('2026-10-28', 6)).toBe('2026-10-24')
  })

  it('nextPayday is the next occurrence after today, clamped to short months', () => {
    expect(nextPayday('2026-10-26', 25)).toBe('2026-11-25')
    expect(nextPayday('2026-10-25', 25)).toBe('2026-11-25') // salary day itself → next month
    expect(nextPayday('2026-10-14', 25)).toBe('2026-10-25') // 11 days away: this month
    expect(nextPayday('2027-01-31', 31)).toBe('2027-02-28')
    expect(nextPayday('2026-12-26', 25)).toBe('2027-01-25')
  })

  it('salary that arrives up to 10 days early runs to next month’s payday', () => {
    expect(nextPayday('2026-10-23', 25)).toBe('2026-11-25') // paid Friday before a Sunday payday
    expect(nextPayday('2026-10-15', 25)).toBe('2026-11-25') // exactly 10 days early
    expect(nextPayday('2026-10-26', 28)).toBe('2026-11-28')
  })
})

describe('payday nudge (SPEC §7)', () => {
  it('lastPayday is the most recent usual payday on or before today, clamped to short months', () => {
    expect(lastPayday('2026-10-27', 25)).toBe('2026-10-25')
    expect(lastPayday('2026-10-25', 25)).toBe('2026-10-25')
    expect(lastPayday('2026-10-20', 25)).toBe('2026-09-25')
    expect(lastPayday('2026-01-05', 25)).toBe('2025-12-25')
    expect(lastPayday('2027-02-28', 31)).toBe('2027-02-28')
    expect(lastPayday('2027-03-15', 31)).toBe('2027-02-28')
  })

  it('is due once payday has passed and no plan started in this pay cycle', () => {
    expect(salaryDue('2026-10-27', 25, ['2026-09-25'])).toBe(true)
    expect(salaryDue('2026-10-25', 25, ['2026-09-25'])).toBe(true) // payday itself
    expect(salaryDue('2026-10-24', 25, ['2026-09-25'])).toBe(false) // not yet
  })

  it('a salary taken up to 10 days early counts for this payday', () => {
    expect(salaryDue('2026-10-27', 25, ['2026-10-20'])).toBe(false)
    expect(salaryDue('2026-10-27', 25, ['2026-10-15'])).toBe(false) // exactly 10 days early
    expect(salaryDue('2026-10-27', 25, ['2026-10-14'])).toBe(true)
    expect(salaryDue('2026-11-01', 1, ['2026-10-29'])).toBe(false) // early, across a month boundary
  })

  it('a late salary stays due past the month boundary', () => {
    expect(salaryDue('2026-11-03', 25, ['2026-09-25'])).toBe(true)
  })

  it('never before the first plan exists (the setup card covers that)', () => {
    expect(salaryDue('2026-10-27', 25, [])).toBe(false)
  })
})

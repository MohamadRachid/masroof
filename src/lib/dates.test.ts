import { describe, expect, it } from 'vitest'
import { addDays, localDateISO, parseLocalDate, relativeDay } from './dates'

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

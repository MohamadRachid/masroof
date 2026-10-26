import { describe, expect, it } from 'vitest'
import { convert, effectiveRate, formatRate, isRealRate, otherCurrency, parseRate, rateForDate } from './fx'

describe('effectiveRate (SPEC §5)', () => {
  const latest = { usd_ghs: 15.42, date: '2026-10-26' }

  it('uses the manual rate in manual mode', () => {
    expect(effectiveRate({ rate_mode: 'manual', manual_rate: 16 }, latest)).toEqual({ rate: 16, source: 'manual' })
  })

  it('uses the latest daily rate in auto mode', () => {
    expect(effectiveRate({ rate_mode: 'auto', manual_rate: 16 }, latest)).toEqual({ rate: 15.42, source: 'auto', date: '2026-10-26' })
  })

  it('falls back to the daily rate when manual mode has no rate', () => {
    expect(effectiveRate({ rate_mode: 'manual', manual_rate: null }, latest).source).toBe('auto')
  })

  it('is 1 with source "none" when nothing exists', () => {
    expect(effectiveRate(null, null)).toEqual({ rate: 1, source: 'none' })
    expect(effectiveRate({ rate_mode: 'auto', manual_rate: null }, null)).toEqual({ rate: 1, source: 'none' })
  })
})

describe('equivalents', () => {
  it('converts to the other currency at the given rate, rounded to cents', () => {
    expect(otherCurrency('GHS')).toBe('USD')
    expect(otherCurrency('USD')).toBe('GHS')
    expect(convert(100, 'GHS', 11.622)).toBe(8.6)
    expect(convert(20, 'USD', 11.622)).toBe(232.44)
  })

  it('treats a stored rate of 1 as "no rate yet"', () => {
    expect(isRealRate(1)).toBe(false)
    expect(isRealRate(11.622)).toBe(true)
    expect(isRealRate(0)).toBe(false)
  })
})

describe('rateForDate', () => {
  const rates = [
    { date: '2026-10-20', usd_ghs: 11.5 },
    { date: '2026-10-26', usd_ghs: 11.622 },
    { date: '2026-10-24', usd_ghs: 11.6 },
  ]

  it('uses the newest rate on or before the date', () => {
    expect(rateForDate(rates, '2026-10-25')).toBe(11.6)
    expect(rateForDate(rates, '2026-10-26')).toBe(11.622)
    expect(rateForDate(rates, '2026-11-01')).toBe(11.622)
  })

  it('falls back to the earliest rate for dates before any rate, and null with no rates', () => {
    expect(rateForDate(rates, '2026-10-01')).toBe(11.5)
    expect(rateForDate([], '2026-10-01')).toBeNull()
  })
})

describe('parseRate / formatRate', () => {
  it('reads a manual rate with up to 4 decimals, Arabic digits and comma decimals', () => {
    expect(parseRate('11.622')).toBe(11.622)
    expect(parseRate('11,5')).toBe(11.5)
    expect(parseRate('١٥٫٤٢')).toBe(15.42)
    expect(parseRate(' 16 ')).toBe(16)
  })

  it('rejects zero, 1 (reserved for "no rate"), junk and absurd values', () => {
    expect(parseRate('0')).toBeNull()
    expect(parseRate('1')).toBeNull()
    expect(parseRate('')).toBeNull()
    expect(parseRate('abc')).toBeNull()
    expect(parseRate('11.12345')).toBeNull()
    expect(parseRate('1000000')).toBeNull()
  })

  it('formats with 2 to 4 decimals and Latin digits', () => {
    expect(formatRate(11.622)).toBe('11.622')
    expect(formatRate(16)).toBe('16.00')
    expect(formatRate(15.4237)).toBe('15.4237')
  })
})

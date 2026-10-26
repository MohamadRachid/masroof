import { describe, expect, it } from 'vitest'
import { effectiveRate } from './fx'

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

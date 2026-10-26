import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  it('maps known routes', () => {
    expect(parseHash('#/history')).toBe('history')
    expect(parseHash('#/plan')).toBe('plan')
    expect(parseHash('#/more')).toBe('more')
    expect(parseHash('#/add')).toBe('add')
  })

  it('falls back to home for empty or unknown hashes', () => {
    expect(parseHash('')).toBe('home')
    expect(parseHash('#')).toBe('home')
    expect(parseHash('#/')).toBe('home')
    expect(parseHash('#/nope')).toBe('home')
  })

  it('treats a magic-link token hash as home, never a blank screen', () => {
    expect(parseHash('#access_token=abc&refresh_token=def&type=magiclink')).toBe('home')
    expect(parseHash('#error=access_denied&error_code=otp_expired')).toBe('home')
  })

  it('ignores a query string after the route', () => {
    expect(parseHash('#/plan?x=1')).toBe('plan')
  })
})

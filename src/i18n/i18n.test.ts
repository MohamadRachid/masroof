import { describe, expect, it } from 'vitest'
import { ar } from './ar'
import { en } from './en'
import { dirFor, formatLongDate, formatShortDate, interpolate, ltr } from './format'

describe('translations', () => {
  it('Arabic has exactly the English keys', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort())
  })

  it('no Arabic string is empty', () => {
    expect(Object.values(ar).every((v) => v.trim().length > 0)).toBe(true)
  })

  it('every {placeholder} in English also appears in Arabic', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(ar[key]), key).toEqual(vars(en[key]))
    }
  })
})

describe('interpolate', () => {
  it('replaces named placeholders', () => {
    expect(interpolate('Week: {spent} / {limit}', { spent: 320, limit: 400 })).toBe('Week: 320 / 400')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hi {x}', {})).toBe('Hi {x}')
  })

  it('returns the template when no vars are given', () => {
    expect(interpolate('Plain')).toBe('Plain')
  })
})

describe('dirFor', () => {
  it('Arabic is right-to-left, English left-to-right', () => {
    expect(dirFor('ar')).toBe('rtl')
    expect(dirFor('en')).toBe('ltr')
  })
})

describe('formatLongDate', () => {
  const d = new Date(2026, 9, 26) // Monday 26 October 2026, local time

  it('uses Latin digits in Arabic', () => {
    const s = formatLongDate(d, 'ar')
    expect(s).toContain('26')
    expect(s).not.toMatch(/[٠-٩۰-۹]/)
    expect(s).toMatch(/[؀-ۿ]/) // Arabic weekday/month names
  })

  it('names the weekday and month in English', () => {
    const s = formatLongDate(d, 'en')
    expect(s).toContain('Monday')
    expect(s).toContain('26')
    expect(s).toContain('October')
  })
})

describe('formatShortDate', () => {
  it('gives day + short month, Latin digits in Arabic', () => {
    expect(formatShortDate('2026-10-20', 'en')).toBe('20 Oct')
    const ar = formatShortDate('2026-10-20', 'ar')
    expect(ar).toContain('20')
    expect(ar).not.toMatch(/[٠-٩]/)
  })
})

describe('ltr', () => {
  it('wraps text in LRI…PDI so numbers keep their order inside Arabic', () => {
    expect(ltr('170 / 220 GHS')).toBe('⁦170 / 220 GHS⁩')
  })
})

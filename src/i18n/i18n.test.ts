import { describe, expect, it } from 'vitest'
import { ar } from './ar'
import { en } from './en'
import { dirFor, interpolate } from './format'

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

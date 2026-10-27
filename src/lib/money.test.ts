import { describe, expect, it } from 'vitest'
import { adjustCategory, balance, drift, driftTrend, formatMoney, formatSigned, parseAdjustAmount, parseAmount, parseSignedAmount, round2, toCents } from './money'

describe('toCents / round2', () => {
  it('rounds half away from zero at 2 decimals, without float drift', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-1.005)).toBe(-1.01)
    expect(round2(0.1 + 0.2)).toBe(0.3)
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(-0.07)).toBe(-7)
  })
})

describe('parseAmount', () => {
  it('reads plain and decimal amounts', () => {
    expect(parseAmount('12')).toBe(12)
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount(' 1,250.75 ')).toBe(1250.75)
  })

  it('accepts a comma as the decimal separator when it is the only separator', () => {
    expect(parseAmount('12,5')).toBe(12.5)
    expect(parseAmount('0,99')).toBe(0.99)
  })

  it('accepts Arabic-Indic and Persian digits and the Arabic decimal mark', () => {
    expect(parseAmount('١٢٫٥')).toBe(12.5)
    expect(parseAmount('۱۲۰')).toBe(120)
  })

  it('rounds to 2 decimals', () => {
    expect(parseAmount('1.005')).toBe(1.01)
  })

  it('rejects empty, zero, negative and junk', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('0.001')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('rejects amounts that cannot fit numeric(14,2)', () => {
    expect(parseAmount('1000000000000')).toBeNull()
    expect(parseAmount('999999999999.99')).toBe(999999999999.99)
  })
})

describe('balance', () => {
  const account = { id: 'bank', opening_balance: 1000 }
  const e = (type: string, amount: number, extra: Partial<{ account_id: string; deleted_at: string | null }> = {}) => ({
    type,
    amount,
    account_id: 'bank',
    deleted_at: null,
    ...extra,
  })

  it('is opening + in − out + adjust', () => {
    expect(balance(account, [e('in', 500), e('out', 120.5), e('adjust', -9.5), e('adjust', 2)])).toBe(1372)
  })

  it('ignores deleted entries and other accounts', () => {
    expect(balance(account, [e('out', 100, { deleted_at: '2026-10-26T10:00:00Z' }), e('out', 50, { account_id: 'cash' })])).toBe(1000)
  })

  it('sums in cents, so many small amounts stay exact', () => {
    const many = Array.from({ length: 10 }, () => e('out', 0.1))
    expect(balance({ id: 'bank', opening_balance: 1 }, many)).toBe(0)
  })
})

describe('formatMoney', () => {
  it('uses Latin digits, thousands separators and 2 decimals', () => {
    expect(formatMoney(1234.5)).toBe('1,234.50')
    expect(formatMoney(0)).toBe('0.00')
  })

  it('uses a true minus sign for negatives', () => {
    expect(formatMoney(-20)).toBe('−20.00')
  })
})

describe('parseSignedAmount (opening balances)', () => {
  it('accepts empty as zero, negatives (overdrawn) and Arabic digits', () => {
    expect(parseSignedAmount('')).toBe(0)
    expect(parseSignedAmount('0')).toBe(0)
    expect(parseSignedAmount('-250.5')).toBe(-250.5)
    expect(parseSignedAmount('−40')).toBe(-40)
    expect(parseSignedAmount('١٢٠')).toBe(120)
    expect(parseSignedAmount('1,250.75')).toBe(1250.75)
  })

  it('rejects junk, NaN-producing and out-of-range input', () => {
    expect(parseSignedAmount('abc')).toBeNull()
    expect(parseSignedAmount('1'.repeat(23))).toBeNull()
    expect(parseSignedAmount('10000000000000')).toBeNull()
    expect(parseSignedAmount('-10000000000000')).toBeNull()
    expect(parseSignedAmount('--5')).toBeNull()
  })
})

describe('reconcile: drift and parseAdjustAmount', () => {
  it('drift = actual − computed, exact to the cent', () => {
    expect(drift(100.1, 100.3)).toBe(-0.2)
    expect(drift(230, 195.55)).toBe(34.45)
    expect(drift(-20, -20)).toBe(0)
  })

  it('parseAdjustAmount keeps the sign and rejects empty and zero', () => {
    expect(parseAdjustAmount('-35')).toBe(-35)
    expect(parseAdjustAmount('−12.5')).toBe(-12.5)
    expect(parseAdjustAmount('35')).toBe(35)
    expect(parseAdjustAmount('')).toBeNull()
    expect(parseAdjustAmount('0')).toBeNull()
    expect(parseAdjustAmount('-0.00')).toBeNull()
    expect(parseAdjustAmount('abc')).toBeNull()
  })
})

describe('driftTrend (SPEC §7)', () => {
  let n = 0
  const check = (account_id: string, date: string, diff: number, deleted_at: string | null = null) => ({
    account_id, date, diff, deleted_at, created_at: `2026-10-01T00:00:${String(++n).padStart(2, '0')}Z`,
  })
  const inGhs = (accountId: string, amount: number) => (accountId === 'usd' ? amount * 12 : amount)

  it('says nothing until some account was checked twice', () => {
    expect(driftTrend([], inGhs)).toBeNull()
    expect(driftTrend([check('cash', '2026-10-01', -50), check('bank', '2026-10-02', 10)], inGhs)).toBeNull()
  })

  it('shrinking / growing / steady compare each latest drift with the one before', () => {
    expect(driftTrend([check('cash', '2026-10-01', -50), check('cash', '2026-10-20', -10)], inGhs)).toEqual({ kind: 'shrinking' })
    expect(driftTrend([check('bank', '2026-10-01', 40), check('bank', '2026-10-20', -40)], inGhs)).toEqual({ kind: 'steady' })
    const growing = [
      check('cash', '2026-10-01', -10), check('cash', '2026-10-20', -60),
      check('bank', '2026-10-02', 5), check('bank', '2026-10-21', 5),
    ]
    expect(driftTrend(growing, inGhs)).toEqual({ kind: 'growing', mostly: 'cash' })
  })

  it('counts USD drift at today’s rate', () => {
    const checks = [
      check('usd', '2026-10-01', -1), check('usd', '2026-10-20', -10), // 12 → 120 GHS
      check('cash', '2026-10-01', -50), check('cash', '2026-10-20', -100),
    ]
    expect(driftTrend(checks, inGhs)).toEqual({ kind: 'growing', mostly: 'usd' })
  })

  it('all latest checks at 0 → clean; an account checked once is left out', () => {
    const checks = [check('cash', '2026-10-01', -50), check('cash', '2026-10-20', 0), check('bank', '2026-10-21', 90)]
    expect(driftTrend(checks, inGhs)).toEqual({ kind: 'clean' })
  })

  it('ignores deleted checks and orders same-day checks by creation', () => {
    const checks = [
      check('cash', '2026-10-01', -50),
      check('cash', '2026-10-20', -5),
      check('cash', '2026-10-20', -80), // created later the same day: the latest
      check('cash', '2026-10-25', 0, '2026-10-25T10:00:00Z'),
    ]
    expect(driftTrend(checks, inGhs)).toEqual({ kind: 'growing', mostly: 'cash' })
  })
})

describe('adjustCategory', () => {
  const c = (name_en: string, kind = 'variable', archived = false) => ({ id: name_en, name_en, kind, archived })
  it('is the live Other category, else the first live non-income one', () => {
    expect(adjustCategory([c('Salary', 'income'), c('Food'), c('Other')])?.id).toBe('Other')
    expect(adjustCategory([c('Salary', 'income'), c('Other', 'variable', true), c('Food')])?.id).toBe('Food')
    expect(adjustCategory([c('Salary', 'income')])).toBeUndefined()
  })
})

describe('formatSigned (drift)', () => {
  it('shows + for extra money, a true minus for missing money, none for zero', () => {
    expect(formatSigned(34.45)).toBe('+34.45')
    expect(formatSigned(-35)).toBe('−35.00')
    expect(formatSigned(0)).toBe('0.00')
  })
})

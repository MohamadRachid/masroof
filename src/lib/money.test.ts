import { describe, expect, it } from 'vitest'
import { balance, formatMoney, parseAmount, parseSignedAmount, round2, toCents } from './money'

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

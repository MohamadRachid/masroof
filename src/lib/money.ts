// Money is a number in major units, rounded to 2 decimals. All arithmetic goes
// through integer cents here; never add raw amounts anywhere else.

export const MAX_AMOUNT = 999_999_999_999.99 // numeric(14,2)

/** Integer cents, half away from zero, immune to binary float drift (1.005 → 101). */
export function toCents(n: number): number {
  const abs = Math.abs(n)
  if (abs < 1e-6) return 0
  const cents = Math.round(Number(`${abs}e2`))
  return n < 0 ? -cents : cents
}

export function round2(n: number): number {
  return toCents(n) / 100
}

const DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٫': '.', '٬': ',',
}

/** Arabic-Indic / Persian digits and the Arabic decimal and thousands marks → Latin. */
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹٫٬]/g, (ch) => DIGITS[ch] ?? ch)
}

/** An unsigned number from what the user typed, rounded to cents; null if it isn't one. */
function readNumber(input: string): number | null {
  let s = normalizeDigits(input.trim().replace(/\s/g, ''))
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '')
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.')
  else s = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = round2(Number(s))
  return Number.isFinite(n) ? n : null
}

/**
 * What the user typed → a positive amount, or null. Accepts Arabic/Persian
 * digits, "12,5" (comma as decimal when it's the only separator) and "1,250.75".
 */
export function parseAmount(input: string): number | null {
  const n = readNumber(input)
  return n !== null && n > 0 && n <= MAX_AMOUNT ? n : null
}

/** Opening balances: empty means 0, may be negative (an overdrawn bank), never NaN or out of range. */
export function parseSignedAmount(input: string): number | null {
  const s = input.trim()
  if (s === '') return 0
  const negative = /^[-−]/.test(s)
  const n = readNumber(negative ? s.slice(1) : s)
  if (n === null || n > MAX_AMOUNT) return null
  return negative && n !== 0 ? -n : n
}

type BalanceAccount = { id: string; opening_balance: number }
type BalanceEntry = { type: string; amount: number; account_id: string; deleted_at: string | null }

/** SPEC §5: opening + Σ in − Σ out + Σ adjust, live entries only. */
export function balance(account: BalanceAccount, entries: readonly BalanceEntry[]): number {
  let cents = toCents(account.opening_balance)
  for (const e of entries) {
    if (e.account_id !== account.id || e.deleted_at) continue
    const c = toCents(e.amount)
    cents += e.type === 'out' ? -c : c
  }
  return cents / 100
}

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "1,234.50", "−20.00": Latin digits in both languages, true minus sign. */
export function formatMoney(n: number): string {
  const r = round2(n)
  return r < 0 ? `−${fmt.format(-r)}` : fmt.format(r)
}

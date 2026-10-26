import { normalizeDigits, round2 } from './money'

export type EffectiveRate =
  | { rate: number; source: 'manual' }
  | { rate: number; source: 'auto'; date: string }
  | { rate: 1; source: 'none' }

type RateSettings = { rate_mode: string; manual_rate: number | null }
type LatestRate = { usd_ghs: number; date: string }

/** SPEC §5: manual rate in manual mode, else the latest daily rate, else 1 ("no rate"). Display only. */
export function effectiveRate(settings: RateSettings | null, latest: LatestRate | null): EffectiveRate {
  if (settings?.rate_mode === 'manual' && settings.manual_rate && settings.manual_rate > 0) {
    return { rate: settings.manual_rate, source: 'manual' }
  }
  if (latest && latest.usd_ghs > 0) return { rate: latest.usd_ghs, source: 'auto', date: latest.date }
  return { rate: 1, source: 'none' }
}

export type Currency = 'GHS' | 'USD'

export function otherCurrency(currency: string): Currency {
  return currency === 'USD' ? 'GHS' : 'USD'
}

/** An amount's value in the other currency. Display only: stored amounts are never converted. */
export function convert(amount: number, from: string, usdGhs: number): number {
  return round2(from === 'USD' ? amount * usdGhs : amount / usdGhs)
}

/** Phase 1 entries were saved with 1, meaning "no rate yet"; a real USD/GHS rate is never 1. */
export function isRealRate(rate: number): boolean {
  return rate > 0 && rate !== 1
}

/** The newest daily rate on or before `date`; the earliest one for older dates; null with no rates. */
export function rateForDate(rates: readonly { date: string; usd_ghs: number }[], date: string): number | null {
  let best: { date: string; usd_ghs: number } | null = null
  let earliest: { date: string; usd_ghs: number } | null = null
  for (const r of rates) {
    if (!earliest || r.date < earliest.date) earliest = r
    if (r.date <= date && (!best || r.date > best.date)) best = r
  }
  return (best ?? earliest)?.usd_ghs ?? null
}

/** A manual rate (GHS for 1 USD): positive, up to 4 decimals, never 1 (that means "no rate"). */
export function parseRate(text: string): number | null {
  const s = normalizeDigits(text.trim()).replace(',', '.')
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null
  const n = Number(s)
  return n > 0 && n < 100_000 && n !== 1 ? n : null
}

const rateFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export function formatRate(rate: number): string {
  return rateFormat.format(rate)
}

/**
 * Settings changes for a Daily/Manual tap. Switching to manual with no manual rate
 * also saves the rate on screen; otherwise effectiveRate would quietly stay on daily.
 */
export function rateModeChanges(
  mode: 'auto' | 'manual',
  current: { manual_rate: number | null },
  shownText: string,
): { rate_mode: 'auto' | 'manual'; manual_rate?: number } {
  if (mode === 'manual' && !current.manual_rate) {
    const rate = parseRate(shownText)
    if (rate !== null) return { rate_mode: 'manual', manual_rate: rate }
  }
  return { rate_mode: mode }
}

/** "1 USD = 11.622 GHS" kept left-to-right inside Arabic text (LRI … PDI). */
export function rateFormula(line: string): string {
  return `⁦${line}⁩`
}

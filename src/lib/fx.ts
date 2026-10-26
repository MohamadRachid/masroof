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

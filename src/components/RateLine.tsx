import { useI18n } from '../i18n'
import { formatShortDate } from '../i18n/format'
import { useEffectiveRate } from '../lib/data'
import { formatRate, rateFormula } from '../lib/fx'
import { goTab } from '../lib/router'
import { useToday } from '../lib/useToday'
import styles from './RateLine.module.css'

/** SPEC §6 Home footer: "1 USD = 11.62 GHS · daily · today" (or "manual"). Tap to change it in More. */
export function RateLine() {
  const { t, lang } = useI18n()
  const eff = useEffectiveRate()
  const today = useToday()
  if (!eff) return null

  let text: string
  if (eff.source === 'none') {
    text = t('fx.none')
  } else {
    const parts = [rateFormula(t('fx.line', { rate: formatRate(eff.rate) }))]
    if (eff.source === 'manual') parts.push(t('fx.manual'))
    else parts.push(t('fx.auto'), eff.date === today ? t('fx.today') : formatShortDate(eff.date, lang))
    text = parts.join(' · ')
  }

  return (
    <button type="button" className={styles.line} onClick={() => goTab('more')} data-none={eff.source === 'none' || undefined}>
      {text}
    </button>
  )
}

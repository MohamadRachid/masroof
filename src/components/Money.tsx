import { formatMoney } from '../lib/money'
import styles from './Money.module.css'

type Tone = 'out' | 'in' | 'plain'

/**
 * An amount with its currency code. Always Latin digits, isolated LTR so it
 * sits correctly inside Arabic text. Large sizes use the number typeface.
 */
export function Money({
  value,
  currency,
  tone = 'plain',
  size = 'md',
}: {
  value: number
  currency: string
  tone?: Tone
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sign = tone === 'out' ? '−' : tone === 'in' ? '+' : ''
  const text = sign ? `${sign}${formatMoney(Math.abs(value))}` : formatMoney(value)
  return (
    <span className={styles.money} data-tone={tone} data-size={size} data-negative={tone === 'plain' && value < 0 ? true : undefined}>
      <span className={styles.value}>{text}</span>
      <span className={styles.currency}>{currency}</span>
    </span>
  )
}

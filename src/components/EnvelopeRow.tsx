import { useI18n } from '../i18n'
import type { Category } from '../lib/db'
import { formatMoney, type EnvelopeStat } from '../lib/money'
import { categoryName, iconFor } from '../lib/names'
import { Icon } from './Icon'
import { Progress, type BarStatus } from './Progress'
import styles from './EnvelopeRow.module.css'

export function envelopeStatus(spent: number, planned: number, warnPct: number): BarStatus {
  if (planned <= 0) return spent > 0 ? 'bad' : 'plain'
  const pct = (spent / planned) * 100
  return pct >= 100 ? 'bad' : pct >= warnPct ? 'warn' : 'plain'
}

/** One envelope: name, spent of planned, what's left (or over), and a thin bar. */
export function EnvelopeRow({ stat, category, warnPct }: { stat: EnvelopeStat; category: Category | undefined; warnPct: number }) {
  const { t, lang } = useI18n()
  const status = envelopeStatus(stat.spent, stat.planned, warnPct)
  return (
    <div className={styles.row}>
      <span className={styles.icon}>
        <Icon name={iconFor(category?.icon ?? 'dots')} size={18} />
      </span>
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name}>{category ? categoryName(category, lang) : '—'}</span>
          <span className={styles.left} data-status={stat.left < 0 ? 'bad' : status}>
            {stat.left >= 0
              ? t('plan.left', { amount: formatMoney(stat.left) })
              : t('plan.overBy', { amount: formatMoney(-stat.left) })}
          </span>
        </span>
        <Progress value={stat.planned > 0 ? stat.spent / stat.planned : stat.spent > 0 ? 1 : 0} status={status} />
        <span className={styles.meta}>
          {t('plan.spentOf', { spent: formatMoney(stat.spent), planned: formatMoney(stat.planned) })} GHS
        </span>
      </span>
    </div>
  )
}

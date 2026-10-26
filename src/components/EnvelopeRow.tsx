import { useI18n } from '../i18n'
import type { Category } from '../lib/db'
import { envelopeStatus, formatMoney, type EnvelopeStat } from '../lib/money'
import { categoryName, iconFor } from '../lib/names'
import { Icon } from './Icon'
import { Equivalent } from './Money'
import { Progress } from './Progress'
import styles from './EnvelopeRow.module.css'

/** One envelope: name, spent of planned, what's left (or over), and a thin bar. */
export function EnvelopeRow({
  stat,
  category,
  warnPct,
  rate,
}: {
  stat: EnvelopeStat
  category: Category | undefined
  warnPct: number
  /** Effective rate now, for the USD equivalent of what's left (SPEC §5). */
  rate: number | null
}) {
  const { t, lang } = useI18n()
  const status = envelopeStatus(stat.kind, stat.spent, stat.planned, warnPct)
  return (
    <div className={styles.row}>
      <span className={styles.icon}>
        <Icon name={iconFor(category?.icon ?? 'dots')} size={18} />
      </span>
      <span className={styles.body}>
        <span className={styles.top}>
          <span className={styles.name}>{category ? categoryName(category, lang) : '—'}</span>
          <span className={styles.left} data-status={status}>
            {stat.left >= 0
              ? t('plan.left', { amount: formatMoney(stat.left) })
              : t('plan.overBy', { amount: formatMoney(-stat.left) })}
          </span>
        </span>
        <Progress value={stat.planned > 0 ? stat.spent / stat.planned : stat.spent > 0 ? 1 : 0} status={status} />
        <span className={styles.meta}>
          <span>{t('plan.spentOf', { spent: formatMoney(stat.spent), planned: formatMoney(stat.planned) })} GHS</span>
          <Equivalent amount={stat.left} currency="GHS" rate={rate} />
        </span>
      </span>
    </div>
  )
}

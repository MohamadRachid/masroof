import { useI18n } from '../i18n'
import { ghs } from '../i18n/format'
import type { Category } from '../lib/db'
import { formatMoney, type CloseSummary, type EnvelopeStat } from '../lib/money'
import { EnvelopeRow } from './EnvelopeRow'
import { Money } from './Money'
import styles from './EnvelopeGroups.module.css'

const KINDS = ['variable', 'fixed', 'savings'] as const

/** Planned vs actual per envelope, grouped day-to-day, fixed, savings. Empty envelopes are left out. */
export function EnvelopeGroups({ stats, categories, warnPct, rate }: { stats: EnvelopeStat[]; categories: Category[]; warnPct: number; rate: number | null }) {
  const { t } = useI18n()
  const catById = new Map(categories.map((c) => [c.id, c]))
  return (
    <>
      {KINDS.map((kind) => {
        const list = stats
          .filter((s) => s.kind === kind && (s.planned > 0 || s.spent > 0))
          .sort((a, b) => (catById.get(a.category_id)?.sort ?? 0) - (catById.get(b.category_id)?.sort ?? 0))
        if (list.length === 0) return null
        return (
          <section key={kind} className={styles.group}>
            <h2 className={styles.groupTitle}>{t(`plan.kind.${kind}`)}</h2>
            <div className={styles.list}>
              {list.map((s) => (
                <EnvelopeRow key={s.category_id} stat={s} category={catById.get(s.category_id)} warnPct={warnPct} rate={rate} />
              ))}
            </div>
          </section>
        )
      })}
    </>
  )
}

/** A plan's month in two numbers: planned, spent, and how far under or over (SPEC §7 close summary). */
export function PlanTotals({ summary }: { summary: CloseSummary }) {
  const { t } = useI18n()
  const status = summary.diff < 0 ? 'bad' : 'good'
  return (
    <div className={styles.totals}>
      <div className={styles.row}>
        <span className={styles.label}>{t('salary.planned')}</span>
        <Money value={summary.planned} currency="GHS" />
      </div>
      <div className={styles.row}>
        <span className={styles.label}>{t('salary.spent')}</span>
        <Money value={summary.spent} currency="GHS" />
      </div>
      <p className={styles.diff} data-status={status}>
        {summary.diff > 0
          ? t('salary.under', { amount: ghs(formatMoney(summary.diff)) })
          : summary.diff < 0
            ? t('salary.over', { amount: ghs(formatMoney(-summary.diff)) })
            : t('salary.onPlan')}
      </p>
    </div>
  )
}

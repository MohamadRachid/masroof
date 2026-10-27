import { useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { EnvelopeGroups, PlanTotals } from '../components/EnvelopeGroups'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { PlanEditor } from '../components/PlanEditor'
import { SalarySheet } from '../components/SalarySheet'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { useBackToClose } from '../components/useBackToClose'
import { useI18n } from '../i18n'
import { formatShortDate, ghs } from '../i18n/format'
import { useCategories, useCurrentPlan, useDisplayRate, usePlans, usePlanStats, useSettings } from '../lib/data'
import type { Plan as PlanRow } from '../lib/db'
import { closeSummary, formatMoney } from '../lib/money'
import styles from './Plan.module.css'

export default function Plan() {
  const { t, lang } = useI18n()
  const current = useCurrentPlan()
  const plans = usePlans()
  const categories = useCategories()
  const settings = useSettings()
  const rate = useDisplayRate()
  const [editing, setEditing] = useState(false)
  const [salaryOpen, setSalaryOpen] = useState(false)
  const [past, setPast] = useState<PlanRow | null>(null)

  if (current === undefined || !categories || !plans) return null
  const warnPct = settings?.warn_pct ?? 80
  const closed = plans.filter((p) => p.closed_at)

  return (
    <Screen
      title={t('plan.title')}
      subtitle={
        current
          ? `${t('plan.period', { start: formatShortDate(current.snapshot.plan.start_date, lang), end: formatShortDate(current.snapshot.plan.expected_end, lang) })} · ${t('plan.daysLeft', { days: current.stats.daysRemaining })}`
          : undefined
      }
    >
      {current ? (
        <>
          <section className={styles.summary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{t('plan.salary')}</span>
              <span className={styles.summaryValue}>
                <Money value={current.snapshot.plan.salary} currency="GHS" size="lg" />
                <Equivalent amount={current.snapshot.plan.salary} currency="GHS" rate={rate} />
              </span>
            </div>
            {current.snapshot.plan.carry_in > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>{t('plan.carried')}</span>
                <span className={styles.summaryValue}>
                  <Money value={current.snapshot.plan.carry_in} currency="GHS" tone="in" />
                  <Equivalent amount={current.snapshot.plan.carry_in} currency="GHS" rate={rate} />
                </span>
              </div>
            )}
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>{t('plan.allocated')}</span>
              <span className={styles.summaryValue}>
                <Money value={current.stats.allocated} currency="GHS" />
                <Equivalent amount={current.stats.allocated} currency="GHS" rate={rate} />
              </span>
            </div>
            {current.stats.unallocated !== 0 && (
              <p className={styles.warning} data-status={current.stats.unallocated < 0 ? 'bad' : 'warn'}>
                <Icon name="alert" size={16} />
                {current.stats.unallocated > 0
                  ? t('plan.unallocated', { amount: ghs(formatMoney(current.stats.unallocated)) })
                  : t(current.snapshot.plan.carry_in > 0 ? 'plan.overBudget' : 'plan.overSalary', { amount: ghs(formatMoney(-current.stats.unallocated)) })}
              </p>
            )}
            <div className={styles.actions}>
              <Button onClick={() => setEditing(true)}>{t('plan.edit')}</Button>
              <Button variant="primary" onClick={() => setSalaryOpen(true)}>
                {t('plan.salaryReceived')}
              </Button>
            </div>
          </section>
          <EnvelopeGroups stats={current.stats.envelopes} categories={categories} warnPct={warnPct} rate={rate} />
        </>
      ) : (
        <>
          <EmptyState icon="plan" title={t('plan.empty.title')} body={t('plan.empty.body')} />
          <div className={styles.emptyActions}>
            <Button variant="primary" size="lg" block onClick={() => setSalaryOpen(true)}>
              <Icon name="wallet" size={20} />
              {t('plan.salaryReceived')}
            </Button>
            {/* First run: the salary may already be in the opening balance (SPEC §6 phase 4 note). */}
            <Button variant="ghost" block onClick={() => setEditing(true)}>
              {t('plan.startWithout')}
            </Button>
          </div>
        </>
      )}

      {closed.length > 0 && (
        <section className={styles.group}>
          <h2 className={styles.groupTitle}>{t('plan.past')}</h2>
          <div className={styles.list}>
            {closed.map((p) => (
              <button key={p.id} type="button" className={styles.pastRow} onClick={() => setPast(p)}>
                <span>{t('plan.period', { start: formatShortDate(p.start_date, lang), end: formatShortDate(p.expected_end, lang) })}</span>
                <Money value={p.salary} currency="GHS" size="sm" />
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}

      <PlanEditor open={editing} existing={current?.snapshot ?? null} onClose={() => setEditing(false)} />
      <SalarySheet open={salaryOpen} onClose={() => setSalaryOpen(false)} />
      <PastPlanSheet plan={past} plans={plans} onClose={() => setPast(null)} />
    </Screen>
  )
}

/** Read-only planned vs actual for a closed plan, with what happened to its leftover (SPEC §6, §7). */
function PastPlanSheet({ plan, plans, onClose }: { plan: PlanRow | null; plans: PlanRow[]; onClose: () => void }) {
  const { t, lang } = useI18n()
  const categories = useCategories()
  const settings = useSettings()
  const rate = useDisplayRate()
  useBackToClose(plan !== null, onClose)

  // The plan ran until the next one started (plans are newest first).
  const idx = plan ? plans.findIndex((p) => p.id === plan.id) : -1
  const next = idx > 0 ? plans[idx - 1] : undefined
  const stats = usePlanStats(plan, next?.start_date)

  const title = plan ? t('plan.pastTitle', { start: formatShortDate(plan.start_date, lang), end: formatShortDate(plan.expected_end, lang) }) : ''
  const leftoverNote =
    plan?.leftover && (plan.leftover_action === 'savings' || plan.leftover_action === 'buffer' || plan.leftover_action === 'ignore')
      ? t(`plan.leftover.${plan.leftover_action}`, { amount: ghs(formatMoney(plan.leftover)) })
      : null

  return (
    <Sheet open={plan !== null} onClose={onClose} title={title}>
      {plan && stats && categories && (
        <div className={styles.pastBody}>
          <PlanTotals summary={closeSummary(stats)} />
          {(leftoverNote || plan.carry_in > 0) && (
            <div className={styles.notes}>
              {plan.carry_in > 0 && <p>{t('planEditor.carried', { amount: ghs(`+${formatMoney(plan.carry_in)}`) })}</p>}
              {leftoverNote && <p>{leftoverNote}</p>}
            </div>
          )}
          <EnvelopeGroups stats={stats.envelopes} categories={categories} warnPct={settings?.warn_pct ?? 80} rate={rate} />
        </div>
      )}
    </Sheet>
  )
}

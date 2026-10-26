import { useState } from 'react'
import { Button } from '../components/Button'
import { EmptyState } from '../components/EmptyState'
import { EnvelopeRow } from '../components/EnvelopeRow'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { PlanEditor } from '../components/PlanEditor'
import { Screen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { useBackToClose } from '../components/useBackToClose'
import { useI18n } from '../i18n'
import { formatShortDate } from '../i18n/format'
import { useAccounts, useCategories, useCurrentPlan, useDisplayRate, useEntries, useEnvelopes, usePlans, useSettings } from '../lib/data'
import type { Category, Plan as PlanRow } from '../lib/db'
import { formatMoney, planStats, type EnvelopeStat } from '../lib/money'
import { useToday } from '../lib/useToday'
import styles from './Plan.module.css'

const KINDS = ['variable', 'fixed', 'savings'] as const

function EnvelopeGroups({ stats, categories, warnPct, rate }: { stats: EnvelopeStat[]; categories: Category[]; warnPct: number; rate: number | null }) {
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

export default function Plan() {
  const { t, lang } = useI18n()
  const current = useCurrentPlan()
  const plans = usePlans()
  const categories = useCategories()
  const settings = useSettings()
  const rate = useDisplayRate()
  const [editing, setEditing] = useState(false)
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
                  ? t('plan.unallocated', { amount: formatMoney(current.stats.unallocated) })
                  : t('plan.overSalary', { amount: formatMoney(-current.stats.unallocated) })}
              </p>
            )}
            <Button onClick={() => setEditing(true)}>{t('plan.edit')}</Button>
          </section>
          <EnvelopeGroups stats={current.stats.envelopes} categories={categories} warnPct={warnPct} rate={rate} />
        </>
      ) : (
        <>
          <EmptyState icon="plan" title={t('plan.empty.title')} body={t('plan.empty.body')} />
          <Button variant="primary" size="lg" block onClick={() => setEditing(true)}>
            {t('plan.start')}
          </Button>
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
      <PastPlanSheet plan={past} plans={plans} onClose={() => setPast(null)} />
    </Screen>
  )
}

/** Read-only planned vs actual for a closed plan (SPEC §6 Plan → past plans). */
function PastPlanSheet({ plan, plans, onClose }: { plan: PlanRow | null; plans: PlanRow[]; onClose: () => void }) {
  const { t, lang } = useI18n()
  const envelopes = useEnvelopes()
  const categories = useCategories()
  const entries = useEntries()
  const accounts = useAccounts()
  const settings = useSettings()
  const rate = useDisplayRate()
  const today = useToday()
  useBackToClose(plan !== null, onClose)

  const title = plan ? t('plan.pastTitle', { start: formatShortDate(plan.start_date, lang), end: formatShortDate(plan.expected_end, lang) }) : ''
  let body = null
  if (plan && envelopes && categories && entries && accounts) {
    // The plan ran until the next one started (plans are newest first).
    const idx = plans.findIndex((p) => p.id === plan.id)
    const next = idx > 0 ? plans[idx - 1] : undefined
    const stats = planStats({
      plan,
      envelopes: envelopes.filter((e) => e.plan_id === plan.id),
      categories,
      entries,
      today,
      nextStart: next?.start_date,
      weekStart: settings?.week_start ?? 1,
      warnPct: settings?.warn_pct ?? 80,
      currencyOf: (id) => accounts.find((a) => a.id === id)?.currency ?? 'GHS',
      fallbackRate: rate,
    })
    body = <EnvelopeGroups stats={stats.envelopes} categories={categories} warnPct={settings?.warn_pct ?? 80} rate={rate} />
  }

  return (
    <Sheet open={plan !== null} onClose={onClose} title={title}>
      <div className={styles.pastBody}>{body}</div>
    </Sheet>
  )
}

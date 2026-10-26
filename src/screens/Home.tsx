import { useEffect } from 'react'
import { EntryRow } from '../components/EntryRow'
import { EnvelopeRow } from '../components/EnvelopeRow'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { Progress } from '../components/Progress'
import { RateLine } from '../components/RateLine'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'
import { formatLongDate, ltr } from '../i18n/format'
import { useAccounts, useCategories, useCurrentPlan, useDisplayRate, useEntries, useSettings } from '../lib/data'
import { parseLocalDate } from '../lib/dates'
import type { Entry } from '../lib/db'
import { groupByDay } from '../lib/entries'
import { balance, formatMoney, type PlanStats, type WeekStatus } from '../lib/money'
import { accountName } from '../lib/names'
import { goTab } from '../lib/router'
import { useToday } from '../lib/useToday'
import styles from './Home.module.css'

export default function Home({ onOpenEntry }: { onOpenEntry: (entry: Entry) => void }) {
  const { t, lang } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  const today = useToday()
  const rate = useDisplayRate()
  const current = useCurrentPlan()
  const settings = useSettings()
  useStatusGlow(current?.stats.week.status ?? null)
  if (!accounts || !categories || !entries || current === undefined) return null

  const currencyOf = (id: string) => accounts.find((a) => a.id === id)?.currency ?? ''
  const todayGroup = groupByDay(
    entries.filter((e) => e.date === today),
    currencyOf,
  )[0]

  return (
    <Screen title={t('home.title')} subtitle={formatLongDate(parseLocalDate(today), lang)}>
      {current && (
        <section className={styles.hero} data-status={current.stats.week.status} aria-label={t('home.safe')}>
          <span className={styles.heroLabel}>{t('home.safe')}</span>
          <span className={styles.heroAmount}>
            <Money value={current.stats.safeToSpend} currency="GHS" size="xl" />
          </span>
          <Equivalent amount={current.stats.safeToSpend} currency="GHS" rate={rate} />
          {current.stats.week.hasBudget ? (
            <div className={styles.week}>
              <div className={styles.weekRow}>
                <span>{t('home.week')}</span>
                <span className={styles.weekNumbers}>
                  {ltr(`${formatMoney(current.stats.week.spent)} / ${formatMoney(current.stats.week.limit)} GHS`)}
                </span>
              </div>
              <Progress value={current.stats.week.limit > 0 ? current.stats.week.spent / current.stats.week.limit : 1} status={current.stats.week.status} />
            </div>
          ) : (
            <p className={styles.heroHint}>{t('home.noVariable')}</p>
          )}
          <span className={styles.heroDays}>{t('plan.daysLeft', { days: current.stats.daysRemaining })}</span>
        </section>
      )}

      <section className={styles.balances} aria-label={t('home.balances')}>
        {accounts.map((a) => {
          const value = balance(a, entries)
          return (
            <div key={a.id} className={styles.balance}>
              <span className={styles.balanceName}>{accountName(a, t)}</span>
              <Money value={value} currency={a.currency} size="xl" />
              {/* Balances use the effective rate now (SPEC §5). */}
              <Equivalent amount={value} currency={a.currency} rate={rate} />
            </div>
          )
        })}
      </section>

      {current ? (
        <EnvelopesPreview stats={current.stats} warnPct={settings?.warn_pct ?? 80} rate={rate} />
      ) : (
        <button type="button" className={styles.planCard} onClick={() => goTab('plan')}>
          <span className={styles.planIcon}>
            <Icon name="plan" size={22} />
          </span>
          <span className={styles.planText}>
            <span className={styles.planTitle}>{t('home.planCard.title')}</span>
            <span className={styles.planBody}>{t('home.planCard.body')}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      )}

      <section className={styles.today}>
        <div className={styles.todayHead}>
          <h2 className={styles.sectionTitle}>{t('home.todayEntries')}</h2>
          {todayGroup && (
            <span className={styles.totals}>
              {Object.entries(todayGroup.outTotals).map(([cur, total]) => (
                <span key={cur} className={styles.total}>
                  <Money value={total ?? 0} currency={cur} tone="out" size="sm" />
                  <Equivalent amount={total ?? 0} currency={cur} rate={rate} />
                </span>
              ))}
            </span>
          )}
        </div>
        {todayGroup ? (
          <div className={styles.list}>
            {todayGroup.entries.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                category={categories.find((c) => c.id === e.category_id)}
                account={accounts.find((a) => a.id === e.account_id)}
                onOpen={onOpenEntry}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>{t('home.todayEmpty')}</p>
        )}
      </section>

      <RateLine />
    </Screen>
  )
}

const GLOW: Record<WeekStatus, string> = {
  good: 'rgb(91 196 137 / 0.07)',
  warn: 'rgb(240 160 75 / 0.09)',
  bad: 'rgb(239 106 91 / 0.1)',
}

/** The page's ambient glow takes the week's colour while Home is showing. */
function useStatusGlow(status: WeekStatus | null) {
  useEffect(() => {
    const root = document.documentElement
    if (status) root.style.setProperty('--glow', GLOW[status])
    return () => {
      root.style.removeProperty('--glow')
    }
  }, [status])
}

/** Envelopes for the open plan, day-to-day first; tap through to the Plan tab. */
function EnvelopesPreview({ stats, warnPct, rate }: { stats: PlanStats; warnPct: number; rate: number | null }) {
  const { t } = useI18n()
  const categories = useCategories() ?? []
  const order = { variable: 0, fixed: 1, savings: 2 } as Record<string, number>
  const sortOf = (id: string) => categories.find((c) => c.id === id)?.sort ?? 0
  const list = stats.envelopes
    .filter((e) => e.planned > 0 || e.spent > 0)
    .sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3) || sortOf(a.category_id) - sortOf(b.category_id))
  if (list.length === 0) return null
  return (
    <section className={styles.today}>
      <div className={styles.todayHead}>
        <h2 className={styles.sectionTitle}>{t('home.envelopes')}</h2>
      </div>
      <button type="button" className={styles.envelopes} onClick={() => goTab('plan')}>
        {list.map((e) => (
          <EnvelopeRow key={e.category_id} stat={e} category={categories.find((c) => c.id === e.category_id)} warnPct={warnPct} rate={rate} />
        ))}
      </button>
    </section>
  )
}

import { EntryRow } from '../components/EntryRow'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { RateLine } from '../components/RateLine'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'
import { formatLongDate } from '../i18n/format'
import { useAccounts, useCategories, useDisplayRate, useEntries } from '../lib/data'
import { parseLocalDate } from '../lib/dates'
import type { Entry } from '../lib/db'
import { groupByDay } from '../lib/entries'
import { balance } from '../lib/money'
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
  if (!accounts || !categories || !entries) return null

  const currencyOf = (id: string) => accounts.find((a) => a.id === id)?.currency ?? ''
  const todayGroup = groupByDay(
    entries.filter((e) => e.date === today),
    currencyOf,
  )[0]

  return (
    <Screen title={t('home.title')} subtitle={formatLongDate(parseLocalDate(today), lang)}>
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

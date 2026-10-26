import { EntryRow } from '../components/EntryRow'
import { Icon } from '../components/Icon'
import { Money } from '../components/Money'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'
import { formatLongDate } from '../i18n/format'
import { useAccounts, useCategories, useEntries } from '../lib/data'
import { localDateISO } from '../lib/dates'
import type { Entry } from '../lib/db'
import { groupByDay } from '../lib/entries'
import { balance } from '../lib/money'
import { accountName } from '../lib/names'
import { goTab } from '../lib/router'
import styles from './Home.module.css'

export default function Home({ onOpenEntry }: { onOpenEntry: (entry: Entry) => void }) {
  const { t, lang } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  if (!accounts || !categories || !entries) return null

  const today = localDateISO()
  const currencyOf = (id: string) => accounts.find((a) => a.id === id)?.currency ?? ''
  const todayGroup = groupByDay(
    entries.filter((e) => e.date === today),
    currencyOf,
  )[0]

  return (
    <Screen title={t('home.title')} subtitle={formatLongDate(new Date(), lang)}>
      <section className={styles.balances} aria-label={t('home.balances')}>
        {accounts.map((a) => (
          <div key={a.id} className={styles.balance}>
            <span className={styles.balanceName}>{accountName(a, t)}</span>
            <Money value={balance(a, entries)} currency={a.currency} size="xl" />
          </div>
        ))}
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
                <Money key={cur} value={total ?? 0} currency={cur} tone="out" size="sm" />
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
    </Screen>
  )
}

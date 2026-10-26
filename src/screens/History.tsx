import { useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { EntryRow } from '../components/EntryRow'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'
import { formatLongDate } from '../i18n/format'
import { useAccounts, useCategories, useDisplayRate, useEntries } from '../lib/data'
import { parseLocalDate, relativeDay } from '../lib/dates'
import type { Entry } from '../lib/db'
import { groupByDay, matchesSearch } from '../lib/entries'
import { accountName } from '../lib/names'
import { useToday } from '../lib/useToday'
import styles from './History.module.css'

const PAGE = 150

export default function History({ onOpenEntry }: { onOpenEntry: (entry: Entry) => void }) {
  const { t, lang } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  const [query, setQuery] = useState('')
  const [accountId, setAccountId] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const today = useToday()
  const rate = useDisplayRate()

  if (!accounts || !categories || !entries) return null
  if (entries.length === 0) {
    return (
      <Screen title={t('history.title')}>
        <EmptyState icon="history" title={t('history.empty.title')} body={t('history.empty.body')} />
      </Screen>
    )
  }

  const catById = new Map(categories.map((c) => [c.id, c]))
  const currencyOf = (id: string) => accounts.find((a) => a.id === id)?.currency ?? ''
  const filtered = entries.filter((e) => {
    if (accountId && e.account_id !== accountId) return false
    const c = catById.get(e.category_id)
    return matchesSearch(e, c ? [c.name_en, c.name_ar] : [], query)
  })
  const groups = groupByDay(filtered, currencyOf)

  // Render day groups until the entry budget is spent; "Show more" raises it.
  let budget = limit
  const shown: typeof groups = []
  for (const g of groups) {
    if (budget <= 0) break
    shown.push(g)
    budget -= g.entries.length
  }

  return (
    <Screen title={t('history.title')}>
      <div className={styles.tools}>
        <label className={styles.search}>
          <span className="visually-hidden">{t('history.search')}</span>
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder={t('history.search')}
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className={styles.clear} onClick={() => setQuery('')} aria-label={t('history.clearSearch')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <div className={styles.filters} role="radiogroup" aria-label={t('entry.account')}>
          <button type="button" role="radio" aria-checked={accountId === null} className={styles.filter} onClick={() => setAccountId(null)}>
            {t('history.all')}
          </button>
          {accounts.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={accountId === a.id} className={styles.filter} onClick={() => setAccountId(a.id)}>
              {accountName(a, t)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.none}>{t('history.noMatches')}</p>
      ) : (
        <div className={styles.days}>
          {shown.map((g) => {
            const rel = relativeDay(g.date, today)
            return (
              <section key={g.date} className={styles.day}>
                <div className={styles.dayHead}>
                  <h2 className={styles.dayTitle}>
                    {rel ? t(rel === 'today' ? 'day.today' : 'day.yesterday') : formatLongDate(parseLocalDate(g.date), lang)}
                  </h2>
                  <span className={styles.totals}>
                    {Object.entries(g.outTotals).map(([cur, total]) => (
                      <span key={cur} className={styles.total}>
                        <Money value={total ?? 0} currency={cur} tone="out" size="sm" />
                        <Equivalent amount={total ?? 0} currency={cur} rate={rate} />
                      </span>
                    ))}
                  </span>
                </div>
                <div className={styles.list}>
                  {g.entries.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      category={catById.get(e.category_id)}
                      account={accounts.find((a) => a.id === e.account_id)}
                      onOpen={onOpenEntry}
                    />
                  ))}
                </div>
              </section>
            )
          })}
          {budget <= 0 && shown.length < groups.length && (
            <button type="button" className={styles.more} onClick={() => setLimit((l) => l + PAGE)}>
              {t('history.showMore')}
            </button>
          )}
        </div>
      )}
    </Screen>
  )
}

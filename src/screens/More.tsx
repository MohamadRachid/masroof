import { useState, type CSSProperties, type ReactNode } from 'react'
import { AccountSheet } from '../components/AccountSheet'
import { Icon } from '../components/Icon'
import { Equivalent, Money } from '../components/Money'
import { ReconcileSheet } from '../components/ReconcileSheet'
import { RecurringSheet } from '../components/RecurringSheet'
import { Screen } from '../components/Screen'
import { useI18n, type Lang } from '../i18n'
import { signOut } from '../lib/auth'
import {
  useAccounts,
  useCategories,
  useData,
  useDisplayRate,
  useEntries,
  useLatestRate,
  useReconciliations,
  useRecurring,
  useRecurringPeriod,
  useSettings,
} from '../lib/data'
import type { Account, Recurring } from '../lib/db'
import { convert, formatRate, parseRate, rateFormula, rateModeChanges } from '../lib/fx'
import { balance, driftTrend, formatMoney, formatSigned, normalizeDigits } from '../lib/money'
import { accountName, iconFor } from '../lib/names'
import { recurringState } from '../lib/recurring'
import { updateSettings } from '../lib/store'
import { showToast } from '../lib/toast'
import { useToday } from '../lib/useToday'
import { formatShortDate, ltr } from '../i18n/format'
import styles from './More.module.css'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.group}>{children}</div>
    </section>
  )
}

const LANGS: readonly Lang[] = ['en', 'ar']
const MODES = ['auto', 'manual'] as const

/** SPEC §6/§9: daily rate from the server, or a manual rate that stays until changed. */
function RateSection() {
  const { t, lang } = useI18n()
  const { db } = useData()
  const settings = useSettings()
  const latest = useLatestRate()
  const today = useToday()
  const [text, setText] = useState<string | null>(null)
  if (!settings || latest === undefined) return null

  const manual = settings.rate_mode === 'manual'
  const value = text ?? (settings.manual_rate ? String(settings.manual_rate) : latest ? String(latest.usd_ghs) : '')
  const parsed = parseRate(value)

  async function change(changes: { rate_mode?: string; manual_rate?: number }) {
    if (!settings) return
    const before = { rate_mode: settings.rate_mode, manual_rate: settings.manual_rate }
    await updateSettings(db, settings, changes)
    const after = { ...settings, ...changes }
    showToast({
      message: t('toast.rateSaved'),
      action: { label: t('toast.undo'), run: () => void updateSettings(db, after, before) },
    })
  }

  return (
    <>
      <div className={styles.row}>
        <span className={styles.rowIcon}>
          <Icon name="refresh" size={20} />
        </span>
        <span className={styles.rowLabel} id="rate-label">
          {t('more.section.rate')}
        </span>
        <div className={styles.segmented} role="radiogroup" aria-labelledby="rate-label" style={{ '--i': manual ? 1 : 0 } as CSSProperties}>
          <span className={styles.thumb} aria-hidden="true" />
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={settings.rate_mode === m}
              className={styles.segment}
              onClick={() => m !== settings.rate_mode && void change(rateModeChanges(m, settings, value))}
            >
              {t(m === 'auto' ? 'rate.auto' : 'rate.manual')}
            </button>
          ))}
        </div>
      </div>
      {manual ? (
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault()
            if (parsed !== null) {
              void change({ manual_rate: parsed })
              setText(null)
            }
          }}
        >
          <label className={styles.rateField} data-invalid={(text !== null && parsed === null) || undefined}>
            <span className={styles.rowHint}>{t('rate.manualLabel')}</span>
            <input value={value} onChange={(e) => setText(normalizeDigits(e.target.value))} inputMode="decimal" dir="ltr" />
          </label>
          <button type="submit" className={styles.rateSave} disabled={parsed === null || parsed === settings.manual_rate}>
            {t('rate.save')}
          </button>
        </form>
      ) : (
        <div className={styles.row}>
          <span className={styles.rowHint}>
            {latest
              ? t('rate.dailyInfo', { formula: rateFormula(t('fx.line', { rate: formatRate(latest.usd_ghs) })), date: latest.date === today ? t('fx.today') : formatShortDate(latest.date, lang) })
              : t('rate.dailyNone')}
          </span>
        </div>
      )}
    </>
  )
}

/** An amount at the end of a row, with its other-currency value under it (SPEC §5, rate now). */
function RowAmount({ value, currency, tone, signed }: { value: number; currency: string; tone?: 'in' | 'out'; signed?: boolean }) {
  const rate = useDisplayRate()
  return (
    <span className={styles.rowAmount}>
      {signed ? (
        <span className={`num ${styles.signed}`}>{ltr(`${formatSigned(value)} ${currency}`)}</span>
      ) : (
        <Money value={value} currency={currency} tone={tone} size="sm" />
      )}
      <Equivalent amount={value} currency={currency} rate={rate} />
    </span>
  )
}

/** SPEC §6 More → Recurring: each item with its day, account and state in this plan. */
function RecurringSection({ onOpen }: { onOpen: (item: Recurring | null) => void }) {
  const { t, lang } = useI18n()
  const items = useRecurring()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  const period = useRecurringPeriod()
  const today = useToday()
  if (!items || !accounts || !categories || !entries || !period) return null

  return (
    <Section title={t('more.section.recurring')}>
      {items.map((r) => {
        const account = accounts.find((a) => a.id === r.account_id)
        const category = categories.find((c) => c.id === r.category_id)
        // Same rule as Home's Due card: an item whose account or category is gone has no state.
        const s = account && category ? recurringState(r, period, entries, today) : ({ state: 'none' } as const)
        const state =
          s.state === 'due'
            ? t('recurring.dueNow')
            : s.state === 'posted'
              ? t('recurring.postedOn', { date: formatShortDate(s.date, lang) })
              : s.state === 'upcoming'
                ? t('recurring.next', { date: formatShortDate(s.date, lang) })
                : null
        const base = [t('recurring.day', { day: r.day_of_month }), account ? accountName(account, t) : null].filter(Boolean).join(' · ')
        return (
          <button key={r.id} type="button" className={styles.row} onClick={() => onOpen(r)}>
            <span className={styles.rowIcon}>
              <Icon name={iconFor(category?.icon ?? 'dots')} size={20} />
            </span>
            <span className={styles.rowStack}>
              <span className={styles.rowName}>{r.name}</span>
              <span className={styles.rowHint}>
                {base}
                {state && (
                  <>
                    {' · '}
                    <span data-status={s.state === 'due' ? 'warn' : undefined}>{state}</span>
                  </>
                )}
              </span>
            </span>
            <RowAmount value={r.amount} currency={account?.currency ?? ''} tone={r.type === 'in' ? 'in' : 'out'} />
          </button>
        )
      })}
      <button type="button" className={styles.row} onClick={() => onOpen(null)}>
        <span className={styles.rowIcon}>
          <Icon name="plus" size={20} />
        </span>
        <span className={styles.rowStack}>
          <span>{t('recurring.add')}</span>
          {items.length === 0 && <span className={styles.rowHint}>{t('recurring.emptyHint')}</span>}
        </span>
      </button>
    </Section>
  )
}

const HISTORY = 10

/** SPEC §6 More → Reconcile: each account's last check and drift; then the trend and the drift history. */
function ReconcileSection({ onOpen }: { onOpen: (account: Account) => void }) {
  const { t, lang } = useI18n()
  const accounts = useAccounts()
  const entries = useEntries()
  const checks = useReconciliations()
  const rate = useDisplayRate()
  const [showAll, setShowAll] = useState(false)
  if (!accounts || !entries || !checks) return null

  const byId = new Map(accounts.map((a) => [a.id, a]))
  const currencyOf = (id: string) => byId.get(id)?.currency ?? ''
  // USD drift counts at today's rate (display only); with no rate yet, USD checks stay out of the trend.
  const trendChecks = rate === null ? checks.filter((c) => currencyOf(c.account_id) !== 'USD') : checks
  const trend = driftTrend(trendChecks, (id, amount) => (rate !== null && currencyOf(id) === 'USD' ? convert(amount, 'USD', rate) : amount))
  const shown = showAll ? checks : checks.slice(0, HISTORY)
  const nameOf = (id: string) => {
    const a = byId.get(id)
    return a ? accountName(a, t) : '—'
  }

  return (
    <>
      <Section title={t('more.section.reconcile')}>
        {accounts.map((a) => {
          const last = checks.find((c) => c.account_id === a.id)
          return (
            <button key={a.id} type="button" className={styles.row} onClick={() => onOpen(a)}>
              <span className={styles.rowIcon}>
                <Icon name={a.kind === 'bank' ? 'home' : 'wallet'} size={20} />
              </span>
              <span className={styles.rowStack}>
                <span>{accountName(a, t)}</span>
                <span className={styles.rowHint}>
                  {last ? t('reconcile.row', { date: formatShortDate(last.date, lang), amount: ltr(formatSigned(last.diff)) }) : t('reconcile.never')}
                </span>
              </span>
              <RowAmount value={balance(a, entries)} currency={a.currency} />
            </button>
          )
        })}
      </Section>

      {checks.length > 0 && (
        <Section title={t('more.section.drift')}>
          {trend && (
            <div className={styles.row} data-trend={trend.kind}>
              <span className={styles.rowIcon}>
                <Icon name={trend.kind === 'growing' ? 'trendUp' : trend.kind === 'shrinking' ? 'trendDown' : 'check'} size={20} />
              </span>
              <span className={styles.rowLabel}>
                {trend.kind === 'growing' ? t('drift.growing', { account: nameOf(trend.mostly) }) : t(`drift.${trend.kind}`)}
              </span>
            </div>
          )}
          {shown.map((c) => (
            <div key={c.id} className={`${styles.row} ${styles.compact}`}>
              <span className={styles.rowStack}>
                <span>{nameOf(c.account_id)}</span>
                <span className={styles.rowHint}>{formatShortDate(c.date, lang)}</span>
              </span>
              <RowAmount value={c.diff} currency={currencyOf(c.account_id)} signed />
            </div>
          ))}
          {!showAll && checks.length > HISTORY && (
            <button type="button" className={`${styles.row} ${styles.compact}`} onClick={() => setShowAll(true)}>
              <span className={styles.rowLabel}>{t('drift.showAll')}</span>
            </button>
          )}
        </Section>
      )}
    </>
  )
}

export default function More({ email }: { email: string | null }) {
  const { t, lang, setLang } = useI18n()
  const [signingOut, setSigningOut] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [checking, setChecking] = useState<Account | null>(null)
  const [recurring, setRecurring] = useState<{ item: Recurring | null } | null>(null)
  const accounts = useAccounts() ?? []
  const thumb = { '--i': LANGS.indexOf(lang) } as CSSProperties

  return (
    <Screen title={t('more.title')}>
      <RecurringSection onOpen={(item) => setRecurring({ item })} />
      <ReconcileSection onOpen={setChecking} />

      <Section title={t('more.section.accounts')}>
        {accounts.map((a) => (
          <button key={a.id} type="button" className={styles.row} onClick={() => setEditing(a)}>
            <span className={styles.rowIcon}>
              <Icon name={a.kind === 'bank' ? 'home' : 'wallet'} size={20} />
            </span>
            <span className={styles.rowStack}>
              <span>{accountName(a, t)}</span>
              <span className={styles.rowHint}>
                {t('more.opening', { amount: formatMoney(a.opening_balance), currency: a.currency })}
              </span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </Section>

      <Section title={t('more.section.prefs')}>
        <RateSection />
        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <Icon name="globe" size={20} />
          </span>
          <span className={styles.rowLabel} id="lang-label">
            {t('more.language')}
          </span>
          <div className={styles.segmented} role="radiogroup" aria-labelledby="lang-label" style={thumb}>
            <span className={styles.thumb} aria-hidden="true" />
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                className={styles.segment}
                onClick={() => setLang(l)}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('more.section.account')}>
        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <Icon name="mail" size={20} />
          </span>
          <span className={styles.rowStack}>
            <span className={styles.rowHint}>{t('more.signedInAs')}</span>
            <bdi className={styles.rowValue}>{email}</bdi>
          </span>
        </div>
        <button
          type="button"
          className={styles.row}
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true)
            await signOut()
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="logout" size={20} />
          </span>
          <span className={styles.rowLabel}>{t('more.signOut')}</span>
        </button>
      </Section>

      <AccountSheet account={editing} onClose={() => setEditing(null)} />
      <ReconcileSheet account={checking} onClose={() => setChecking(null)} />
      <RecurringSheet open={recurring !== null} item={recurring?.item ?? null} onClose={() => setRecurring(null)} />
      <p className={styles.version}>{t('more.version', { version: __APP_VERSION__ })}</p>
    </Screen>
  )
}

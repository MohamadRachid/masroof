import { useState, type CSSProperties, type ReactNode } from 'react'
import { AccountSheet } from '../components/AccountSheet'
import { Icon } from '../components/Icon'
import { Screen } from '../components/Screen'
import { useI18n, type Lang } from '../i18n'
import { signOut } from '../lib/auth'
import { useAccounts, useData, useLatestRate, useSettings } from '../lib/data'
import type { Account } from '../lib/db'
import { formatRate, parseRate, rateFormula, rateModeChanges } from '../lib/fx'
import { formatMoney, normalizeDigits } from '../lib/money'
import { accountName } from '../lib/names'
import { updateSettings } from '../lib/store'
import { showToast } from '../lib/toast'
import { useToday } from '../lib/useToday'
import { formatShortDate } from '../i18n/format'
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

export default function More({ email }: { email: string | null }) {
  const { t, lang, setLang } = useI18n()
  const [signingOut, setSigningOut] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const accounts = useAccounts() ?? []
  const thumb = { '--i': LANGS.indexOf(lang) } as CSSProperties

  return (
    <Screen title={t('more.title')}>
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
      <p className={styles.version}>{t('more.version', { version: __APP_VERSION__ })}</p>
    </Screen>
  )
}

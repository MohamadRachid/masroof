import { useState } from 'react'
import { Button } from '../components/Button'
import { LangToggle } from '../components/LangToggle'
import { useI18n, type Lang } from '../i18n'
import { useData, useSettings } from '../lib/data'
import { nowISO } from '../lib/dates'
import { normalizeDigits, parseAmount } from '../lib/money'
import { createAccounts, updateSettings } from '../lib/store'
import { queueRows } from '../lib/sync'
import styles from './FirstRun.module.css'

type Balances = { bank: string; cash: string; usd: string }
const STEPS = 3

/** Empty or 0 means zero; anything else must parse. */
function opening(text: string): number | null {
  const s = text.trim()
  if (s === '' || /^0+([.,٫]0*)?$/.test(s)) return 0
  return parseAmount(s)
}

/** SPEC §6 First run: language → opening balances → usual payday → done. Shown once. */
export default function FirstRun() {
  const { t, lang, setLang } = useI18n()
  const { db, userId } = useData()
  const settings = useSettings()
  const [step, setStep] = useState(0)
  const [balances, setBalances] = useState<Balances>({ bank: '', cash: '', usd: '' })
  const [payday, setPayday] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const day = payday ?? settings?.usual_payday ?? 25
  const parsed = { bank: opening(balances.bank), cash: opening(balances.cash), usd: opening(balances.usd) }
  const balancesOk = parsed.bank !== null && parsed.cash !== null && parsed.usd !== null

  async function finish() {
    if (busy || parsed.bank === null || parsed.cash === null || parsed.usd === null) return
    setBusy(true)
    await createAccounts(db, userId, { bank: parsed.bank, cash: parsed.cash, usd: parsed.usd })
    if (settings) {
      await updateSettings(db, settings, { usual_payday: day, lang })
    } else {
      const now = nowISO()
      await queueRows(db, 'settings', [
        { user_id: userId, lang, rate_mode: 'auto', manual_rate: null, usual_payday: day, warn_pct: 80, week_start: 1, created_at: now, updated_at: now, deleted_at: null },
      ])
    }
    // The accounts now exist, so the app swaps this screen for Home.
  }

  const field = (key: keyof Balances, label: string, currency: string) => (
    <label className={styles.balance} data-invalid={parsed[key] === null || undefined}>
      <span className={styles.balanceLabel}>{label}</span>
      <span className={styles.balanceInput}>
        <input
          value={balances[key]}
          onChange={(e) => setBalances((b) => ({ ...b, [key]: normalizeDigits(e.target.value) }))}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          dir="ltr"
        />
        <span className={styles.cur}>{currency}</span>
      </span>
    </label>
  )

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <span className={styles.progress}>
          {t('firstRun.step', { n: step + 1, total: STEPS })}
          <span className={styles.dots} aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} data-on={i <= step || undefined} />
            ))}
          </span>
        </span>
        <LangToggle />
      </div>

      <main className={styles.main} key={step}>
        {step === 0 && (
          <>
            <h1 className={styles.title}>{t('firstRun.lang.title')}</h1>
            <p className={styles.body}>{t('firstRun.lang.body')}</p>
            <div className={styles.langs} role="radiogroup" aria-label={t('firstRun.lang.title')}>
              {(['en', 'ar'] as Lang[]).map((l) => (
                <button key={l} type="button" role="radio" aria-checked={lang === l} lang={l} className={styles.lang} onClick={() => setLang(l)}>
                  {t(`lang.${l}`)}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className={styles.title}>{t('firstRun.balances.title')}</h1>
            <p className={styles.body}>{t('firstRun.balances.body')}</p>
            <div className={styles.balances}>
              {field('bank', t('account.Bank'), 'GHS')}
              {field('cash', t('account.Cash'), 'GHS')}
              {field('usd', t('account.USD'), 'USD')}
            </div>
            {!balancesOk && <p className={styles.error}>{t('firstRun.invalid')}</p>}
          </>
        )}

        {step === 2 && (
          <>
            <h1 className={styles.title}>{t('firstRun.payday.title')}</h1>
            <p className={styles.body}>{t('firstRun.payday.body')}</p>
            <div className={styles.days} role="radiogroup" aria-label={t('firstRun.payday.title')} dir="ltr">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <button key={d} type="button" role="radio" aria-checked={d === day} className={styles.day} onClick={() => setPayday(d)}>
                  {d}
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <div className={styles.actions}>
        {step > 0 && (
          <Button size="lg" onClick={() => setStep((s) => s - 1)} disabled={busy}>
            {t('firstRun.back')}
          </Button>
        )}
        {step < STEPS - 1 ? (
          <Button variant="primary" size="lg" block onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !balancesOk}>
            {t('firstRun.continue')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={() => void finish()} disabled={busy}>
            {t('firstRun.finish')}
          </Button>
        )}
      </div>
    </div>
  )
}

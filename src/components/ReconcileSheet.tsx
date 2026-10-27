import { useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { formatShortDate, ltr } from '../i18n/format'
import { useAccounts, useCategories, useData, useDisplayRate, useEntries, useLatestRate, useReconciliations, useSettings } from '../lib/data'
import type { Account } from '../lib/db'
import { effectiveRate } from '../lib/fx'
import { adjustCategory, balance, drift, formatSigned, normalizeDigits, parseSignedAmount } from '../lib/money'
import { accountName } from '../lib/names'
import { reconcile, undoReconcile } from '../lib/store'
import { showToast } from '../lib/toast'
import { useToday } from '../lib/useToday'
import { Button } from './Button'
import { Equivalent, Money } from './Money'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './ReconcileSheet.module.css'

/** SPEC §7 Reconcile: the balance Masroof computed, the real one typed in, the drift live; Save fixes the balance. */
export function ReconcileSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t } = useI18n()
  useBackToClose(account !== null, onClose)
  // The parent clears `account` as the sheet starts closing; keep its title until the exit ends.
  const [shown, setShown] = useState(account)
  if (account && account !== shown) setShown(account)
  const current = account ?? shown
  return (
    <Sheet open={account !== null} onClose={onClose} title={current ? t('reconcile.title', { account: accountName(current, t) }) : ''}>
      {current && <ReconcileForm key={current.id} accountId={current.id} onDone={onClose} />}
    </Sheet>
  )
}

function ReconcileForm({ accountId, onDone }: { accountId: string; onDone: () => void }) {
  const { t, lang } = useI18n()
  const { db, userId } = useData()
  const accounts = useAccounts()
  const entries = useEntries()
  const categories = useCategories()
  const checks = useReconciliations()
  const settings = useSettings()
  const latestRate = useLatestRate()
  const displayRate = useDisplayRate()
  const today = useToday()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const account = accounts?.find((a) => a.id === accountId)
  if (!account || !entries || !categories || !checks || settings === undefined || latestRate === undefined) return null

  const computed = balance(account, entries)
  // Must be typed (empty is not 0); may be negative, an overdrawn bank.
  const actual = text.trim() === '' ? null : parseSignedAmount(text)
  const diff = actual === null ? null : drift(actual, computed)
  const category = adjustCategory(categories)
  const last = checks.find((c) => c.account_id === account.id)
  const signed = (n: number) => ltr(`${formatSigned(n)} ${account.currency}`)
  const canSave = actual !== null && !!category && !busy

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!account || actual === null || !category || busy) return
    setBusy(true)
    const receipt = await reconcile(db, userId, {
      accountId: account.id,
      actual,
      date: today,
      rate: effectiveRate(settings ?? null, latestRate ?? null).rate,
      categoryId: category.id,
      note: t('reconcile.note'),
    })
    const name = accountName(account, t)
    showToast({
      message: receipt.adjustment
        ? t('toast.adjusted', { account: name, amount: formatSigned(receipt.adjustment.amount), currency: account.currency })
        : t('toast.reconciled', { account: name }),
      action: { label: t('toast.undo'), run: () => void undoReconcile(db, receipt) },
    })
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={(e) => void save(e)}>
      <div className={styles.computed}>
        <span className={styles.label}>{t('reconcile.computed')}</span>
        <Money value={computed} currency={account.currency} size="lg" />
        <Equivalent amount={computed} currency={account.currency} rate={displayRate} />
        <span className={styles.last}>
          {last ? t('reconcile.lastChecked', { date: formatShortDate(last.date, lang), amount: signed(last.diff) }) : t('reconcile.never')}
        </span>
      </div>

      <label className={styles.field} data-invalid={(text.trim() !== '' && actual === null) || undefined}>
        <span className={styles.label}>{t('reconcile.actual')}</span>
        <span className={styles.amount}>
          <input
            value={text}
            onChange={(e) => setText(normalizeDigits(e.target.value))}
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            placeholder="0.00"
            dir="ltr"
            data-autofocus
            autoFocus
          />
          <span className={styles.cur}>{account.currency}</span>
        </span>
      </label>

      <p className={styles.drift} data-status={diff === null ? undefined : diff === 0 ? 'good' : 'warn'} aria-live="polite">
        {diff === null ? t('reconcile.typeHint') : diff === 0 ? t('reconcile.matches') : t('reconcile.drift', { amount: signed(diff) })}
      </p>
      {!category && <p className={styles.problem}>{t('reconcile.noCategory')}</p>}

      <Button type="submit" variant="primary" size="lg" block disabled={!canSave}>
        {t('reconcile.save')}
      </Button>
    </form>
  )
}

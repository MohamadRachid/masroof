import { useState } from 'react'
import { useI18n } from '../i18n'
import { useData } from '../lib/data'
import type { Account } from '../lib/db'
import { normalizeDigits, round2 } from '../lib/money'
import { updateAccount } from '../lib/store'
import { showToast } from '../lib/toast'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './AccountSheet.module.css'

/** Opening balances may be zero or negative (an overdrawn bank), unlike entry amounts. */
function parseOpening(text: string): number | null {
  const s = normalizeDigits(text.trim()).replace(/\s|,(?=\d{3}\b)/g, '').replace(',', '.')
  if (s === '' || s === '-') return 0
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return round2(Number(s))
}

/** SPEC §6 Settings → accounts: name and opening balance. Saving shows an Undo toast. */
export function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t } = useI18n()
  useBackToClose(account !== null, onClose)
  return (
    <Sheet open={account !== null} onClose={onClose} title={t('accountSheet.title')}>
      {account && <AccountForm key={account.id} account={account} onDone={onClose} />}
    </Sheet>
  )
}

function AccountForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const { t } = useI18n()
  const { db } = useData()
  const [name, setName] = useState(account.name)
  const [openingText, setOpeningText] = useState(String(account.opening_balance))
  const opening = parseOpening(openingText)
  const valid = name.trim().length > 0 && opening !== null

  async function save() {
    if (!valid || opening === null) return
    await updateAccount(db, account, { name: name.trim(), opening_balance: opening })
    const after = { ...account, name: name.trim(), opening_balance: opening }
    showToast({
      message: t('toast.accountUpdated'),
      action: {
        label: t('toast.undo'),
        run: () => void updateAccount(db, after, { name: account.name, opening_balance: account.opening_balance }),
      },
    })
    onDone()
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className={styles.field}>
        <span className={styles.label}>{t('accountSheet.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <label className={styles.field} data-invalid={opening === null || undefined}>
        <span className={styles.label}>{t('accountSheet.opening')}</span>
        <span className={styles.amount}>
          <input value={openingText} onChange={(e) => setOpeningText(normalizeDigits(e.target.value))} inputMode="decimal" dir="ltr" />
          <span className={styles.cur}>{account.currency}</span>
        </span>
      </label>
      <Button type="submit" variant="primary" size="lg" block disabled={!valid}>
        {t('accountSheet.save')}
      </Button>
    </form>
  )
}

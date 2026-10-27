import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { useAccounts, useCategories, useData, useEntries } from '../lib/data'
import type { Account, Category, Entry, Recurring } from '../lib/db'
import { lastUsed } from '../lib/entries'
import { normalizeDigits, parseAmount } from '../lib/money'
import { accountName, categoryName, iconFor } from '../lib/names'
import { deleteRecurring, restoreRecurring, saveRecurring } from '../lib/store'
import { showToast } from '../lib/toast'
import { useToday } from '../lib/useToday'
import { Button } from './Button'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './RecurringSheet.module.css'

type Kind = 'in' | 'out'

/** SPEC §6 More → Recurring: add (item = null) or edit an item. Saving and deleting show an Undo toast. */
export function RecurringSheet({ open, item, onClose }: { open: boolean; item: Recurring | null; onClose: () => void }) {
  const { t } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  useBackToClose(open, onClose)

  // A fresh form every time the sheet opens.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  // Keep showing what the sheet opened with (an item, or the new form) until the exit animation ends.
  const [shown, setShown] = useState(item)
  if (open && item !== shown) setShown(item)
  const current = open ? item : shown

  return (
    <Sheet open={open} onClose={onClose} title={t(current ? 'recurringSheet.titleEdit' : 'recurringSheet.titleNew')}>
      {accounts && categories && entries && (
        <RecurringForm key={`${session}-${current?.id ?? 'new'}`} item={current} accounts={accounts} categories={categories} entries={entries} onDone={onClose} />
      )}
    </Sheet>
  )
}

/** Categories for this type; an item's own category stays offered even after it was archived. */
function allowedFor(type: Kind, categories: Category[], keep?: string): Category[] {
  return categories.filter((c) => (!c.archived || c.id === keep) && (type === 'in' ? c.kind === 'income' : c.kind !== 'income'))
}

function RecurringForm({
  item,
  accounts,
  categories,
  entries,
  onDone,
}: {
  item: Recurring | null
  accounts: Account[]
  categories: Category[]
  entries: Entry[]
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  const { db, userId } = useData()
  const today = useToday()
  const categoryRow = useRef<HTMLDivElement>(null)

  // New items: Out, the last-used account, a fixed category (rent and bills are what repeats), today's day.
  const startType: Kind = item?.type === 'in' ? 'in' : 'out'
  const pickCategory = (type: Kind, id: string | undefined) => {
    const allowed = allowedFor(type, categories, item?.category_id)
    const fallback = type === 'out' ? (allowed.find((c) => c.kind === 'fixed') ?? allowed[0]) : allowed[0]
    return (allowed.some((c) => c.id === id) ? id : fallback?.id) ?? ''
  }
  const [name, setName] = useState(item?.name ?? '')
  const [type, setType] = useState<Kind>(startType)
  const [amountText, setAmountText] = useState(item ? String(item.amount) : '')
  const [accountId, setAccountId] = useState(() => {
    const id = item?.account_id ?? lastUsed(entries, 'out')?.account_id
    return (accounts.some((a) => a.id === id) ? id : accounts[0]?.id) ?? ''
  })
  const [categoryId, setCategoryId] = useState(() => pickCategory(startType, item?.category_id))
  const [dayText, setDayText] = useState(String(item?.day_of_month ?? Number(today.slice(8))))
  const [busy, setBusy] = useState(false)

  // The chosen category may sit past the edge of the scrolling row; bring it into view.
  useEffect(() => {
    categoryRow.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [type])

  const amount = parseAmount(amountText)
  const day = /^\d{1,2}$/.test(dayText) ? Number(dayText) : null
  const account = accounts.find((a) => a.id === accountId)
  const valid = name.trim() !== '' && amount !== null && !!account && categoryId !== '' && day !== null && day >= 1 && day <= 31

  function switchType(next: Kind) {
    if (next === type) return
    setType(next)
    setCategoryId(pickCategory(next, categoryId))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!valid || busy || amount === null || day === null) return
    setBusy(true)
    let saved: Recurring
    try {
      saved = await saveRecurring(db, userId, item, { name, type, amount, account_id: accountId, category_id: categoryId, day_of_month: day })
    } catch {
      setBusy(false)
      showToast({ message: t('toast.saveFailed') })
      return
    }
    showToast({
      message: t('toast.recurringSaved'),
      action: { label: t('toast.undo'), run: () => void (item ? restoreRecurring(db, item) : deleteRecurring(db, saved)) },
    })
    onDone()
  }

  async function remove() {
    if (!item || busy) return
    setBusy(true)
    await deleteRecurring(db, item)
    showToast({ message: t('toast.recurringDeleted'), action: { label: t('toast.undo'), run: () => void restoreRecurring(db, item) } })
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={(e) => void save(e)}>
      <label className={styles.field}>
        <span className={styles.label}>{t('recurringSheet.name')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('recurringSheet.namePlaceholder')}
          maxLength={40}
          enterKeyHint="next"
          data-autofocus={item ? undefined : true}
          autoFocus={!item}
        />
      </label>

      <div className={styles.toggle} role="radiogroup" aria-label={t('entry.amount')} data-value={type}>
        <span className={styles.thumb} aria-hidden="true" />
        {(['out', 'in'] as const).map((v) => (
          <button key={v} type="button" role="radio" aria-checked={type === v} className={styles.toggleBtn} onClick={() => switchType(v)}>
            {t(v === 'out' ? 'entry.out' : 'entry.in')}
          </button>
        ))}
      </div>

      <label className={styles.field} data-invalid={(amountText !== '' && amount === null) || undefined}>
        <span className={styles.label}>{t('entry.amount')}</span>
        <span className={styles.amount}>
          <input value={amountText} onChange={(e) => setAmountText(normalizeDigits(e.target.value))} inputMode="decimal" autoComplete="off" placeholder="0.00" dir="ltr" />
          <span className={styles.cur}>{account?.currency}</span>
        </span>
      </label>

      <div className={styles.chips} role="radiogroup" aria-label={t('entry.account')}>
        {accounts.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={a.id === accountId} className={styles.chip} onClick={() => setAccountId(a.id)}>
            {accountName(a, t)}
            <span className={styles.chipCur}>{a.currency}</span>
          </button>
        ))}
      </div>

      <div ref={categoryRow} className={styles.scroller} role="radiogroup" aria-label={t('entry.category')}>
        {allowedFor(type, categories, item?.category_id).map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === categoryId} className={styles.chip} onClick={() => setCategoryId(c.id)}>
            <Icon name={iconFor(c.icon)} size={16} />
            {categoryName(c, lang)}
          </button>
        ))}
      </div>

      <div className={styles.dayRow}>
        <label className={styles.dayLabel} htmlFor="recurring-day">
          <span>{t('recurringSheet.day')}</span>
          <span className={styles.hint}>{t('recurringSheet.dayHint')}</span>
        </label>
        <input
          id="recurring-day"
          className={styles.dayInput}
          value={dayText}
          onChange={(e) => setDayText(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 2))}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          aria-invalid={day === null || day < 1 || day > 31 || undefined}
        />
      </div>

      <div className={styles.footer}>
        {item && (
          <Button variant="secondary" size="lg" className={styles.delete} onClick={() => void remove()} disabled={busy}>
            {t('entry.delete')}
          </Button>
        )}
        <Button type="submit" variant="primary" size="lg" block disabled={!valid || busy}>
          {t('recurringSheet.save')}
        </Button>
      </div>
    </form>
  )
}

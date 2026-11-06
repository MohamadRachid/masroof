import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { formatShortDate, ltr } from '../i18n/format'
import { useAccounts, useCategories, useCurrentPlan, useData, useEntries, useLatestRate, useSettings } from '../lib/data'
import { localDateISO, relativeDay } from '../lib/dates'
import type { Account, Category, Entry } from '../lib/db'
import { allowedCategories, lastUsed, quickTiles, type QuickTile } from '../lib/entries'
import { amountInAccount, effectiveRate, formatRate, isRealRate, otherCurrency, rateFormula, type Currency } from '../lib/fx'
import { formatMoney, impactOf, normalizeDigits, parseAdjustAmount, parseAmount, round2, type PlanStats } from '../lib/money'
import { accountName, categoryName, iconFor } from '../lib/names'
import { addEntry, deleteEntry, restoreEntry, updateEntry, type EntryType } from '../lib/store'
import { showToast } from '../lib/toast'
import { Button } from './Button'
import { Icon } from './Icon'
import { Equivalent } from './Money'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './EntrySheet.module.css'

/**
 * Add (entry = null) or edit an entry. Order follows SPEC §6: quick tiles,
 * amount, Out/In, account, category, note + date, Save. With good defaults,
 * saving is one tap after typing the amount.
 */
export function EntrySheet({
  open,
  entry,
  onClose,
  backCloses = false,
}: {
  open: boolean
  entry: Entry | null
  onClose: () => void
  backCloses?: boolean
}) {
  const { t } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const entries = useEntries()
  const settings = useSettings()
  const latestRate = useLatestRate()
  const currentPlan = useCurrentPlan()
  useBackToClose(open && backCloses, onClose)

  // A fresh form every time the sheet opens.
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }
  // The parent clears `entry` the moment the sheet starts closing; keep showing the
  // entry it was opened for until the exit animation ends (no flash of the Add form).
  const [shown, setShown] = useState(entry)
  if (entry && entry !== shown) setShown(entry)
  const current = open ? entry : shown

  const ready = accounts && categories && entries && settings !== undefined && latestRate !== undefined && currentPlan !== undefined
  return (
    <Sheet open={open} onClose={onClose} title={t(current ? 'entry.editTitle' : 'entry.addTitle')}>
      {ready && (
        <EntryForm
          key={`${session}-${current?.id ?? 'new'}`}
          entry={current}
          accounts={accounts}
          categories={categories}
          entries={entries}
          rate={effectiveRate(settings ?? null, latestRate ?? null).rate}
          plan={currentPlan?.stats ?? null}
          onDone={onClose}
        />
      )}
    </Sheet>
  )
}

function EntryForm({
  entry,
  accounts,
  categories,
  entries,
  rate,
  plan,
  onDone,
}: {
  entry: Entry | null
  accounts: Account[]
  categories: Category[]
  entries: Entry[]
  rate: number
  plan: PlanStats | null
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  const { db, userId } = useData()
  const today = localDateISO()

  const startType: EntryType = entry ? (entry.type as EntryType) : 'out'
  const defaults = entry ? null : lastUsed(entries, 'out')
  const pickAccount = (id: string | undefined) => (accounts.some((a) => a.id === id) ? id : accounts[0]?.id) ?? ''
  // An entry's own category stays offered for its own type, even archived, so fixing a note can't move it.
  const allowedFor = (forType: EntryType) => allowedCategories(forType, categories, forType === startType ? entry?.category_id : undefined)
  const pickCategory = (forType: EntryType, id: string | undefined) => {
    const allowed = allowedFor(forType)
    return (allowed.some((c) => c.id === id) ? id : allowed[0]?.id) ?? ''
  }

  const [type, setType] = useState<EntryType>(startType)
  const [amountText, setAmountText] = useState(entry ? String(entry.amount) : '')
  const [accountId, setAccountId] = useState(() => pickAccount(entry?.account_id ?? defaults?.account_id))
  const [categoryId, setCategoryId] = useState(() => pickCategory(startType, entry?.category_id ?? defaults?.category_id))
  const [note, setNote] = useState(entry?.note ?? '')
  const [date, setDate] = useState(entry?.date ?? today)
  const [busy, setBusy] = useState(false)
  // Editing never changes the frozen rate unless Ali taps "update rate" (SPEC §9).
  const [rateOverride, setRateOverride] = useState<number | null>(null)
  // The currency the amount is typed in; null = the account's (SPEC §6 "typed currency").
  const [typedCur, setTypedCur] = useState<Currency | null>(null)
  const categoryRow = useRef<HTMLDivElement>(null)
  const amountInput = useRef<HTMLInputElement>(null)

  // The default category may sit past the edge of the scrolling row; bring it into view.
  useEffect(() => {
    categoryRow.current?.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [type])

  // An adjustment keeps its sign (a reconcile can take money off); in/out amounts are always positive.
  const typed = type === 'adjust' ? parseAdjustAmount(amountText) : parseAmount(amountText)
  const account = accounts.find((a) => a.id === accountId)
  const category = categories.find((c) => c.id === categoryId)
  const shownRate = entry ? (rateOverride ?? entry.rate_usd_ghs) : rate
  // In/Out amounts may be typed in the other currency when a real rate exists. The typed
  // currency follows the account chips until tapped, and converts once, at the rate this
  // entry saves; `amount` is always what gets stored, in the account's currency.
  const accountCur = account?.currency ?? ''
  const canSwitch = type !== 'adjust' && accountCur !== '' && isRealRate(shownRate)
  const typedCurrency: string = canSwitch ? (typedCur ?? accountCur) : accountCur
  const converting = typedCurrency !== accountCur
  const amount = typed === null || !account ? null : amountInAccount(typed, typedCurrency, accountCur, shownRate)
  const valid = amount !== null && !!account && !!category
  const visible = allowedFor(type)

  // SPEC §6 / rule 4: warn while typing, before saving. New 'out' entries only.
  const amountGhs =
    account?.currency === 'USD' ? (isRealRate(rate) ? round2((amount ?? 0) * rate) : null) : (amount ?? 0)
  const impact =
    !entry && plan && type === 'out' && category && amountGhs !== null
      ? impactOf(plan, { categoryId: category.id, kind: category.kind, amountGhs })
      : null
  const tiles = entry
    ? []
    : quickTiles(entries, today).filter(
        (tile) => accounts.some((a) => a.id === tile.account_id) && allowedCategories(tile.type, categories).some((c) => c.id === tile.category_id),
      )

  function switchType(next: EntryType) {
    if (next === type) return
    setType(next)
    setCategoryId(pickCategory(next, lastUsed(entries, next as 'in' | 'out')?.category_id ?? categoryId))
  }

  function savedToast(saved: Entry, cur: string, cat: Category | undefined) {
    showToast({
      message: t('toast.saved', {
        amount: formatMoney(saved.amount),
        currency: cur,
        category: cat ? categoryName(cat, lang) : '',
      }),
      action: { label: t('toast.undo'), run: () => void deleteEntry(db, saved) },
    })
  }

  async function save() {
    if (!valid || busy || amount === null) return
    setBusy(true)
    const fields = { type, amount, account_id: accountId, category_id: categoryId, note: note || null, date }
    if (entry) {
      const { before } = await updateEntry(db, entry, rateOverride !== null ? { ...fields, rate_usd_ghs: rateOverride } : fields)
      showToast({ message: t('toast.updated'), action: { label: t('toast.undo'), run: () => void restoreEntry(db, before) } })
    } else {
      const saved = await addEntry(db, userId, { ...fields, rate_usd_ghs: rate })
      savedToast(saved, account.currency, category)
    }
    onDone()
  }

  async function saveTile(tile: QuickTile) {
    if (busy) return
    setBusy(true)
    const saved = await addEntry(db, userId, {
      type: tile.type,
      amount: tile.amount,
      account_id: tile.account_id,
      category_id: tile.category_id,
      note: null,
      date: today,
      rate_usd_ghs: rate,
    })
    const cur = accounts.find((a) => a.id === tile.account_id)?.currency ?? ''
    savedToast(saved, cur, categories.find((c) => c.id === tile.category_id))
    onDone()
  }

  async function remove() {
    if (!entry || busy) return
    setBusy(true)
    await deleteEntry(db, entry)
    showToast({ message: t('toast.deleted'), action: { label: t('toast.undo'), run: () => void restoreEntry(db, entry) } })
    onDone()
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void save()
    }
  }

  const rel = relativeDay(date, today)
  const dateLabel = rel ? t(rel === 'today' ? 'day.today' : 'day.yesterday') : formatShortDate(date, lang)

  return (
    <div className={styles.form}>
      {tiles.length > 0 && (
        <div className={styles.tiles} role="group" aria-label={t('entry.quick')}>
          {tiles.map((tile) => {
            const cat = categories.find((c) => c.id === tile.category_id)
            const acc = accounts.find((a) => a.id === tile.account_id)
            return (
              <button
                key={`${tile.type}-${tile.category_id}-${tile.account_id}-${tile.amount}`}
                type="button"
                className={styles.tile}
                data-type={tile.type}
                onClick={() => void saveTile(tile)}
              >
                <Icon name={iconFor(cat?.icon ?? 'dots')} size={16} />
                <span className={styles.tileName}>{cat ? categoryName(cat, lang) : ''}</span>
                <span className="num">
                  {tile.type === 'in' ? '+' : ''}
                  {formatMoney(tile.amount)}
                </span>
                {acc && accounts.length > 1 && <span className={styles.tileAcc}>{accountName(acc, t)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Tapping beside the number focuses it; the currency button is not inside a label (it can't be). */}
      <div
        className={styles.amountWrap}
        data-type={type}
        onClick={(e) => {
          if (e.target === e.currentTarget) amountInput.current?.focus()
        }}
      >
        <input
          ref={amountInput}
          aria-label={t('entry.amount')}
          className={styles.amount}
          value={amountText}
          onChange={(e) => setAmountText(normalizeDigits(e.target.value))}
          onKeyDown={onEnter}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          placeholder="0.00"
          dir="ltr"
          style={{ width: `${Math.max(amountText.length, 4) + 1}ch` }}
          data-autofocus={entry ? undefined : true}
          // The form mounts after its data loads, so focus here, not from the sheet.
          autoFocus={!entry}
        />
        {canSwitch ? (
          <button
            type="button"
            className={styles.curBtn}
            data-converting={converting || undefined}
            aria-label={t('entry.currencySwitch', { current: typedCurrency, other: otherCurrency(typedCurrency) })}
            // Keep focus, and the phone keyboard, on the amount.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setTypedCur(otherCurrency(typedCurrency))}
          >
            {typedCurrency}
            <Icon name="swap" size={14} />
          </button>
        ) : (
          <span className={styles.currency}>{accountCur}</span>
        )}
      </div>
      <p className={styles.equiv} aria-live="polite">
        {amount !== null &&
          account &&
          (converting ? (
            <span className={styles.converted}>
              {t('entry.converted', {
                amount: ltr(`${formatMoney(amount)} ${account.currency}`),
                formula: rateFormula(t('fx.line', { rate: formatRate(shownRate) })),
              })}
            </span>
          ) : (
            <Equivalent amount={amount} currency={account.currency} rate={shownRate} />
          ))}
      </p>

      {type === 'adjust' ? (
        <p className={styles.adjust}>{t('entry.adjust')}</p>
      ) : (
        <div className={styles.toggle} role="radiogroup" aria-label={t('entry.amount')} data-value={type}>
          <span className={styles.thumb} aria-hidden="true" />
          {(['out', 'in'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={type === v} className={styles.toggleBtn} onClick={() => switchType(v)}>
              {t(v === 'out' ? 'entry.out' : 'entry.in')}
            </button>
          ))}
        </div>
      )}

      <div className={styles.chips} role="radiogroup" aria-label={t('entry.account')}>
        {accounts.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={a.id === accountId} className={styles.chip} onClick={() => setAccountId(a.id)}>
            {accountName(a, t)}
            <span className={styles.chipCur}>{a.currency}</span>
          </button>
        ))}
      </div>

      <div ref={categoryRow} className={styles.scroller} role="radiogroup" aria-label={t('entry.category')}>
        {visible.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === categoryId} className={styles.chip} onClick={() => setCategoryId(c.id)}>
            <Icon name={iconFor(c.icon)} size={16} />
            {categoryName(c, lang)}
          </button>
        ))}
      </div>

      {impact && (impact.week || impact.envelope) && (
        <div className={styles.impact} aria-live="polite">
          {impact.week && (
            <span data-status={impact.week.status}>
              {impact.week.over > 0
                ? t('impact.over', { amount: formatMoney(impact.week.over) })
                : t('impact.week', { amounts: ltr(`${formatMoney(impact.week.spent)} / ${formatMoney(impact.week.limit)} GHS`) })}
            </span>
          )}
          {impact.envelope && category && (
            <span data-status={impact.envelope.left < 0 ? 'bad' : 'plain'}>
              {impact.envelope.left >= 0
                ? t('impact.envelope', { name: categoryName(category, lang), amount: formatMoney(impact.envelope.left) })
                : t('impact.envelopeOver', { name: categoryName(category, lang), amount: formatMoney(-impact.envelope.left) })}
            </span>
          )}
        </div>
      )}

      <div className={styles.details}>
        <input
          className={styles.note}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
          placeholder={t('entry.notePlaceholder')}
          enterKeyHint="done"
          maxLength={200}
        />
        <label className={styles.date}>
          <span className="visually-hidden">{t('entry.date')}</span>
          <span aria-hidden="true">{dateLabel}</span>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={styles.dateInput} />
        </label>
      </div>

      {entry && (
        <div className={styles.rateRow}>
          <span>
            {rateOverride !== null
              ? t('entry.rateWillUpdate', { rate: formatRate(rateOverride) })
              : isRealRate(entry.rate_usd_ghs)
                ? t('entry.rateSaved', { formula: rateFormula(t('fx.line', { rate: formatRate(entry.rate_usd_ghs) })) })
                : t('entry.rateNone')}
          </span>
          {rateOverride === null && isRealRate(rate) && rate !== entry.rate_usd_ghs && (
            <button type="button" className={styles.rateBtn} onClick={() => setRateOverride(rate)}>
              {t('entry.updateRate', { rate: formatRate(rate) })}
            </button>
          )}
        </div>
      )}

      <div className={styles.footer}>
        {entry && (
          <Button variant="secondary" size="lg" className={styles.delete} onClick={() => void remove()} disabled={busy}>
            {t('entry.delete')}
          </Button>
        )}
        <Button variant="primary" size="lg" block onClick={() => void save()} disabled={!valid || busy}>
          {/* ltr: an adjustment's minus sign stays in front of its number in Arabic. */}
          {valid && amount !== null ? t('entry.saveAmount', { amount: ltr(formatMoney(amount)), currency: account.currency }) : t('entry.save')}
        </Button>
      </div>
    </div>
  )
}

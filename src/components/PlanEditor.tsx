import { useState } from 'react'
import { useI18n } from '../i18n'
import { ghs } from '../i18n/format'
import { useCategories, useData, useSettings } from '../lib/data'
import { localDateISO, nextPayday } from '../lib/dates'
import type { Category } from '../lib/db'
import { bufferCategory, formatMoney, nextPlanAmounts, normalizeDigits, parseAmount, parseSignedAmount, plannable, round2, toCents } from '../lib/money'
import { categoryName, iconFor } from '../lib/names'
import { savePlan, undoPlanSave, type PlanDraft, type PlanSnapshot } from '../lib/store'
import { showToast } from '../lib/toast'
import { Button } from './Button'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './PlanEditor.module.css'

const KINDS = ['variable', 'fixed', 'savings'] as const

/** Envelope amounts: empty means 0, never negative. */
function readEnvelope(text: string): number | null {
  const n = parseSignedAmount(text)
  return n === null || n < 0 ? null : n
}

const asText = (n: number | undefined) => (n ? String(n) : '')

/** SPEC §6 Plan: salary, envelopes, total assigned vs salary (never above it). New or edit. */
export function PlanEditor({ open, existing, onClose }: { open: boolean; existing: PlanSnapshot | null; onClose: () => void }) {
  const { t } = useI18n()
  const { db, userId } = useData()
  const categories = useCategories()
  const settings = useSettings()
  useBackToClose(open, onClose)

  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }

  async function submit(draft: PlanDraft) {
    const saved = await savePlan(db, userId, existing, draft)
    showToast({ message: t('toast.planSaved'), action: { label: t('toast.undo'), run: () => void undoPlanSave(db, existing, saved) } })
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={t(existing ? 'planEditor.titleEdit' : 'planEditor.titleNew')}>
      {categories && settings !== undefined && (
        <PlanForm
          key={session}
          existing={existing}
          categories={plannable(categories)}
          payday={settings?.usual_payday ?? 25}
          carryIn={existing?.plan.carry_in ?? 0}
          onSubmit={submit}
        />
      )}
    </Sheet>
  )
}

/**
 * The plan form. Editing starts from `existing`; a new plan from `initial` (Salary received)
 * or empty. `carryIn` (leftover taken into Buffer) raises what can be assigned.
 */
export function PlanForm({
  existing,
  initial,
  categories,
  payday,
  carryIn,
  onSubmit,
}: {
  existing: PlanSnapshot | null
  initial?: { salary: number; amounts: Record<string, number> }
  categories: Category[]
  payday: number
  carryIn: number
  onSubmit: (draft: PlanDraft) => Promise<void>
}) {
  const { t, lang } = useI18n()
  const today = localDateISO()
  const [salaryText, setSalaryText] = useState(existing ? String(existing.plan.salary) : asText(initial?.salary))
  const [ends, setEnds] = useState(existing?.plan.expected_end ?? nextPayday(today, payday))
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const byCategory = existing ? Object.fromEntries(existing.envelopes.map((e) => [e.category_id, e.amount])) : (initial?.amounts ?? {})
    return Object.fromEntries(categories.map((c) => [c.id, asText(byCategory[c.id])]))
  })
  const [busy, setBusy] = useState(false)

  const salary = parseAmount(salaryText)
  const parsed = Object.fromEntries(categories.map((c) => [c.id, readEnvelope(amounts[c.id] ?? '')]))
  const allValid = Object.values(parsed).every((v) => v !== null)
  const assignedCents = Object.values(parsed).reduce<number>((sum, v) => sum + toCents(v ?? 0), 0)
  const remainingCents = salary !== null ? toCents(salary) + toCents(carryIn) - assignedCents : 0
  // A new plan ends in the future; an open plan stays editable after payday (until Salary received closes it).
  const minEnd = existing ? existing.plan.start_date : today
  const canSave = salary !== null && allValid && remainingCents >= 0 && ends >= minEnd && !busy

  function suggest() {
    if (salary === null) return
    const buffer = bufferCategory(categories)
    const s = nextPlanAmounts(categories, null, salary, buffer ? { id: buffer.id, carry: carryIn } : undefined)
    setAmounts(Object.fromEntries(categories.map((c) => [c.id, asText(s[c.id])])))
  }

  async function save() {
    if (!canSave || salary === null) return
    setBusy(true)
    try {
      await onSubmit({
        salary,
        start_date: today,
        expected_end: ends,
        amounts: Object.fromEntries(categories.map((c) => [c.id, round2(parsed[c.id] ?? 0)])),
      })
    } catch (err) {
      console.error('plan save failed', err)
      showToast({ message: t('toast.saveFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.form}>
      <p className={styles.hint}>{t('planEditor.hint')}</p>

      <div className={styles.top}>
        <label className={styles.salary}>
          <span className={styles.label}>{t('planEditor.salary')}</span>
          <span className={styles.salaryInput}>
            <input
              value={salaryText}
              onChange={(e) => setSalaryText(normalizeDigits(e.target.value))}
              inputMode="decimal"
              placeholder="0.00"
              dir="ltr"
              autoFocus={!existing && !initial}
            />
            <span className={styles.cur}>GHS</span>
          </span>
        </label>
        <label className={styles.ends}>
          <span className={styles.label}>{t('planEditor.ends')}</span>
          <input type="date" value={ends} min={minEnd} onChange={(e) => e.target.value && setEnds(e.target.value)} />
        </label>
      </div>
      {carryIn > 0 && <p className={styles.carry}>{t('planEditor.carried', { amount: ghs(`+${formatMoney(carryIn)}`) })}</p>}

      <Button size="md" onClick={suggest} disabled={salary === null}>
        <Icon name="sparkle" size={16} />
        {t('planEditor.suggest')}
      </Button>

      {KINDS.map((kind) => {
        const list = categories.filter((c) => c.kind === kind)
        if (list.length === 0) return null
        return (
          <section key={kind} className={styles.group}>
            <h3 className={styles.groupTitle}>{t(`plan.kind.${kind}`)}</h3>
            {list.map((c) => (
              <label key={c.id} className={styles.envelope} data-invalid={parsed[c.id] === null || undefined}>
                <Icon name={iconFor(c.icon)} size={18} />
                <span className={styles.envName}>{categoryName(c, lang)}</span>
                <input
                  value={amounts[c.id] ?? ''}
                  onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: normalizeDigits(e.target.value) }))}
                  inputMode="decimal"
                  placeholder="0"
                  dir="ltr"
                />
              </label>
            ))}
          </section>
        )
      })}

      <div className={styles.footer}>
        {salary !== null && (
          <p className={styles.balance} data-status={remainingCents < 0 ? 'bad' : remainingCents > 0 ? 'warn' : 'good'}>
            {remainingCents < 0
              ? t(carryIn > 0 ? 'plan.overBudget' : 'plan.overSalary', { amount: ghs(formatMoney(-remainingCents / 100)) })
              : remainingCents > 0
                ? t('plan.unallocated', { amount: ghs(formatMoney(remainingCents / 100)) })
                : `${t('plan.allocated')} ${ghs(formatMoney(assignedCents / 100))}`}
          </p>
        )}
        <Button variant="primary" size="lg" block onClick={() => void save()} disabled={!canSave}>
          {t('planEditor.save')}
        </Button>
      </div>
    </div>
  )
}

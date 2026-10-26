import { useState } from 'react'
import { useI18n } from '../i18n'
import { useCategories, useData, useSettings } from '../lib/data'
import { localDateISO, nextPayday } from '../lib/dates'
import type { Category } from '../lib/db'
import { formatMoney, normalizeDigits, parseAmount, parseSignedAmount, round2, suggestEnvelopes, toCents } from '../lib/money'
import { categoryName, iconFor } from '../lib/names'
import { savePlan, undoPlanSave, type PlanSnapshot } from '../lib/store'
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

/** SPEC §6 Plan: salary, envelopes, total assigned vs salary (never above it). New or edit. */
export function PlanEditor({ open, existing, onClose }: { open: boolean; existing: PlanSnapshot | null; onClose: () => void }) {
  const { t } = useI18n()
  const categories = useCategories()
  const settings = useSettings()
  useBackToClose(open, onClose)

  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession((s) => s + 1)
  }

  return (
    <Sheet open={open} onClose={onClose} title={t(existing ? 'planEditor.titleEdit' : 'planEditor.titleNew')}>
      {categories && settings !== undefined && (
        <PlanForm
          key={session}
          existing={existing}
          categories={categories.filter((c) => c.kind !== 'income' && !c.archived)}
          payday={settings?.usual_payday ?? 25}
          onDone={onClose}
        />
      )}
    </Sheet>
  )
}

function PlanForm({
  existing,
  categories,
  payday,
  onDone,
}: {
  existing: PlanSnapshot | null
  categories: Category[]
  payday: number
  onDone: () => void
}) {
  const { t, lang } = useI18n()
  const { db, userId } = useData()
  const today = localDateISO()
  const [salaryText, setSalaryText] = useState(existing ? String(existing.plan.salary) : '')
  const [ends, setEnds] = useState(existing?.plan.expected_end ?? nextPayday(today, payday))
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const byCategory = new Map((existing?.envelopes ?? []).map((e) => [e.category_id, e.amount]))
    return Object.fromEntries(categories.map((c) => [c.id, byCategory.has(c.id) ? String(byCategory.get(c.id)) : '']))
  })
  const [busy, setBusy] = useState(false)

  const salary = parseAmount(salaryText)
  const parsed = Object.fromEntries(categories.map((c) => [c.id, readEnvelope(amounts[c.id] ?? '')]))
  const allValid = Object.values(parsed).every((v) => v !== null)
  const assignedCents = Object.values(parsed).reduce<number>((sum, v) => sum + toCents(v ?? 0), 0)
  const remainingCents = salary !== null ? toCents(salary) - assignedCents : 0
  const canSave = salary !== null && allValid && remainingCents >= 0 && ends >= today && !busy

  function suggest() {
    if (salary === null) return
    const s = suggestEnvelopes(categories, salary)
    setAmounts(Object.fromEntries(categories.map((c) => [c.id, s[c.id] ? String(s[c.id]) : ''])))
  }

  async function save() {
    if (!canSave || salary === null) return
    setBusy(true)
    const draft = {
      salary,
      start_date: today,
      expected_end: ends,
      amounts: Object.fromEntries(categories.map((c) => [c.id, round2(parsed[c.id] ?? 0)])),
    }
    const saved = await savePlan(db, userId, existing, draft)
    showToast({ message: t('toast.planSaved'), action: { label: t('toast.undo'), run: () => void undoPlanSave(db, existing, saved) } })
    onDone()
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
              autoFocus={!existing}
            />
            <span className={styles.cur}>GHS</span>
          </span>
        </label>
        <label className={styles.ends}>
          <span className={styles.label}>{t('planEditor.ends')}</span>
          <input type="date" value={ends} min={today} onChange={(e) => e.target.value && setEnds(e.target.value)} />
        </label>
      </div>

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
              ? t('plan.overSalary', { amount: formatMoney(-remainingCents / 100) })
              : remainingCents > 0
                ? t('plan.unallocated', { amount: formatMoney(remainingCents / 100) })
                : `${t('plan.allocated')} ${formatMoney(assignedCents / 100)} GHS`}
          </p>
        )}
        <Button variant="primary" size="lg" block onClick={() => void save()} disabled={!canSave}>
          {t('planEditor.save')}
        </Button>
      </div>
    </div>
  )
}

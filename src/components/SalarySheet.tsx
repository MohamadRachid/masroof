import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { formatShortDate, ghs } from '../i18n/format'
import { useAccounts, useCategories, useData, useDisplayRate, useEnvelopes, useLatestRate, usePlans, usePlanStats, useSettings } from '../lib/data'
import { localDateISO } from '../lib/dates'
import type { Account, Category, Plan, PlanEnvelope } from '../lib/db'
import { effectiveRate, isRealRate } from '../lib/fx'
import { bufferCategory, closeSummary, formatMoney, nextPlanAmounts, normalizeDigits, parseAmount, plannable, round2 } from '../lib/money'
import { accountName } from '../lib/names'
import { receiveSalary, undoSalary, type LeftoverAction, type PlanDraft } from '../lib/store'
import { showToast } from '../lib/toast'
import { useToday } from '../lib/useToday'
import { Button } from './Button'
import { EnvelopeGroups, PlanTotals } from './EnvelopeGroups'
import { Icon, type IconName } from './Icon'
import { Equivalent } from './Money'
import { PlanForm } from './PlanEditor'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './SalarySheet.module.css'

type Step = 'amount' | 'close' | 'plan'

/**
 * SPEC §7 Salary received, one sheet: 1 amount + account, 2 close summary and leftover
 * (only with an open plan), 3 the next plan. Nothing is written until the final Save.
 */
export function SalarySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const accounts = useAccounts()
  const categories = useCategories()
  const settings = useSettings()
  const latestRate = useLatestRate()
  const plans = usePlans()
  const envelopes = useEnvelopes()
  useBackToClose(open, onClose)

  const [session, setSession] = useState(0)
  const [step, setStep] = useState<Step>('amount')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSession((s) => s + 1)
      setStep('amount')
    }
  }

  const openPlan = plans?.find((p) => !p.closed_at) ?? null
  const title =
    step === 'close' && openPlan
      ? t('salary.closeTitle', { start: formatShortDate(openPlan.start_date, lang), end: formatShortDate(openPlan.expected_end, lang) })
      : t(step === 'plan' ? 'salary.planTitle' : 'salary.title')
  const ready = accounts && categories && settings !== undefined && latestRate !== undefined && plans && envelopes

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {ready && (
        <SalaryFlow
          key={session}
          step={step}
          setStep={setStep}
          accounts={accounts}
          categories={categories}
          plans={plans}
          envelopes={envelopes}
          rate={effectiveRate(settings ?? null, latestRate ?? null).rate}
          payday={settings?.usual_payday ?? 25}
          warnPct={settings?.warn_pct ?? 80}
          onDone={onClose}
        />
      )}
    </Sheet>
  )
}

function SalaryFlow({
  step,
  setStep,
  accounts,
  categories,
  plans,
  envelopes,
  rate,
  payday,
  warnPct,
  onDone,
}: {
  step: Step
  setStep: (s: Step) => void
  accounts: Account[]
  categories: Category[]
  plans: Plan[]
  envelopes: PlanEnvelope[]
  rate: number
  payday: number
  warnPct: number
  onDone: () => void
}) {
  const { t } = useI18n()
  const { db, userId } = useData()
  const today = useToday()
  const displayRate = useDisplayRate()
  const root = useRef<HTMLDivElement>(null)
  const questionId = useId()

  const openPlan = plans.find((p) => !p.closed_at) ?? null
  const previous = openPlan ?? plans[0] ?? null
  // The open plan as it closes: its period ends yesterday, the new plan starts today.
  const stats = usePlanStats(openPlan, today)
  const summary = stats ? closeSummary(stats) : null
  // A plan started today was never lived (its period is empty): nothing is left over from it.
  const leftover = openPlan && openPlan.start_date < today ? (summary?.leftover ?? 0) : 0
  const buffer = bufferCategory(categories)
  const salaryCategory =
    categories.find((c) => c.kind === 'income' && c.name_en === 'Salary' && !c.archived) ??
    categories.find((c) => c.kind === 'income' && !c.archived)

  const [amountText, setAmountText] = useState(previous?.salary ? String(previous.salary) : '')
  const [accountId, setAccountId] = useState((accounts.find((a) => a.kind === 'bank') ?? accounts[0])?.id ?? '')
  const [choice, setChoice] = useState<LeftoverAction | null>(null)

  const amount = parseAmount(amountText)
  const account = accounts.find((a) => a.id === accountId)
  // The plan budgets in GHS: a salary paid into USD starts the plan at its value at the frozen rate.
  const amountGhs = amount === null ? null : account?.currency === 'USD' ? (isRealRate(rate) ? round2(amount * rate) : null) : amount
  const canContinue = amount !== null && !!account && !!salaryCategory
  const carry = choice === 'buffer' && buffer && leftover > 0 ? leftover : 0

  // Each step starts at its top.
  useEffect(() => {
    root.current?.scrollIntoView({ block: 'start' })
  }, [step])

  function next() {
    if (canContinue) setStep(openPlan ? 'close' : 'plan')
  }

  function decide(action: LeftoverAction | null) {
    setChoice(action)
    setStep('plan')
  }

  async function submit(draft: PlanDraft) {
    // Never start a second open plan: closing needs the open plan's numbers.
    if (amount === null || !salaryCategory || (openPlan && !summary)) return
    const receipt = await receiveSalary(db, userId, {
      entry: { type: 'in', amount, account_id: accountId, category_id: salaryCategory.id, note: null, date: localDateISO(), rate_usd_ghs: rate },
      close: openPlan ? { plan: openPlan, leftover, action: choice ?? 'ignore' } : null,
      plan: draft,
    })
    showToast({ message: t('toast.salarySaved'), action: { label: t('toast.undo'), run: () => void undoSalary(db, receipt) } })
    onDone()
  }

  const onEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      next()
    }
  }

  const back = (to: Step) => (
    <button type="button" className={styles.back} onClick={() => setStep(to)}>
      <span className={styles.backIcon}>
        <Icon name="chevron" size={18} />
      </span>
      {t('salary.back')}
    </button>
  )

  if (step === 'amount') {
    return (
      <div ref={root} className={styles.form}>
        <label className={styles.amountWrap}>
          <span className="visually-hidden">{t('salary.amount')}</span>
          <input
            className={styles.amount}
            value={amountText}
            onChange={(e) => setAmountText(normalizeDigits(e.target.value))}
            onFocus={(e) => e.target.select()}
            onKeyDown={onEnter}
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            placeholder="0.00"
            dir="ltr"
            style={{ width: `${Math.max(amountText.length, 4) + 1}ch` }}
            autoFocus
          />
          <span className={styles.currency}>{account?.currency}</span>
        </label>
        <p className={styles.equiv} aria-live="polite">
          {amount !== null && account && <Equivalent amount={amount} currency={account.currency} rate={rate} />}
        </p>

        <div className={styles.chips} role="radiogroup" aria-label={t('entry.account')}>
          {accounts.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={a.id === accountId} className={styles.chip} onClick={() => setAccountId(a.id)}>
              {accountName(a, t)}
              <span className={styles.chipCur}>{a.currency}</span>
            </button>
          ))}
        </div>
        {!salaryCategory && <p className={styles.problem}>{t('salary.noCategory')}</p>}

        <div className={styles.footer}>
          <Button variant="primary" size="lg" block onClick={next} disabled={!canContinue}>
            {t('salary.next')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'close') {
    if (!stats || !summary) return null
    return (
      <div ref={root} className={styles.form}>
        {back('amount')}
        <PlanTotals summary={summary} />
        {leftover > 0 ? (
          <section className={styles.choices} aria-labelledby={questionId}>
            <p id={questionId} className={styles.question}>
              {t('salary.leftover', { amount: ghs(formatMoney(leftover)) })}
            </p>
            <Choice icon="piggy" title={t('salary.toSavings')} hint={t('salary.toSavingsHint')} onClick={() => decide('savings')} />
            {buffer && (
              <Choice icon="shield" title={t('salary.toBuffer')} hint={t('salary.toBufferHint', { amount: ghs(formatMoney(leftover)) })} onClick={() => decide('buffer')} />
            )}
            <Choice icon="wallet" title={t('salary.ignore')} hint={t('salary.ignoreHint')} onClick={() => decide('ignore')} />
          </section>
        ) : (
          <p className={styles.muted}>{t('salary.noLeftover')}</p>
        )}
        <EnvelopeGroups stats={stats.envelopes} categories={categories} warnPct={warnPct} rate={displayRate} />
        {leftover <= 0 && (
          <div className={styles.footer}>
            <Button variant="primary" size="lg" block onClick={() => decide(null)}>
              {t('salary.next')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={root} className={styles.form}>
      {back(openPlan ? 'close' : 'amount')}
      <PlanForm
        existing={null}
        initial={{
          salary: amountGhs ?? 0,
          amounts: nextPlanAmounts(
            plannable(categories),
            previous ? { envelopes: envelopes.filter((e) => e.plan_id === previous.id), carry_in: previous.carry_in } : null,
            amountGhs ?? 0,
            buffer ? { id: buffer.id, carry } : undefined,
          ),
        }}
        categories={plannable(categories)}
        payday={payday}
        carryIn={carry}
        onSubmit={submit}
      />
    </div>
  )
}

function Choice({ icon, title, hint, onClick }: { icon: IconName; title: string; hint: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.choice} onClick={onClick}>
      <span className={styles.choiceIcon}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.choiceText}>
        <span className={styles.choiceTitle}>{title}</span>
        <span className={styles.choiceHint}>{hint}</span>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  )
}

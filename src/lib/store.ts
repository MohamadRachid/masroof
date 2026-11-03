import type { Lang } from '../i18n/format'
import type { Account, Category, Entry, MasroofDB, Plan, PlanEnvelope, Reconciliation, Recurring, Settings, SyncedTable } from './db'
import { nowISO } from './dates'
import { isRealRate, rateForDate } from './fx'
import { balance, drift, plannable, round2 } from './money'
import { queueRows } from './sync'

// Every write: Dexie first, then the outbox (CLAUDE.md). Undo = write the previous version back.

export type EntryType = 'in' | 'out' | 'adjust'

export type EntryInput = {
  type: EntryType
  amount: number
  account_id: string
  category_id: string
  note: string | null
  date: string
  rate_usd_ghs: number
  /** Set only when posting a recurring item. */
  recurring_id?: string | null
}

export async function addEntry(db: MasroofDB, userId: string, input: EntryInput): Promise<Entry> {
  const id = crypto.randomUUID()
  const now = nowISO()
  const entry: Entry = {
    id,
    user_id: userId,
    client_id: id,
    ...input,
    recurring_id: input.recurring_id ?? null,
    amount: round2(input.amount),
    note: input.note?.trim() || null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  await queueRows(db, 'entries', [entry])
  return entry
}

/** Edit an entry. The frozen rate stays unless the caller passes a new one explicitly (SPEC §9). */
export async function updateEntry(
  db: MasroofDB,
  entry: Entry,
  changes: Partial<EntryInput>,
): Promise<{ before: Entry; after: Entry }> {
  const after: Entry = {
    ...entry,
    ...changes,
    amount: round2(changes.amount ?? entry.amount),
    note: changes.note !== undefined ? changes.note?.trim() || null : entry.note,
    updated_at: nowISO(),
  }
  await queueRows(db, 'entries', [after])
  return { before: entry, after }
}

export async function deleteEntry(db: MasroofDB, entry: Entry): Promise<Entry> {
  const now = nowISO()
  const deleted: Entry = { ...entry, deleted_at: now, updated_at: now }
  await queueRows(db, 'entries', [deleted])
  return deleted
}

/** Put a previous version back: undo for add (pass the deleted copy's original), edit and delete. */
export async function restoreEntry(db: MasroofDB, snapshot: Entry): Promise<void> {
  await queueRows(db, 'entries', [{ ...snapshot, updated_at: nowISO() }])
}

export async function createAccounts(
  db: MasroofDB,
  userId: string,
  opening: { bank: number; cash: number; usd: number },
): Promise<void> {
  const now = nowISO()
  const make = (name: string, currency: 'GHS' | 'USD', kind: string, balance: number, sort: number): Account => ({
    id: crypto.randomUUID(),
    user_id: userId,
    name,
    currency,
    kind,
    opening_balance: round2(balance),
    sort,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  })
  await queueRows(db, 'accounts', [
    make('Bank', 'GHS', 'bank', opening.bank, 10),
    make('Cash', 'GHS', 'cash', opening.cash, 20),
    make('USD', 'USD', 'cash', opening.usd, 30),
  ])
}

export async function updateAccount(
  db: MasroofDB,
  account: Account,
  changes: Partial<Pick<Account, 'name' | 'opening_balance'>>,
): Promise<void> {
  const next: Account = {
    ...account,
    ...changes,
    opening_balance: round2(changes.opening_balance ?? account.opening_balance),
    updated_at: nowISO(),
  }
  await queueRows(db, 'accounts', [next])
}

export async function updateSettings(
  db: MasroofDB,
  settings: Settings,
  changes: Partial<Omit<Settings, 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'>>,
): Promise<void> {
  await queueRows(db, 'settings', [{ ...settings, ...changes, updated_at: nowISO() }])
}

/**
 * Repair (SPEC §9 note): entries saved while no rate existed carry rate 1; give them
 * the daily rate of their own date. Not a user edit. Run it only right after a
 * successful pull, so it never pushes a stale copy over a newer change from the other device.
 */
export async function repairPlaceholderRates(db: MasroofDB): Promise<number> {
  const rates = (await db.rates.toArray()).filter((r) => !r.deleted_at)
  if (rates.length === 0) return 0
  const stale = await db.entries.filter((e) => e.rate_usd_ghs === 1 && !e.deleted_at).toArray()
  const now = nowISO()
  const fixed: Entry[] = []
  for (const e of stale) {
    const rate = rateForDate(rates, e.date)
    if (rate !== null && isRealRate(rate)) fixed.push({ ...e, rate_usd_ghs: rate, updated_at: now })
  }
  if (fixed.length > 0) await queueRows(db, 'entries', fixed)
  return fixed.length
}

// ── Plans (SPEC §6 Plan, §7) ─────────────────────────────────────────────

/** carry_in applies to a new plan only; editing keeps the plan's own. */
export type PlanDraft = { salary: number; start_date: string; expected_end: string; amounts: Record<string, number>; carry_in?: number }
export type PlanSnapshot = { plan: Plan; envelopes: PlanEnvelope[] }

/** Create a plan, or edit the open one (its start date never moves); one envelope per category. */
export async function savePlan(
  db: MasroofDB,
  userId: string,
  existing: PlanSnapshot | null,
  draft: PlanDraft,
): Promise<PlanSnapshot> {
  const now = nowISO()
  const plan: Plan = existing
    ? { ...existing.plan, salary: round2(draft.salary), expected_end: draft.expected_end, updated_at: now }
    : {
        id: crypto.randomUUID(),
        user_id: userId,
        start_date: draft.start_date,
        expected_end: draft.expected_end,
        salary: round2(draft.salary),
        carry_in: round2(draft.carry_in ?? 0),
        leftover: null,
        leftover_action: null,
        closed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }
  const byCategory = new Map((existing?.envelopes ?? []).map((e) => [e.category_id, e]))
  const envelopes: PlanEnvelope[] = Object.entries(draft.amounts).map(([categoryId, amount]) => {
    const prev = byCategory.get(categoryId)
    return prev
      ? { ...prev, amount: round2(amount), deleted_at: null, updated_at: now }
      : {
          id: crypto.randomUUID(),
          user_id: userId,
          plan_id: plan.id,
          category_id: categoryId,
          amount: round2(amount),
          created_at: now,
          updated_at: now,
          deleted_at: null,
        }
  })
  await queueRows(db, 'plans', [plan])
  await queueRows(db, 'plan_envelopes', envelopes)
  return { plan, envelopes }
}

/** Undo a plan save: put the previous version back, or soft-delete a plan that was just created. */
export async function undoPlanSave(db: MasroofDB, before: PlanSnapshot | null, saved: PlanSnapshot): Promise<void> {
  const now = nowISO()
  if (before) {
    await queueRows(db, 'plans', [{ ...before.plan, updated_at: now }])
    const restored = new Map(before.envelopes.map((e) => [e.id, { ...e, updated_at: now }]))
    // Envelopes added by the edit didn't exist before: remove them.
    for (const e of saved.envelopes) if (!restored.has(e.id)) restored.set(e.id, { ...e, deleted_at: now, updated_at: now })
    await queueRows(db, 'plan_envelopes', [...restored.values()])
  } else {
    await queueRows(db, 'plans', [{ ...saved.plan, deleted_at: now, updated_at: now }])
    await queueRows(db, 'plan_envelopes', saved.envelopes.map((e) => ({ ...e, deleted_at: now, updated_at: now })))
  }
}

// ── Salary received (SPEC §7) ───────────────────────────────────────────

export type LeftoverAction = 'savings' | 'buffer' | 'ignore'

export type SalaryInput = {
  entry: EntryInput
  /** The open plan to close, with its day-to-day leftover and what Ali chose for it. */
  close: { plan: Plan; leftover: number; action: LeftoverAction } | null
  plan: PlanDraft
}

export type SalaryReceipt = { entry: Entry; closed: { before: Plan; after: Plan } | null; created: PlanSnapshot }

/** The open plan changed while the sheet was open (closed, or another one appeared): nothing was saved. */
export class PlanChangedError extends Error {
  constructor() {
    super('The open plan changed; nothing was saved.')
    this.name = 'PlanChangedError'
  }
}

/**
 * One save for the whole flow: the salary entry, the closed plan (with its leftover note)
 * and the next plan, in one transaction. A leftover sent to Buffer becomes the new plan's carry_in.
 * Throws PlanChangedError, writing nothing, unless the open plan is still the one the sheet showed.
 */
export async function receiveSalary(db: MasroofDB, userId: string, input: SalaryInput): Promise<SalaryReceipt> {
  return db.transaction('rw', [db.entries, db.plans, db.plan_envelopes, db.outbox], async () => {
    const open = await db.plans.filter((p) => !p.closed_at && !p.deleted_at).toArray()
    if (open.length !== (input.close ? 1 : 0) || (input.close && open[0]?.id !== input.close.plan.id)) throw new PlanChangedError()

    const entry = await addEntry(db, userId, input.entry)
    let closed: SalaryReceipt['closed'] = null
    let carry = 0
    if (input.close && open[0]) {
      // Close the stored version: the sheet's copy may predate an edit pulled from the other device.
      const plan = open[0]
      const { action } = input.close
      const leftover = round2(input.close.leftover)
      const now = nowISO()
      const after: Plan = {
        ...plan,
        closed_at: now,
        leftover: leftover > 0 ? leftover : null,
        leftover_action: leftover > 0 ? action : null,
        updated_at: now,
      }
      await queueRows(db, 'plans', [after])
      closed = { before: plan, after }
      if (leftover > 0 && action === 'buffer') carry = leftover
    }
    const created = await savePlan(db, userId, null, { ...input.plan, carry_in: carry })
    return { entry, closed, created }
  })
}

/** Undo the whole flow: delete the salary entry and the new plan, reopen the old plan as it was. */
export async function undoSalary(db: MasroofDB, receipt: SalaryReceipt): Promise<void> {
  await db.transaction('rw', [db.entries, db.plans, db.plan_envelopes, db.outbox], async () => {
    await deleteEntry(db, receipt.entry)
    if (receipt.closed) await queueRows(db, 'plans', [{ ...receipt.closed.before, updated_at: nowISO() }])
    await undoPlanSave(db, null, receipt.created)
  })
}

// ── Reconcile (SPEC §7) ─────────────────────────────────────────────────

export type ReconcileInput = {
  accountId: string
  actual: number
  date: string
  /** Effective rate now, frozen on the adjustment like on any entry. */
  rate: number
  /** The adjustment's category (Other) and note ("Reconcile" in the UI language). */
  categoryId: string
  note: string
}

export type ReconcileReceipt = { check: Reconciliation; adjustment: Entry | null }

/**
 * Record a check and, when the records drifted, an adjustment for the drift, in one
 * transaction. The computed balance is read inside it, so afterwards the balance is the actual.
 */
export async function reconcile(db: MasroofDB, userId: string, input: ReconcileInput): Promise<ReconcileReceipt> {
  return db.transaction('rw', [db.accounts, db.entries, db.reconciliations, db.outbox], async () => {
    const account = await db.accounts.get(input.accountId)
    if (!account) throw new Error(`No account ${input.accountId}`)
    const computed = balance(account, await db.entries.where('account_id').equals(account.id).toArray())
    const actual = round2(input.actual)
    const diff = drift(actual, computed)
    const now = nowISO()
    const check: Reconciliation = {
      id: crypto.randomUUID(),
      user_id: userId,
      date: input.date,
      account_id: account.id,
      actual,
      computed,
      diff,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }
    await queueRows(db, 'reconciliations', [check])
    const adjustment =
      diff === 0
        ? null
        : await addEntry(db, userId, {
            type: 'adjust',
            amount: diff,
            account_id: account.id,
            category_id: input.categoryId,
            note: input.note,
            date: input.date,
            rate_usd_ghs: input.rate,
          })
    return { check, adjustment }
  })
}

/** Undo a check: remove it and its adjustment. */
export async function undoReconcile(db: MasroofDB, receipt: ReconcileReceipt): Promise<void> {
  await db.transaction('rw', [db.entries, db.reconciliations, db.outbox], async () => {
    const now = nowISO()
    await queueRows(db, 'reconciliations', [{ ...receipt.check, deleted_at: now, updated_at: now }])
    if (receipt.adjustment) await deleteEntry(db, receipt.adjustment)
  })
}

// ── Recurring (SPEC §6 More, §7) ────────────────────────────────────────

export type RecurringDraft = Pick<Recurring, 'name' | 'type' | 'amount' | 'account_id' | 'category_id' | 'day_of_month'>

/** Create an item, or edit one (it keeps its id, so entries already posted still point at it). */
export async function saveRecurring(db: MasroofDB, userId: string, existing: Recurring | null, draft: RecurringDraft): Promise<Recurring> {
  const now = nowISO()
  const fields = { ...draft, name: draft.name.trim(), amount: round2(draft.amount) }
  const item: Recurring = existing
    ? { ...existing, ...fields, updated_at: now }
    : { id: crypto.randomUUID(), user_id: userId, ...fields, created_at: now, updated_at: now, deleted_at: null }
  await queueRows(db, 'recurring', [item])
  return item
}

export async function deleteRecurring(db: MasroofDB, item: Recurring): Promise<Recurring> {
  const now = nowISO()
  const deleted: Recurring = { ...item, deleted_at: now, updated_at: now }
  await queueRows(db, 'recurring', [deleted])
  return deleted
}

/** Put a previous version back: undo for edit and delete. */
export async function restoreRecurring(db: MasroofDB, snapshot: Recurring): Promise<void> {
  await queueRows(db, 'recurring', [{ ...snapshot, updated_at: nowISO() }])
}

// ── Categories (SPEC §6 Settings) ───────────────────────────────────────

export type CategoryDraft = { name: string; kind: string; archived: boolean }
export type CategoryReceipt = {
  before: Category | null
  after: Category
  /** The envelope this save added to the open plan. */
  envelope: PlanEnvelope | null
  /** The envelope as it was, when this save gave its planned amount back to unassigned. */
  zeroed: PlanEnvelope | null
}

/**
 * Add or edit a category. A new one gets the name in both languages; a rename changes only the
 * language in use. In the open plan, every spending category has an envelope (SPEC §6), so one
 * that newly qualifies gets it at 0. One that stops qualifying (archived, or now income) can no
 * longer be edited in the plan, so its planned amount goes back to unassigned; otherwise it would
 * stay counted, invisible, and Assigned and Safe to spend would be wrong.
 */
export async function saveCategory(
  db: MasroofDB,
  userId: string,
  existing: Category | null,
  draft: CategoryDraft,
  lang: Lang,
): Promise<CategoryReceipt> {
  const name = draft.name.trim()
  return db.transaction('rw', [db.categories, db.plans, db.plan_envelopes, db.outbox], async () => {
    const now = nowISO()
    const fields = { kind: draft.kind, archived: draft.archived, updated_at: now }
    const after: Category = existing
      ? { ...existing, ...fields, ...(lang === 'ar' ? { name_ar: name } : { name_en: name }) }
      : {
          id: crypto.randomUUID(),
          user_id: userId,
          name_en: name,
          name_ar: name,
          icon: 'dots',
          sort: Math.max(0, ...(await db.categories.toArray()).map((c) => c.sort)) + 10,
          created_at: now,
          deleted_at: null,
          ...fields,
        }
    await queueRows(db, 'categories', [after])

    const plan = await db.plans.filter((p) => !p.closed_at && !p.deleted_at).first()
    const current =
      plan && (await db.plan_envelopes.where('plan_id').equals(plan.id).filter((e) => e.category_id === after.id && !e.deleted_at).first())
    const planned = plannable([after]).length > 0
    let envelope: PlanEnvelope | null = null
    let zeroed: PlanEnvelope | null = null
    if (plan && !current && planned) {
      envelope = { id: crypto.randomUUID(), user_id: userId, plan_id: plan.id, category_id: after.id, amount: 0, created_at: now, updated_at: now, deleted_at: null }
      await queueRows(db, 'plan_envelopes', [envelope])
    } else if (current && !planned && current.amount !== 0) {
      zeroed = current
      await queueRows(db, 'plan_envelopes', [{ ...current, amount: 0, updated_at: now }])
    }
    return { before: existing, after, envelope, zeroed }
  })
}

/** Undo a save: put the previous version back, or remove a category that was just added. */
export async function undoCategorySave(db: MasroofDB, receipt: CategoryReceipt): Promise<void> {
  await db.transaction('rw', [db.categories, db.plan_envelopes, db.outbox], async () => {
    const now = nowISO()
    const previous = receipt.before ?? { ...receipt.after, deleted_at: now }
    await queueRows(db, 'categories', [{ ...previous, updated_at: now }])
    if (receipt.envelope) await queueRows(db, 'plan_envelopes', [{ ...receipt.envelope, deleted_at: now, updated_at: now }])
    if (receipt.zeroed) await queueRows(db, 'plan_envelopes', [{ ...receipt.zeroed, updated_at: now }])
  })
}

// ── Delete all data (SPEC §6 Settings, §12) ─────────────────────────────

const WIPED_TABLES = ['accounts', 'recurring', 'entries', 'plans', 'plan_envelopes', 'reconciliations'] as const satisfies readonly SyncedTable[]

/**
 * Soft-delete like everything else, so it reaches the user's other devices. Categories and
 * settings stay: with no accounts left, the app goes back to First run. Returns the rows removed.
 * The caller syncs first, because this only reaches rows the device holds. First run calls it too,
 * to clear rows that synced in after a delete (SPEC §12), so they can't count against a new plan.
 */
export async function deleteAllData(db: MasroofDB): Promise<number> {
  return db.transaction('rw', [...WIPED_TABLES.map((t) => db.tableOf(t)), db.outbox], async () => {
    const now = nowISO()
    let removed = 0
    for (const table of WIPED_TABLES) {
      const rows = (await db.tableOf(table).toArray()).filter((r) => !r.deleted_at)
      if (rows.length === 0) continue
      await queueRows(db, table, rows.map((r) => ({ ...r, deleted_at: now, updated_at: now })))
      removed += rows.length
    }
    return removed
  })
}

/** Post = an ordinary entry from the item, named after it and pointing at it (SPEC §7). */
export async function postRecurring(db: MasroofDB, userId: string, item: Recurring, at: { date: string; rate: number }): Promise<Entry> {
  return addEntry(db, userId, {
    type: item.type as EntryType,
    amount: item.amount,
    account_id: item.account_id,
    category_id: item.category_id,
    note: item.name,
    date: at.date,
    rate_usd_ghs: at.rate,
    recurring_id: item.id,
  })
}

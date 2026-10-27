import type { Account, Entry, MasroofDB, Plan, PlanEnvelope, Settings } from './db'
import { nowISO } from './dates'
import { isRealRate, rateForDate } from './fx'
import { round2 } from './money'
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
}

export async function addEntry(db: MasroofDB, userId: string, input: EntryInput): Promise<Entry> {
  const id = crypto.randomUUID()
  const now = nowISO()
  const entry: Entry = {
    id,
    user_id: userId,
    client_id: id,
    recurring_id: null,
    ...input,
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

/**
 * One save for the whole flow: the salary entry, the closed plan (with its leftover note)
 * and the next plan, in one transaction. A leftover sent to Buffer becomes the new plan's carry_in.
 */
export async function receiveSalary(db: MasroofDB, userId: string, input: SalaryInput): Promise<SalaryReceipt> {
  return db.transaction('rw', [db.entries, db.plans, db.plan_envelopes, db.outbox], async () => {
    const entry = await addEntry(db, userId, input.entry)
    let closed: SalaryReceipt['closed'] = null
    let carry = 0
    if (input.close) {
      const { plan, action } = input.close
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
    // Plans are queued before envelopes, so the server has the plan when its envelopes arrive.
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

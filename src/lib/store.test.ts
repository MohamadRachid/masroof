import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MasroofDB } from './db'
import Dexie from 'dexie'
import { addEntry, createAccounts, deleteEntry, deleteRecurring, PlanChangedError, postRecurring, receiveSalary, reconcile, repairPlaceholderRates, restoreEntry, restoreRecurring, savePlan, saveRecurring, undoPlanSave, undoReconcile, undoSalary, updateAccount, updateEntry, updateSettings } from './store'
import { balance } from './money'

let dbCount = 0
const freshDb = () => new MasroofDB(`store_${++dbCount}_${Date.now()}`)
const input = {
  type: 'out' as const,
  amount: 25,
  account_id: 'cash-id',
  category_id: 'food-id',
  note: null,
  date: '2026-10-26',
  rate_usd_ghs: 1,
}

describe('entries', () => {
  it('addEntry stores a complete row locally and queues it', async () => {
    const db = freshDb()
    const e = await addEntry(db, 'u1', input)
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(e.client_id).toBe(e.id)
    expect(e.user_id).toBe('u1')
    expect(e.deleted_at).toBeNull()
    expect(await db.entries.get(e.id)).toEqual(e)
    expect((await db.outbox.toArray()).map((i) => i.key)).toEqual([e.id])
  })

  it('deleteEntry soft-deletes and restoreEntry brings it back (undo)', async () => {
    const db = freshDb()
    const e = await addEntry(db, 'u1', input)
    await deleteEntry(db, e)
    expect((await db.entries.get(e.id))?.deleted_at).toBeTruthy()
    await restoreEntry(db, e)
    expect((await db.entries.get(e.id))?.deleted_at).toBeNull()
    expect(await db.outbox.count()).toBe(3)
  })

  it('updateEntry keeps the frozen rate and returns the previous version for undo', async () => {
    const db = freshDb()
    const e = await addEntry(db, 'u1', { ...input, rate_usd_ghs: 15.4 })
    const { before, after } = await updateEntry(db, e, { amount: 30, note: 'lunch' })
    expect(before.amount).toBe(25)
    expect(after.amount).toBe(30)
    expect(after.note).toBe('lunch')
    expect(after.rate_usd_ghs).toBe(15.4)
    await restoreEntry(db, before)
    expect((await db.entries.get(e.id))?.amount).toBe(25)
  })
})

describe('accounts and settings', () => {
  it('createAccounts makes Bank, Cash (GHS) and USD with their opening balances', async () => {
    const db = freshDb()
    await createAccounts(db, 'u1', { bank: 1200.5, cash: 80, usd: 40 })
    const accounts = (await db.accounts.toArray()).sort((a, b) => a.sort - b.sort)
    expect(accounts.map((a) => [a.name, a.currency, a.kind, a.opening_balance])).toEqual([
      ['Bank', 'GHS', 'bank', 1200.5],
      ['Cash', 'GHS', 'cash', 80],
      ['USD', 'USD', 'cash', 40],
    ])
    expect(await db.outbox.count()).toBe(3)
  })

  it('updateAccount and updateSettings change only the given fields and queue them', async () => {
    const db = freshDb()
    await createAccounts(db, 'u1', { bank: 0, cash: 0, usd: 0 })
    const bank = (await db.accounts.toArray()).find((a) => a.name === 'Bank')
    if (!bank) throw new Error('no bank')
    await updateAccount(db, bank, { opening_balance: 500 })
    expect((await db.accounts.get(bank.id))?.opening_balance).toBe(500)
    expect((await db.accounts.get(bank.id))?.name).toBe('Bank')

    const settings = {
      user_id: 'u1', lang: 'en', rate_mode: 'auto', manual_rate: null, usual_payday: 25, warn_pct: 80, week_start: 1,
      created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z', deleted_at: null,
    }
    await updateSettings(db, settings, { usual_payday: 28, lang: 'ar' })
    const saved = await db.settings.get('u1')
    expect([saved?.usual_payday, saved?.lang, saved?.warn_pct]).toEqual([28, 'ar', 80])
  })
})

describe('repairPlaceholderRates (phase 1 entries saved with rate 1)', () => {
  it('replaces rate 1 with the rate of the entry date and queues the change; real rates stay', async () => {
    const db = freshDb()
    await db.rates.bulkPut([
      { id: 'r1', date: '2026-10-24', usd_ghs: 11.6, source: 'test', created_at: '', updated_at: '', deleted_at: null },
      { id: 'r2', date: '2026-10-26', usd_ghs: 11.622, source: 'test', created_at: '', updated_at: '', deleted_at: null },
    ])
    const old = await addEntry(db, 'u1', { ...input, date: '2026-10-25', rate_usd_ghs: 1 })
    const kept = await addEntry(db, 'u1', { ...input, rate_usd_ghs: 12.5 })
    await db.outbox.clear()

    const fixed = await repairPlaceholderRates(db)

    expect(fixed).toBe(1)
    expect((await db.entries.get(old.id))?.rate_usd_ghs).toBe(11.6)
    expect((await db.entries.get(kept.id))?.rate_usd_ghs).toBe(12.5)
    expect((await db.outbox.toArray()).map((i) => i.key)).toEqual([old.id])
  })

  it('leaves soft-deleted entries alone and finds nothing on a second run', async () => {
    const db = freshDb()
    await db.rates.put({ id: 'r', date: '2026-10-26', usd_ghs: 11.622, source: 'test', created_at: '', updated_at: '', deleted_at: null })
    const gone = await addEntry(db, 'u1', { ...input, rate_usd_ghs: 1 })
    await deleteEntry(db, gone)
    await addEntry(db, 'u1', { ...input, rate_usd_ghs: 1 })

    expect(await repairPlaceholderRates(db)).toBe(1)
    expect(await repairPlaceholderRates(db)).toBe(0)
    expect((await db.entries.get(gone.id))?.rate_usd_ghs).toBe(1)
  })

  it('does nothing while no rate exists', async () => {
    const db = freshDb()
    await addEntry(db, 'u1', { ...input, rate_usd_ghs: 1 })
    expect(await repairPlaceholderRates(db)).toBe(0)
  })
})

describe('plans', () => {
  const draft = { salary: 5000, start_date: '2026-10-26', expected_end: '2026-11-25', amounts: { rent: 1500, food: 900, savings: 500 } }

  it('savePlan creates the plan and one envelope per category, all queued', async () => {
    const db = freshDb()
    const saved = await savePlan(db, 'u1', null, draft)
    expect(saved.plan).toMatchObject({ user_id: 'u1', salary: 5000, start_date: '2026-10-26', expected_end: '2026-11-25', closed_at: null, carry_in: 0, leftover: null, leftover_action: null })
    expect(saved.envelopes.map((e) => [e.category_id, e.amount, e.plan_id === saved.plan.id]).sort()).toEqual([
      ['food', 900, true], ['rent', 1500, true], ['savings', 500, true],
    ])
    expect(await db.outbox.count()).toBe(4)
  })

  it('editing keeps the start date and the envelope ids, and undo restores the previous amounts', async () => {
    const db = freshDb()
    const first = await savePlan(db, 'u1', null, draft)
    const edited = await savePlan(db, 'u1', first, { ...draft, start_date: '2026-10-30', salary: 5200, amounts: { rent: 1500, food: 1100, savings: 500 } })
    expect(edited.plan.id).toBe(first.plan.id)
    expect(edited.plan.start_date).toBe('2026-10-26')
    expect(edited.envelopes.find((e) => e.category_id === 'food')?.id).toBe(first.envelopes.find((e) => e.category_id === 'food')?.id)

    await undoPlanSave(db, first, edited)
    expect((await db.plans.get(first.plan.id))?.salary).toBe(5000)
    const food = (await db.plan_envelopes.toArray()).find((e) => e.category_id === 'food')
    expect(food?.amount).toBe(900)
  })

  it('undo of a brand-new plan soft-deletes it and its envelopes', async () => {
    const db = freshDb()
    const created = await savePlan(db, 'u1', null, draft)
    await undoPlanSave(db, null, created)
    expect((await db.plans.get(created.plan.id))?.deleted_at).toBeTruthy()
    expect((await db.plan_envelopes.toArray()).every((e) => e.deleted_at)).toBe(true)
  })
})

describe('salary received (SPEC §7)', () => {
  const draft = { salary: 5000, start_date: '2026-10-26', expected_end: '2026-11-25', amounts: { rent: 1500, food: 900, buffer: 250 } }
  const salary = { type: 'in' as const, amount: 5000, account_id: 'bank-id', category_id: 'salary-id', note: null, date: '2026-11-25', rate_usd_ghs: 11.6 }
  const next = { salary: 5000, start_date: '2026-11-25', expected_end: '2026-12-25', amounts: { rent: 1500, food: 900, buffer: 480 } }

  it('records the salary, closes the open plan with its leftover note and starts the next plan', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    await db.outbox.clear()

    const r = await receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 230, action: 'buffer' }, plan: next })

    expect(await db.entries.get(r.entry.id)).toMatchObject({ type: 'in', amount: 5000, category_id: 'salary-id', date: '2026-11-25' })
    expect(await db.plans.get(open.plan.id)).toMatchObject({ leftover: 230, leftover_action: 'buffer' })
    expect((await db.plans.get(open.plan.id))?.closed_at).toBeTruthy()
    expect(await db.plans.get(r.created.plan.id)).toMatchObject({ start_date: '2026-11-25', salary: 5000, carry_in: 230, closed_at: null })
    expect(r.created.envelopes.find((e) => e.category_id === 'buffer')?.amount).toBe(480)
    // The outbox sends plans before their envelopes (the server checks plan_id).
    const tables = (await db.outbox.orderBy('seq').toArray()).map((i) => i.table)
    expect(tables.indexOf('plans')).toBeLessThan(tables.indexOf('plan_envelopes'))
  })

  it('savings and ignore are notes only: the next plan carries nothing', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    const r = await receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 230, action: 'savings' }, plan: next })
    expect(await db.plans.get(open.plan.id)).toMatchObject({ leftover: 230, leftover_action: 'savings' })
    expect(r.created.plan.carry_in).toBe(0)
  })

  it('no leftover → no note on the closed plan', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    await receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 0, action: 'buffer' }, plan: next })
    expect(await db.plans.get(open.plan.id)).toMatchObject({ leftover: null, leftover_action: null })
  })

  it('without an open plan it just records the salary and starts the first plan', async () => {
    const db = freshDb()
    const r = await receiveSalary(db, 'u1', { entry: salary, close: null, plan: next })
    expect(r.closed).toBeNull()
    expect(await db.plans.count()).toBe(1)
    expect(await db.entries.count()).toBe(1)
  })

  it('undo puts everything back: salary gone, old plan open again, new plan and envelopes gone', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    const r = await receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 230, action: 'buffer' }, plan: next })

    await undoSalary(db, r)

    expect((await db.entries.get(r.entry.id))?.deleted_at).toBeTruthy()
    expect(await db.plans.get(open.plan.id)).toMatchObject({ closed_at: null, leftover: null, leftover_action: null, deleted_at: null })
    expect((await db.plans.get(r.created.plan.id))?.deleted_at).toBeTruthy()
    const mine = (await db.plan_envelopes.toArray()).filter((e) => e.plan_id === r.created.plan.id)
    expect(mine.length).toBe(3)
    expect(mine.every((e) => e.deleted_at)).toBe(true)
    expect((await db.plan_envelopes.toArray()).filter((e) => e.plan_id === open.plan.id).every((e) => !e.deleted_at)).toBe(true)
  })

  it('refuses, writing nothing, when the plan to close is no longer the open one', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    // Closed meanwhile (e.g. Salary received on the other device, pulled in while the sheet was open).
    await db.plans.put({ ...open.plan, closed_at: '2026-11-20T00:00:00Z' })
    const before = { entries: await db.entries.count(), plans: await db.plans.count(), outbox: await db.outbox.count() }

    await expect(receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 0, action: 'ignore' }, plan: next })).rejects.toThrow(PlanChangedError)

    expect({ entries: await db.entries.count(), plans: await db.plans.count(), outbox: await db.outbox.count() }).toEqual(before)
  })

  it('refuses to start a second open plan', async () => {
    const db = freshDb()
    await savePlan(db, 'u1', null, draft)
    await expect(receiveSalary(db, 'u1', { entry: salary, close: null, plan: next })).rejects.toThrow(PlanChangedError)
    expect(await db.entries.count()).toBe(0)
  })

  it('closes the stored version of the plan, not an older copy', async () => {
    const db = freshDb()
    const open = await savePlan(db, 'u1', null, draft)
    const newer = { ...open.plan, expected_end: '2026-11-27', updated_at: '2026-11-01T00:00:00Z' }
    await db.plans.put(newer)

    const r = await receiveSalary(db, 'u1', { entry: salary, close: { plan: open.plan, leftover: 0, action: 'ignore' }, plan: next })

    expect((await db.plans.get(open.plan.id))?.expected_end).toBe('2026-11-27')
    expect(r.closed?.before.expected_end).toBe('2026-11-27')
  })

  it('editing a plan keeps its carry-over', async () => {
    const db = freshDb()
    const r = await receiveSalary(db, 'u1', { entry: salary, close: { plan: (await savePlan(db, 'u1', null, draft)).plan, leftover: 230, action: 'buffer' }, plan: next })
    const edited = await savePlan(db, 'u1', r.created, { ...next, amounts: { ...next.amounts, food: 800 } })
    expect(edited.plan.carry_in).toBe(230)
  })
})

describe('local database upgrade', () => {
  it('v2 fills the new plan fields on plans stored before the migration', async () => {
    const name = `upgrade_${Date.now()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ plans: 'id, updated_at' })
    await v1.table('plans').put({ id: 'p1', salary: 5000, start_date: '2026-10-26', expected_end: '2026-11-25', closed_at: null, updated_at: 'x' })
    v1.close()

    const db = new MasroofDB(name)
    expect(await db.plans.get('p1')).toMatchObject({ salary: 5000, carry_in: 0, leftover: null, leftover_action: null })
  })
})

describe('reconcile (SPEC §7)', () => {
  async function cashAccount(db: MasroofDB) {
    await createAccounts(db, 'u1', { bank: 0, cash: 200, usd: 0 })
    const cash = (await db.accounts.toArray()).find((a) => a.name === 'Cash')
    if (!cash) throw new Error('no cash')
    await addEntry(db, 'u1', { ...input, account_id: cash.id, amount: 4.45 }) // computed: 195.55
    return cash
  }
  const check = { actual: 230, date: '2026-10-27', rate: 11.6, categoryId: 'other-id', note: 'Reconcile' }

  it('records the check and an adjustment for the drift, so the balance becomes the actual', async () => {
    const db = freshDb()
    const cash = await cashAccount(db)
    await db.outbox.clear()
    const receipt = await reconcile(db, 'u1', { ...check, accountId: cash.id })
    expect(receipt.check).toMatchObject({ user_id: 'u1', account_id: cash.id, date: '2026-10-27', actual: 230, computed: 195.55, diff: 34.45, deleted_at: null })
    expect(receipt.adjustment).toMatchObject({
      type: 'adjust', amount: 34.45, account_id: cash.id, category_id: 'other-id', note: 'Reconcile', date: '2026-10-27', rate_usd_ghs: 11.6, recurring_id: null,
    })
    expect(balance(cash, await db.entries.toArray())).toBe(230)
    expect((await db.outbox.toArray()).map((i) => i.table).sort()).toEqual(['entries', 'reconciliations'])
  })

  it('a negative drift makes a negative adjustment', async () => {
    const db = freshDb()
    const cash = await cashAccount(db)
    const receipt = await reconcile(db, 'u1', { ...check, accountId: cash.id, actual: 160.55 })
    expect(receipt.adjustment?.amount).toBe(-35)
    expect(balance(cash, await db.entries.toArray())).toBe(160.55)
  })

  it('no drift: the check only, no adjustment', async () => {
    const db = freshDb()
    const cash = await cashAccount(db)
    const receipt = await reconcile(db, 'u1', { ...check, accountId: cash.id, actual: 195.55 })
    expect(receipt.check.diff).toBe(0)
    expect(receipt.adjustment).toBeNull()
    expect(await db.entries.filter((e) => e.type === 'adjust').count()).toBe(0)
  })

  it('undoReconcile removes both the check and its adjustment', async () => {
    const db = freshDb()
    const cash = await cashAccount(db)
    const receipt = await reconcile(db, 'u1', { ...check, accountId: cash.id })
    await undoReconcile(db, receipt)
    expect((await db.reconciliations.get(receipt.check.id))?.deleted_at).toBeTruthy()
    expect((await db.entries.get(receipt.adjustment?.id ?? ''))?.deleted_at).toBeTruthy()
    expect(balance(cash, await db.entries.toArray())).toBe(195.55)
  })
})

describe('recurring (SPEC §7)', () => {
  const draft = { name: 'Rent', type: 'out', amount: 1500, account_id: 'bank-id', category_id: 'rent-id', day_of_month: 1 }

  it('saveRecurring creates a complete row, edits keep the id, delete and restore round-trip', async () => {
    const db = freshDb()
    const created = await saveRecurring(db, 'u1', null, { ...draft, name: '  Rent ' })
    expect(created).toMatchObject({ ...draft, user_id: 'u1', deleted_at: null })
    expect(await db.recurring.get(created.id)).toEqual(created)

    const edited = await saveRecurring(db, 'u1', created, { ...draft, amount: 1600.004, day_of_month: 2 })
    expect(edited.id).toBe(created.id)
    expect(edited).toMatchObject({ amount: 1600, day_of_month: 2 })

    await deleteRecurring(db, edited)
    expect((await db.recurring.get(created.id))?.deleted_at).toBeTruthy()
    await restoreRecurring(db, edited)
    expect(await db.recurring.get(created.id)).toMatchObject({ amount: 1600, deleted_at: null })
    expect(await db.outbox.count()).toBe(4)
  })

  it('postRecurring adds an ordinary entry that points at the item, named after it', async () => {
    const db = freshDb()
    const item = await saveRecurring(db, 'u1', null, draft)
    const entry = await postRecurring(db, 'u1', item, { date: '2026-11-01', rate: 11.6 })
    expect(entry).toMatchObject({
      type: 'out', amount: 1500, account_id: 'bank-id', category_id: 'rent-id', note: 'Rent', date: '2026-11-01', rate_usd_ghs: 11.6, recurring_id: item.id,
    })
    expect(await db.entries.get(entry.id)).toEqual(entry)
  })

  it('addEntry keeps recurring_id null unless one is given', async () => {
    const db = freshDb()
    expect((await addEntry(db, 'u1', input)).recurring_id).toBeNull()
  })
})

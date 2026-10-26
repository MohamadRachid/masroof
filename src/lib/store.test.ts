import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MasroofDB } from './db'
import { addEntry, createAccounts, deleteEntry, repairPlaceholderRates, restoreEntry, savePlan, undoPlanSave, updateAccount, updateEntry, updateSettings } from './store'

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
    expect(saved.plan).toMatchObject({ user_id: 'u1', salary: 5000, start_date: '2026-10-26', expected_end: '2026-11-25', closed_at: null })
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

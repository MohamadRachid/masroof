import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MasroofDB } from './db'
import { addEntry, createAccounts, deleteEntry, restoreEntry, updateAccount, updateEntry, updateSettings } from './store'

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

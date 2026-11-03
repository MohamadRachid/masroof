import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Category } from './db'
import { MasroofDB } from './db'
import { collectExport, exportFileName } from './exportData'
import {
  addEntry,
  createAccounts,
  deleteAllData,
  saveCategory,
  savePlan,
  saveRecurring,
  undoCategorySave,
} from './store'

let dbCount = 0
const freshDb = () => new MasroofDB(`settings_${++dbCount}_${Date.now()}`)

const category = (over: Partial<Category> = {}): Category => ({
  id: crypto.randomUUID(),
  user_id: 'u1',
  name_en: 'Food',
  name_ar: 'طعام',
  kind: 'variable',
  icon: 'utensils',
  sort: 40,
  archived: false,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  deleted_at: null,
  ...over,
})

const planDraft = { salary: 1000, start_date: '2026-11-01', expected_end: '2026-11-25', amounts: {} }

describe('saveCategory', () => {
  it('a new category gets the name in both languages, the next sort and the default icon', async () => {
    const db = freshDb()
    await db.categories.put(category({ sort: 130 }))
    const { after } = await saveCategory(db, 'u1', null, { name: '  Pets ', kind: 'variable', archived: false }, 'en')
    expect(after).toMatchObject({ user_id: 'u1', name_en: 'Pets', name_ar: 'Pets', icon: 'dots', sort: 140, kind: 'variable', archived: false, deleted_at: null })
    expect(await db.categories.get(after.id)).toEqual(after)
    expect((await db.outbox.toArray()).map((i) => i.key)).toContain(after.id)
  })

  it('renaming changes only the current language', async () => {
    const db = freshDb()
    const food = category()
    await db.categories.put(food)
    const en = await saveCategory(db, 'u1', food, { name: 'Eating out', kind: 'variable', archived: false }, 'en')
    expect(en.after).toMatchObject({ name_en: 'Eating out', name_ar: 'طعام' })
    const ar = await saveCategory(db, 'u1', en.after, { name: 'مطاعم', kind: 'variable', archived: false }, 'ar')
    expect(ar.after).toMatchObject({ name_en: 'Eating out', name_ar: 'مطاعم' })
  })

  it('a new spending category gets a 0 envelope in the open plan (SPEC §6: every non-income category has one)', async () => {
    const db = freshDb()
    const { plan } = await savePlan(db, 'u1', null, planDraft)
    const { after, envelope } = await saveCategory(db, 'u1', null, { name: 'Pets', kind: 'variable', archived: false }, 'en')
    expect(envelope).toMatchObject({ plan_id: plan.id, category_id: after.id, amount: 0, user_id: 'u1' })
    expect(await db.plan_envelopes.count()).toBe(1)
  })

  it('no envelope for income, for an archived category, or with no open plan', async () => {
    const withPlan = freshDb()
    await savePlan(withPlan, 'u1', null, planDraft)
    expect((await saveCategory(withPlan, 'u1', null, { name: 'Bonus', kind: 'income', archived: false }, 'en')).envelope).toBeNull()
    expect((await saveCategory(withPlan, 'u1', null, { name: 'Old', kind: 'variable', archived: true }, 'en')).envelope).toBeNull()
    const noPlan = freshDb()
    expect((await saveCategory(noPlan, 'u1', null, { name: 'Pets', kind: 'variable', archived: false }, 'en')).envelope).toBeNull()
  })

  it('changing income to spending adds the envelope once, and never a second one', async () => {
    const db = freshDb()
    await savePlan(db, 'u1', null, planDraft)
    const side = category({ kind: 'income', name_en: 'Side job', name_ar: 'عمل جانبي' })
    await db.categories.put(side)
    const first = await saveCategory(db, 'u1', side, { name: 'Side job', kind: 'variable', archived: false }, 'en')
    expect(first.envelope).not.toBeNull()
    const second = await saveCategory(db, 'u1', first.after, { name: 'Side job', kind: 'fixed', archived: false }, 'en')
    expect(second.envelope).toBeNull()
    expect(await db.plan_envelopes.count()).toBe(1)
  })

  it('undo removes a new category and its envelope, and puts an edited one back', async () => {
    const db = freshDb()
    await savePlan(db, 'u1', null, planDraft)
    const created = await saveCategory(db, 'u1', null, { name: 'Pets', kind: 'variable', archived: false }, 'en')
    await undoCategorySave(db, created)
    expect((await db.categories.get(created.after.id))?.deleted_at).toBeTruthy()
    expect((await db.plan_envelopes.get(created.envelope?.id ?? ''))?.deleted_at).toBeTruthy()

    const food = category()
    await db.categories.put(food)
    const edited = await saveCategory(db, 'u1', food, { name: 'Food', kind: 'variable', archived: true }, 'en')
    expect((await db.categories.get(food.id))?.archived).toBe(true)
    await undoCategorySave(db, edited)
    expect(await db.categories.get(food.id)).toMatchObject({ archived: false, deleted_at: null })
  })
})

describe('deleteAllData', () => {
  async function seeded() {
    const db = freshDb()
    await createAccounts(db, 'u1', { bank: 10, cash: 20, usd: 30 })
    const account = (await db.accounts.toArray())[0]
    const food = category()
    await db.categories.put(food)
    await db.settings.put({ user_id: 'u1', lang: 'en', rate_mode: 'auto', manual_rate: null, usual_payday: 25, warn_pct: 80, week_start: 1, created_at: '', updated_at: '', deleted_at: null })
    const entry = { type: 'out' as const, amount: 5, account_id: account?.id ?? '', category_id: food.id, note: null, date: '2026-11-02', rate_usd_ghs: 11.5 }
    await addEntry(db, 'u1', entry)
    await savePlan(db, 'u1', null, { ...planDraft, amounts: { [food.id]: 100 } })
    await saveRecurring(db, 'u1', null, { name: 'Rent', type: 'out', amount: 100, account_id: account?.id ?? '', category_id: food.id, day_of_month: 1 })
    return { db, food }
  }

  it('soft-deletes accounts, entries, plans, envelopes and recurring items, and queues each', async () => {
    const { db } = await seeded()
    await db.outbox.clear()
    const count = await deleteAllData(db)
    expect(count).toBe(3 + 1 + 1 + 1 + 1)
    for (const table of ['accounts', 'entries', 'plans', 'plan_envelopes', 'recurring'] as const) {
      const rows = await db.tableOf(table).toArray()
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.deleted_at)).toBe(true)
    }
    expect(await db.outbox.count()).toBe(count)
  })

  it('keeps categories and settings, so First run can start again', async () => {
    const { db, food } = await seeded()
    await deleteAllData(db)
    expect((await db.categories.get(food.id))?.deleted_at).toBeNull()
    expect((await db.settings.get('u1'))?.deleted_at).toBeNull()
  })

  it('leaves rows that were already deleted alone', async () => {
    const { db } = await seeded()
    await deleteAllData(db)
    await db.outbox.clear()
    expect(await deleteAllData(db)).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('export', () => {
  it('holds live rows of the user’s own tables, not deleted rows, rates or the outbox', async () => {
    const db = freshDb()
    await createAccounts(db, 'u1', { bank: 1, cash: 2, usd: 3 })
    const food = category()
    await db.categories.put(food)
    await db.categories.put(category({ deleted_at: '2026-11-02T00:00:00Z' }))
    await db.rates.put({ id: 'r1', date: '2026-11-03', usd_ghs: 11.6, source: 'x', created_at: '', updated_at: '', deleted_at: null })

    const out = await collectExport(db, '1.2.3', '2026-11-03T10:00:00.000Z')
    expect(out).toMatchObject({ app: 'masroof', version: '1.2.3', exported_at: '2026-11-03T10:00:00.000Z' })
    expect(out.tables.accounts).toHaveLength(3)
    expect(out.tables.categories).toEqual([food])
    expect(Object.keys(out.tables).sort()).toEqual(['accounts', 'categories', 'entries', 'plan_envelopes', 'plans', 'reconciliations', 'recurring', 'settings'])
    expect(JSON.parse(JSON.stringify(out))).toEqual(out)
  })

  it('names the file after the day', () => {
    expect(exportFileName('2026-11-03')).toBe('masroof-2026-11-03.json')
  })
})

describe('saveCategory and the open plan’s money', () => {
  async function planWithFun() {
    const db = freshDb()
    const fun = category({ name_en: 'Fun', name_ar: 'ترفيه' })
    await db.categories.put(fun)
    const { envelopes } = await savePlan(db, 'u1', null, { ...planDraft, amounts: { [fun.id]: 300 } })
    return { db, fun, envelope: envelopes[0] }
  }

  it('archiving gives its planned amount back to unassigned; otherwise it stays counted with no way to edit it', async () => {
    const { db, fun, envelope } = await planWithFun()
    const r = await saveCategory(db, 'u1', fun, { name: 'Fun', kind: 'variable', archived: true }, 'en')
    expect(r.zeroed?.amount).toBe(300)
    expect((await db.plan_envelopes.get(envelope?.id ?? ''))?.amount).toBe(0)
    expect((await db.outbox.toArray()).some((i) => i.table === 'plan_envelopes' && i.key === envelope?.id && i.row.amount === 0)).toBe(true)
  })

  it('so does changing a spending category to income', async () => {
    const { db, fun, envelope } = await planWithFun()
    await saveCategory(db, 'u1', fun, { name: 'Fun', kind: 'income', archived: false }, 'en')
    expect((await db.plan_envelopes.get(envelope?.id ?? ''))?.amount).toBe(0)
  })

  it('undo puts the planned amount back', async () => {
    const { db, fun, envelope } = await planWithFun()
    const r = await saveCategory(db, 'u1', fun, { name: 'Fun', kind: 'variable', archived: true }, 'en')
    await undoCategorySave(db, r)
    expect(await db.plan_envelopes.get(envelope?.id ?? '')).toMatchObject({ amount: 300, deleted_at: null })
    expect((await db.categories.get(fun.id))?.archived).toBe(false)
  })

  it('a rename or a change between spending types leaves the amount alone', async () => {
    const { db, fun, envelope } = await planWithFun()
    const r = await saveCategory(db, 'u1', fun, { name: 'Going out', kind: 'fixed', archived: false }, 'en')
    expect(r.zeroed).toBeNull()
    expect((await db.plan_envelopes.get(envelope?.id ?? ''))?.amount).toBe(300)
  })

  it('bringing an archived category back doesn’t add a second envelope', async () => {
    const { db, fun } = await planWithFun()
    const archived = await saveCategory(db, 'u1', fun, { name: 'Fun', kind: 'variable', archived: true }, 'en')
    const back = await saveCategory(db, 'u1', archived.after, { name: 'Fun', kind: 'variable', archived: false }, 'en')
    expect(back.envelope).toBeNull()
    expect(await db.plan_envelopes.count()).toBe(1)
  })
})

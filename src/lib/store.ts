import type { Account, Entry, MasroofDB, Settings } from './db'
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
 * One-time repair (SPEC §9 note): entries saved before any rate existed carry
 * rate 1; give them the daily rate of their own date. Not a user edit.
 */
export async function repairPlaceholderRates(db: MasroofDB): Promise<number> {
  const rates = (await db.rates.toArray()).filter((r) => !r.deleted_at)
  if (rates.length === 0) return 0
  const stale = await db.entries.filter((e) => e.rate_usd_ghs === 1).toArray()
  const now = nowISO()
  const fixed: Entry[] = []
  for (const e of stale) {
    const rate = rateForDate(rates, e.date)
    if (rate !== null && isRealRate(rate)) fixed.push({ ...e, rate_usd_ghs: rate, updated_at: now })
  }
  if (fixed.length > 0) await queueRows(db, 'entries', fixed)
  return fixed.length
}

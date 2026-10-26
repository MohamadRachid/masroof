import Dexie, { type Table } from 'dexie'
import type { Tables } from './database.types'

// Local mirror of the Supabase tables (SPEC §8). The UI reads only from here.

export type Account = Tables<'accounts'>
export type Category = Tables<'categories'>
export type Entry = Tables<'entries'>
export type Plan = Tables<'plans'>
export type PlanEnvelope = Tables<'plan_envelopes'>
export type Recurring = Tables<'recurring'>
export type Reconciliation = Tables<'reconciliations'>
export type Rate = Tables<'rates'>
export type Settings = Tables<'settings'>

export const SYNCED_TABLES = [
  'accounts',
  'categories',
  'entries',
  'plans',
  'plan_envelopes',
  'recurring',
  'reconciliations',
  'rates',
  'settings',
] as const
export type SyncedTable = (typeof SYNCED_TABLES)[number]
export type Row = Record<string, unknown>

/** Users never write `rates` (the cron does). */
export const READ_ONLY_TABLES: ReadonlySet<SyncedTable> = new Set<SyncedTable>(['rates'])

export function keyColumn(table: SyncedTable): 'id' | 'user_id' {
  return table === 'settings' ? 'user_id' : 'id'
}

export function keyOf(table: SyncedTable, row: Row): string {
  return String(row[keyColumn(table)])
}

export type OutboxItem = { seq?: number; table: SyncedTable; key: string; row: Row; queuedAt: string }
export type MetaItem = { key: string; value: string }

export class MasroofDB extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  entries!: Table<Entry, string>
  plans!: Table<Plan, string>
  plan_envelopes!: Table<PlanEnvelope, string>
  recurring!: Table<Recurring, string>
  reconciliations!: Table<Reconciliation, string>
  rates!: Table<Rate, string>
  settings!: Table<Settings, string>
  outbox!: Table<OutboxItem, number>
  meta!: Table<MetaItem, string>

  constructor(name: string) {
    super(name)
    // Bump the version whenever a migration changes a table (CLAUDE.md).
    this.version(1).stores({
      accounts: 'id, updated_at',
      categories: 'id, updated_at',
      entries: 'id, date, account_id, category_id, created_at, updated_at',
      plans: 'id, updated_at',
      plan_envelopes: 'id, plan_id, updated_at',
      recurring: 'id, updated_at',
      reconciliations: 'id, account_id, updated_at',
      rates: 'id, date, updated_at',
      settings: 'user_id, updated_at',
      outbox: '++seq, table, key',
      meta: 'key',
    })
  }

  tableOf(table: SyncedTable): Table<Row, string> {
    return this.table(table)
  }
}

let current: { userId: string; db: MasroofDB } | null = null

/** One local database per signed-in user, so two accounts on one device never mix. */
export function dbFor(userId: string): MasroofDB {
  if (current?.userId !== userId) {
    current?.db.close()
    current = { userId, db: new MasroofDB(`masroof_${userId}`) }
  }
  return current.db
}

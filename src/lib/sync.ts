import { keyOf, READ_ONLY_TABLES, SYNCED_TABLES, type MasroofDB, type OutboxItem, type Row, type SyncedTable } from './db'
import { nowISO } from './dates'

/** The server, as sync sees it. Production: Supabase; tests: an in-memory fake. */
export interface Remote {
  /** Insert-or-update full rows. Throws on failure. */
  upsert(table: SyncedTable, rows: Row[]): Promise<void>
  /** Rows with updated_at > since (all rows when since is null), oldest first. */
  pullSince(table: SyncedTable, since: string | null): Promise<Row[]>
}

export const INITIAL_PULL_KEY = 'initialPullDone'
const cursorKey = (table: SyncedTable) => `cursor:${table}`

/** Fires "queued" after every local write, so the sync runner can push soon. */
export const syncEvents = new EventTarget()

/** Write rows locally and queue them for the server, atomically (SPEC §8). */
export async function queueRows(db: MasroofDB, table: SyncedTable, rows: Row[]): Promise<void> {
  const queuedAt = nowISO()
  await db.transaction('rw', db.tableOf(table), db.outbox, async () => {
    await db.tableOf(table).bulkPut(rows)
    await db.outbox.bulkAdd(rows.map((row): OutboxItem => ({ table, key: keyOf(table, row), row, queuedAt })))
  })
  syncEvents.dispatchEvent(new Event('queued'))
}

/** The server stamps updated_at (column default on insert, trigger on update), so never send ours. */
function toServer(row: Row): Row {
  const { updated_at: _updatedAt, ...rest } = row
  return rest
}

/** Send the outbox, oldest first, one upsert per table with only the latest version of each row. */
export async function push(db: MasroofDB, remote: Remote): Promise<number> {
  const items = await db.outbox.orderBy('seq').toArray()
  if (items.length === 0) return 0

  const byTable = new Map<SyncedTable, { latest: Map<string, OutboxItem>; seqs: number[] }>()
  for (const item of items) {
    const group = byTable.get(item.table) ?? { latest: new Map<string, OutboxItem>(), seqs: [] }
    group.latest.set(item.key, item)
    if (item.seq !== undefined) group.seqs.push(item.seq)
    byTable.set(item.table, group)
  }

  let sent = 0
  for (const [table, { latest, seqs }] of byTable) {
    if (!READ_ONLY_TABLES.has(table)) {
      const rows = [...latest.values()].map((item) => toServer(item.row))
      await remote.upsert(table, rows)
      sent += rows.length
    }
    // Only the items read above; anything queued meanwhile stays for the next push.
    await db.outbox.bulkDelete(seqs)
  }
  return sent
}

/** Fetch rows changed since each table's cursor. Rows with unsent local changes keep the local version. */
export async function pull(db: MasroofDB, remote: Remote, tables: readonly SyncedTable[] = SYNCED_TABLES): Promise<void> {
  for (const table of tables) {
    const since = (await db.meta.get(cursorKey(table)))?.value ?? null
    const rows = await remote.pullSince(table, since)
    if (rows.length === 0) continue

    await db.transaction('rw', db.tableOf(table), db.outbox, db.meta, async () => {
      const pending = new Set((await db.outbox.where('table').equals(table).toArray()).map((i) => i.key))
      await db.tableOf(table).bulkPut(rows.filter((r) => !pending.has(keyOf(table, r))))
      let cursor = since ?? ''
      for (const r of rows) {
        const updated = String(r.updated_at ?? '')
        if (updated > cursor) cursor = updated
      }
      if (cursor) await db.meta.put({ key: cursorKey(table), value: cursor })
    })
  }
  await db.meta.put({ key: INITIAL_PULL_KEY, value: '1' })
}

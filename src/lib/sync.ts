import { keyOf, READ_ONLY_TABLES, SYNCED_TABLES, type MasroofDB, type OutboxItem, type Row, type SyncedTable } from './db'
import { nowISO } from './dates'

/** The server, as sync sees it. Production: Supabase; tests: an in-memory fake. */
export interface Remote {
  /** Insert-or-update full rows. Throws on failure. */
  upsert(table: SyncedTable, rows: Row[]): Promise<void>
  /** Rows with updated_at > since (all rows when since is null), oldest first. */
  pullSince(table: SyncedTable, since: string | null): Promise<Row[]>
  /** The server's current copies of these rows; a key it never had is simply missing. */
  getRows(table: SyncedTable, keys: string[]): Promise<Row[]>
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

/**
 * The server refused the data itself (Postgres class 22 bad value, 23 broken constraint):
 * retrying can never succeed. Everything else is retried and the rows stay queued:
 * network, timeouts, 5xx, and also permission, login and schema errors (42xxx, PGRST…).
 * A request without a valid login (supabase-js falls back to the public key) is refused by
 * RLS with 42501; dropping rows for that would lose offline entries for good.
 */
function isPermanent(err: unknown): boolean {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code ?? '') : ''
  return /^(22|23)/.test(code)
}

export type PushResult = { sent: number; rejected: string[] }

/** Send the outbox: one upsert per table, parent tables first, with only the latest version of each row. */
export async function push(db: MasroofDB, remote: Remote): Promise<PushResult> {
  const result: PushResult = { sent: 0, rejected: [] }
  const items = await db.outbox.orderBy('seq').toArray()
  if (items.length === 0) return result

  const byTable = new Map<SyncedTable, { latest: Map<string, OutboxItem>; seqs: number[] }>()
  for (const item of items) {
    const group = byTable.get(item.table) ?? { latest: new Map<string, OutboxItem>(), seqs: [] }
    group.latest.set(item.key, item)
    if (item.seq !== undefined) group.seqs.push(item.seq)
    byTable.set(item.table, group)
  }

  // Parents before children, never outbox order: a child arriving first fails its foreign key
  // (23503), which counts as permanent, and would be set aside for good.
  for (const table of SYNCED_TABLES) {
    const group = byTable.get(table)
    if (!group) continue
    const { latest, seqs } = group
    const refused: string[] = []
    if (!READ_ONLY_TABLES.has(table)) {
      const rows = [...latest.values()]
      try {
        await remote.upsert(table, rows.map((item) => toServer(item.row)))
        result.sent += rows.length
      } catch (err) {
        if (!isPermanent(err)) throw err
        // One bad row must not block the rest forever: send them one by one and set aside
        // the ones the server rejects.
        for (const item of rows) {
          try {
            await remote.upsert(table, [toServer(item.row)])
            result.sent += 1
          } catch (rowErr) {
            if (!isPermanent(rowErr)) throw rowErr
            console.warn(`server rejected ${table} ${item.key}`, rowErr)
            refused.push(item.key)
          }
        }
      }
    }
    // Fetch the server's copies before letting go of anything: if that fails, the table stays queued.
    const serverCopies = refused.length > 0 ? await remote.getRows(table, refused) : []
    // Only the items read above; anything queued meanwhile stays for the next push.
    await db.outbox.bulkDelete(seqs)
    if (refused.length > 0) {
      await matchServer(db, table, refused, serverCopies)
      result.rejected.push(...refused)
    }
  }
  return result
}

/**
 * Refused rows: put the server's copy back, or remove a row the server never had (its
 * children are refused next, 23503, and go the same way), so this device matches the server.
 * A newer local change queued meanwhile is kept and pushed next time.
 */
async function matchServer(db: MasroofDB, table: SyncedTable, keys: string[], serverCopies: Row[]): Promise<void> {
  const byKey = new Map(serverCopies.map((r) => [keyOf(table, r), r]))
  await db.transaction('rw', db.tableOf(table), db.outbox, async () => {
    const pending = new Set((await db.outbox.where('table').equals(table).toArray()).map((i) => i.key))
    for (const key of keys) {
      if (pending.has(key)) continue
      const copy = byKey.get(key)
      if (copy) await db.tableOf(table).put(copy)
      else await db.tableOf(table).delete(key)
    }
  })
}

export type PageCursor = { updated_at: string; key: string }

/**
 * Keyset paging on (updated_at, key): each page starts after the last row seen. Offset paging
 * would skip a row whenever the other device edits one mid-pull (the edited row moves to the end).
 */
export async function pageThrough(
  pageSize: number,
  keyOfRow: (row: Row) => string,
  fetchPage: (after: PageCursor | null) => Promise<Row[]>,
): Promise<Row[]> {
  const out: Row[] = []
  let after: PageCursor | null = null
  for (;;) {
    const rows = await fetchPage(after)
    out.push(...rows)
    const last = rows[rows.length - 1]
    if (!last || rows.length < pageSize) return out
    after = { updated_at: String(last.updated_at), key: keyOfRow(last) }
  }
}

/** Push, then pull even if the push failed, so one device's trouble never stops the other's changes arriving. */
export async function syncOnce(db: MasroofDB, remote: Remote): Promise<{ ok: boolean; pulled: boolean; rejected: string[] }> {
  let ok = true
  let pulled = false
  let rejected: string[] = []
  try {
    rejected = (await push(db, remote)).rejected
  } catch (err) {
    ok = false
    console.warn('push failed', err)
  }
  try {
    await pull(db, remote)
    pulled = true
  } catch (err) {
    ok = false
    console.warn('pull failed', err)
  }
  return { ok, pulled, rejected }
}

// Re-read a few minutes before the cursor: a row whose transaction started earlier but
// committed later (or shifted between pages) would otherwise sit below the cursor forever.
// Re-applying rows we already have is harmless.
const OVERLAP_MS = 5 * 60 * 1000
function withOverlap(cursor: string | null): string | null {
  if (!cursor) return null
  const t = Date.parse(cursor)
  return Number.isNaN(t) ? cursor : new Date(t - OVERLAP_MS).toISOString()
}

/** Fetch rows changed since each table's cursor. Rows with unsent local changes keep the local version. */
export async function pull(db: MasroofDB, remote: Remote, tables: readonly SyncedTable[] = SYNCED_TABLES): Promise<void> {
  for (const table of tables) {
    const since = (await db.meta.get(cursorKey(table)))?.value ?? null
    const rows = await remote.pullSince(table, withOverlap(since))
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

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MasroofDB, type Row } from './db'
import { INITIAL_PULL_KEY, pull, push, queueRows, syncOnce, type Remote } from './sync'

let dbCount = 0
const freshDb = () => new MasroofDB(`test_${++dbCount}_${Date.now()}`)

/** An in-memory stand-in for Supabase that stamps updated_at like the real server. */
function fakeServer() {
  const tables = new Map<string, Map<string, Row>>()
  const upserts: { table: string; rows: Row[] }[] = []
  let clock = 0
  const stamp = () => `2026-10-26T12:00:${String(++clock).padStart(2, '0')}.000000+00:00`
  const put = (table: string, row: Row) => {
    const t = tables.get(table) ?? new Map<string, Row>()
    const key = String(table === 'settings' ? row.user_id : row.id)
    t.set(key, { ...row, updated_at: stamp() })
    tables.set(table, t)
  }
  let fail = false
  const rejected = new Map<string, string>()
  let duringUpsert: (() => Promise<void>) | null = null
  const remote: Remote = {
    async upsert(table, rows) {
      if (fail) throw new Error('offline')
      const bad = rows.find((r) => rejected.has(String(r.id)))
      if (bad) throw Object.assign(new Error('rejected'), { code: rejected.get(String(bad.id)) })
      upserts.push({ table, rows })
      if (duringUpsert) await duringUpsert()
      for (const r of rows) put(table, r)
    },
    async pullSince(table, since) {
      return [...(tables.get(table)?.values() ?? [])]
        .filter((r) => !since || String(r.updated_at) > since)
        .sort((a, b) => (String(a.updated_at) < String(b.updated_at) ? -1 : 1))
    },
  }
  return {
    remote,
    upserts,
    put,
    rows: (table: string) => [...(tables.get(table)?.values() ?? [])],
    setFail: (v: boolean) => (fail = v),
    reject: (id: string, code: string) => rejected.set(id, code),
    putAt: (table: string, row: Row, updatedAt: string) => {
      const t = tables.get(table) ?? new Map<string, Row>()
      t.set(String(row.id), { ...row, updated_at: updatedAt })
      tables.set(table, t)
    },
    onUpsert: (fn: () => Promise<void>) => (duringUpsert = fn),
  }
}

const entry = (id: string, amount: number, extra: Row = {}): Row => ({
  id,
  user_id: 'u1',
  amount,
  type: 'out',
  date: '2026-10-26',
  updated_at: '2026-10-26T09:00:00.000Z',
  deleted_at: null,
  ...extra,
})

describe('push', () => {
  it('sends a queued row once, without updated_at, and empties the outbox', async () => {
    const db = freshDb()
    const server = fakeServer()
    await queueRows(db, 'entries', [entry('a', 10)])
    expect(await db.entries.get('a')).toBeTruthy()
    expect(await db.outbox.count()).toBe(1)

    await push(db, server.remote)

    expect(server.upserts).toHaveLength(1)
    expect(server.upserts[0]?.rows[0]).not.toHaveProperty('updated_at')
    expect(await db.outbox.count()).toBe(0)
    expect(server.rows('entries')).toHaveLength(1)
  })

  it('coalesces several edits of one row into a single upsert of the latest version', async () => {
    const db = freshDb()
    const server = fakeServer()
    await queueRows(db, 'entries', [entry('a', 10)])
    await queueRows(db, 'entries', [entry('a', 12)])
    await queueRows(db, 'entries', [entry('a', 15)])

    await push(db, server.remote)

    expect(server.upserts).toHaveLength(1)
    expect(server.upserts[0]?.rows).toHaveLength(1)
    expect(server.upserts[0]?.rows[0]?.amount).toBe(15)
  })

  it('sends parents before children whatever order the outbox holds them in (foreign keys)', async () => {
    const db = freshDb()
    const server = fakeServer()
    // Envelopes left over from an earlier, half-failed push sit ahead of their new plan.
    await queueRows(db, 'plan_envelopes', [{ id: 'env1', plan_id: 'p1', updated_at: 'x', deleted_at: null }])
    await queueRows(db, 'entries', [entry('e1', 5)])
    await queueRows(db, 'plans', [{ id: 'p1', updated_at: 'x', deleted_at: null }])
    await queueRows(db, 'recurring', [{ id: 'r1', updated_at: 'x', deleted_at: null }])

    await push(db, server.remote)

    expect(server.upserts.map((u) => u.table)).toEqual(['recurring', 'entries', 'plans', 'plan_envelopes'])
  })

  it('keeps everything queued when the server is unreachable', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.setFail(true)
    await queueRows(db, 'entries', [entry('a', 10)])

    await expect(push(db, server.remote)).rejects.toThrow()
    expect(await db.outbox.count()).toBe(1)
  })

  it('does not drop a write queued while a push is in flight', async () => {
    const db = freshDb()
    const server = fakeServer()
    await queueRows(db, 'entries', [entry('a', 10)])
    server.onUpsert(async () => {
      server.onUpsert(async () => {})
      await queueRows(db, 'entries', [entry('b', 20)])
    })

    await push(db, server.remote)

    const left = await db.outbox.toArray()
    expect(left.map((i) => i.key)).toEqual(['b'])
  })
})

describe('pull', () => {
  it('applies rows newer than the cursor, advances it, and marks the initial pull done', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.put('entries', entry('a', 10))
    server.put('categories', { id: 'c1', user_id: 'u1', name_en: 'Food' })

    await pull(db, server.remote)

    expect(await db.entries.count()).toBe(1)
    expect(await db.categories.count()).toBe(1)
    expect((await db.meta.get(INITIAL_PULL_KEY))?.value).toBe('1')
    const cursor = (await db.meta.get('cursor:entries'))?.value
    expect(cursor).toBe(server.rows('entries')[0]?.updated_at)

    server.put('entries', entry('b', 20))
    await pull(db, server.remote)
    expect(await db.entries.count()).toBe(2)
  })

  it('never overwrites a row that has an unsent local change', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.put('entries', entry('a', 10))
    await queueRows(db, 'entries', [entry('a', 99)]) // edited offline, not pushed yet

    await pull(db, server.remote)

    expect((await db.entries.get('a'))?.amount).toBe(99)
  })

  it('a pushed row comes back with the server timestamp (deletes sync like updates)', async () => {
    const db = freshDb()
    const server = fakeServer()
    await queueRows(db, 'entries', [entry('a', 10, { deleted_at: '2026-10-26T10:00:00.000Z' })])
    await push(db, server.remote)
    await pull(db, server.remote)

    const local = await db.entries.get('a')
    expect(local?.deleted_at).toBe('2026-10-26T10:00:00.000Z')
    expect(local?.updated_at).toBe(server.rows('entries')[0]?.updated_at)
  })
})

describe('robustness', () => {
  it('reports pulled = false when the pull itself fails', async () => {
    const db = freshDb()
    const failing: Remote = {
      upsert: async () => {},
      pullSince: async () => {
        throw new Error('offline')
      },
    }
    const result = await syncOnce(db, failing)
    expect(result).toMatchObject({ ok: false, pulled: false })
  })

  it('a row the server permanently rejects is set aside; the other rows still sync', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('bad', '22003')
    await queueRows(db, 'entries', [entry('good1', 1), entry('bad', 2), entry('good2', 3)])

    const result = await push(db, server.remote)

    expect(server.rows('entries').map((r) => r.id).sort()).toEqual(['good1', 'good2'])
    expect(result.rejected).toEqual(['bad'])
    expect(await db.outbox.count()).toBe(0)
  })

  it('still pulls when push fails, and reports the failure', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.put('entries', entry('remote', 7))
    await queueRows(db, 'entries', [entry('local', 1)])
    server.setFail(true)

    const result = await syncOnce(db, server.remote)

    expect(result.ok).toBe(false)
    expect(result.pulled).toBe(true)
    expect(await db.entries.get('remote')).toBeTruthy()
    expect(await db.outbox.count()).toBe(1)
  })

  it('re-reads a short window before the cursor, so a row committed late is not lost', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.put('entries', entry('a', 1)) // stamped 12:00:01
    await pull(db, server.remote)
    server.putAt('entries', entry('late', 2), '2026-10-26T11:59:59.000000+00:00') // older than the cursor

    await pull(db, server.remote)

    expect(await db.entries.get('late')).toBeTruthy()
  })
})

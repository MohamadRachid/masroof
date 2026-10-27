import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { MasroofDB, type Row } from './db'
import { INITIAL_PULL_KEY, pageThrough, pull, push, queueRows, syncOnce, type Remote } from './sync'

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
  let getRowsFails = false
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
    async getRows(table, keys) {
      if (getRowsFails) throw new Error('offline')
      return keys.flatMap((k): Row[] => {
        const row = tables.get(table)?.get(k)
        return row ? [row] : []
      })
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
    failGetRows: (v: boolean) => (getRowsFails = v),
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
      getRows: async () => [],
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

describe('offline hardening (SPEC §8, phase 6)', () => {
  it.each([
    ['42501', 'refused by RLS: the request went out without a login'],
    ['PGRST301', 'expired or invalid JWT'],
    ['PGRST204', 'column missing from the schema cache'],
    ['42703', 'undefined column: the app is newer than the database'],
    ['NO_SESSION', 'no signed-in session on this device'],
  ])('a %s error keeps every row queued (%s)', async (code) => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('e1', code)
    await queueRows(db, 'entries', [entry('e1', 1), entry('e2', 2)])

    await expect(push(db, server.remote)).rejects.toMatchObject({ code })

    expect(await db.outbox.count()).toBe(2)
    expect(server.rows('entries')).toEqual([])
  })

  it('a rejected edit is reverted to the server copy on the same sync', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.putAt('entries', entry('e1', 10), '2026-10-26T10:00:00.000000+00:00') // well before the cursor window
    server.put('entries', entry('other', 5))
    await pull(db, server.remote)
    server.reject('e1', '23514')
    await queueRows(db, 'entries', [entry('e1', 999)])

    const result = await syncOnce(db, server.remote)

    expect(result.rejected).toEqual(['e1'])
    expect((await db.entries.get('e1'))?.amount).toBe(10)
    expect(await db.outbox.count()).toBe(0)
  })

  it('a pull that fails (no session) never marks the initial pull done', async () => {
    const db = freshDb()
    const noSession = Object.assign(new Error('no session'), { code: 'NO_SESSION' })
    const remote: Remote = {
      upsert: () => Promise.reject(noSession),
      pullSince: () => Promise.reject(noSession),
      getRows: () => Promise.reject(noSession),
    }

    const result = await syncOnce(db, remote)

    expect(result).toMatchObject({ ok: false, pulled: false })
    expect(await db.meta.get(INITIAL_PULL_KEY)).toBeUndefined()
  })
})

describe('two devices (SPEC §10 phase 6)', () => {
  /** One device: its own local database, sharing the server; offline = every request fails. */
  function device(server: ReturnType<typeof fakeServer>) {
    const db = freshDb()
    let online = true
    const offline = () => Promise.reject(new TypeError('Failed to fetch'))
    const remote: Remote = {
      upsert: (table, rows) => (online ? server.remote.upsert(table, rows) : offline()),
      pullSince: (table, since) => (online ? server.remote.pullSince(table, since) : offline()),
      getRows: (table, keys) => (online ? server.remote.getRows(table, keys) : offline()),
    }
    return { db, sync: () => syncOnce(db, remote), setOnline: (v: boolean) => (online = v) }
  }

  it('an entry made offline on the phone shows on the laptop after reconnect', async () => {
    const server = fakeServer()
    const phone = device(server)
    const laptop = device(server)

    phone.setOnline(false)
    await queueRows(phone.db, 'entries', [entry('lunch', 45)])
    expect((await phone.sync()).ok).toBe(false)
    expect(await phone.db.entries.get('lunch')).toBeTruthy() // on the phone's screen straight away
    expect(await phone.db.outbox.count()).toBe(1)

    await queueRows(laptop.db, 'entries', [entry('rent', 1500)])
    expect((await laptop.sync()).ok).toBe(true)

    phone.setOnline(true)
    expect((await phone.sync()).ok).toBe(true)
    expect(await phone.db.outbox.count()).toBe(0)
    expect(await phone.db.entries.get('rent')).toBeTruthy()

    await laptop.sync()
    expect(await laptop.db.entries.get('lunch')).toMatchObject({ amount: 45 })
  })

  it('a delete on one device reaches the other', async () => {
    const server = fakeServer()
    const phone = device(server)
    const laptop = device(server)
    await queueRows(phone.db, 'entries', [entry('taxi', 30)])
    await phone.sync()
    await laptop.sync()

    await queueRows(laptop.db, 'entries', [entry('taxi', 30, { deleted_at: '2026-10-27T10:00:00.000Z' })])
    await laptop.sync()
    await phone.sync()

    expect((await phone.db.entries.get('taxi'))?.deleted_at).toBe('2026-10-27T10:00:00.000Z')
  })

  it('the same entry edited on both: the last push wins and both end up the same', async () => {
    const server = fakeServer()
    const phone = device(server)
    const laptop = device(server)
    await queueRows(laptop.db, 'entries', [entry('food', 20, { note: null })])
    await laptop.sync()
    await phone.sync()

    phone.setOnline(false)
    await queueRows(laptop.db, 'entries', [entry('food', 20, { note: 'laptop' })])
    await laptop.sync()
    await queueRows(phone.db, 'entries', [entry('food', 20, { note: 'phone' })])
    await phone.sync()
    phone.setOnline(true)
    await phone.sync()
    await laptop.sync()

    expect((await phone.db.entries.get('food'))?.note).toBe('phone')
    expect((await laptop.db.entries.get('food'))?.note).toBe('phone')
  })
})

describe('rows the server refuses (SPEC §8, phase 6)', () => {
  it('a refused new row the server never had is removed here, so both devices match', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('bad', '23514')
    await queueRows(db, 'entries', [entry('good', 1), entry('bad', 0)])

    const result = await push(db, server.remote)

    expect(result.rejected).toEqual(['bad'])
    expect(await db.entries.get('bad')).toBeUndefined()
    expect(await db.entries.get('good')).toBeTruthy()
    expect(await db.outbox.count()).toBe(0)
  })

  it('a newer local change queued during the push is kept, and stays queued', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('bad', '23514')
    await queueRows(db, 'entries', [entry('good', 1), entry('bad', 0)])
    // While the push runs, Ali fixes the bad row.
    server.onUpsert(async () => {
      server.onUpsert(async () => {})
      await queueRows(db, 'entries', [entry('bad', 5)])
    })

    await push(db, server.remote)

    expect((await db.entries.get('bad'))?.amount).toBe(5)
    expect((await db.outbox.toArray()).map((i) => i.key)).toEqual(['bad'])
  })

  it('a refused parent takes its children with it (23503), on this device too', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('acc1', '23514')
    server.reject('e1', '23503')
    await queueRows(db, 'accounts', [{ id: 'acc1', user_id: 'u1', name: 'Bad', updated_at: 'x', deleted_at: null }])
    await queueRows(db, 'entries', [entry('e1', 3, { account_id: 'acc1' })])

    const result = await push(db, server.remote)

    expect(result.rejected).toEqual(['acc1', 'e1'])
    expect(await db.accounts.get('acc1')).toBeUndefined()
    expect(await db.entries.get('e1')).toBeUndefined()
  })

  it('if the server copy can’t be fetched, the whole table stays queued (nothing lost)', async () => {
    const db = freshDb()
    const server = fakeServer()
    server.reject('bad', '23514')
    server.failGetRows(true)
    await queueRows(db, 'entries', [entry('good', 1), entry('bad', 0)])

    await expect(push(db, server.remote)).rejects.toThrow('offline')

    expect(await db.outbox.count()).toBe(2)
    expect(await db.entries.get('bad')).toBeTruthy()
  })
})

describe('pageThrough (keyset paging)', () => {
  it('asks for each next page after the last row seen, so an edit mid-pull hides nothing', async () => {
    // Server rows ordered by (updated_at, id); "b" is edited between the first and second page.
    let rows: Row[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, updated_at: `t${i}` }))
    const asked: (string | null)[] = []
    const fetchPage = async (after: { updated_at: string; key: string } | null) => {
      asked.push(after ? `${after.updated_at}/${after.key}` : null)
      if (asked.length === 2) rows = [...rows.filter((r) => r.id !== 'b'), { id: 'b', updated_at: 't9' }]
      return rows
        .filter((r) => !after || String(r.updated_at) > after.updated_at || (r.updated_at === after.updated_at && String(r.id) > after.key))
        .slice(0, 2)
    }

    const got = await pageThrough(2, (r) => String(r.id), fetchPage)

    expect(asked).toEqual([null, 't1/b', 't3/d', 't9/b'])
    expect(new Set(got.map((r) => r.id))).toEqual(new Set(['a', 'b', 'c', 'd', 'e']))
  })
})

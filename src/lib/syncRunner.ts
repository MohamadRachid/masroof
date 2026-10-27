import type { SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { keyColumn, type MasroofDB, type Row } from './db'
import { supabase } from './supabase'
import { repairPlaceholderRates } from './store'
import { pageThrough, syncEvents, syncOnce, type Remote } from './sync'

const PAGE = 1000
const PUSH_DELAY_MS = 400
const PULL_EVERY_MS = 60_000

// Table names are dynamic here, so use the client untyped; rows are validated by the schema.
const client = supabase as unknown as SupabaseClient

/**
 * Never talk to the server as the anonymous role. When the stored login has expired and the
 * refresh fails (offline, flaky network), supabase-js sends the request with the public key
 * instead: RLS refuses pushes and pulls come back empty. Wait for a real session, and send
 * exactly the token checked here (supabase-js keeps an Authorization header it is given).
 */
async function bearer(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw Object.assign(new Error('No signed-in session yet; sync will retry'), { code: 'NO_SESSION' })
  return `Bearer ${data.session.access_token}`
}

/** A PostgREST value inside an or() filter, quoted (timestamps hold ':' '.' '+'). */
const quoted = (v: string) => `"${v.replace(/"/g, '\\"')}"`

export const supabaseRemote: Remote = {
  async upsert(table, rows) {
    const auth = await bearer()
    const { error } = await client.from(table).upsert(rows, { onConflict: keyColumn(table) }).setHeader('Authorization', auth)
    if (error) throw error
  },
  async pullSince(table, since) {
    const auth = await bearer()
    const key = keyColumn(table)
    return pageThrough(PAGE, (r) => String(r[key]), async (after) => {
      let query = client.from(table).select('*').setHeader('Authorization', auth)
      if (after) {
        const t = quoted(after.updated_at)
        query = query.or(`updated_at.gt.${t},and(updated_at.eq.${t},${key}.gt.${quoted(after.key)})`)
      } else if (since) {
        query = query.gt('updated_at', since)
      }
      const { data, error } = await query.order('updated_at').order(key).limit(PAGE)
      if (error) throw error
      return (data ?? []) as Row[]
    })
  },
  async getRows(table, keys) {
    const auth = await bearer()
    const { data, error } = await client.from(table).select('*').in(keyColumn(table), keys).setHeader('Authorization', auth)
    if (error) throw error
    return (data ?? []) as Row[]
  },
}

// ── status, for the gate's "connect once" screen ──
type Status = { failed: boolean }
let status: Status = { failed: false }
const listeners = new Set<() => void>()
function setStatus(next: Status) {
  if (next.failed === status.failed) return
  status = next
  for (const l of listeners) l()
}
export function useSyncFailed(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status.failed,
  )
}

/** Run under a Web Lock shared by every tab of this app (where the browser has them). */
function oneTabAtATime(name: string, fn: () => Promise<void>): Promise<void> {
  return 'locks' in navigator ? navigator.locks.request(name, fn) : fn()
}

let runNow: (() => void) | null = null
/** Ask for a sync right away (e.g. the "Try again" button). */
export function syncNow() {
  runNow?.()
}

/**
 * Push then pull: soon after every write, on start, on focus, when the
 * network returns, and every 60 s while the app is visible (SPEC §8).
 */
export function startSync(db: MasroofDB, remote: Remote = supabaseRemote): () => void {
  let running = false
  let again = false
  let debounce: number | undefined

  const run = async () => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      if (!navigator.onLine) {
        setStatus({ failed: true })
        return
      }
      // One tab at a time: two tabs pushing the same outbox at once can land an older version last.
      await oneTabAtATime(`masroof-sync:${db.name}`, async () => {
        const { ok, pulled, rejected } = await syncOnce(db, remote)
        setStatus({ failed: !ok })
        if (rejected.length > 0) syncEvents.dispatchEvent(new CustomEvent<number>('rejected', { detail: rejected.length }))
        // Entries saved before any rate existed get their day's rate — only on fresh data.
        if (pulled) await repairPlaceholderRates(db).catch((err: unknown) => console.warn('rate repair failed', err))
      })
    } finally {
      running = false
      if (again) {
        again = false
        void run()
      }
    }
  }

  const soon = () => {
    window.clearTimeout(debounce)
    debounce = window.setTimeout(() => void run(), PUSH_DELAY_MS)
  }
  const now = () => void run()
  const onVisible = () => {
    if (document.visibilityState === 'visible') void run()
  }

  runNow = now
  syncEvents.addEventListener('queued', soon)
  window.addEventListener('online', now)
  window.addEventListener('focus', now)
  document.addEventListener('visibilitychange', onVisible)
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible') void run()
  }, PULL_EVERY_MS)
  void run()

  return () => {
    if (runNow === now) runNow = null
    syncEvents.removeEventListener('queued', soon)
    window.removeEventListener('online', now)
    window.removeEventListener('focus', now)
    document.removeEventListener('visibilitychange', onVisible)
    window.clearInterval(interval)
    window.clearTimeout(debounce)
  }
}

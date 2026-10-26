import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { dbFor, type MasroofDB } from './db'
import { INITIAL_PULL_KEY } from './sync'
import { startSync } from './syncRunner'

// Components read data only through these hooks (live Dexie queries), never from Supabase.

type DataContextValue = { db: MasroofDB; userId: string }
const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const db = useMemo(() => dbFor(userId), [userId])
  useEffect(() => startSync(db), [db])
  useEffect(() => {
    // Ask the browser not to evict local data under storage pressure: the outbox may hold unsynced entries.
    void navigator.storage?.persist?.().catch(() => false)
  }, [])
  const value = useMemo(() => ({ db, userId }), [db, userId])
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside <DataProvider>')
  return ctx
}

/** undefined while the first local read is in flight. */
export function useInitialPullDone(): boolean | undefined {
  const { db } = useData()
  return useLiveQuery(async () => (await db.meta.get(INITIAL_PULL_KEY))?.value === '1', [db])
}

export function useAccounts() {
  const { db } = useData()
  return useLiveQuery(() => db.accounts.filter((a) => !a.deleted_at).sortBy('sort'), [db])
}

export function useCategories() {
  const { db } = useData()
  return useLiveQuery(() => db.categories.filter((c) => !c.deleted_at).sortBy('sort'), [db])
}

export function useEntries() {
  const { db } = useData()
  return useLiveQuery(() => db.entries.filter((e) => !e.deleted_at).toArray(), [db])
}

export function useSettings() {
  const { db, userId } = useData()
  // null = no row; undefined = still loading (useLiveQuery can't tell an empty result apart otherwise).
  return useLiveQuery(async () => (await db.settings.get(userId)) ?? null, [db, userId])
}

export function useLatestRate() {
  const { db } = useData()
  return useLiveQuery(async () => (await db.rates.orderBy('date').last()) ?? null, [db])
}

export function useOutboxCount(): number {
  const { db } = useData()
  return useLiveQuery(() => db.outbox.count(), [db]) ?? 0
}

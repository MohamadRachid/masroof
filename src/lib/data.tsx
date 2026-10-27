import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { dbFor, type MasroofDB, type Plan } from './db'
import { effectiveRate, type EffectiveRate } from './fx'
import { planStats, type PlanStats } from './money'
import type { PlanSnapshot } from './store'
import { useToday } from './useToday'
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

/** SPEC §5 effective rate now (manual, else latest daily, else none). undefined while loading. */
export function useEffectiveRate(): EffectiveRate | undefined {
  const settings = useSettings()
  const latest = useLatestRate()
  if (settings === undefined || latest === undefined) return undefined
  return effectiveRate(settings, latest)
}

/** The rate to show equivalents with, or null when there is no real rate yet. */
export function useDisplayRate(): number | null {
  const eff = useEffectiveRate()
  return eff && eff.source !== 'none' ? eff.rate : null
}

/** All live plans, newest first. */
export function usePlans() {
  const { db } = useData()
  return useLiveQuery(
    async () =>
      (await db.plans.filter((p) => !p.deleted_at).toArray()).sort(
        (a, b) => b.start_date.localeCompare(a.start_date) || b.created_at.localeCompare(a.created_at),
      ),
    [db],
  )
}

export function useEnvelopes() {
  const { db } = useData()
  return useLiveQuery(() => db.plan_envelopes.filter((e) => !e.deleted_at).toArray(), [db])
}

export type CurrentPlan = { snapshot: PlanSnapshot; stats: PlanStats }

/** The open plan with its envelopes and SPEC §5 numbers. null = no plan yet; undefined = loading. */
export function useCurrentPlan(): CurrentPlan | null | undefined {
  const plans = usePlans()
  const envelopes = useEnvelopes()
  const categories = useCategories()
  const entries = useEntries()
  const accounts = useAccounts()
  const settings = useSettings()
  const rate = useDisplayRate()
  const today = useToday()

  return useMemo(() => {
    if (!plans || !envelopes || !categories || !entries || !accounts || settings === undefined) return undefined
    const plan = plans.find((p) => !p.closed_at)
    if (!plan) return null
    const mine = envelopes.filter((e) => e.plan_id === plan.id)
    const stats = planStats({
      plan,
      envelopes: mine,
      categories,
      entries,
      today,
      weekStart: settings?.week_start ?? 1,
      warnPct: settings?.warn_pct ?? 80,
      currencyOf: (id) => accounts.find((a) => a.id === id)?.currency ?? 'GHS',
      fallbackRate: rate,
    })
    return { snapshot: { plan, envelopes: mine }, stats }
  }, [plans, envelopes, categories, entries, accounts, settings, rate, today])
}

/**
 * SPEC §5 numbers for any plan. With nextStart the period ends the day before it
 * (a past plan, or the open plan as Salary received closes it). null = no plan or loading.
 */
export function usePlanStats(plan: Plan | null, nextStart?: string): PlanStats | null {
  const envelopes = useEnvelopes()
  const categories = useCategories()
  const entries = useEntries()
  const accounts = useAccounts()
  const settings = useSettings()
  const rate = useDisplayRate()
  const today = useToday()

  return useMemo(() => {
    if (!plan || !envelopes || !categories || !entries || !accounts || settings === undefined) return null
    return planStats({
      plan,
      envelopes: envelopes.filter((e) => e.plan_id === plan.id),
      categories,
      entries,
      today,
      nextStart,
      weekStart: settings?.week_start ?? 1,
      warnPct: settings?.warn_pct ?? 80,
      currencyOf: (id) => accounts.find((a) => a.id === id)?.currency ?? 'GHS',
      fallbackRate: rate,
    })
  }, [plan, nextStart, envelopes, categories, entries, accounts, settings, rate, today])
}

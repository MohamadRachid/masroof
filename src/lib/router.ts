import { useSyncExternalStore } from 'react'

// Hash routing: survives GitHub Pages (no server rewrites) and ignores the
// `#access_token=…` fragment Supabase appends when a magic link is opened.
export const ROUTES = ['home', 'history', 'plan', 'more', 'add'] as const
export type Route = (typeof ROUTES)[number]

export function parseHash(hash: string): Route {
  if (!hash.startsWith('#/')) return 'home'
  const name = hash.slice(2).split(/[?/]/)[0] ?? ''
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'home'
}

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  window.addEventListener('hashchange', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
    window.removeEventListener('hashchange', listener)
  }
}

function emit() {
  for (const listener of listeners) listener()
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseHash(window.location.hash))
}

/** Push (default) or replace the current history entry. */
export function navigate(route: Route, { replace = false }: { replace?: boolean } = {}) {
  const url = `#/${route}`
  if (replace) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState({ masroof: true }, '', url)
  emit()
}

/** Tabs keep history shallow: Back from any tab returns Home, Back from Home leaves. */
export function goTab(route: Route) {
  const current = parseHash(window.location.hash)
  if (current === route) return
  navigate(route, { replace: current !== 'home' })
}

/** Close a pushed screen (e.g. the Add sheet); falls back to Home if we didn't push it. */
export function goBack() {
  const state: unknown = window.history.state
  if (state && typeof state === 'object' && 'masroof' in state) window.history.back()
  else navigate('home', { replace: true })
}

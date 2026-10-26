import { useEffect, useState } from 'react'
import { authErrorKey, type AuthErrorKey } from './authErrors'
import { initialSessionState, nextSessionState, type SessionState } from './sessionState'
import { AUTH_STORAGE_KEY, supabase } from './supabase'

export type { SessionState }

export const MIN_PASSWORD = 6

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey }

function readStoredSession(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return null
  }
}

export function useSession(): SessionState {
  // Open from the stored session at once (offline too); never wait on a token refresh.
  const [state, setState] = useState<SessionState>(() => initialSessionState(readStoredSession()))

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((prev) => nextSessionState(prev, event, session, readStoredSession()))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return state
}

function fail(error: { status?: number; code?: string; message?: string; name?: string } | null): AuthResult {
  return { ok: false, error: authErrorKey(error, navigator.onLine) }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? fail(error) : { ok: true }
  } catch (err) {
    return fail(err instanceof Error ? err : null)
  }
}

/** One-time account creation. Needs "Confirm email" off in Supabase, otherwise no session comes back. */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    if (error) return fail(error)
    return data.session ? { ok: true } : { ok: false, error: 'notConfirmed' }
  } catch (err) {
    return fail(err instanceof Error ? err : null)
  }
}

/** Signs out this device only; the other device keeps its session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}

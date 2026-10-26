import { useEffect, useState } from 'react'
import { authErrorKey, type AuthErrorKey } from './authErrors'
import { initialSessionState, nextSessionState, type SessionState } from './sessionState'
import { AUTH_STORAGE_KEY, supabase } from './supabase'

export type { SessionState }

export const OTP_LENGTH = 6
export const RESEND_SECONDS = 60

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey }

function readStoredSession(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Drop `#access_token=…` / `#error=…` once Supabase has read it. */
function cleanAuthHash() {
  const { hash, pathname, search } = window.location
  if (hash && !hash.startsWith('#/') && /access_token|error/.test(hash)) {
    window.history.replaceState(null, '', `${pathname}${search}#/home`)
  }
}

export function useSession(): SessionState {
  // Open from the stored session at once (offline too); never wait on a token refresh.
  const [state, setState] = useState<SessionState>(() =>
    initialSessionState(readStoredSession(), window.location.hash),
  )

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') cleanAuthHash()
      setState((prev) => nextSessionState(prev, event, session, readStoredSession()))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return state
}

function fail(error: { status?: number; code?: string; message?: string } | null): AuthResult {
  return { ok: false, error: authErrorKey(error, navigator.onLine) }
}

export async function sendCode(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    return error ? fail(error) : { ok: true }
  } catch (err) {
    return fail(err instanceof Error ? err : null)
  }
}

export async function verifyCode(email: string, code: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: 'email' })
    return error ? fail(error) : { ok: true }
  } catch (err) {
    return fail(err instanceof Error ? err : null)
  }
}

/** Signs out this device only; the other device keeps its session. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
}

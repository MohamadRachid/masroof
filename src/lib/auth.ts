import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { authErrorKey, type AuthErrorKey } from './authErrors'
import { supabase } from './supabase'

export const OTP_LENGTH = 6
export const RESEND_SECONDS = 60

export type AuthResult = { ok: true } | { ok: false; error: AuthErrorKey }

export type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn'
  email: string | null
}

function fromSession(session: Session | null): SessionState {
  return session
    ? { status: 'signedIn', email: session.user.email ?? null }
    : { status: 'signedOut', email: null }
}

/** Drop `#access_token=…` / `#error=…` once Supabase has read it. */
function cleanAuthHash() {
  const { hash, pathname, search } = window.location
  if (hash && !hash.startsWith('#/') && /access_token|error/.test(hash)) {
    window.history.replaceState(null, '', `${pathname}${search}#/home`)
  }
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading', email: null })

  useEffect(() => {
    // INITIAL_SESSION fires on subscribe, so this also covers the first load.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') cleanAuthHash()
      setState(fromSession(session))
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

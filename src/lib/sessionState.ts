export type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn'
  email: string | null
}

const SIGNED_OUT: SessionState = { status: 'signedOut', email: null }

/** The session supabase-js keeps in localStorage, if it holds a usable refresh token. */
function readStored(raw: string | null): { email: string | null } | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('refresh_token' in parsed)) return null
    if (typeof parsed.refresh_token !== 'string' || !parsed.refresh_token) return null
    const user = 'user' in parsed ? parsed.user : null
    const email = user && typeof user === 'object' && 'email' in user && typeof user.email === 'string' ? user.email : null
    return { email }
  } catch {
    return null
  }
}

/**
 * Decide the first screen without the network: a stored session opens the app
 * straight away (offline too); only a magic-link return waits for Supabase.
 */
export function initialSessionState(storedRaw: string | null, hash: string): SessionState {
  const stored = readStored(storedRaw)
  if (stored) return { status: 'signedIn', email: stored.email }
  if (/access_token=/.test(hash)) return { status: 'loading', email: null }
  return SIGNED_OUT
}

/**
 * A null session only signs out on SIGNED_OUT. supabase-js reports a null
 * INITIAL_SESSION when the start-up token refresh fails for network reasons,
 * but keeps the session stored and retries — that is still signed in.
 */
export function nextSessionState(
  prev: SessionState,
  event: string,
  session: { user: { email?: string | null } } | null,
  storedRaw: string | null,
): SessionState {
  if (session) return { status: 'signedIn', email: session.user.email ?? null }
  if (event === 'SIGNED_OUT') return SIGNED_OUT
  const stored = readStored(storedRaw)
  if (stored) return prev.status === 'signedIn' ? prev : { status: 'signedIn', email: stored.email }
  return SIGNED_OUT
}

export type SessionState = {
  status: 'loading' | 'signedOut' | 'signedIn'
  email: string | null
  userId: string | null
}

const SIGNED_OUT: SessionState = { status: 'signedOut', email: null, userId: null }

type StoredUser = { userId: string; email: string | null }

/** The session supabase-js keeps in localStorage, if it holds a refresh token and a user. */
function readStored(raw: string | null): StoredUser | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('refresh_token' in parsed) || !('user' in parsed)) return null
    if (typeof parsed.refresh_token !== 'string' || !parsed.refresh_token) return null
    const user = parsed.user
    if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string') return null
    const email = 'email' in user && typeof user.email === 'string' ? user.email : null
    return { userId: user.id, email }
  } catch {
    return null
  }
}

function signedInAs(user: StoredUser): SessionState {
  return { status: 'signedIn', email: user.email, userId: user.userId }
}

/** Decide the first screen without the network: a stored session opens the app straight away, offline too. */
export function initialSessionState(storedRaw: string | null): SessionState {
  const stored = readStored(storedRaw)
  return stored ? signedInAs(stored) : SIGNED_OUT
}

/**
 * A null session only signs out on SIGNED_OUT. supabase-js reports a null
 * INITIAL_SESSION when the start-up token refresh fails for network reasons,
 * but keeps the session stored and retries — that is still signed in.
 */
export function nextSessionState(
  prev: SessionState,
  event: string,
  session: { user: { id: string; email?: string | null } } | null,
  storedRaw: string | null,
): SessionState {
  if (session) return { status: 'signedIn', email: session.user.email ?? null, userId: session.user.id }
  if (event === 'SIGNED_OUT') return SIGNED_OUT
  const stored = readStored(storedRaw)
  if (stored) return prev.status === 'signedIn' ? prev : signedInAs(stored)
  return SIGNED_OUT
}

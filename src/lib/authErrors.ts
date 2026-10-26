export type AuthErrorKey = 'invalidEmail' | 'badCode' | 'rateLimited' | 'offline' | 'unknown'

type AuthErrorLike = { status?: number; code?: string; message?: string } | null

/** Turn a Supabase auth error into one of a few messages a person can act on. */
export function authErrorKey(err: AuthErrorLike, online: boolean): AuthErrorKey {
  if (!online) return 'offline'
  if (!err) return 'unknown'

  const code = err.code ?? ''
  const message = (err.message ?? '').toLowerCase()

  if (message.includes('failed to fetch') || message.includes('network')) return 'offline'
  if (err.status === 429 || code.includes('rate_limit')) return 'rateLimited'
  if (code === 'otp_expired' || message.includes('expired') || message.includes('token')) return 'badCode'
  if (code === 'email_address_invalid' || message.includes('email address')) return 'invalidEmail'
  return 'unknown'
}

/** Supabase redirects a failed magic link to `#error=…&error_code=…`. */
export function linkErrorFromHash(hash: string): AuthErrorKey | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null
  const params = new URLSearchParams(hash.slice(1))
  if (!params.has('error') && !params.has('error_code')) return null
  return params.get('error_code') === 'otp_expired' ? 'badCode' : 'unknown'
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

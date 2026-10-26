export type AuthErrorKey = 'invalidEmail' | 'badCode' | 'rateLimited' | 'notAllowed' | 'offline' | 'unknown'

type AuthErrorLike = { status?: number; code?: string; message?: string; name?: string } | null

const BY_CODE: Record<string, AuthErrorKey> = {
  email_address_not_authorized: 'notAllowed',
  otp_disabled: 'notAllowed',
  signup_disabled: 'notAllowed',
  over_email_send_rate_limit: 'rateLimited',
  over_request_rate_limit: 'rateLimited',
  otp_expired: 'badCode',
  email_address_invalid: 'invalidEmail',
}

/** Turn a Supabase auth error into one of a few messages a person can act on. Codes first, message text last. */
export function authErrorKey(err: AuthErrorLike, online: boolean): AuthErrorKey {
  if (!online) return 'offline'
  if (!err) return 'unknown'

  const byCode = err.code ? BY_CODE[err.code] : undefined
  if (byCode) return byCode
  if (err.status === 429) return 'rateLimited'

  const message = (err.message ?? '').toLowerCase()
  // supabase-js reports network failures and our request timeout as status 0.
  if (err.status === 0 || message.includes('failed to fetch') || message.includes('network')) return 'offline'
  if (message.includes('expired') || message.includes('token')) return 'badCode'
  if (message.includes('invalid format') || message.includes('validate email')) return 'invalidEmail'
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

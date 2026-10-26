export type AuthErrorKey =
  | 'invalidEmail'
  | 'wrongPassword'
  | 'exists'
  | 'weakPassword'
  | 'notConfirmed'
  | 'rateLimited'
  | 'notAllowed'
  | 'offline'
  | 'unknown'

type AuthErrorLike = { status?: number; code?: string; message?: string; name?: string } | null

const BY_CODE: Record<string, AuthErrorKey> = {
  invalid_credentials: 'wrongPassword',
  user_already_exists: 'exists',
  email_exists: 'exists',
  weak_password: 'weakPassword',
  email_not_confirmed: 'notConfirmed',
  signup_disabled: 'notAllowed',
  email_provider_disabled: 'notAllowed',
  email_address_not_authorized: 'notAllowed',
  over_request_rate_limit: 'rateLimited',
  over_email_send_rate_limit: 'rateLimited',
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
  if (message.includes('invalid format') || message.includes('validate email')) return 'invalidEmail'
  return 'unknown'
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

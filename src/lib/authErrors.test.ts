import { describe, expect, it } from 'vitest'
import { authErrorKey, looksLikeEmail } from './authErrors'

describe('authErrorKey — password sign-in', () => {
  it('wrong email or password', () => {
    expect(authErrorKey({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }, true)).toBe('wrongPassword')
  })

  it('creating an account that already exists', () => {
    expect(authErrorKey({ code: 'user_already_exists', status: 422 }, true)).toBe('exists')
    expect(authErrorKey({ code: 'email_exists', status: 422 }, true)).toBe('exists')
  })

  it('password too short', () => {
    expect(authErrorKey({ code: 'weak_password', status: 422, message: 'Password should be at least 6 characters.' }, true)).toBe('weakPassword')
  })

  it('Supabase still requires email confirmation', () => {
    expect(authErrorKey({ code: 'email_not_confirmed', status: 400 }, true)).toBe('notConfirmed')
  })

  it('sign-ups turned off', () => {
    expect(authErrorKey({ code: 'signup_disabled', status: 422 }, true)).toBe('notAllowed')
  })
})

describe('authErrorKey — general', () => {
  it('maps rate limits by status or code', () => {
    expect(authErrorKey({ status: 429 }, true)).toBe('rateLimited')
    expect(authErrorKey({ code: 'over_request_rate_limit', status: 400 }, true)).toBe('rateLimited')
  })

  it('maps a rejected address to invalidEmail', () => {
    expect(authErrorKey({ status: 400, message: 'Unable to validate email address: invalid format' }, true)).toBe('invalidEmail')
    expect(authErrorKey({ code: 'email_address_invalid', status: 400 }, true)).toBe('invalidEmail')
  })

  it('reports offline when the browser is offline, whatever the error says', () => {
    expect(authErrorKey({ message: 'Failed to fetch' }, false)).toBe('offline')
    expect(authErrorKey({ status: 429 }, false)).toBe('offline')
  })

  it('a network failure or our timeout (status 0) reads as offline', () => {
    expect(authErrorKey({ message: 'Failed to fetch', status: 0 }, true)).toBe('offline')
    expect(authErrorKey({ name: 'AuthRetryableFetchError', message: 'signal timed out', status: 0 }, true)).toBe('offline')
  })

  it('falls back to unknown', () => {
    expect(authErrorKey({ status: 500 }, true)).toBe('unknown')
    expect(authErrorKey(null, true)).toBe('unknown')
  })
})

describe('looksLikeEmail', () => {
  it('accepts plausible addresses, trimming spaces', () => {
    expect(looksLikeEmail('ali@example.com')).toBe(true)
    expect(looksLikeEmail('  ali@example.com ')).toBe(true)
  })

  it('rejects incomplete input', () => {
    expect(looksLikeEmail('')).toBe(false)
    expect(looksLikeEmail('ali')).toBe(false)
    expect(looksLikeEmail('ali@')).toBe(false)
    expect(looksLikeEmail('ali@example')).toBe(false)
    expect(looksLikeEmail('a li@example.com')).toBe(false)
  })
})

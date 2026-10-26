import { describe, expect, it } from 'vitest'
import { authErrorKey, linkErrorFromHash, looksLikeEmail } from './authErrors'

describe('authErrorKey', () => {
  it('maps rate limits by status or code', () => {
    expect(authErrorKey({ status: 429 }, true)).toBe('rateLimited')
    expect(authErrorKey({ code: 'over_email_send_rate_limit' }, true)).toBe('rateLimited')
    expect(authErrorKey({ code: 'over_request_rate_limit', status: 400 }, true)).toBe('rateLimited')
  })

  it('maps expired or wrong codes to badCode', () => {
    expect(authErrorKey({ code: 'otp_expired', status: 403 }, true)).toBe('badCode')
    expect(authErrorKey({ status: 403, message: 'Token has expired or is invalid' }, true)).toBe('badCode')
  })

  it('maps a rejected address to invalidEmail', () => {
    expect(authErrorKey({ status: 400, message: 'Unable to validate email address: invalid format' }, true)).toBe('invalidEmail')
    expect(authErrorKey({ code: 'email_address_invalid', status: 400 }, true)).toBe('invalidEmail')
  })

  it('reports offline when the browser is offline, whatever the error says', () => {
    expect(authErrorKey({ message: 'Failed to fetch' }, false)).toBe('offline')
    expect(authErrorKey({ status: 429 }, false)).toBe('offline')
  })

  it('treats a network failure while "online" as offline', () => {
    expect(authErrorKey({ message: 'Failed to fetch', status: 0 }, true)).toBe('offline')
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

describe('linkErrorFromHash', () => {
  it('reports an expired or used magic link as badCode', () => {
    expect(linkErrorFromHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toBe('badCode')
  })

  it('reports other link errors as unknown', () => {
    expect(linkErrorFromHash('#error=server_error&error_code=unexpected_failure')).toBe('unknown')
  })

  it('returns null for a successful link or a normal route', () => {
    expect(linkErrorFromHash('#access_token=abc&type=magiclink')).toBeNull()
    expect(linkErrorFromHash('#/home')).toBeNull()
    expect(linkErrorFromHash('')).toBeNull()
  })
})

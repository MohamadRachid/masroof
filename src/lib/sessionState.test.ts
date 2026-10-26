import { describe, expect, it } from 'vitest'
import { initialSessionState, nextSessionState, type SessionState } from './sessionState'

const stored = JSON.stringify({ access_token: 'a', refresh_token: 'r', user: { email: 'ali@example.com' } })
const signedIn: SessionState = { status: 'signedIn', email: 'ali@example.com' }
const signedOut: SessionState = { status: 'signedOut', email: null }
const loading: SessionState = { status: 'loading', email: null }

describe('initialSessionState', () => {
  it('starts signed in from a stored session, without waiting for the network', () => {
    expect(initialSessionState(stored, '#/home')).toEqual(signedIn)
  })

  it('waits for Supabase when returning from a magic link', () => {
    expect(initialSessionState(null, '#access_token=abc&refresh_token=def&type=magiclink')).toEqual(loading)
  })

  it('is signed out when nothing is stored', () => {
    expect(initialSessionState(null, '#/home')).toEqual(signedOut)
    expect(initialSessionState(null, '')).toEqual(signedOut)
  })

  it('ignores corrupt or incomplete storage', () => {
    expect(initialSessionState('{oops', '')).toEqual(signedOut)
    expect(initialSessionState(JSON.stringify({ access_token: 'a' }), '')).toEqual(signedOut)
  })
})

describe('nextSessionState', () => {
  it('a session from Supabase means signed in', () => {
    expect(nextSessionState(signedOut, 'SIGNED_IN', { user: { email: 'ali@example.com' } }, stored)).toEqual(signedIn)
  })

  it('stays signed in when the start-up refresh fails offline (null INITIAL_SESSION, session still stored)', () => {
    expect(nextSessionState(signedIn, 'INITIAL_SESSION', null, stored)).toEqual(signedIn)
  })

  it('signs out on SIGNED_OUT even before storage is cleared', () => {
    expect(nextSessionState(signedIn, 'SIGNED_OUT', null, stored)).toEqual(signedOut)
  })

  it('a null session with nothing stored is signed out', () => {
    expect(nextSessionState(loading, 'INITIAL_SESSION', null, null)).toEqual(signedOut)
  })
})

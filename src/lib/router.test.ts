import { describe, expect, it } from 'vitest'
import { parseHash, tabNavAction, type Route } from './router'

describe('parseHash', () => {
  it('maps known routes', () => {
    expect(parseHash('#/history')).toBe('history')
    expect(parseHash('#/plan')).toBe('plan')
    expect(parseHash('#/more')).toBe('more')
    expect(parseHash('#/add')).toBe('add')
  })

  it('falls back to home for empty or unknown hashes', () => {
    expect(parseHash('')).toBe('home')
    expect(parseHash('#')).toBe('home')
    expect(parseHash('#/')).toBe('home')
    expect(parseHash('#/nope')).toBe('home')
  })

  it('treats a magic-link token hash as home, never a blank screen', () => {
    expect(parseHash('#access_token=abc&refresh_token=def&type=magiclink')).toBe('home')
    expect(parseHash('#error=access_denied&error_code=otp_expired')).toBe('home')
  })

  it('ignores a query string after the route', () => {
    expect(parseHash('#/plan?x=1')).toBe('plan')
  })
})

// A tiny model of the browser history stack, to check that tab navigation never piles up entries.
function simulate(taps: Route[], start: Route = 'home') {
  const stack: { route: Route; pushed: boolean }[] = [{ route: start, pushed: false }]
  for (const target of taps) {
    const top = stack[stack.length - 1]!
    const action = tabNavAction(top.route, target, top.pushed)
    if (action === 'push') stack.push({ route: target, pushed: true })
    else if (action === 'replace') stack[stack.length - 1] = { route: target, pushed: top.pushed }
    else if (action === 'back') stack.pop()
  }
  return stack
}

describe('tabNavAction', () => {
  it('does nothing when tapping the current tab', () => {
    expect(tabNavAction('history', 'history', true)).toBe('none')
  })

  it('pushes when leaving Home, replaces between tabs', () => {
    expect(tabNavAction('home', 'history', false)).toBe('push')
    expect(tabNavAction('history', 'plan', true)).toBe('replace')
  })

  it('goes back (not replace) when returning Home over an entry we pushed', () => {
    expect(tabNavAction('plan', 'home', true)).toBe('back')
  })

  it('replaces when returning Home from a cold-start deep link', () => {
    expect(tabNavAction('history', 'home', false)).toBe('replace')
  })

  it('Home → History → Home, repeated, leaves a single Home entry so Back exits', () => {
    const stack = simulate(['history', 'home', 'plan', 'more', 'home', 'history', 'home'])
    expect(stack).toEqual([{ route: 'home', pushed: false }])
  })

  it('any tab hopping leaves at most Home + the current tab', () => {
    const stack = simulate(['history', 'plan', 'more', 'history', 'plan'])
    expect(stack.map((e) => e.route)).toEqual(['home', 'plan'])
  })
})

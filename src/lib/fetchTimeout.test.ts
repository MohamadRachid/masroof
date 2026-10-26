import { describe, expect, it } from 'vitest'
import { withTimeout } from './fetchTimeout'

// A fetch that never answers unless its signal aborts.
const hang: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
  })

describe('withTimeout', () => {
  it('aborts a request that never answers', async () => {
    await expect(withTimeout(hang, 20)('https://example.test')).rejects.toThrow()
  })

  it('passes through a response that arrives in time', async () => {
    const ok: typeof fetch = async () => new Response('hi')
    const res = await withTimeout(ok, 1000)('https://example.test')
    expect(await res.text()).toBe('hi')
  })

  it("still honours the caller's own abort signal", async () => {
    const ctrl = new AbortController()
    const pending = withTimeout(hang, 10_000)('https://example.test', { signal: ctrl.signal })
    ctrl.abort()
    await expect(pending).rejects.toThrow()
  })
})

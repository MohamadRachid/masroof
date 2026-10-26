/** Wrap fetch so no request can hang forever on a stalled connection. */
export function withTimeout(fetchImpl: typeof fetch, ms: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return fetchImpl(input, { ...init, signal })
  }
}

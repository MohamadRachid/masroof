import { useEffect, useRef } from 'react'

/**
 * While `open`, Android Back closes the sheet instead of leaving the screen:
 * push a history entry on open; Back pops it and closes; closing any other
 * way pops it for us.
 */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  }, [close])

  useEffect(() => {
    if (!open) return
    window.history.pushState({ masroof: true, sheet: true }, '')
    let popped = false
    const onPop = () => {
      popped = true
      closeRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!popped) window.history.back()
    }
  }, [open])
}

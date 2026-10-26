import { useEffect, useState } from 'react'
import { localDateISO } from './dates'

/**
 * Today's local date that rolls over by itself: an installed PWA resumed the next
 * morning must not keep showing yesterday as "today".
 */
export function useToday(): string {
  const [today, setToday] = useState(localDateISO)
  useEffect(() => {
    const check = () => setToday(localDateISO())
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    const id = window.setInterval(check, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      window.clearInterval(id)
    }
  }, [])
  return today
}

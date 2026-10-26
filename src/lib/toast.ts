import { useSyncExternalStore } from 'react'

// One toast at a time; a new one replaces the old. Undo lives for 5 s (SPEC §1.5, §7).

export const TOAST_MS = 5000

export type Toast = {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

let current: Toast | null = null
let nextId = 1
let timer: number | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function showToast(toast: Omit<Toast, 'id'>) {
  window.clearTimeout(timer)
  current = { ...toast, id: nextId++ }
  emit()
  const id = current.id
  timer = window.setTimeout(() => dismissToast(id), TOAST_MS)
}

export function dismissToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return
  window.clearTimeout(timer)
  current = null
  emit()
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

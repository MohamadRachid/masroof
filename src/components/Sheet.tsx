import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import styles from './Sheet.module.css'

const EXIT_MS = 200
const DISMISS_DISTANCE = 120 // px
const DISMISS_VELOCITY = 0.11 // px/ms — a quick flick closes regardless of distance
const DESKTOP = '(min-width: 960px)'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) {
    e.preventDefault()
    return
  }
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

type Drag = { id: number; startY: number; startT: number; dy: number }

/** Bottom sheet on phones, centred dialog on desktop. Esc, backdrop, close button or drag-down closes it. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(open)
  const panelRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Stay mounted through the exit transition.
  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    if (!mounted) return
    const id = window.setTimeout(() => setMounted(false), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current
      ;(panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel)?.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
      } else if (e.key === 'Tab' && panelRef.current) {
        trapTab(e, panelRef.current)
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      restore?.focus()
    }
  }, [open])

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (drag.current || e.button !== 0) return // ignore a second finger
    if (e.target instanceof Element && e.target.closest('button')) return
    if (window.matchMedia(DESKTOP).matches) return
    drag.current = { id: e.pointerId, startY: e.clientY, startT: performance.now(), dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    panelRef.current?.setAttribute('data-dragging', '')
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const raw = e.clientY - d.startY
    d.dy = raw > 0 ? raw : raw * 0.2 // friction when pulled up
    if (panelRef.current) panelRef.current.style.transform = `translateY(${d.dy}px)`
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    const panel = panelRef.current
    const velocity = d.dy / Math.max(1, performance.now() - d.startT)
    panel?.removeAttribute('data-dragging')
    if (panel) panel.style.transform = '' // transition from where the finger left it
    if (d.dy > DISMISS_DISTANCE || (d.dy > 8 && velocity > DISMISS_VELOCITY)) onCloseRef.current()
  }

  if (!mounted) return null

  return createPortal(
    <div className={styles.root} data-state={open ? 'open' : 'closed'}>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div
          className={styles.grabber}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className={styles.handle} aria-hidden="true" />
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}

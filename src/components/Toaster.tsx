import { dismissToast, useToast } from '../lib/toast'
import styles from './Toaster.module.css'

/** Shows the current toast above the tab bar, with its Undo action. */
export function Toaster() {
  const toast = useToast()
  if (!toast) return null
  return (
    <div className={styles.toast} role="status" key={toast.id}>
      <span className={styles.message}>{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            toast.action?.run()
            dismissToast(toast.id)
          }}
        >
          {toast.action.label}
        </button>
      )}
      <span className={styles.timer} aria-hidden="true" />
    </div>
  )
}

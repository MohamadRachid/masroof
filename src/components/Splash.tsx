import { LogoMark } from './Brand'
import styles from './Splash.module.css'

/** Shown while the stored session or the first data load is read. Fades in late so fast loads never flash it. */
export function Splash({ label }: { label?: string }) {
  return (
    <div className={styles.splash} role="status" aria-busy="true">
      <LogoMark size={44} />
      {label && <p className={styles.label}>{label}</p>}
    </div>
  )
}

import { LogoMark } from './Brand'
import styles from './Splash.module.css'

/** Shown while the stored session is read. Fades in late so fast loads never flash it. */
export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-busy="true">
      <LogoMark size={44} />
    </div>
  )
}

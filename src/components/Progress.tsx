import styles from './Progress.module.css'

export type BarStatus = 'good' | 'warn' | 'bad' | 'plain'

/** A thin bar. `value` is the share used (1 = full); colour carries the status. */
export function Progress({ value, status }: { value: number; status: BarStatus }) {
  const fill = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <span className={styles.track} data-status={status} aria-hidden="true">
      <span className={styles.fill} style={{ transform: `scaleX(${fill})` }} />
    </span>
  )
}

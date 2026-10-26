import { Icon, type IconName } from './Icon'
import styles from './EmptyState.module.css'

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <div className={styles.card}>
      <span className={styles.icon}>
        <Icon name={icon} size={24} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
    </div>
  )
}

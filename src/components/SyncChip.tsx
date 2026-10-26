import { useI18n } from '../i18n'
import { useOutboxCount } from '../lib/data'
import { useOnline } from '../lib/useOnline'
import { Icon } from './Icon'
import styles from './SyncChip.module.css'

/** SPEC §8: "n unsynced" while the outbox has items; "Offline" when there's no network. */
export function SyncChip() {
  const { t } = useI18n()
  const count = useOutboxCount()
  const online = useOnline()
  if (online && count === 0) return null
  return (
    <span className={styles.chip} role="status">
      <Icon name="cloudOff" size={14} />
      {count > 0 ? t('sync.pending', { count }) : t('sync.offline')}
    </span>
  )
}

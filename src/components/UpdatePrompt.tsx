import { useRegisterSW } from 'virtual:pwa-register/react'
import { useI18n } from '../i18n'
import { Icon } from './Icon'
import styles from './UpdatePrompt.module.css'

const CHECK_EVERY_MS = 60 * 60 * 1000

/** A new build is waiting: offer a reload instead of swapping the app mid-entry. */
export function UpdatePrompt() {
  const { t } = useI18n()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // An installed PWA can stay open for days; look for new builds hourly.
      if (registration) window.setInterval(() => void registration.update(), CHECK_EVERY_MS)
    },
  })

  if (!needRefresh) return null

  return (
    <div className={styles.toast} role="status">
      <Icon name="refresh" size={18} />
      <span className={styles.text}>{t('pwa.updateReady')}</span>
      <button type="button" className={styles.reload} onClick={() => void updateServiceWorker(true)}>
        {t('pwa.reload')}
      </button>
      <button type="button" className={styles.dismiss} onClick={() => setNeedRefresh(false)} aria-label={t('common.close')}>
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

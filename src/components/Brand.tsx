import { useId } from 'react'
import { useI18n } from '../i18n'
import styles from './Brand.module.css'

/** The Masroof mark: two coins (cedi and dollar), the front one outlined. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const mask = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <mask id={mask}>
        <rect width="32" height="32" fill="white" />
        <circle cx="19.5" cy="16" r="9.25" fill="black" />
      </mask>
      <circle cx="11.5" cy="16" r="7.5" fill="currentColor" mask={`url(#${mask})`} />
      <circle cx="19.5" cy="16" r="6.5" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

export function Wordmark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { t, lang } = useI18n()
  return (
    <span className={styles.wordmark} data-size={size} data-script={lang}>
      {t('app.name')}
    </span>
  )
}

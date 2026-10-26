import { useI18n } from '../i18n'
import styles from './LangToggle.module.css'

/** Shows the other language's short name; one tap switches. */
export function LangToggle() {
  const { t, lang, setLang } = useI18n()
  return (
    <button
      type="button"
      className={styles.toggle}
      data-target={lang === 'en' ? 'ar' : 'en'}
      aria-label={t('header.switchLang')}
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
    >
      {t('header.langShort')}
    </button>
  )
}

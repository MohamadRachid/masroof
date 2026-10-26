import { useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '../components/Icon'
import { Screen } from '../components/Screen'
import { useI18n, type Lang } from '../i18n'
import { signOut } from '../lib/auth'
import styles from './More.module.css'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.group}>{children}</div>
    </section>
  )
}

const LANGS: readonly Lang[] = ['en', 'ar']

export default function More({ email }: { email: string | null }) {
  const { t, lang, setLang } = useI18n()
  const [signingOut, setSigningOut] = useState(false)
  const thumb = { '--i': LANGS.indexOf(lang) } as CSSProperties

  return (
    <Screen title={t('more.title')}>
      <Section title={t('more.section.prefs')}>
        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <Icon name="globe" size={20} />
          </span>
          <span className={styles.rowLabel} id="lang-label">
            {t('more.language')}
          </span>
          <div className={styles.segmented} role="radiogroup" aria-labelledby="lang-label" style={thumb}>
            <span className={styles.thumb} aria-hidden="true" />
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={lang === l}
                lang={l}
                className={styles.segment}
                onClick={() => setLang(l)}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('more.section.account')}>
        <div className={styles.row}>
          <span className={styles.rowIcon}>
            <Icon name="mail" size={20} />
          </span>
          <span className={styles.rowStack}>
            <span className={styles.rowHint}>{t('more.signedInAs')}</span>
            <bdi className={styles.rowValue}>{email}</bdi>
          </span>
        </div>
        <button
          type="button"
          className={styles.row}
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true)
            await signOut()
          }}
        >
          <span className={styles.rowIcon}>
            <Icon name="logout" size={20} />
          </span>
          <span className={styles.rowLabel}>{t('more.signOut')}</span>
        </button>
      </Section>

      <p className={styles.version}>{t('more.version', { version: __APP_VERSION__ })}</p>
    </Screen>
  )
}

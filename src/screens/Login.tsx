import { useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { LogoMark, Wordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { LangToggle } from '../components/LangToggle'
import { useI18n } from '../i18n'
import { MIN_PASSWORD, signIn, signUp } from '../lib/auth'
import { looksLikeEmail, type AuthErrorKey } from '../lib/authErrors'
import { useOnline } from '../lib/useOnline'
import styles from './Login.module.css'

const LAST_EMAIL_KEY = 'masroof.lastEmail'

function readLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email)
  } catch {
    // not remembered; nothing else depends on it
  }
}

/** Email + password, typed once per device. "Create account" is for the very first time only. */
export default function Login() {
  const { t } = useI18n()
  const online = useOnline()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState(readLastEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErrorKey | null>(null)

  const creating = mode === 'signUp'
  const minLength = creating ? MIN_PASSWORD : 1
  const canSubmit = online && !busy && looksLikeEmail(email) && password.length >= minLength

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    rememberEmail(email.trim())
    const res = await (creating ? signUp : signIn)(email, password)
    if (res.ok) return // the session listener swaps this screen out
    setBusy(false)
    setError(res.error)
  }

  function switchMode() {
    setMode(creating ? 'signIn' : 'signUp')
    setError(null)
  }

  const errorText = error ? t(`auth.err.${error}`, { min: MIN_PASSWORD }) : null

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <LangToggle />
      </div>

      <main className={styles.main}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <LogoMark size={40} />
          </span>
          <Wordmark size="lg" />
          <p className={styles.tagline}>{t('app.tagline')}</p>
        </div>

        {!online && (
          <p className={styles.banner} role="status">
            <Icon name="cloudOff" size={18} />
            {t('auth.offline')}
          </p>
        )}

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <label className={styles.label} htmlFor="login-email">
            {t('auth.emailLabel')}
          </label>
          <div className={styles.field}>
            <Icon name="mail" size={20} />
            <input
              id="login-email"
              className={styles.input}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              dir="ltr"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              autoFocus={!email}
            />
          </div>

          <label className={styles.label} htmlFor="login-password">
            {t('auth.passwordLabel')}
          </label>
          <div className={styles.field} data-invalid={error ? 'true' : undefined}>
            <Icon name="lock" size={20} />
            <input
              id="login-password"
              className={styles.input}
              type={showPassword ? 'text' : 'password'}
              autoComplete={creating ? 'new-password' : 'current-password'}
              enterKeyHint="go"
              dir="ltr"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={errorText ? 'login-error' : creating ? 'login-hint' : undefined}
              autoFocus={!!email}
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={showPassword}
            >
              <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
            </button>
          </div>

          {creating && !errorText && (
            <p id="login-hint" className={styles.hint}>
              {t('auth.passwordHint', { min: MIN_PASSWORD })}
            </p>
          )}
          <p id="login-error" className={styles.error} role="alert" hidden={!errorText}>
            <Icon name="alert" size={16} />
            {errorText}
          </p>

          <Button type="submit" variant="primary" size="lg" block disabled={!canSubmit}>
            {busy
              ? t(creating ? 'auth.creating' : 'auth.signingIn')
              : t(creating ? 'auth.createAccount' : 'auth.signIn')}
          </Button>

          <button type="button" className={styles.switch} onClick={switchMode}>
            {t(creating ? 'auth.toSignIn' : 'auth.toSignUp')}
          </button>
        </form>
      </main>
    </div>
  )
}

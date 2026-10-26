import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { LogoMark, Wordmark } from '../components/Brand'
import { Icon } from '../components/Icon'
import { LangToggle } from '../components/LangToggle'
import { useI18n } from '../i18n'
import { OTP_LENGTH, RESEND_SECONDS, sendCode, verifyCode } from '../lib/auth'
import { linkErrorFromHash, looksLikeEmail, type AuthErrorKey } from '../lib/authErrors'
import { useOnline } from '../lib/useOnline'
import styles from './Login.module.css'

type Step = { kind: 'email' } | { kind: 'code'; email: string; sentAt: number }

// Android may kill the app while you read the email; remember where we were.
const PENDING_KEY = 'masroof.pendingLogin'
const LAST_EMAIL_KEY = 'masroof.lastEmail'
const PENDING_TTL_MS = 60 * 60 * 1000

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage blocked: the flow still works, it just won't survive a reload
  }
}

function loadPending(): Step {
  const raw = readStorage(PENDING_KEY)
  if (!raw) return { kind: 'email' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'email' in parsed &&
      'sentAt' in parsed &&
      typeof parsed.email === 'string' &&
      typeof parsed.sentAt === 'number' &&
      Date.now() - parsed.sentAt < PENDING_TTL_MS
    ) {
      return { kind: 'code', email: parsed.email, sentAt: parsed.sentAt }
    }
  } catch {
    // corrupt entry: start over
  }
  return { kind: 'email' }
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

export default function Login() {
  const { t } = useI18n()
  const online = useOnline()
  const [step, setStep] = useState<Step>(loadPending)
  const [email, setEmail] = useState(() => readStorage(LAST_EMAIL_KEY) ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthErrorKey | null>(() => linkErrorFromHash(window.location.hash))
  const [notice, setNotice] = useState(false)
  const [codeFocused, setCodeFocused] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const cellsRef = useRef<HTMLDivElement>(null)
  const now = useNow(step.kind === 'code')

  const secondsLeft =
    step.kind === 'code' ? Math.max(0, RESEND_SECONDS - Math.floor((now - step.sentAt) / 1000)) : 0

  function goToCode(address: string) {
    const next: Step = { kind: 'code', email: address, sentAt: Date.now() }
    writeStorage(PENDING_KEY, JSON.stringify({ email: next.email, sentAt: next.sentAt }))
    writeStorage(LAST_EMAIL_KEY, address)
    setStep(next)
    setCode('')
  }

  async function onSendCode(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!looksLikeEmail(email)) {
      setError('invalidEmail')
      return
    }
    setBusy(true)
    setError(null)
    const res = await sendCode(email)
    setBusy(false)
    if (res.ok) goToCode(email.trim())
    else setError(res.error)
  }

  function shake() {
    cellsRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-6px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'ease-out' },
    )
  }

  async function verify(value: string) {
    if (step.kind !== 'code' || busy) return
    setBusy(true)
    setError(null)
    setNotice(false)
    const res = await verifyCode(step.email, value)
    if (res.ok) {
      writeStorage(PENDING_KEY, null)
      return // the session listener swaps this screen out
    }
    setBusy(false)
    setError(res.error)
    setCode('')
    shake()
    requestAnimationFrame(() => codeRef.current?.focus())
  }

  function onCodeChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH)
    setCode(digits)
    if (error) setError(null)
    if (digits.length === OTP_LENGTH) void verify(digits)
  }

  async function onResend() {
    if (step.kind !== 'code' || busy || secondsLeft > 0) return
    setBusy(true)
    setError(null)
    const res = await sendCode(step.email)
    setBusy(false)
    if (res.ok) {
      goToCode(step.email)
      setNotice(true)
      codeRef.current?.focus()
    } else {
      setError(res.error)
    }
  }

  function onChangeEmail() {
    writeStorage(PENDING_KEY, null)
    setStep({ kind: 'email' })
    setCode('')
    setError(null)
    setNotice(false)
  }

  const errorText = error ? t(`auth.err.${error}`) : null

  return (
    <div className={styles.page}>
      <div className={styles.top}>
        <LangToggle />
      </div>

      <main className={styles.main}>
        <div className={styles.brand} data-compact={step.kind === 'code' || undefined}>
          <span className={styles.mark}>
            <LogoMark size={step.kind === 'code' ? 30 : 40} />
          </span>
          <Wordmark size={step.kind === 'code' ? 'md' : 'lg'} />
          <p className={styles.tagline}>{t('app.tagline')}</p>
        </div>

        {!online && (
          <p className={styles.banner} role="status">
            <Icon name="cloudOff" size={18} />
            {t('auth.offline')}
          </p>
        )}

        {step.kind === 'email' ? (
          <form className={styles.form} onSubmit={onSendCode} noValidate>
            <label className={styles.label} htmlFor="login-email">
              {t('auth.emailLabel')}
            </label>
            <div className={styles.field} data-invalid={error ? 'true' : undefined}>
              <Icon name="mail" size={20} />
              <input
                id="login-email"
                className={styles.input}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="send"
                dir="ltr"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (error) setError(null)
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={errorText ? 'login-error' : undefined}
                autoFocus
              />
            </div>
            <p id="login-error" className={styles.error} role="alert" hidden={!errorText}>
              <Icon name="alert" size={16} />
              {errorText}
            </p>
            <Button type="submit" variant="primary" size="lg" block disabled={busy || !online || !looksLikeEmail(email)}>
              {busy ? t('auth.sending') : t('auth.sendCode')}
            </Button>
          </form>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === OTP_LENGTH) void verify(code)
            }}
          >
            <h1 className={styles.title}>{t('auth.codeTitle')}</h1>
            <p className={styles.body}>
              <CodeBody text={t('auth.codeBody', { digits: OTP_LENGTH, email: '\u0000' })} email={step.email} />
            </p>

            <div className={styles.codeWrap} dir="ltr">
              <input
                ref={codeRef}
                className={styles.codeInput}
                value={code}
                onChange={(e) => onCodeChange(e.target.value)}
                onFocus={() => setCodeFocused(true)}
                onBlur={() => setCodeFocused(false)}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                aria-label={t('auth.codeLabel')}
                aria-invalid={error ? true : undefined}
                disabled={busy}
                autoFocus
              />
              <div ref={cellsRef} className={styles.cells} aria-hidden="true" data-busy={busy || undefined}>
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <span
                    key={i}
                    className={styles.cell}
                    data-filled={i < code.length || undefined}
                    data-active={(codeFocused && i === Math.min(code.length, OTP_LENGTH - 1)) || undefined}
                    data-invalid={error ? 'true' : undefined}
                  >
                    {code[i] ?? ''}
                  </span>
                ))}
              </div>
            </div>

            <p className={styles.hint} aria-live="polite" data-tone={errorText ? 'bad' : undefined}>
              {busy ? t('auth.verifying') : errorText ?? (notice ? t('auth.sent') : t('auth.orLink'))}
            </p>

            <div className={styles.actions}>
              <button type="button" className={styles.link} onClick={onChangeEmail}>
                <Icon name="arrowBack" size={16} />
                {t('auth.changeEmail')}
              </button>
              <button
                type="button"
                className={styles.link}
                onClick={onResend}
                disabled={busy || secondsLeft > 0 || !online}
              >
                {secondsLeft > 0 ? t('auth.resendIn', { seconds: secondsLeft }) : t('auth.resend')}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}

/** The translated sentence with the email bolded and isolated (it's LTR inside Arabic). */
function CodeBody({ text, email }: { text: string; email: string }) {
  const [before, after] = text.split('\u0000')
  return (
    <>
      {before}
      <bdi>
        <strong>{email}</strong>
      </bdi>
      {after}
    </>
  )
}

import { useState } from 'react'
import styles from './App.module.css'
import { Button } from './components/Button'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Icon } from './components/Icon'
import { Sheet } from './components/Sheet'
import { Shell } from './components/Shell'
import { Splash } from './components/Splash'
import { UpdatePrompt } from './components/UpdatePrompt'
import { I18nProvider, useI18n } from './i18n'
import { useSession } from './lib/auth'
import { goBack, useRoute, type Route } from './lib/router'
import History from './screens/History'
import Home from './screens/Home'
import Login from './screens/Login'
import More from './screens/More'
import Plan from './screens/Plan'

function AddSoon({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  return (
    <div className={styles.soon}>
      <span className={styles.soonIcon}>
        <Icon name="plus" size={24} />
      </span>
      <p>{t('add.soon')}</p>
      <Button variant="primary" size="lg" block onClick={onDone} data-autofocus>
        {t('common.gotIt')}
      </Button>
    </div>
  )
}

function Gate() {
  const { t } = useI18n()
  const session = useSession()
  const route = useRoute()
  // The tab under the Add sheet: whatever was showing when + was tapped.
  const [tab, setTab] = useState<Route>(route === 'add' ? 'home' : route)
  if (route !== 'add' && route !== tab) setTab(route)

  if (session.status === 'loading') return <Splash />
  if (session.status === 'signedOut') return <Login />

  const screen =
    tab === 'history' ? <History /> : tab === 'plan' ? <Plan /> : tab === 'more' ? <More email={session.email} /> : <Home />

  return (
    <Shell route={tab}>
      <ErrorBoundary key={tab} title={t('error.screen')} action={t('pwa.reload')}>
        {screen}
      </ErrorBoundary>
      <Sheet open={route === 'add'} onClose={goBack} title={t('add.title')}>
        <AddSoon onDone={goBack} />
      </Sheet>
    </Shell>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <Gate />
      <UpdatePrompt />
    </I18nProvider>
  )
}

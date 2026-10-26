import { useState } from 'react'
import { Button } from './components/Button'
import { EntrySheet } from './components/EntrySheet'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Icon } from './components/Icon'
import { Shell } from './components/Shell'
import { Splash } from './components/Splash'
import { Toaster } from './components/Toaster'
import { UpdatePrompt } from './components/UpdatePrompt'
import { I18nProvider, useI18n } from './i18n'
import { useSession } from './lib/auth'
import { DataProvider, useAccounts, useInitialPullDone } from './lib/data'
import type { Entry } from './lib/db'
import { goBack, useRoute, type Route } from './lib/router'
import { syncNow, useSyncFailed } from './lib/syncRunner'
import FirstRun from './screens/FirstRun'
import History from './screens/History'
import Home from './screens/Home'
import Login from './screens/Login'
import More from './screens/More'
import Plan from './screens/Plan'
import styles from './App.module.css'

function Gate() {
  const session = useSession()
  if (session.status === 'loading') return <Splash />
  if (session.status === 'signedOut' || !session.userId) return <Login />
  return (
    <DataProvider userId={session.userId}>
      <DataGate email={session.email} />
    </DataProvider>
  )
}

/** Before the first pull on this device we can't know whether First run is needed, so wait for it. */
function DataGate({ email }: { email: string | null }) {
  const { t } = useI18n()
  const pulled = useInitialPullDone()
  const accounts = useAccounts()
  const failed = useSyncFailed()

  if (pulled === undefined) return <Splash />
  if (!pulled) {
    return failed ? <OfflineFirstTime /> : <Splash label={t('loading.data')} />
  }
  if (!accounts) return <Splash />
  if (accounts.length === 0) return <FirstRun />
  return <Main email={email} />
}

function OfflineFirstTime() {
  const { t } = useI18n()
  return (
    <div className={styles.offline} role="alert">
      <span className={styles.offlineIcon}>
        <Icon name="cloudOff" size={26} />
      </span>
      <h1 className={styles.offlineTitle}>{t('offlineFirst.title')}</h1>
      <p className={styles.offlineBody}>{t('offlineFirst.body')}</p>
      <Button variant="primary" size="lg" onClick={syncNow}>
        {t('common.retry')}
      </Button>
    </div>
  )
}

function Main({ email }: { email: string | null }) {
  const { t } = useI18n()
  const route = useRoute()
  // The tab under the Add sheet: whatever was showing when + was tapped.
  const [tab, setTab] = useState<Route>(route === 'add' ? 'home' : route)
  if (route !== 'add' && route !== tab) setTab(route)
  const [editing, setEditing] = useState<Entry | null>(null)

  const screen =
    tab === 'history' ? (
      <History onOpenEntry={setEditing} />
    ) : tab === 'plan' ? (
      <Plan />
    ) : tab === 'more' ? (
      <More email={email} />
    ) : (
      <Home onOpenEntry={setEditing} />
    )

  return (
    <Shell route={tab}>
      <ErrorBoundary key={tab} title={t('error.screen')} action={t('pwa.reload')}>
        {screen}
      </ErrorBoundary>
      <EntrySheet open={route === 'add'} entry={null} onClose={goBack} />
      <EntrySheet open={editing !== null} entry={editing} onClose={() => setEditing(null)} backCloses />
    </Shell>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <Gate />
      <Toaster />
      <UpdatePrompt />
    </I18nProvider>
  )
}

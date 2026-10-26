import { Splash } from './components/Splash'
import { I18nProvider } from './i18n'
import { useSession } from './lib/auth'
import Login from './screens/Login'

function Gate() {
  const session = useSession()
  if (session.status === 'loading') return <Splash />
  if (session.status === 'signedOut') return <Login />
  return <main>{session.email}</main>
}

export default function App() {
  return (
    <I18nProvider>
      <Gate />
    </I18nProvider>
  )
}

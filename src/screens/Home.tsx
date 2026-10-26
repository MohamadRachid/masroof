import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'
import { formatLongDate } from '../i18n/format'

export default function Home() {
  const { t, lang } = useI18n()
  return (
    <Screen title={t('home.title')} subtitle={formatLongDate(new Date(), lang)}>
      <EmptyState icon="wallet" title={t('home.empty.title')} body={t('home.empty.body')} />
    </Screen>
  )
}

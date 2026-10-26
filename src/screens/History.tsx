import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'

export default function History() {
  const { t } = useI18n()
  return (
    <Screen title={t('history.title')}>
      <EmptyState icon="history" title={t('history.empty.title')} body={t('history.empty.body')} />
    </Screen>
  )
}

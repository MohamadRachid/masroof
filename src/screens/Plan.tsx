import { EmptyState } from '../components/EmptyState'
import { Screen } from '../components/Screen'
import { useI18n } from '../i18n'

export default function Plan() {
  const { t } = useI18n()
  return (
    <Screen title={t('plan.title')}>
      <EmptyState icon="plan" title={t('plan.empty.title')} body={t('plan.empty.body')} />
    </Screen>
  )
}

import { useI18n } from '../i18n'
import { formatShortDate } from '../i18n/format'
import type { Account, Category, Recurring } from '../lib/db'
import { accountName, iconFor } from '../lib/names'
import { Button } from './Button'
import { Icon } from './Icon'
import { Money } from './Money'
import styles from './DueRow.module.css'

/** Home's Due card: one recurring item that is due, with its one-tap Post (SPEC §6, §7). */
export function DueRow({
  item,
  date,
  today,
  category,
  account,
  busy,
  onPost,
}: {
  item: Recurring
  date: string
  today: string
  category: Category | undefined
  account: Account | undefined
  busy: boolean
  onPost: () => void
}) {
  const { t, lang } = useI18n()
  return (
    <div className={styles.row}>
      <span className={styles.icon}>
        <Icon name={iconFor(category?.icon ?? 'dots')} size={20} />
      </span>
      <span className={styles.text}>
        <span className={styles.top}>
          <span className={styles.name}>{item.name}</span>
          <Money value={item.amount} currency={account?.currency ?? ''} tone={item.type === 'in' ? 'in' : 'out'} />
        </span>
        <span className={styles.meta}>
          <span className={styles.when}>{date === today ? t('home.dueToday') : t('home.dueSince', { date: formatShortDate(date, lang) })}</span>
          {account && ` · ${accountName(account, t)}`}
        </span>
      </span>
      <Button className={styles.post} onClick={onPost} disabled={busy}>
        {t('home.post')}
      </Button>
    </div>
  )
}

import type { Account, Category, Entry } from '../lib/db'
import { useI18n } from '../i18n'
import { accountName, categoryName, iconFor } from '../lib/names'
import { Icon } from './Icon'
import { Equivalent, Money } from './Money'
import styles from './EntryRow.module.css'

/** One entry in a list: category, note/account, signed amount. Tapping opens it for editing. */
export function EntryRow({
  entry,
  category,
  account,
  onOpen,
}: {
  entry: Entry
  category: Category | undefined
  account: Account | undefined
  onOpen: (entry: Entry) => void
}) {
  const { t, lang } = useI18n()
  const name = category ? categoryName(category, lang) : '—'
  const meta = [entry.note, account ? accountName(account, t) : null].filter(Boolean).join(' · ')
  const tone = entry.type === 'in' ? 'in' : entry.type === 'out' ? 'out' : 'plain'

  return (
    <button type="button" className={styles.row} onClick={() => onOpen(entry)}>
      <span className={styles.icon} data-type={entry.type}>
        <Icon name={iconFor(category?.icon ?? 'dots')} size={20} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{entry.type === 'adjust' ? `${name} · ${t('entry.adjust')}` : name}</span>
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
      <span className={styles.amount}>
        <Money value={entry.amount} currency={account?.currency ?? ''} tone={tone} />
        {/* Entries use their own frozen rate (SPEC §5). */}
        <Equivalent amount={entry.amount} currency={account?.currency ?? ''} rate={entry.rate_usd_ghs} />
      </span>
    </button>
  )
}

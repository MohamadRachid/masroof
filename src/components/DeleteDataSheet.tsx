import { useState } from 'react'
import { useI18n } from '../i18n'
import { useData } from '../lib/data'
import { deleteAllData } from '../lib/store'
import { syncAndWait } from '../lib/syncRunner'
import { showToast } from '../lib/toast'
import { useOnline } from '../lib/useOnline'
import { Button } from './Button'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './DeleteDataSheet.module.css'

/** SPEC §1 rule 5, §6 Settings: the one action behind a typed confirmation instead of an Undo toast. */
export function DeleteDataSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  useBackToClose(open, onClose)
  return (
    <Sheet open={open} onClose={onClose} title={t('deleteSheet.title')}>
      {open && <DeleteForm onClose={onClose} />}
    </Sheet>
  )
}

function DeleteForm({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { db } = useData()
  const online = useOnline()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const word = t('deleteSheet.word')
  const confirmed = typed.trim().toLowerCase() === word.toLowerCase()

  async function run() {
    if (!confirmed || busy || !online) return
    setBusy(true)
    try {
      // Fetch first: this only reaches rows the device holds, so rows from another device would survive it.
      if (await syncAndWait(db)) {
        await deleteAllData(db)
        showToast({ message: t('toast.allDeleted') })
        onClose()
        return
      }
      showToast({ message: t('toast.deleteFailed') })
    } catch {
      showToast({ message: t('toast.deleteFailed') })
    }
    setBusy(false)
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        void run()
      }}
    >
      <p className={styles.body}>{t('deleteSheet.body')}</p>
      <p className={styles.note}>{t(online ? 'deleteSheet.exportFirst' : 'deleteSheet.offline')}</p>
      <label className={styles.field}>
        <span className={styles.label}>{t('deleteSheet.type', { word })}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
      </label>
      <Button type="submit" size="lg" block className={styles.danger} disabled={!confirmed || busy || !online}>
        {t(busy ? 'deleteSheet.deleting' : 'deleteSheet.confirm')}
      </Button>
    </form>
  )
}

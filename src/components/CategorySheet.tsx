import { useState } from 'react'
import { useI18n } from '../i18n'
import { useCategories, useData } from '../lib/data'
import type { Category } from '../lib/db'
import { categoryName, iconFor } from '../lib/names'
import { saveCategory, undoCategorySave, type CategoryDraft } from '../lib/store'
import { showToast } from '../lib/toast'
import { Button } from './Button'
import { Icon } from './Icon'
import { Sheet } from './Sheet'
import { useBackToClose } from './useBackToClose'
import styles from './CategorySheet.module.css'

const KINDS = ['variable', 'fixed', 'savings', 'income'] as const

/** SPEC §6 Settings → categories: the list, then add, rename, archive and set the type. */
export function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<{ item: Category | null } | null>(null)
  const close = () => {
    setEditing(null)
    onClose()
  }
  useBackToClose(open, close)
  const title = !editing ? t('categorySheet.title') : editing.item ? t('categorySheet.titleEdit') : t('categorySheet.titleNew')

  return (
    <Sheet open={open} onClose={close} title={title}>
      {editing ? (
        <CategoryForm key={editing.item?.id ?? 'new'} item={editing.item} onSaved={close} onBack={() => setEditing(null)} />
      ) : (
        <CategoryList onOpen={(item) => setEditing({ item })} />
      )}
    </Sheet>
  )
}

function useKindLabel() {
  const { t } = useI18n()
  return (kind: string) => (kind === 'fixed' || kind === 'variable' || kind === 'savings' ? t(`plan.kind.${kind}`) : t('categorySheet.income'))
}

function CategoryList({ onOpen }: { onOpen: (item: Category | null) => void }) {
  const { t, lang } = useI18n()
  const kindLabel = useKindLabel()
  const categories = useCategories()
  if (!categories) return null
  const ordered = [...categories.filter((c) => !c.archived), ...categories.filter((c) => c.archived)]

  return (
    <div className={styles.list}>
      {ordered.map((c) => (
        <button key={c.id} type="button" className={styles.row} data-archived={c.archived || undefined} onClick={() => onOpen(c)}>
          <span className={styles.icon}>
            <Icon name={iconFor(c.icon)} size={20} />
          </span>
          <span className={styles.stack}>
            <span>{categoryName(c, lang)}</span>
            <span className={styles.hint}>{c.archived ? t('categorySheet.archived') : kindLabel(c.kind)}</span>
          </span>
          <Icon name="chevron" size={18} />
        </button>
      ))}
      <button type="button" className={styles.row} onClick={() => onOpen(null)}>
        <span className={styles.icon}>
          <Icon name="plus" size={20} />
        </span>
        <span className={styles.stack}>{t('categorySheet.add')}</span>
      </button>
    </div>
  )
}

/** Saving closes the whole sheet, like every other sheet: the Undo toast must not sit behind it. */
function CategoryForm({ item, onSaved, onBack }: { item: Category | null; onSaved: () => void; onBack: () => void }) {
  const { t, lang } = useI18n()
  const { db, userId } = useData()
  const kindLabel = useKindLabel()
  const [name, setName] = useState(item ? categoryName(item, lang) : '')
  const [kind, setKind] = useState(item?.kind ?? 'variable')
  const trimmed = name.trim()
  const renamesBuffer = item?.name_en === 'Buffer' && lang === 'en' && trimmed !== 'Buffer'

  async function write(draft: CategoryDraft, message: string) {
    try {
      const receipt = await saveCategory(db, userId, item, draft, lang)
      showToast({ message, action: { label: t('toast.undo'), run: () => void undoCategorySave(db, receipt) } })
      onSaved()
    } catch {
      showToast({ message: t('toast.saveFailed') })
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault()
        if (trimmed) void write({ name: trimmed, kind, archived: item?.archived ?? false }, t('toast.categorySaved'))
      }}
    >
      <label className={styles.field}>
        <span className={styles.label}>{t('categorySheet.name')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus={!item} />
        {renamesBuffer && <span className={styles.hint}>{t('categorySheet.bufferHint')}</span>}
      </label>

      <div className={styles.field}>
        <span className={styles.label} id="category-kind">
          {t('categorySheet.kind')}
        </span>
        <div className={styles.chips} role="radiogroup" aria-labelledby="category-kind">
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={styles.chip} onClick={() => setKind(k)}>
              {kindLabel(k)}
            </button>
          ))}
        </div>
      </div>

      <Button type="submit" variant="primary" size="lg" block disabled={!trimmed}>
        {t('categorySheet.save')}
      </Button>

      {item && (
        <>
          <Button
            size="lg"
            block
            onClick={() =>
              void write(
                { name: trimmed || categoryName(item, lang), kind, archived: !item.archived },
                t(item.archived ? 'toast.categoryBack' : 'toast.categoryArchived'),
              )
            }
          >
            {t(item.archived ? 'categorySheet.unarchive' : 'categorySheet.archive')}
          </Button>
          {!item.archived && <p className={styles.hint}>{t('categorySheet.archiveHint')}</p>}
        </>
      )}
      <Button variant="ghost" size="lg" block onClick={onBack}>
        {t('categorySheet.back')}
      </Button>
    </form>
  )
}

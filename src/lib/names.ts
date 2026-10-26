import { isIconName, type IconName } from '../components/Icon'
import type { Lang, MsgKey } from '../i18n'

export function categoryName(c: { name_en: string; name_ar: string }, lang: Lang): string {
  return lang === 'ar' && c.name_ar.trim() ? c.name_ar : c.name_en
}

const DEFAULT_ACCOUNTS = new Set(['Bank', 'Cash', 'USD'])

/** The three default accounts follow the UI language; names Ali typed himself stay as typed. */
export function accountName(a: { name: string }, t: (key: MsgKey) => string): string {
  return DEFAULT_ACCOUNTS.has(a.name) ? t(`account.${a.name}` as MsgKey) : a.name
}

export function iconFor(key: string): IconName {
  return isIconName(key) ? key : 'dots'
}

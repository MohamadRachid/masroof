import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { ar } from './ar'
import { en, type MsgKey } from './en'
import { dirFor, interpolate, type Dir, type Lang } from './format'

export type { Lang, Dir, MsgKey }

const dictionaries: Record<Lang, Record<MsgKey, string>> = { en, ar }
const STORAGE_KEY = 'masroof.lang'

type Vars = Record<string, string | number>

type I18n = {
  lang: Lang
  dir: Dir
  t: (key: MsgKey, vars?: Vars) => string
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18n | null>(null)

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'ar') return saved
  } catch {
    // storage blocked: fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)
  const dir = dirFor(lang)

  useLayoutEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted; still switches for this session
    }
  }, [])

  const value = useMemo<I18n>(() => {
    const dict = dictionaries[lang]
    return { lang, dir, setLang, t: (key, vars) => interpolate(dict[key], vars) }
  }, [lang, dir, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}

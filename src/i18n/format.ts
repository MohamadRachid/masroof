export type Lang = 'en' | 'ar'
export type Dir = 'ltr' | 'rtl'

export function dirFor(lang: Lang): Dir {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

// Latin digits in both languages (`-u-nu-latn`), per spec.
const locales: Record<Lang, string> = { en: 'en-GB', ar: 'ar-u-nu-latn' }

export function formatLongDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { weekday: 'long', day: 'numeric', month: 'long' }).format(date)
}

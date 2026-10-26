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

/** "20 Oct" / "20 أكتوبر" from a YYYY-MM-DD local date. */
export function formatShortDate(iso: string, lang: Lang): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d))
}

/** Keep a run of numbers/codes ("170 / 220 GHS") in order inside right-to-left text. */
export function ltr(text: string): string {
  return `⁦${text}⁩`
}

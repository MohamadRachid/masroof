import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { useI18n, type MsgKey } from '../i18n'
import { goTab, navigate, type Route } from '../lib/router'
import { LogoMark, Wordmark } from './Brand'
import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import { LangToggle } from './LangToggle'
import { SyncChip } from './SyncChip'
import styles from './Shell.module.css'

type Tab = { route: Route; icon: IconName; label: MsgKey }

const TABS = [
  { route: 'home', icon: 'home', label: 'nav.home' },
  { route: 'history', icon: 'history', label: 'nav.history' },
  { route: 'plan', icon: 'plan', label: 'nav.plan' },
  { route: 'more', icon: 'more', label: 'nav.more' },
] as const satisfies readonly Tab[]

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return scrolled
}

function openAdd() {
  navigate('add')
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { t } = useI18n()
  const scrolled = useScrolled()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [route])

  const link = (tab: Tab, className: string | undefined, iconClass?: string) => (
    <a
      key={tab.route}
      href={`#/${tab.route}`}
      className={className}
      aria-current={route === tab.route ? 'page' : undefined}
      onClick={(e: MouseEvent) => {
        e.preventDefault()
        goTab(tab.route)
      }}
    >
      <span className={iconClass}>
        <Icon name={tab.icon} size={22} strokeWidth={route === tab.route ? 2 : 1.75} />
      </span>
      <span>{t(tab.label)}</span>
    </a>
  )

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.brand}>
          <LogoMark size={26} />
          <Wordmark />
        </div>
        <Button variant="primary" block onClick={openAdd}>
          <Icon name="plus" size={20} strokeWidth={2.25} />
          {t('nav.addEntry')}
        </Button>
        <nav className={styles.railNav} aria-label={t('nav.main')}>
          {TABS.map((tab) => link(tab, styles.railItem))}
        </nav>
        <div className={styles.railFoot}>
          <span className={styles.syncSlot}>
            <SyncChip />
          </span>
          <LangToggle />
        </div>
      </aside>

      <header className={styles.header} data-scrolled={scrolled || undefined}>
        <div className={styles.brand}>
          <LogoMark size={22} />
          <Wordmark />
        </div>
        <span className={styles.syncSlot}>
          <SyncChip />
        </span>
        <LangToggle />
      </header>

      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>

      <nav className={styles.tabbar} aria-label={t('nav.main')}>
        {link(TABS[0], styles.tab, styles.tabIcon)}
        {link(TABS[1], styles.tab, styles.tabIcon)}
        <button type="button" className={styles.add} onClick={openAdd} aria-label={t('nav.addEntry')}>
          <Icon name="plus" size={26} strokeWidth={2.25} />
        </button>
        {link(TABS[2], styles.tab, styles.tabIcon)}
        {link(TABS[3], styles.tab, styles.tabIcon)}
      </nav>
    </div>
  )
}

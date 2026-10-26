import type { ReactNode } from 'react'
import styles from './Screen.module.css'

export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className={styles.screen} aria-labelledby="screen-title">
      <header className={styles.head}>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        <h1 id="screen-title" className={styles.title}>
          {title}
        </h1>
      </header>
      {children}
    </section>
  )
}

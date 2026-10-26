import { Component, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

type Props = { title: string; action: string; children: ReactNode }

/** A crash in one screen shows a way out instead of a blank app. Data lives in the database, so reloading is safe. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={styles.box} role="alert">
        <p>{this.props.title}</p>
        <button type="button" className={styles.reload} onClick={() => window.location.reload()}>
          {this.props.action}
        </button>
      </div>
    )
  }
}

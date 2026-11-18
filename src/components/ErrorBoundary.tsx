import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** What this boundary protects, used in the fallback copy ("canvas", "output"). */
  scope: string
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * CP48: one throwing widget used to unmount the whole editor, which read as "the site crashed until I refresh".
 * A boundary keeps the failure local, shows what happened, and offers a recovery that re-renders the subtree
 * without reloading the page (the composition itself lives in state, so nothing is lost).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the detail in the console for support; the UI stays calm and monochrome.
    console.error(`[${this.props.scope}]`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="boundary-fallback" role="alert">
        <strong>The {this.props.scope} hit an error.</strong>
        <p>{this.state.error.message || 'Unknown error.'}</p>
        <button type="button" className="secondary-button" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    )
  }
}

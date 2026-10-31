import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import { App } from './App'
import { ThemeProvider } from './theme/ThemeContext'
import './styles/theme.css'
import './styles/global.css'
import './styles/app.css'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Goblin++ IDE crashed:', error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 32, fontFamily: 'var(--font-ui)', color: 'var(--fg-text)' }}>
        <h2>Goblin++ IDE hit an unexpected error</h2>
        <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--error)' }}>{String(this.state.error?.stack ?? this.state.error)}</pre>
        <button type="button" className="run-btn" onClick={() => { this.setState({ error: null }) }}>Try to continue</button>
        <button type="button" className="toolbar-btn framed" style={{ marginLeft: 8 }} onClick={() => { localStorage.clear(); location.reload() }}>Reset UI state and reload</button>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

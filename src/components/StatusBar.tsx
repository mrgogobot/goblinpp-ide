import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useLanguageStore } from '../stores/languageStore'
import { useRunStore } from '../stores/runStore'
import { useEnvironmentStore } from '../stores/environmentStore'
import { useTheme } from '../theme/ThemeContext'
import { themeLabel } from '../theme/themes'
import { isDirty } from '../stores/editorStore'

export function StatusBar() {
  const cursor = useEditorStore((s) => s.cursor)
  const diagnostics = useEditorStore((s) => s.diagnostics)
  const activePath = useEditorStore((s) => s.activePath)
  const tabs = useEditorStore((s) => s.tabs)
  const engine = useLanguageStore((s) => s.engine)
  const manifest = useLanguageStore((s) => s.manifest)
  const analysis = useLanguageStore((s) => (activePath ? s.analysisByPath[activePath] : undefined))
  const lastCheck = useLanguageStore((s) => (activePath ? s.lastCheck[activePath] : undefined))
  const fileStatus = useRunStore((s) => (activePath ? s.fileStatus[activePath] : undefined))
  const running = useRunStore((s) => s.running)
  const checks = useEnvironmentStore((s) => s.checks)
  const openSettings = useAppStore((s) => s.openSettings)
  const showBottomTab = useAppStore((s) => s.showBottomTab)
  const { theme } = useTheme()

  const activeTab = tabs.find((t) => t.path === activePath)
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length
  const rust = checks.find((c) => c.id === 'rust')?.detail.match(/rustc (\S+)/)?.[1]
  const version = engine?.version?.replace(/^goblin\+\+\s*/, '') ?? manifest?.version ?? '—'

  return (
    <footer className="status-bar">
      <span className="status-item accent" title={engine ? `${engine.path} (${engine.source})` : 'goblin++ engine not found'} onClick={() => openSettings('goblin-engine')}>
        goblin++ {engine ? version : 'not found'}
      </span>
      <span className="status-sep" />
      <span className="status-item" title="Rust toolchain (only needed for --compile)" onClick={() => showBottomTab('environment')}>{rust ? `Rust ${rust}` : 'Rust —'}</span>
      <span className="status-item">UTF-8</span>
      <span className="status-item" title="Evidence profile of the active file (from its first directive)">{analysis?.profile ?? 'everyday'}</span>
      {fileStatus && <span className="status-item" style={{ color: fileStatus.frozen ? 'var(--accent-secondary)' : undefined }} title={fileStatus.classification ?? ''}>{fileStatus.frozen ? '🔒 ' : ''}{fileStatus.state}</span>}
      {running && <span className="status-item accent">⏵ running…</span>}
      <span className="grow" />
      {activeTab && <span className="status-item muted" title={activeTab.path}>{isDirty(activeTab) ? '● ' : ''}{activeTab.name}</span>}
      <span className="status-item">Ln {cursor.line}, Col {cursor.column}</span>
      <span className="status-sep" />
      <span className="status-item" title="seal statements in the active file">{analysis?.seals.length ?? 0} seals</span>
      <span className="status-sep" />
      <span className="status-item" style={{ color: errors ? 'var(--error)' : warnings ? 'var(--warning)' : undefined }} onClick={() => showBottomTab('problems')} title="Problems">
        {errors ? `✖ ${errors} ` : ''}{warnings ? `⚠ ${warnings}` : errors ? '' : '✓ no problems'}
      </span>
      {lastCheck && <span className="status-item muted" title="last goblin++ check (preview only)">check {lastCheck.status}</span>}
      <span className="status-sep" />
      <span className="status-item" title="Current theme" onClick={() => openSettings('general')}>{themeLabel(theme)}</span>
    </footer>
  )
}

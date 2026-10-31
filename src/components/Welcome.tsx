import { newProject, openExamplesProject, openProject, runAction } from '../actions'
import { useAppStore } from '../stores/appStore'
import { useSettingsStore } from '../stores/settingsStore'
import { basename } from '../util/path'

export function Welcome() {
  const recent = useSettingsStore((s) => s.settings.recentProjects)
  const isWeb = useAppStore((s) => s.isWeb)
  return (
    <div className="welcome">
      <div className="welcome-card">
        <img src="/goblinpp-logo.png" alt="" width={84} height={84} />
        <h1>Goblin++ IDE</h1>
        <p className="muted">A Pragmatic Language for Curious Minds; Built on Rust; Ideas Compile Here.</p>
        {isWeb && <p className="welcome-warn">You are viewing the web preview. Files, processes and the terminal need the desktop app.</p>}
        <div className="welcome-actions">
          <button type="button" className="run-btn" onClick={() => runAction('file.openFolder')}>Open Folder…</button>
          <button type="button" className="toolbar-btn framed" onClick={() => void newProject()}>New Project…</button>
          <button type="button" className="toolbar-btn framed" onClick={() => void openExamplesProject()}>Open bundled examples</button>
          <button type="button" className="toolbar-btn framed" onClick={() => runAction('file.new')}>New scratch file</button>
        </div>
        {recent.length > 0 && (
          <div className="welcome-recent">
            <div className="sidebar-header" style={{ padding: '8px 0' }}>Recent projects</div>
            {recent.slice(0, 8).map((p) => (
              <button key={p} type="button" className="welcome-recent-item" onClick={() => void openProject(p)} title={p}>
                <span>{basename(p)}</span>
                <span className="muted mono">{p}</span>
              </button>
            ))}
          </div>
        )}
        <div className="welcome-tips muted">
          <span>⌃R run</span><span>⌥⌘F freeze</span><span>⌥⌘V verify</span><span>⌘P go to file</span><span>⇧⌘A find action</span><span>⌥F12 terminal</span>
        </div>
      </div>
    </div>
  )
}

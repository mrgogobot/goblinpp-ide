import { useEffect, useState } from 'react'
import { runAction } from '../actions'
import { fs, isTauri, proc } from '../platform/tauri'
import type { SearchMatch } from '../platform/tauri'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { useSettingsStore } from '../stores/settingsStore'
import { basename, relative } from '../util/path'
import { EvidencePanel } from './EvidencePanel'
import { ProjectTree } from './ProjectTree'

function SearchPanel() {
  const root = useProjectStore((s) => s.root)
  const query = useAppStore((s) => s.searchQuery)
  const setQuery = useAppStore((s) => s.setSearchQuery)
  const openPath = useEditorStore((s) => s.openPath)
  const [include, setInclude] = useState('*.gbl')
  const [exclude, setExclude] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchMatch[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!root || !query.trim() || !isTauri()) { setResults([]); return }
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        const r = await fs.search({ root, query, caseSensitive, include: include.split(',').map((s) => s.trim()).filter(Boolean), exclude: exclude.split(',').map((s) => s.trim()).filter(Boolean), maxResults: 500 })
        setResults(r)
      } catch { setResults([]) }
      setBusy(false)
    }, 250)
    return () => clearTimeout(t)
  }, [root, query, include, exclude, caseSensitive])

  const grouped = results.reduce<Record<string, SearchMatch[]>>((acc, m) => { (acc[m.path] ??= []).push(m); return acc }, {})
  return (
    <div className="sidebar-body" style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input autoFocus placeholder="Search in project…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="settings-row" style={{ gap: 6 }}>
          <input placeholder="include: *.gbl" value={include} onChange={(e) => setInclude(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
          <input placeholder="exclude" value={exclude} onChange={(e) => setExclude(e.target.value)} style={{ flex: 1, fontSize: 11 }} />
        </div>
        <label className="settings-row muted" style={{ fontSize: 11 }}><input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> match case</label>
        <div className="muted" style={{ fontSize: 11 }}>{busy ? 'searching…' : query ? `${results.length} match${results.length === 1 ? '' : 'es'} in ${Object.keys(grouped).length} file(s)` : root ? '' : 'Open a project to search.'}</div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
        {Object.entries(grouped).map(([path, ms]) => (
          <div key={path}>
            <div className="search-file" title={path}>{relative(root, path)} <span className="muted">({ms.length})</span></div>
            {ms.map((m, i) => (
              <div key={i} className="search-hit" onClick={() => void openPath(path, { line: m.line, column: m.column })}>
                <span className="muted mono" style={{ width: 34, flexShrink: 0, textAlign: 'right' }}>{m.line}</span>
                <span className="mono" style={{ whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.text.trimStart()}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function RunDebugPanel() {
  const configs = useRunStore((s) => s.configs)
  const activeConfigId = useRunStore((s) => s.activeConfigId)
  const setActiveConfig = useRunStore((s) => s.setActiveConfig)
  const history = useRunStore((s) => s.history)
  const activePath = useEditorStore((s) => s.activePath)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const programArgs = useRunStore((s) => (activePath ? s.programArgsByFile[activePath] ?? '' : ''))
  return (
    <div className="sidebar-body" style={{ fontSize: 12 }}>
      <div className="sidebar-section">Configurations</div>
      {configs.map((c) => (
        <div key={c.id} className={`tree-row${c.id === activeConfigId ? ' selected' : ''}`} onClick={() => setActiveConfig(c.id)} onDoubleClick={() => { setActiveConfig(c.id); runAction(c.kind === 'interpreter' ? 'run.run' : c.kind === 'compiled' ? 'run.compile' : c.kind === 'check' ? 'run.check' : `run.${c.args[0] === 'audit-ledger' ? 'audit' : c.args[0]}`) }}>
          <span className="tree-icon" style={{ color: 'var(--accent-secondary)' }}>▶</span>
          <span className="tree-label">{c.name}</span>
        </div>
      ))}
      <div className="sidebar-section">Active file</div>
      <div style={{ padding: '0 10px 8px' }} className="muted">{activePath ? basename(activePath) : 'none'}{programArgs ? ` · args: ${programArgs}` : ''}</div>
      <div style={{ padding: '0 10px' }} className="settings-row"><button type="button" className="toolbar-btn framed" onClick={() => runAction('run.runArgs')}>Run with arguments…</button></div>
      <div className="sidebar-section">Options</div>
      <label className="settings-row" style={{ padding: '2px 10px' }}><input type="checkbox" checked={settings.autoSaveBeforeRun} onChange={(e) => update({ autoSaveBeforeRun: e.target.checked })} /> Save before run</label>
      <label className="settings-row" style={{ padding: '2px 10px' }}><input type="checkbox" checked={settings.autoVerify} onChange={(e) => update({ autoVerify: e.target.checked })} /> Verify after each PASS run</label>
      <div className="sidebar-section">Recent runs</div>
      {history.length === 0 && <div className="muted" style={{ padding: '0 10px' }}>No runs yet in this session.</div>}
      {history.slice(0, 20).map((h) => (
        <div key={h.id} className="tree-row" style={{ height: 'auto', padding: '3px 10px', flexDirection: 'column', alignItems: 'flex-start' }} onClick={() => { if (h.runDir) { useRunStore.getState().selectRunDir(h.runDir); useAppStore.getState().setActiveActivity('evidence') } }}>
          <span><span style={{ color: h.status === 'PASS' ? 'var(--accent-secondary)' : 'var(--error)', fontWeight: 700 }}>{h.status}</span> {basename(h.file)} <span className="muted">{h.kind}</span></span>
          <span className="muted mono" style={{ fontSize: 10 }}>{h.runDir ? basename(h.runDir) : h.command}</span>
        </div>
      ))}
    </div>
  )
}

function ScmPanel() {
  const root = useProjectStore((s) => s.root)
  const openPath = useEditorStore((s) => s.openPath)
  const [state, setState] = useState<{ branch: string; lines: string[]; error?: string } | null>(null)
  const refresh = async () => {
    if (!root || !isTauri()) return
    try {
      const b = await proc.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], root)
      if (b.code !== 0) { setState({ branch: '', lines: [], error: 'Not a git repository' }); return }
      const s = await proc.run('git', ['status', '--porcelain'], root)
      setState({ branch: b.stdout.trim(), lines: s.stdout.split('\n').filter(Boolean) })
    } catch (e) { setState({ branch: '', lines: [], error: String(e) }) }
  }
  useEffect(() => { void refresh() }, [root]) // eslint-disable-line react-hooks/exhaustive-deps
  const init = async () => { if (!root) return; await proc.run('git', ['init'], root); if (!(await fs.exists(`${root}/.gitignore`))) await fs.writeText(`${root}/.gitignore`, 'runs/\n.goblin/\n*.partial\n'); await refresh() }
  const commit = async () => {
    if (!root) return
    const { promptDialog } = await import('../stores/dialogStore')
    const msg = await promptDialog('Commit', { message: 'Stage all changes and commit.', placeholder: 'commit message', ok: 'Commit' })
    if (!msg) return
    await proc.run('git', ['add', '-A'], root)
    const r = await proc.run('git', ['commit', '-m', msg], root)
    const { toast } = await import('../stores/dialogStore')
    toast(r.code === 0 ? 'success' : 'error', r.code === 0 ? 'Committed' : 'Commit failed', (r.stdout + r.stderr).trim().split('\n')[0])
    await refresh()
  }
  return (
    <div className="sidebar-body" style={{ fontSize: 12 }}>
      {!root && <div className="panel-placeholder"><span>Open a project to see its git status.</span></div>}
      {root && state?.error && (
        <div style={{ padding: 10 }}>
          <div className="muted" style={{ marginBottom: 8 }}>{state.error}.</div>
          <button type="button" className="toolbar-btn framed" onClick={() => void init()}>git init (adds runs/ and .goblin/ to .gitignore)</button>
        </div>
      )}
      {root && state && !state.error && (
        <>
          <div className="sidebar-section">Branch: <span className="accent-text">{state.branch}</span></div>
          <div className="settings-row" style={{ padding: '0 10px 8px', gap: 6 }}>
            <button type="button" className="toolbar-btn framed" onClick={() => void refresh()}>Refresh</button>
            <button type="button" className="run-btn" onClick={() => void commit()} disabled={!state.lines.length}>Commit all…</button>
          </div>
          <div className="sidebar-section">Changes ({state.lines.length})</div>
          {state.lines.length === 0 && <div className="muted" style={{ padding: '0 10px' }}>Working tree clean.</div>}
          {state.lines.map((l) => {
            const code = l.slice(0, 2).trim()
            const file = l.slice(3).replace(/^"|"$/g, '')
            return (
              <div key={l} className="tree-row" onClick={() => void openPath(`${root}/${file}`)} title={l}>
                <span className="mono" style={{ width: 20, color: code === 'M' ? 'var(--accent)' : code === '??' || code === 'A' ? 'var(--accent-secondary)' : 'var(--error)' }}>{code}</span>
                <span className="tree-label">{file}</span>
              </div>
            )
          })}
          <div className="muted" style={{ padding: 10, fontSize: 11 }}>Evidence folders (runs/, .goblin/) are ignored by default. Freeze and revise receipts live next to the source and can be committed.</div>
        </>
      )}
    </div>
  )
}

export function Sidebar() {
  const activeActivity = useAppStore((s) => s.activeActivity)
  const titles: Record<string, string> = { project: 'Project', search: 'Find in Files', scm: 'Source Control', run: 'Run & Debug', evidence: 'Evidence & Audit' }
  const title = titles[activeActivity] ?? 'Project'
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>{title}</span>
        {activeActivity === 'project' && <button type="button" className="icon-btn" title="Synchronize" onClick={() => runAction('file.refresh')}>⟳</button>}
      </div>
      {activeActivity === 'project' && <ProjectTree />}
      {activeActivity === 'search' && <SearchPanel />}
      {activeActivity === 'scm' && <ScmPanel />}
      {activeActivity === 'run' && <RunDebugPanel />}
      {activeActivity === 'evidence' && <div className="sidebar-body"><EvidencePanel compact /></div>}
    </aside>
  )
}

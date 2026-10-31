import { useState } from 'react'
import { runAction } from '../actions'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { useSettingsStore } from '../stores/settingsStore'
import { basename } from '../util/path'

export function RunConfigDialog() {
  const open = useRunStore((s) => s.runConfigOpen)
  const setOpen = useRunStore((s) => s.setRunConfigOpen)
  const configs = useRunStore((s) => s.configs)
  const activeConfigId = useRunStore((s) => s.activeConfigId)
  const setActiveConfig = useRunStore((s) => s.setActiveConfig)
  const programArgsByFile = useRunStore((s) => s.programArgsByFile)
  const activePath = useEditorStore((s) => s.activePath)
  const root = useProjectStore((s) => s.root)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [selected, setSelected] = useState(activeConfigId)
  if (!open) return null
  const active = configs.find((c) => c.id === selected) ?? configs[0]
  const file = activePath ? basename(activePath) : '<active file>'
  const command = active.kind === 'interpreter' ? `goblin++ run ${file}${settings.runsRoot ? ` --runs-root ${settings.runsRoot}` : ''}${activePath && programArgsByFile[activePath] ? ` -- ${programArgsByFile[activePath]}` : ''}`
    : active.kind === 'compiled' ? `goblin++ run ${file} --compile${settings.inlineRustHashes[activePath ?? ''] ? ' --allow-inline-rust <sha256>' : ''}`
    : active.kind === 'check' ? `goblin++ check ${file} --json` : `goblin++ ${active.args.join(' ')}`
  const launch = () => {
    setActiveConfig(active.id)
    setOpen(false)
    if (active.kind === 'interpreter') runAction('run.run')
    else if (active.kind === 'compiled') runAction('run.compile')
    else if (active.kind === 'check') runAction('run.check')
    else runAction(active.args[0] === 'audit-ledger' ? 'run.audit' : `run.${active.args[0]}`)
  }
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="settings-dialog" style={{ width: 720, height: 460 }} role="dialog" aria-label="Run configurations">
        <div className="settings-title">Run/Debug Configurations</div>
        <div className="settings-body">
          <div className="settings-nav" style={{ width: 240, flex: '0 0 240px' }}>
            <div className="settings-group">Goblin++</div>
            {configs.map((c) => <div key={c.id} className={`settings-item${selected === c.id ? ' active' : ''}`} onClick={() => setSelected(c.id)}>{c.name}</div>)}
          </div>
          <div className="settings-content">
            <h3 style={{ margin: '0 0 12px' }}>{active.name}</h3>
            <div className="settings-field"><label>Command</label><code style={{ fontSize: 12 }}>{command}</code></div>
            <div className="settings-field"><label>Working directory</label><div className="mono" style={{ fontSize: 12 }}>{root || '(folder of the file)'}</div><div className="hint">RUN_DIRs and the .goblin custody ledger are created here.</div></div>
            <div className="settings-field">
              <label>Runs root (--runs-root)</label>
              <input value={settings.runsRoot} placeholder="runs (engine default)" onChange={(e) => update({ runsRoot: e.target.value })} style={{ width: 280 }} />
            </div>
            <div className="settings-field">
              <label>Program arguments (after --)</label>
              <input value={activePath ? programArgsByFile[activePath] ?? '' : ''} placeholder="e.g. 42 catalogue.fits" onChange={(e) => { if (activePath) useRunStore.setState((s) => ({ programArgsByFile: { ...s.programArgsByFile, [activePath]: e.target.value } })) }} style={{ width: 280 }} disabled={!activePath} />
            </div>
            <label className="settings-row"><input type="checkbox" checked={settings.autoSaveBeforeRun} onChange={(e) => update({ autoSaveBeforeRun: e.target.checked })} /> Save the file before running</label>
            <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={settings.autoVerify} onChange={(e) => update({ autoVerify: e.target.checked })} /> Run <code>goblin++ verify</code> automatically after a PASS</label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: 12, borderTop: '1px solid var(--border)' }}>
          <button type="button" className="toolbar-btn" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="toolbar-btn framed" onClick={() => { setActiveConfig(active.id); setOpen(false) }}>Apply</button>
          <button type="button" className="run-btn" onClick={launch}>Run</button>
        </div>
      </div>
    </div>
  )
}

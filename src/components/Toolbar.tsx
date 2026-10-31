import { useEffect, useState } from 'react'
import { ACTIONS, runAction } from '../actions'
import { displayCombo } from '../keymap/keymap'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useKeymapStore } from '../stores/keymapStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { useSettingsStore } from '../stores/settingsStore'
import { basename } from '../util/path'
import { ChevronDownIcon, RunIcon } from './icons'

interface MenuEntry { label?: string; action?: string; shortcut?: string; separator?: boolean; disabled?: boolean; run?: () => void }

const MENUS: Record<string, MenuEntry[]> = {
  File: [
    { label: 'New File…', action: 'file.new', shortcut: '⌘N' },
    { label: 'New Project…', action: 'file.newProject', shortcut: '⇧⌘N' },
    { separator: true },
    { label: 'Open File…', action: 'file.open', shortcut: '⌘O' },
    { label: 'Open Folder…', action: 'file.openFolder', shortcut: '⇧⌘O' },
    { label: 'Open Recent…', action: 'file.openRecent' },
    { label: 'Open bundled examples', action: 'file.openExamples' },
    { separator: true },
    { label: 'Save', action: 'file.save', shortcut: '⌘S' },
    { label: 'Save As…', action: 'file.saveAs', shortcut: '⇧⌘S' },
    { label: 'Save All', action: 'file.saveAll', shortcut: '⌥⌘S' },
    { separator: true },
    { label: 'Close Tab', action: 'file.closeTab', shortcut: '⌘W' },
    { label: 'Close Other Tabs', action: 'file.closeOthers' },
    { label: 'Close Project', action: 'file.closeProject' },
    { separator: true },
    { label: 'Reveal in Finder', action: 'file.reveal' },
    { label: 'Synchronize', action: 'file.refresh' },
    { separator: true },
    { label: 'Settings…', action: 'settings', shortcut: '⌘,' },
  ],
  Edit: [
    { label: 'Find…', action: 'edit.find', shortcut: '⌘F' },
    { label: 'Replace…', action: 'edit.replace', shortcut: '⌥⌘F' },
    { label: 'Find in Files…', action: 'edit.findInFiles' },
    { separator: true },
    { label: 'Toggle Line Comment', action: 'edit.toggleComment', shortcut: '⌘/' },
    { label: 'Select All', action: 'edit.selectAll', shortcut: '⌘A' },
  ],
  View: [
    { label: 'Project', action: 'view.project' },
    { label: 'Evidence & Audit', action: 'view.evidence' },
    { label: 'Structure', action: 'view.structure' },
    { label: 'Problems', action: 'view.problems' },
    { label: 'Run', action: 'view.runPanel' },
    { label: 'Terminal', action: 'view.terminal' },
    { label: 'Toggle Bottom Panel', action: 'view.bottom' },
    { label: 'Maximize Bottom Panel', action: 'view.bottomMax' },
    { label: 'AI Assistant', action: 'view.ai' },
    { separator: true },
    { label: 'Function Reference', action: 'view.functionReference' },
    { label: 'Unit Reference', action: 'view.unitReference' },
    { separator: true },
    { label: 'Appearance: Background Image…', action: 'view.background' },
    { label: 'Appearance: Theme…', action: 'view.theme' },
  ],
  Navigate: [
    { label: 'Go to File…', action: 'nav.quickOpen' },
    { label: 'Find Action…', action: 'nav.commandPalette' },
    { label: 'Go to Line…', action: 'code.gotoLine', shortcut: '⌃G' },
    { label: 'Go to Next Seal', action: 'code.goToSeal' },
    { separator: true },
    { label: 'Back', action: 'nav.back' },
    { label: 'Forward', action: 'nav.forward' },
  ],
  Code: [
    { label: 'Reformat File', action: 'code.format' },
    { label: 'Fold All', action: 'code.fold' },
    { label: 'Unfold All', action: 'code.unfold' },
    { separator: true },
    { label: 'Insert GO_PARANOID', action: 'code.insertParanoid' },
    { label: 'Seal Selected Identifier', action: 'code.sealSelection' },
    { label: 'Authorise Inline Rust…', action: 'run.inlineRust' },
    { separator: true },
    { label: 'AI: Explain / Fix Selection', action: 'ai.fix' },
  ],
  Run: [
    { label: 'Run', action: 'run.run' },
    { label: 'Run with Arguments…', action: 'run.runArgs' },
    { label: 'Compile and Run (--compile)', action: 'run.compile' },
    { label: 'Check (preview only)', action: 'run.check' },
    { label: 'Stop', action: 'run.stop' },
    { label: 'Run Configurations…', action: 'run.config' },
    { separator: true },
    { label: 'Freeze Current File', action: 'run.freeze' },
    { label: 'Verify Last Run', action: 'run.verify' },
    { label: 'Revise…', action: 'run.revise' },
    { label: 'Status', action: 'run.status' },
    { label: 'Lineage', action: 'run.lineage' },
  ],
  Build: [
    { label: 'Compile and Run (--compile)', action: 'run.compile' },
    { label: 'Check (hash, no execution)', action: 'run.check' },
    { label: 'Authorise Inline Rust (exact SHA-256)…', action: 'run.inlineRust' },
  ],
  Tools: [
    { label: 'Audit Ledger', action: 'run.audit' },
    { label: 'Doctor', action: 'run.doctor' },
    { label: 'Capabilities', action: 'run.capabilities' },
    { separator: true },
    { label: 'Detect Environment', action: 'tools.environment' },
    { label: 'New Terminal Session', action: 'view.newTerminal' },
    { separator: true },
    { label: 'Goblin++ → Language Path…', action: 'tools.languagePath' },
    { label: 'Goblin++ → Engine…', action: 'tools.engine' },
  ],
  Help: [
    { label: 'Goblin++ Documentation…', action: 'help.docs' },
    { label: 'Goblin++ on GitHub', action: 'help.github' },
    { separator: true },
    { label: 'Open Log Folder', action: 'help.logs' },
    { label: 'About Goblin++ IDE', action: 'about' },
  ],
}

export function Toolbar() {
  const running = useRunStore((s) => s.running)
  const configs = useRunStore((s) => s.configs)
  const activeConfigId = useRunStore((s) => s.activeConfigId)
  const setActiveConfig = useRunStore((s) => s.setActiveConfig)
  const activePath = useEditorStore((s) => s.activePath)
  const name = useProjectStore((s) => s.name)
  const bindings = useKeymapStore((s) => s.bindings)
  const isMac = useKeymapStore((s) => s.isMac)
  const uiScale = useSettingsStore((s) => s.settings.uiScale)
  const showBottomTab = useAppStore((s) => s.showBottomTab)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)

  useEffect(() => { document.documentElement.style.fontSize = `${(uiScale / 100) * 100}%` }, [uiScale])

  const shortcutFor = (e: MenuEntry) => e.shortcut ?? (e.action && bindings[e.action] ? displayCombo(bindings[e.action], isMac) : '')
  const activeConfig = configs.find((c) => c.id === activeConfigId) ?? configs[0]

  const runActiveConfig = () => {
    showBottomTab('run')
    const run = useRunStore.getState()
    if (activeConfig.kind === 'interpreter') void run.run('run')
    else if (activeConfig.kind === 'compiled') void run.run('compile')
    else if (activeConfig.kind === 'check') void run.run('check')
    else void run.runSubcommand(activeConfig.args, { label: activeConfig.args[0] })
  }

  return (
    <header className="toolbar">
      {Object.keys(MENUS).map((menu) => (
        <div className="menu-root" key={menu} onMouseEnter={() => { if (openMenu && openMenu !== menu) setOpenMenu(menu) }}>
          <button type="button" className={`menu-btn${openMenu === menu ? ' open' : ''}`} onClick={() => setOpenMenu(openMenu === menu ? null : menu)} aria-haspopup="menu" aria-expanded={openMenu === menu}>
            {menu}
          </button>
          {openMenu === menu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onMouseDown={() => setOpenMenu(null)} />
              <div className="menu" role="menu">
                {MENUS[menu].map((item, i) =>
                  item.separator ? (
                    <div className="menu-sep" key={`sep-${i}`} />
                  ) : (
                    <div key={item.label ?? i} className={`menu-item${item.disabled ? ' disabled' : ''}`} role="menuitem" onMouseDown={() => { setOpenMenu(null); if (item.action) runAction(item.action); item.run?.() }}>
                      <span>{item.label}</span>
                      {shortcutFor(item) && <span className="shortcut">{shortcutFor(item)}</span>}
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </div>
      ))}

      <span className="toolbar-sep" />

      <div className="run-group">
        <button type="button" className="run-config-btn" onClick={() => setConfigOpen((v) => !v)} title="Run configuration">
          <span className="muted" style={{ fontSize: 11 }}>{activePath ? basename(activePath) : 'no file'}</span>
          <span>{activeConfig.name}</span>
          <ChevronDownIcon size={12} />
        </button>
        {configOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onMouseDown={() => setConfigOpen(false)} />
            <div className="menu" role="menu" style={{ left: 0 }}>
              {configs.map((c) => (
                <div key={c.id} className={`menu-item${c.id === activeConfigId ? ' checked' : ''}`} role="menuitem" onMouseDown={() => { setActiveConfig(c.id); setConfigOpen(false) }}>
                  <span>{c.name}</span>
                </div>
              ))}
              <div className="menu-sep" />
              <div className="menu-item" role="menuitem" onMouseDown={() => { setConfigOpen(false); runAction('run.config') }}>Edit Configurations…</div>
            </div>
          </>
        )}
        {running ? (
          <button type="button" className="run-btn stop" onClick={() => runAction('run.stop')} title="Stop (⌘F2)">■ Stop</button>
        ) : (
          <button type="button" className="run-btn" onClick={runActiveConfig} title={`Run · ${displayCombo(bindings['run.run'] ?? '', isMac)}`}>
            <RunIcon size={14} /> <span>goblin++ Run</span>
          </button>
        )}
      </div>
      {([['Compile', 'run.compile'], ['Check', 'run.check'], ['Freeze', 'run.freeze'], ['Verify', 'run.verify'], ['Revise', 'run.revise']] as const).map(([label, action]) => (
        <button key={label} type="button" className="toolbar-btn" onClick={() => runAction(action)} title={`${ACTIONS.find((a) => a.id === action)?.label ?? label}${bindings[action] ? ` · ${displayCombo(bindings[action], isMac)}` : ''}`}>
          {label}
        </button>
      ))}

      <span className="grow" />
      <button type="button" className="toolbar-btn muted" onClick={() => runAction('nav.commandPalette')} title="Find Action (⇧⌘A)">⌕</button>
      <span className="muted" style={{ fontSize: 12 }} title={activePath ?? ''}>{name ? `Project: ${name}` : 'No project open'}</span>
    </header>
  )
}

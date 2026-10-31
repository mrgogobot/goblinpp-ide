/*
 * Central action dispatcher. Menus (in-app and native), the keymap, the command
 * palette and toolbar buttons all route through `runAction(id)`.
 */
import { getActiveEditor, runEditorAction } from './language/monaco'
import { dialogs, fs, GBL_FILTER, isTauri, settingsApi, shell } from './platform/tauri'
import { useAppStore } from './stores/appStore'
import { chooseDialog, confirmDialog, promptDialog, toast } from './stores/dialogStore'
import { useEditorStore } from './stores/editorStore'
import { useEnvironmentStore } from './stores/environmentStore'
import { useLanguageStore } from './stores/languageStore'
import { useProjectStore } from './stores/projectStore'
import { useRunStore } from './stores/runStore'
import { getSettings, useSettingsStore } from './stores/settingsStore'
import { useTerminalStore } from './stores/terminalStore'
import { basename, dirname, join } from './util/path'
import { useTheme$ } from './theme/ThemeContext'
import { THEMES } from './theme/themes'

export interface ActionDef { id: string; label: string; group: string; run: () => void | Promise<void>; when?: () => boolean }

const STARTER = `# New Goblin++ program
# Run with ⌃R · freeze → run → verify → revise

GO_PARANOID

mass = 2 kg
energy = mass * c^2
print("energy = {energy}")
seal energy
`

export async function openProject(root: string): Promise<void> {
  const project = useProjectStore.getState()
  await project.openProject(root)
  useSettingsStore.getState().addRecentProject(root)
  useAppStore.getState().setActiveActivity('project')
  const lang = useLanguageStore.getState()
  await lang.detect(root)
  await lang.resolveEngine()
  void useRunStore.getState().scanRuns()
  void useRunStore.getState().auditLedgerRefresh(false)
  void useEnvironmentStore.getState().detect()
  void settingsApi.log(`${new Date().toISOString()} open project ${root}`)
}

export async function newProject(): Promise<void> {
  if (!isTauri()) return
  const parent = await dialogs.pickFolder('Choose where to create the project')
  if (!parent) return
  const name = await promptDialog('New Goblin++ project', { message: `A folder will be created inside ${parent}.`, defaultValue: 'experiment', ok: 'Create', validate: (v) => (/^[\w.-]+$/.test(v) ? null : 'Use letters, digits, dot, dash or underscore') })
  if (!name) return
  const root = join(parent, name)
  if (await fs.exists(root)) { toast('error', 'Folder exists', root); return }
  const withExamples = await confirmDialog('Include the bundled examples?', 'Copies the goblin++ examples folder (electrical, chemistry, FITS, statistics…) into the new project.', { ok: 'Include examples', cancel: 'Just a starter file' })
  await fs.createDir(root)
  await fs.writeText(join(root, `${name}.gbl`), STARTER)
  await fs.writeText(join(root, '.goblin-project'), JSON.stringify({ name, languageFolder: 'goblin++', root: '.', evidenceRoot: '.goblin', runsRoot: 'runs', created: new Date().toISOString() }, null, 2) + '\n')
  await fs.writeText(join(root, '.gitignore'), 'runs/\n.goblin/\n*.partial\n')
  if (withExamples === 'ok') await copyBundledExamples(join(root, 'examples'))
  await openProject(root)
  await useEditorStore.getState().openPath(join(root, `${name}.gbl`))
}

export async function copyBundledExamples(dest: string): Promise<number> {
  const def = useLanguageStore.getState().definition
  if (!def) return 0
  let list: string[] = []
  try {
    list = (JSON.parse(await def.fs.readText(`${def.examplesBase.replace(/\/$/, '')}/index.json`)) as { files: string[] }).files
  } catch {
    return 0
  }
  let n = 0
  for (const rel of list) {
    if (/\.(fits|png|npz|npy)$/i.test(rel)) continue
    try {
      const text = await def.fs.readText(`${def.examplesBase.replace(/\/$/, '')}/${rel}`)
      await fs.writeText(join(dest, rel), text)
      n++
    } catch { /* skip */ }
  }
  return n
}

export async function openExamplesProject(): Promise<void> {
  if (!isTauri()) return
  const home = await fs.homeDir()
  const dest = join(home, 'Documents', 'Goblin++ Examples')
  if (!(await fs.exists(dest))) {
    await fs.createDir(dest)
    const n = await copyBundledExamples(dest)
    toast('success', 'Examples copied', `${n} files → ${dest}`)
  }
  await openProject(dest)
  const first = join(dest, 'electrical.gbl')
  if (await fs.exists(first)) await useEditorStore.getState().openPath(first)
}

async function newFile(): Promise<void> {
  const project = useProjectStore.getState()
  const editor = useEditorStore.getState()
  if (!project.root || !isTauri()) { editor.newUntitled(STARTER); return }
  const sel = project.selectedPath
  let dir = project.root
  if (sel) {
    const st = await fs.stat(sel)
    dir = st.is_dir ? sel : dirname(sel)
  }
  const name = await promptDialog('New File', { message: `Created in ${dir}`, defaultValue: 'untitled.gbl', ok: 'Create', validate: (v) => (v.trim() && !v.includes('/') ? null : 'Enter a file name') })
  if (!name) return
  const path = join(dir, name.trim())
  if (await fs.exists(path)) { toast('error', 'File exists', path); return }
  await fs.writeText(path, name.endsWith('.gbl') ? STARTER : '')
  await project.refresh()
  await project.revealPath(path)
  await editor.openPath(path)
}

async function openFile(): Promise<void> {
  if (!isTauri()) return
  const files = await dialogs.pickFiles({ title: 'Open File', filters: GBL_FILTER })
  for (const f of files) await useEditorStore.getState().openPath(f)
  if (files.length && !useProjectStore.getState().root) {
    const r = await confirmDialog('Open containing folder as project?', dirname(files[0]), { ok: 'Open folder', cancel: 'Just the file' })
    if (r === 'ok') await openProject(dirname(files[0]))
  }
}

async function openFolder(): Promise<void> {
  if (!isTauri()) return
  const dir = await dialogs.pickFolder('Open Folder')
  if (dir) await openProject(dir)
}

async function openRecent(): Promise<void> {
  const recent = getSettings().recentProjects
  if (!recent.length) { toast('info', 'No recent projects'); return }
  const pick = await chooseDialog('Open Recent', recent.map((p) => ({ id: p, label: basename(p), detail: p })))
  if (pick) await openProject(pick)
}

async function closeProject(): Promise<void> {
  const ok = await useEditorStore.getState().closeAll()
  if (!ok) return
  useProjectStore.getState().closeProject()
  useSettingsStore.getState().update({ lastProject: '' })
}

function activeFile(): string | null {
  return useEditorStore.getState().activePath
}

function goToNextSeal(): void {
  const e = getActiveEditor()
  const model = e?.getModel()
  if (!e || !model) return
  const pos = e.getPosition()
  const lines = model.getLinesContent()
  const start = pos ? pos.lineNumber : 0
  const idx = [...lines.keys()].map((i) => (i + start) % lines.length).find((i) => /^\s*seal\s+/.test(lines[i]))
  if (idx === undefined) { toast('info', 'No seal statements in this file'); return }
  e.revealLineInCenter(idx + 1)
  e.setPosition({ lineNumber: idx + 1, column: 1 })
  e.focus()
}

export async function openDoc(name: string): Promise<void> {
  const lang = useLanguageStore.getState()
  const doc = await lang.readDoc(name)
  if (!doc) { toast('warning', 'Document not found', name); return }
  useEditorStore.getState().openBuffer({ path: `doc:${name}`, name: `📖 ${name}`, language: 'markdown', content: doc.text, readOnly: true })
}

async function pickDoc(): Promise<void> {
  const lang = useLanguageStore.getState()
  const idx = lang.manifest?.docsIndex ?? []
  const options = [{ id: 'README.md', label: 'README.md', detail: 'Goblin++ engine README' }, ...idx.map((d) => ({ id: d, label: d }))]
  const pick = await chooseDialog('Goblin++ Documentation', options, 'Opens as a read-only tab.')
  if (pick) await openDoc(pick)
}

function cycleTab(dir: 1 | -1): void {
  const s = useEditorStore.getState()
  if (!s.tabs.length || !s.activePath) return
  const i = s.tabs.findIndex((t) => t.path === s.activePath)
  const next = s.tabs[(i + dir + s.tabs.length) % s.tabs.length]
  s.setActive(next.path)
}

export const ACTIONS: ActionDef[] = [
  { id: 'file.new', label: 'New File…', group: 'File', run: newFile },
  { id: 'file.newProject', label: 'New Project…', group: 'File', run: newProject },
  { id: 'file.open', label: 'Open File…', group: 'File', run: openFile },
  { id: 'file.openFolder', label: 'Open Folder…', group: 'File', run: openFolder },
  { id: 'file.openRecent', label: 'Open Recent…', group: 'File', run: openRecent },
  { id: 'file.openExamples', label: 'Open the bundled examples', group: 'File', run: openExamplesProject },
  { id: 'file.save', label: 'Save', group: 'File', run: async () => { await useEditorStore.getState().save() } },
  { id: 'file.saveAs', label: 'Save As…', group: 'File', run: async () => { await useEditorStore.getState().saveAs() } },
  { id: 'file.saveAll', label: 'Save All', group: 'File', run: () => useEditorStore.getState().saveAll() },
  { id: 'file.closeTab', label: 'Close Tab', group: 'File', run: async () => { const p = activeFile(); if (p) await useEditorStore.getState().closeTab(p) } },
  { id: 'file.closeOthers', label: 'Close Other Tabs', group: 'File', run: async () => { const p = activeFile(); if (p) await useEditorStore.getState().closeOthers(p) } },
  { id: 'file.closeAll', label: 'Close All Tabs', group: 'File', run: async () => { await useEditorStore.getState().closeAll() } },
  { id: 'file.closeProject', label: 'Close Project', group: 'File', run: closeProject },
  { id: 'file.reveal', label: 'Reveal in Finder', group: 'File', run: async () => { const p = activeFile() ?? useProjectStore.getState().root; if (p && !p.includes(':')) await shell.revealInFinder(p) } },
  { id: 'file.nextTab', label: 'Next Tab', group: 'File', run: () => cycleTab(1) },
  { id: 'file.prevTab', label: 'Previous Tab', group: 'File', run: () => cycleTab(-1) },
  { id: 'file.refresh', label: 'Synchronize project tree', group: 'File', run: () => useProjectStore.getState().refresh() },

  { id: 'edit.find', label: 'Find…', group: 'Edit', run: () => runEditorAction('actions.find') },
  { id: 'edit.replace', label: 'Replace…', group: 'Edit', run: () => runEditorAction('editor.action.startFindReplaceAction') },
  { id: 'edit.findInFiles', label: 'Find in Files…', group: 'Edit', run: () => { const e = getActiveEditor(); const sel = e?.getModel()?.getValueInRange(e.getSelection()!) ?? ''; if (sel && !sel.includes('\n')) useAppStore.getState().setSearchQuery(sel); useAppStore.getState().setActiveActivity('search') } },
  { id: 'edit.toggleComment', label: 'Toggle Line Comment', group: 'Edit', run: () => runEditorAction('editor.action.commentLine') },
  { id: 'edit.selectAll', label: 'Select All', group: 'Edit', run: () => runEditorAction('editor.action.selectAll') },
  { id: 'code.format', label: 'Reformat File', group: 'Code', run: () => runEditorAction('editor.action.formatDocument') },
  { id: 'code.goToSeal', label: 'Go to Next Seal', group: 'Code', run: goToNextSeal },
  { id: 'code.fold', label: 'Fold All', group: 'Code', run: () => runEditorAction('editor.foldAll') },
  { id: 'code.unfold', label: 'Unfold All', group: 'Code', run: () => runEditorAction('editor.unfoldAll') },
  { id: 'code.gotoLine', label: 'Go to Line…', group: 'Code', run: () => runEditorAction('editor.action.gotoLine') },
  { id: 'code.insertParanoid', label: 'Insert GO_PARANOID at top', group: 'Code', run: () => { const e = getActiveEditor(); const m = e?.getModel(); if (!e || !m) return; e.executeEdits('ide', [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'GO_PARANOID\n\n' }]) } },
  { id: 'code.sealSelection', label: 'Seal selected identifier', group: 'Code', run: () => { const e = getActiveEditor(); const m = e?.getModel(); if (!e || !m) return; const sel = e.getSelection(); const word = sel ? m.getValueInRange(sel).trim() || m.getWordAtPosition(sel.getPosition())?.word : ''; if (!word) return; const line = sel!.endLineNumber; e.executeEdits('ide', [{ range: { startLineNumber: line, startColumn: m.getLineMaxColumn(line), endLineNumber: line, endColumn: m.getLineMaxColumn(line) }, text: `\nseal ${word}` }]) } },

  { id: 'view.project', label: 'Project Tool Window', group: 'View', run: () => { const a = useAppStore.getState(); if (a.activeActivity === 'project' && a.leftSidebarOpen) a.setLeftSidebarOpen(false); else a.setActiveActivity('project') } },
  { id: 'view.bottom', label: 'Toggle Bottom Tool Window', group: 'View', run: () => useAppStore.getState().toggleBottomPanel() },
  { id: 'view.bottomMax', label: 'Maximize / Restore Bottom Tool Window', group: 'View', run: () => useAppStore.getState().toggleBottomMaximized() },
  { id: 'view.terminal', label: 'Terminal', group: 'View', run: () => { const a = useAppStore.getState(); if (a.activeBottomTab === 'terminal' && a.bottomPanelOpen) a.setBottomPanelOpen(false); else a.showBottomTab('terminal'); if (!useTerminalStore.getState().sessions.length) useTerminalStore.getState().create(useProjectStore.getState().root) } },
  { id: 'view.newTerminal', label: 'New Terminal Session', group: 'View', run: () => { useTerminalStore.getState().create(useProjectStore.getState().root); useAppStore.getState().showBottomTab('terminal') } },
  { id: 'view.problems', label: 'Problems', group: 'View', run: () => useAppStore.getState().showBottomTab('problems') },
  { id: 'view.runPanel', label: 'Run Tool Window', group: 'View', run: () => useAppStore.getState().showBottomTab('run') },
  { id: 'view.evidence', label: 'Evidence & Audit', group: 'View', run: () => useAppStore.getState().setActiveActivity('evidence') },
  { id: 'view.structure', label: 'Structure', group: 'View', run: () => useAppStore.getState().showBottomTab('structure') },
  { id: 'view.ai', label: 'Toggle AI Assistant', group: 'View', run: () => useAppStore.getState().toggleAiPane() },
  { id: 'view.background', label: 'Appearance: Background Image…', group: 'View', run: () => useAppStore.getState().setBackgroundDialogOpen(true) },
  { id: 'view.theme', label: 'Appearance: Theme…', group: 'View', run: async () => { const pick = await chooseDialog('Theme', THEMES.map((t) => ({ id: t.id, label: t.label, detail: t.kind }))); if (pick) useTheme$.setTheme(pick as (typeof THEMES)[number]['id']) } },
  { id: 'view.functionReference', label: 'Function Reference', group: 'View', run: () => useAppStore.getState().showBottomTab('function-reference') },
  { id: 'view.unitReference', label: 'Unit Reference', group: 'View', run: () => useAppStore.getState().showBottomTab('unit-reference') },

  { id: 'nav.quickOpen', label: 'Go to File…', group: 'Navigate', run: () => useAppStore.getState().setQuickOpen(true, 'files') },
  { id: 'nav.commandPalette', label: 'Find Action…', group: 'Navigate', run: () => useAppStore.getState().setQuickOpen(true, 'commands') },
  { id: 'nav.back', label: 'Back', group: 'Navigate', run: () => useEditorStore.getState().navigate(-1) },
  { id: 'nav.forward', label: 'Forward', group: 'Navigate', run: () => useEditorStore.getState().navigate(1) },

  { id: 'run.run', label: 'Run', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().run('run') } },
  { id: 'run.runArgs', label: 'Run with Arguments…', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().runWithArgs() } },
  { id: 'run.compile', label: 'Compile and Run (--compile)', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().run('compile') } },
  { id: 'run.check', label: 'Check (preview, no evidence)', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().run('check') } },
  { id: 'run.stop', label: 'Stop', group: 'Run', run: () => useRunStore.getState().stop() },
  { id: 'run.config', label: 'Run Configurations…', group: 'Run', run: () => useRunStore.getState().setRunConfigOpen(true) },
  { id: 'run.freeze', label: 'Freeze Current File', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().freezeCurrent() } },
  { id: 'run.verify', label: 'Verify Last Run', group: 'Run', run: async () => { const r = useRunStore.getState().lastRun; if (!r?.runDir) { toast('info', 'No run to verify', 'Run a program first, or pick a RUN_DIR in Evidence.'); return } useAppStore.getState().showBottomTab('run'); await useRunStore.getState().verifyRun(r.runDir) } },
  { id: 'run.revise', label: 'Revise…', group: 'Run', run: () => useRunStore.getState().revise() },
  { id: 'run.status', label: 'Status', group: 'Run', run: async () => { const f = activeFile(); if (!f) return; useAppStore.getState().showBottomTab('run'); const cwd = useProjectStore.getState().root && f.startsWith(useProjectStore.getState().root + '/') ? useProjectStore.getState().root : dirname(f); await useRunStore.getState().runSubcommand(['status', f.slice(cwd.length + 1)], { cwd, label: 'status', file: f }); await useRunStore.getState().refreshStatus(f) } },
  { id: 'run.lineage', label: 'Lineage', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().lineage() } },
  { id: 'run.audit', label: 'Audit Ledger', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().auditLedgerRefresh(true) } },
  { id: 'run.doctor', label: 'Doctor', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().doctor() } },
  { id: 'run.capabilities', label: 'Capabilities', group: 'Run', run: async () => { useAppStore.getState().showBottomTab('run'); await useRunStore.getState().capabilities() } },
  { id: 'run.inlineRust', label: 'Authorise inline Rust (exact SHA-256)…', group: 'Run', run: () => useRunStore.getState().openInlineRustAuth() },

  { id: 'ai.fix', label: 'AI: Explain / Fix Selection', group: 'AI', run: async () => { const e = getActiveEditor(); const sel = e?.getSelection(); const text = sel && e ? e.getModel()?.getValueInRange(sel) ?? '' : ''; const m = await import('./stores/aiStore'); useAppStore.getState().setAiPaneOpen(true); if (text.trim()) void m.useAiStore.getState().send(`Explain this Goblin++ code and suggest fixes if needed:\n\n\`\`\`goblinpp\n${text}\n\`\`\``) } },

  { id: 'settings', label: 'Settings…', group: 'Tools', run: () => useAppStore.getState().openSettings('general') },
  { id: 'about', label: 'About Goblin++ IDE', group: 'Help', run: () => useAppStore.getState().openSettings('about') },
  { id: 'tools.environment', label: 'Detect Environment', group: 'Tools', run: async () => { useAppStore.getState().showBottomTab('environment'); await useEnvironmentStore.getState().detect() } },
  { id: 'tools.languagePath', label: 'Goblin++ → Language Path…', group: 'Tools', run: () => useAppStore.getState().openSettings('goblin-language') },
  { id: 'tools.engine', label: 'Goblin++ → Engine…', group: 'Tools', run: () => useAppStore.getState().openSettings('goblin-engine') },
  { id: 'help.docs', label: 'Goblin++ Documentation…', group: 'Help', run: pickDoc },
  { id: 'help.github', label: 'Goblin++ on GitHub', group: 'Help', run: () => shell.openExternal('https://github.com/mrgogobot/goblinpp') },
  { id: 'help.environment', label: 'Detect Environment', group: 'Help', run: async () => { useAppStore.getState().showBottomTab('environment'); await useEnvironmentStore.getState().detect() } },
  { id: 'help.logs', label: 'Open Log Folder', group: 'Help', run: async () => { const p = await settingsApi.appPaths(); await fs.createDir(p.log_dir); await shell.revealInFinder(p.log_dir) } },
]

const byId = new Map(ACTIONS.map((a) => [a.id, a]))

export function runAction(id: string): void {
  const a = byId.get(id)
  if (!a) return
  try {
    const r = a.run()
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch((e) => toast('error', a.label, e instanceof Error ? e.message : String(e)))
  } catch (e) {
    toast('error', a.label, e instanceof Error ? e.message : String(e))
  }
}

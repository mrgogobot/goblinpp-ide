import appPackage from '../../package.json'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PROVIDERS } from '../ai/providers'
import { comboFromEvent, displayCombo, KEY_ACTIONS } from '../keymap/keymap'
import { dialogs, isTauri, settingsApi, shell } from '../platform/tauri'
import { useAiStore } from '../stores/aiStore'
import { useAppStore } from '../stores/appStore'
import { useKeymapStore } from '../stores/keymapStore'
import { useLanguageStore } from '../stores/languageStore'
import { useProjectStore } from '../stores/projectStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTheme } from '../theme/ThemeContext'
import { THEMES } from '../theme/themes'
import { BackgroundEditor } from './BackgroundDialog'

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: 'Appearance & Behavior', items: [{ id: 'general', label: 'Appearance' }, { id: 'background', label: 'Background Image' }, { id: 'editor', label: 'Editor' }, { id: 'keymap', label: 'Keymap' }] },
  { group: 'Goblin++', items: [{ id: 'goblin-engine', label: 'Engine' }, { id: 'goblin-language', label: 'Language Path' }, { id: 'goblin-evidence', label: 'Evidence & Runs' }, { id: 'goblin-rust', label: 'Inline Rust' }] },
  { group: 'AI Assistant', items: [{ id: 'ai-providers', label: 'Providers' }, { id: 'ai-context', label: 'Context' }] },
  { group: 'System', items: [{ id: 'privacy', label: 'Privacy' }, { id: 'paths', label: 'Paths & Logs' }, { id: 'about', label: 'About' }] },
]

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <div className="settings-field"><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>
}
function SectionTitle({ children }: { children: ReactNode }) { return <h3 style={{ margin: '0 0 16px', fontWeight: 600 }}>{children}</h3> }

function GeneralSection() {
  const { theme, setTheme } = useTheme()
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  return (
    <div>
      <SectionTitle>Appearance</SectionTitle>
      <Field label="Theme" hint="Goblin Merch is the default: charcoal base, deep purple keywords and accents, electric green highlights. All themes switch atomically via CSS tokens.">
        <select className="settings-select" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>{THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </Field>
      <Field label={`UI scale — ${settings.uiScale}%`}>
        <input type="range" min={80} max={150} step={5} value={settings.uiScale} onChange={(e) => update({ uiScale: Number(e.target.value) })} />
      </Field>
      <Field label="Startup">
        <label className="settings-row"><input type="checkbox" checked={settings.reopenLastProject} onChange={(e) => update({ reopenLastProject: e.target.checked })} /> Reopen the last project and its tabs on launch</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={settings.showHiddenFiles} onChange={(e) => { update({ showHiddenFiles: e.target.checked }); void useProjectStore.getState().refresh() }} /> Show hidden files (.goblin, .gitignore…) in the project tree</label>
      </Field>
      <Field label="Background image" hint="Pick any image, fit it to the whole window and fade it with the opacity slider.">
        <button type="button" className="toolbar-btn framed" onClick={() => useAppStore.getState().setSettingsSection('background')}>Open Background Image settings…</button>
      </Field>
    </div>
  )
}

function EditorSection() {
  const prefs = useSettingsStore((s) => s.settings.editor)
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const set = (patch: Partial<typeof prefs>) => update({ editor: { ...prefs, ...patch } })
  return (
    <div>
      <SectionTitle>Editor</SectionTitle>
      <div className="settings-row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <Field label="Font size"><input type="number" value={prefs.fontSize} min={9} max={28} onChange={(e) => set({ fontSize: Number(e.target.value) || 14 })} style={{ width: 80 }} /></Field>
        <Field label="Line height"><input type="number" step={0.05} value={prefs.lineHeight} min={1.1} max={2.2} onChange={(e) => set({ lineHeight: Number(e.target.value) || 1.55 })} style={{ width: 80 }} /></Field>
        <Field label="Tab size" hint="Goblin++ convention is 4 spaces."><input type="number" value={prefs.tabSize} min={1} max={8} onChange={(e) => set({ tabSize: Number(e.target.value) || 4 })} style={{ width: 80 }} /></Field>
        <Field label="Terminal font size"><input type="number" value={settings.terminalFontSize} min={9} max={24} onChange={(e) => update({ terminalFontSize: Number(e.target.value) || 13 })} style={{ width: 80 }} /></Field>
      </div>
      <Field label="Display">
        <label className="settings-row"><input type="checkbox" checked={prefs.ligatures} onChange={(e) => set({ ligatures: e.target.checked })} /> Font ligatures (JetBrains Mono)</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={prefs.bracketColors} onChange={(e) => set({ bracketColors: e.target.checked })} /> Bracket pair colourisation</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={prefs.minimap} onChange={(e) => set({ minimap: e.target.checked })} /> Minimap</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={prefs.wordWrap} onChange={(e) => set({ wordWrap: e.target.checked })} /> Soft wrap</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={prefs.renderWhitespace} onChange={(e) => set({ renderWhitespace: e.target.checked })} /> Render whitespace</label>
      </Field>
      <Field label="Analysis">
        <label className="settings-row"><input type="checkbox" checked={settings.checkOnSave} onChange={(e) => update({ checkOnSave: e.target.checked })} /> Run <code>goblin++ check --json</code> on save (preview only, never creates evidence)</label>
        <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={settings.checkWhileTyping} onChange={(e) => update({ checkWhileTyping: e.target.checked })} /> Also check while typing (uses a scratch copy; skipped for files with imports)</label>
      </Field>
    </div>
  )
}

function EngineSection() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const engine = useLanguageStore((s) => s.engine)
  const resolveEngine = useLanguageStore((s) => s.resolveEngine)
  const [draft, setDraft] = useState(settings.goblinPath)
  useEffect(() => setDraft(settings.goblinPath), [settings.goblinPath])
  const apply = async (p: string) => { update({ goblinPath: p }); await resolveEngine() }
  return (
    <div>
      <SectionTitle>Goblin++ → Engine</SectionTitle>
      <Field label="goblin++ binary" hint="Leave empty for auto: the copy bundled inside this app → ~/.local/bin/goblin++ → PATH. The IDE never rebuilds or modifies the engine.">
        <div className="settings-row" style={{ gap: 6 }}>
          <input style={{ flex: 1, fontFamily: 'var(--font-mono)' }} value={draft} placeholder="auto-detect" onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className="toolbar-btn framed" onClick={async () => { const p = await dialogs.pickFile({ title: 'Select goblin++ binary' }); if (p) { setDraft(p); await apply(p) } }}>Browse…</button>
          <button type="button" className="run-btn" onClick={() => void apply(draft.trim())}>Apply</button>
          <button type="button" className="toolbar-btn framed" onClick={() => { setDraft(''); void apply('') }}>Auto</button>
        </div>
      </Field>
      <div className="kv" style={{ fontSize: 12 }}>
        <span>resolved</span><span className="mono">{engine?.path ?? 'not found'}</span>
        <span>source</span><span>{engine?.source ?? '—'}</span>
        <span>version</span><span>{engine?.version ?? '—'}</span>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Engine contract: the IDE talks to goblin++ exclusively through its CLI (run, check, freeze, verify, revise, status, lineage, audit-ledger, doctor, capabilities). Rust 1.92 is only needed on this machine for <code>run --compile</code>.</p>
    </div>
  )
}

function LanguagePathSection() {
  const languagePath = useLanguageStore((s) => s.languagePath)
  const languageSource = useLanguageStore((s) => s.languageSource)
  const status = useLanguageStore((s) => s.status)
  const version = useLanguageStore((s) => s.manifest?.version)
  const functions = useLanguageStore((s) => s.functions.length)
  const detect = useLanguageStore((s) => s.detect)
  const setLanguagePath = useLanguageStore((s) => s.setLanguagePath)
  const root = useProjectStore((s) => s.root)
  const [draft, setDraft] = useState(languageSource === 'explicit' ? languagePath : '')
  return (
    <div>
      <SectionTitle>Goblin++ → Language Path</SectionTitle>
      <Field label="Language folder" hint="A folder containing manifest.json (grammar, snippets, docs, function registry). The IDE bundles the alpha.45 folder; auto-detection also walks the project folder and its parents for goblin++/ or goblinpp/.">
        <div className="settings-row" style={{ gap: 6 }}>
          <input style={{ flex: 1 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="/path/to/goblin++ (optional)" />
          <button type="button" className="toolbar-btn framed" onClick={async () => { const p = await dialogs.pickFolder('Select the goblin++ language folder'); if (p) setDraft(p) }}>Browse…</button>
          <button type="button" className="run-btn" onClick={() => { setLanguagePath(draft.trim()); void detect(root || undefined) }}>Apply</button>
          <button type="button" className="toolbar-btn framed" onClick={() => { setDraft(''); setLanguagePath(''); void detect(root || undefined) }}>Auto</button>
        </div>
      </Field>
      <div className="kv" style={{ fontSize: 12 }}>
        <span>status</span><span>{status === 'found' ? 'loaded' : status}</span>
        <span>source</span><span>{languageSource || '—'}</span>
        <span>folder</span><span className="mono">{languagePath || '—'}</span>
        <span>version</span><span>{version ?? '—'}</span>
        <span>functions</span><span>{functions}</span>
      </div>
    </div>
  )
}

function EvidenceSection() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  return (
    <div>
      <SectionTitle>Goblin++ → Evidence & Runs</SectionTitle>
      <Field label="Runs root (--runs-root)" hint="Relative to the project root. Empty uses the engine default ./runs. The custody ledger always lives in <project>/.goblin/."><input value={settings.runsRoot} placeholder="runs" onChange={(e) => update({ runsRoot: e.target.value })} style={{ width: 300 }} /></Field>
      <Field label="Default profile when a file has no directive" hint="Informational: goblin++ decides the profile from the file's first directive (GO_PARANOID / COMPLETELY_MAD). The IDE's New File template uses this.">
        <select className="settings-select" value={settings.defaultProfile} onChange={(e) => update({ defaultProfile: e.target.value as typeof settings.defaultProfile })}><option value="everyday">everyday</option><option value="GO_PARANOID">GO_PARANOID</option><option value="COMPLETELY_MAD">COMPLETELY_MAD</option></select>
      </Field>
      <label className="settings-row"><input type="checkbox" checked={settings.autoSaveBeforeRun} onChange={(e) => update({ autoSaveBeforeRun: e.target.checked })} /> Save the file before running</label>
      <label className="settings-row" style={{ marginTop: 6 }}><input type="checkbox" checked={settings.autoVerify} onChange={(e) => update({ autoVerify: e.target.checked })} /> Verify every PASS run automatically</label>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>GO_PARANOID, seal and SHA-256 give byte integrity and reproducibility evidence. They are not confidentiality, encryption, or legal admissibility.</p>
    </div>
  )
}

function InlineRustSection() {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const entries = Object.entries(settings.inlineRustHashes)
  return (
    <div>
      <SectionTitle>Goblin++ → Inline Rust</SectionTitle>
      <Field label="Policy" hint="The engine refuses inline Rust unless run --compile receives the exact block digest. The IDE never passes a digest you did not authorise.">
        <select className="settings-select" value={settings.inlineRustMode} onChange={(e) => update({ inlineRustMode: e.target.value as 'hash' | 'refuse' })}><option value="hash">Require an exact SHA-256 per file (default)</option><option value="refuse">Never pass --allow-inline-rust</option></select>
      </Field>
      <Field label="Authorised digests">
        {entries.length === 0 && <div className="muted">None.</div>}
        {entries.map(([file, hash]) => <div key={file} className="settings-row" style={{ gap: 8, fontSize: 12 }}><span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file}</span><span className="mono muted">{hash.slice(0, 16)}…</span><button type="button" className="toolbar-btn" onClick={() => { const next = { ...settings.inlineRustHashes }; delete next[file]; useSettingsStore.setState((s) => ({ settings: { ...s.settings, inlineRustHashes: next } })); update({}) }}>revoke</button></div>)}
      </Field>
    </div>
  )
}

function AiProvidersSection() {
  const apiKeys = useAiStore((s) => s.apiKeys)
  const setApiKey = useAiStore((s) => s.setApiKey)
  const budgetTokens = useAiStore((s) => s.budgetTokens)
  const setBudgetTokens = useAiStore((s) => s.setBudgetTokens)
  const contextFree = useAiStore((s) => s.contextFree)
  const setContextFree = useAiStore((s) => s.setContextFree)
  return (
    <div>
      <SectionTitle>AI Assistant → Providers</SectionTitle>
      <p className="muted" style={{ marginTop: 0 }}>API keys are kept in memory for this session only and are never written to the project. Without a key the assistant runs in simulated mode.</p>
      {PROVIDERS.filter((p) => p.requiresKey).map((p) => <Field key={p.id} label={p.name}><input type="password" value={apiKeys[p.id] ?? ''} onChange={(e) => setApiKey(p.id, e.target.value)} placeholder="API key" style={{ width: '100%' }} /></Field>)}
      <Field label="Context budget (tokens)"><input type="number" value={budgetTokens} onChange={(e) => setBudgetTokens(Number(e.target.value) || 0)} style={{ width: 140 }} /></Field>
      <Field label="Context-free mode"><label className="settings-row"><input type="checkbox" checked={contextFree} onChange={(e) => setContextFree(e.target.checked)} /> Send only the prompt and a minimal system prompt</label></Field>
    </div>
  )
}

const AI_SOURCES = [['active-file', 'Active file'], ['open-files', 'Open files (first 50 lines)'], ['diagnostics', 'Diagnostics'], ['run-dir', 'Last RUN_DIR summary'], ['seal-ledger', 'Sealed values'], ['freeze-state', 'Freeze state'], ['docs', 'Language reference excerpt']] as const
function AiContextSection() {
  const contextSources = useAiStore((s) => s.contextSources)
  const toggleContextSource = useAiStore((s) => s.toggleContextSource)
  return (
    <div>
      <SectionTitle>AI Assistant → Context</SectionTitle>
      <p className="muted">Sources are added in priority order until the budget is full.</p>
      {AI_SOURCES.map(([id, label]) => <label key={id} className="settings-row" style={{ marginBottom: 6 }}><input type="checkbox" checked={contextSources[id] ?? false} onChange={() => toggleContextSource(id)} /><span>{label}</span></label>)}
    </div>
  )
}

function KeymapSection() {
  const isMac = useKeymapStore((s) => s.isMac)
  const bindings = useKeymapStore((s) => s.bindings)
  const setBinding = useKeymapStore((s) => s.setBinding)
  const reset = useKeymapStore((s) => s.reset)
  const conflictActions = useKeymapStore((s) => s.conflictActions)
  const [capturing, setCapturing] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    if (!capturing) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setCapturing(null); return }
      const combo = comboFromEvent(e)
      if (combo && !combo.endsWith('+') && !['alt', 'ctrl', 'meta', 'shift'].includes(combo)) { setBinding(capturing, combo); setCapturing(null) }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [capturing, setBinding])
  const conflicts = new Set(conflictActions())
  return (
    <div>
      <SectionTitle>Keymap</SectionTitle>
      <div className="settings-row" style={{ justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <input placeholder="filter actions…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }} />
        <span className="muted" style={{ fontSize: 12 }}>Click a binding, then press the new keys (Esc cancels). ⌘N ⌘O ⌘S ⇧⌘S ⌘W live in the macOS menu.</span>
        <button type="button" className="toolbar-btn framed" onClick={reset}>Reset to defaults</button>
      </div>
      <div style={{ fontSize: 12 }}>
        {KEY_ACTIONS.filter((a) => !filter || `${a.group} ${a.label}`.toLowerCase().includes(filter.toLowerCase())).map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>
            <span className="muted" style={{ width: 80 }}>{a.group}</span>
            <span style={{ flex: 1 }}>{a.label}</span>
            <button type="button" className="toolbar-btn" style={{ fontFamily: 'var(--font-mono)', color: conflicts.has(a.id) ? 'var(--error)' : 'var(--accent)' }} onClick={() => setCapturing(a.id)}>{capturing === a.id ? 'press keys…' : displayCombo(bindings[a.id] ?? '', isMac) || '—'}</button>
            {conflicts.has(a.id) && <span style={{ color: 'var(--error)', marginLeft: 6 }} title="Binding conflict">⚠</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function PrivacySection() {
  const contextFree = useAiStore((s) => s.contextFree)
  const setContextFree = useAiStore((s) => s.setContextFree)
  return (
    <div>
      <SectionTitle>Privacy</SectionTitle>
      <label className="settings-row"><input type="checkbox" checked={contextFree} onChange={(e) => setContextFree(e.target.checked)} /> Never send file content, RUN_DIR data or diagnostics to AI providers (context-free mode)</label>
      <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>The IDE makes no network requests of its own. goblin++ runs locally; only the AI assistant contacts a provider, and only when you send a message with a configured key. Evidence folders are never uploaded.</p>
    </div>
  )
}

function PathsSection() {
  const [paths, setPaths] = useState<Record<string, string> | null>(null)
  useEffect(() => { if (isTauri()) settingsApi.appPaths().then((p) => setPaths(p as unknown as Record<string, string>)).catch(() => {}) }, [])
  return (
    <div>
      <SectionTitle>Paths & Logs</SectionTitle>
      {!paths && <div className="muted">Available in the desktop app.</div>}
      {paths && <div className="kv" style={{ fontSize: 12 }}>{Object.entries(paths).map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span>{k.replace(/_/g, ' ')}</span><span className="mono" style={{ wordBreak: 'break-all', cursor: 'pointer' }} onClick={() => void shell.revealInFinder(v)} title="reveal">{v}</span></span>)}</div>}
    </div>
  )
}

function AboutSection() {
  const engine = useLanguageStore((s) => s.engine)
  const manifest = useLanguageStore((s) => s.manifest)
  return (
    <div style={{ textAlign: 'center', paddingTop: 8 }}>
      <img src="/goblinpp-logo.png" alt="" width={96} height={96} />
      <h2 style={{ margin: '12px 0 4px' }}>Goblin++ IDE</h2>
      <div className="muted">v{appPackage.version} · JetBrains-style shell for the Goblin++ scientific language</div>
      <p style={{ fontStyle: 'italic', marginTop: 16 }}>“A Pragmatic Language for Curious Minds; Built on Rust; Ideas Compile Here.”</p>
      <div style={{ marginTop: 20, fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.8 }}>
        <div>Engine · {engine?.version ?? `goblin++ ${manifest?.version ?? ''}`} ({engine?.source ?? 'not found'})</div>
        <div>Language folder · Goblin++ {manifest?.version ?? '—'}</div>
        <div>Engine pins Rust 1.92.0 · IDE shell: Tauri 2 + React + Monaco + xterm.js</div>
        <div>Licences · goblin++ MIT (code) / CC-BY-4.0 (docs) · logo © Malin Hess</div>
      </div>
      <div className="settings-row" style={{ justifyContent: 'center', gap: 8, marginTop: 16 }}>
        <button type="button" className="toolbar-btn framed" onClick={() => void shell.openExternal('https://github.com/mrgogobot/goblinpp')}>GitHub</button>
        <button type="button" className="toolbar-btn framed" onClick={() => void import('../actions').then((m) => m.openDoc('README.md'))}>Engine README</button>
        <button type="button" className="toolbar-btn framed" onClick={() => void import('../actions').then((m) => m.openDoc('CHANGELOG.md'))}>Release notes</button>
      </div>
    </div>
  )
}

export function SettingsDialog() {
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const settingsSection = useAppStore((s) => s.settingsSection)
  const setSettingsSection = useAppStore((s) => s.setSettingsSection)
  const closeSettings = useAppStore((s) => s.closeSettings)
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeSettings() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, closeSettings])
  if (!settingsOpen) return null
  const content = (() => {
    switch (settingsSection) {
      case 'general': return <GeneralSection />
      case 'background': return <div><SectionTitle>Appearance → Background Image</SectionTitle><BackgroundEditor /></div>
      case 'editor': return <EditorSection />
      case 'keymap': return <KeymapSection />
      case 'goblin-engine': return <EngineSection />
      case 'goblin-language': return <LanguagePathSection />
      case 'goblin-evidence': return <EvidenceSection />
      case 'goblin-rust': return <InlineRustSection />
      case 'ai-providers': return <AiProvidersSection />
      case 'ai-context': return <AiContextSection />
      case 'privacy': return <PrivacySection />
      case 'paths': return <PathsSection />
      case 'about': return <AboutSection />
      default: return <GeneralSection />
    }
  })()
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeSettings() }}>
      <div className="settings-dialog" role="dialog" aria-label="Settings">
        <div className="settings-title"><span>Settings</span><button type="button" className="tab-close" onClick={closeSettings} title="Close (Esc)">×</button></div>
        <div className="settings-body">
          <div className="settings-nav">
            {NAV.map((group) => <div key={group.group}><div className="settings-group">{group.group}</div>{group.items.map((item) => <div key={item.id} className={`settings-item${settingsSection === item.id ? ' active' : ''}`} onClick={() => setSettingsSection(item.id)} role="button">{item.label}</div>)}</div>)}
          </div>
          <div className="settings-content">{content}</div>
        </div>
      </div>
    </div>
  )
}

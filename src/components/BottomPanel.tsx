import { useEffect, useMemo, useState } from 'react'
import { runAction } from '../actions'
import { fs, isTauri } from '../platform/tauri'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import type { Diagnostic } from '../stores/editorStore'
import { useEnvironmentStore } from '../stores/environmentStore'
import { useLanguageStore } from '../stores/languageStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { basename, relative } from '../util/path'
import { AIHistoryPanel } from './AIHistoryPanel'
import { EvidencePanel } from './EvidencePanel'
import { RunPanel } from './RunPanel'
import { TerminalPanel } from './TerminalPanel'

const TABS = ['problems', 'run', 'terminal', 'evidence', 'freeze-log', 'audit-ledger', 'structure', 'todo', 'environment', 'function-reference', 'unit-reference', 'diagnostics', 'ai-history'] as const
const TAB_LABELS: Record<string, string> = { problems: 'Problems', diagnostics: 'Diagnostics', run: 'Run', terminal: 'Terminal', evidence: 'Evidence', 'freeze-log': 'Freeze Log', 'audit-ledger': 'Audit Ledger', 'ai-history': 'AI History', structure: 'Structure', todo: 'TODO', environment: 'Environment', 'function-reference': 'Function Reference', 'unit-reference': 'Unit Reference' }
const SEVERITY_RANK = { error: 0, warning: 1, info: 2, hint: 3 } as const

function ProblemsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const openPath = useEditorStore((s) => s.openPath)
  const root = useProjectStore((s) => s.root)
  const sorted = useMemo(() => [...diagnostics].filter((d) => d.severity !== 'hint').sort((a, b) => a.file.localeCompare(b.file) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.line - b.line), [diagnostics])
  if (sorted.length === 0) return <div className="panel-placeholder"><span>✓ No problems in open files.</span><span className="muted" style={{ fontSize: 11 }}>Local preview checks plus <code>goblin++ check --json</code> on save.</span></div>
  return (
    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      {sorted.map((d, i) => (
        <div key={i} className="table-row" onClick={() => void openPath(d.file, { line: d.line, column: d.column })} onDoubleClick={() => void import('../stores/aiStore').then((m) => m.useAiStore.getState().openForFix(d.code, d.message))} title="click: jump · double-click: ask AI">
          <span style={{ color: d.severity === 'error' ? 'var(--error)' : d.severity === 'warning' ? 'var(--warning)' : 'var(--fg-muted)', width: 16 }}>{d.severity === 'error' ? '✖' : d.severity === 'warning' ? '⚠' : 'ℹ'}</span>
          <span className="accent-text" style={{ width: 56 }}>{d.code}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.message}</span>
          <span className="muted">{d.source === 'check' ? 'check · ' : ''}{relative(root, d.file)}:{d.line}</span>
        </div>
      ))}
    </div>
  )
}

function DiagnosticsRegistryPanel() {
  const codes = useLanguageStore((s) => s.diagnosticCodes)
  return (
    <div style={{ fontSize: 12 }}>
      <div className="table-head"><span style={{ width: 60 }}>Code</span><span style={{ width: 70 }}>Severity</span><span style={{ width: 150 }}>Category</span><span style={{ flex: 1 }}>Meaning</span><span style={{ width: 170 }}>See</span></div>
      {codes.map((c) => (
        <div key={c.code} className="table-row">
          <span className="accent-text mono" style={{ width: 60 }}>{c.code}</span>
          <span style={{ width: 70, color: c.severity === 'error' ? 'var(--error)' : c.severity === 'warning' ? 'var(--warning)' : 'var(--fg-muted)' }}>{c.severity}</span>
          <span style={{ width: 150 }} className="muted">{c.category ?? ''}</span>
          <span style={{ flex: 1 }}>{c.message}</span>
          <span style={{ width: 170 }} className="muted link" onClick={() => c.see && void import('../actions').then((m) => m.openDoc(c.see!))}>{c.see ?? ''}</span>
        </div>
      ))}
    </div>
  )
}

function StructurePanel() {
  const activePath = useEditorStore((s) => s.activePath)
  const symbols = useLanguageStore((s) => (activePath ? s.symbolsByPath[activePath] ?? [] : []))
  const openPath = useEditorStore((s) => s.openPath)
  if (!activePath || symbols.length === 0) return <div className="panel-placeholder"><span>No symbols in the active file.</span></div>
  const glyph: Record<string, string> = { function: 'ƒ', directive: '◆', seal: '★', rust: '⚡', variable: '•', import: '⇲', loop: '↻', branch: '⑂' }
  const color: Record<string, string> = { function: 'var(--accent)', directive: 'var(--accent)', seal: 'var(--accent-secondary)', rust: 'var(--warning)', variable: 'var(--fg-muted)', import: 'var(--fg-muted)' }
  const render = (list: typeof symbols, depth: number) => list.map((s, i) => (
    <div key={`${s.line}-${i}`}>
      <div className="tree-row" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => void openPath(activePath, { line: s.line })} title={`line ${s.line}`}>
        <span style={{ width: 16, color: color[s.kind] ?? 'var(--fg-muted)' }}>{glyph[s.kind] ?? '•'}</span>
        <span className="tree-label mono">{s.name}</span>
        {s.detail && <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{s.detail}</span>}
        <span className="muted" style={{ marginLeft: 'auto' }}>{s.line}</span>
      </div>
      {s.children && render(s.children, depth + 1)}
    </div>
  ))
  return <div style={{ fontSize: 12 }}>{render(symbols, 0)}</div>
}

function TodoPanel() {
  const tabs = useEditorStore((s) => s.tabs)
  const root = useProjectStore((s) => s.root)
  const openPath = useEditorStore((s) => s.openPath)
  const [projectHits, setProjectHits] = useState<{ path: string; line: number; text: string }[]>([])
  useEffect(() => {
    if (!root || !isTauri()) return
    fs.search({ root, query: 'TODO', include: ['*.gbl', '*.md'], maxResults: 300 }).then((a) => fs.search({ root, query: 'FIXME', include: ['*.gbl', '*.md'], maxResults: 300 }).then((b) => setProjectHits([...a, ...b].map((m) => ({ path: m.path, line: m.line, text: m.text }))))).catch(() => {})
  }, [root, tabs])
  const openHits = tabs.flatMap((t) => t.content.split('\n').map((l, i) => ({ path: t.path, line: i + 1, text: l })).filter((x) => /\b(TODO|FIXME|HACK|XXX|SEAL:)\b/.test(x.text)))
  const seen = new Set(openHits.map((h) => `${h.path}:${h.line}`))
  const all = [...openHits, ...projectHits.filter((h) => !seen.has(`${h.path}:${h.line}`))]
  if (!all.length) return <div className="panel-placeholder"><span>No TODO / FIXME / HACK / SEAL: comments found.</span></div>
  return <div style={{ fontSize: 12 }}>{all.map((h, i) => <div key={i} className="table-row" onClick={() => void openPath(h.path, { line: h.line })}><span className="accent-text" style={{ width: 60 }}>{/FIXME/.test(h.text) ? 'FIXME' : /HACK/.test(h.text) ? 'HACK' : /SEAL:/.test(h.text) ? 'SEAL' : 'TODO'}</span><span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.text.trim()}</span><span className="muted">{relative(root, h.path)}:{h.line}</span></div>)}</div>
}

function EnvironmentPanel() {
  const checks = useEnvironmentStore((s) => s.checks)
  const status = useEnvironmentStore((s) => s.status)
  const detectedAt = useEnvironmentStore((s) => s.detectedAt)
  const detect = useEnvironmentStore((s) => s.detect)
  useEffect(() => { if (!detectedAt) void detect() }, [detectedAt, detect])
  const report = async () => {
    const json = JSON.stringify({ generatedAt: new Date().toISOString(), checks }, null, 2)
    await navigator.clipboard?.writeText(json)
    const { toast } = await import('../stores/dialogStore')
    toast('success', 'Environment report copied to clipboard')
  }
  return (
    <div style={{ fontSize: 12 }}>
      <div className="subtabs">
        <span className="muted">{status === 'detecting' ? 'detecting…' : `${checks.length} checks · ${detectedAt ? new Date(detectedAt).toLocaleTimeString() : ''}`}</span>
        <span className="grow" />
        <button type="button" className="toolbar-btn" onClick={() => void detect()}>Refresh</button>
        <button type="button" className="toolbar-btn" onClick={() => void report()} disabled={!checks.length}>Copy report (JSON)</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.doctor')}>goblin++ doctor</button>
      </div>
      {checks.map((c) => (
        <div key={c.id} className="table-row" style={{ alignItems: 'flex-start' }}>
          <span style={{ width: 16, color: c.status === 'ok' ? 'var(--accent-secondary)' : c.status === 'warn' ? 'var(--warning)' : 'var(--error)' }}>{c.status === 'ok' ? '✓' : c.status === 'warn' ? '⚠' : '✖'}</span>
          <span style={{ width: 150, color: 'var(--fg-muted)', flexShrink: 0 }}>{c.name}</span>
          <span style={{ flex: 1, wordBreak: 'break-all' }} className={c.id === 'path' ? 'mono' : ''}>{c.detail}</span>
        </div>
      ))}
    </div>
  )
}

function FunctionReferencePanel() {
  const functions = useLanguageStore((s) => s.functions)
  const statements = useLanguageStore((s) => s.statements)
  const [q, setQ] = useState('')
  const [domain, setDomain] = useState('')
  const domains = useMemo(() => [...new Set(functions.map((f) => f.domain))].sort(), [functions])
  const list = useMemo(() => functions.filter((f) => (!domain || f.domain === domain) && (!q || f.name.includes(q.toLowerCase()) || f.description.toLowerCase().includes(q.toLowerCase()))), [functions, q, domain])
  const grouped = useMemo(() => { const m = new Map<string, typeof list>(); for (const f of list) { (m.get(f.domain) ?? m.set(f.domain, []).get(f.domain)!).push(f) } return [...m.entries()] }, [list])
  return (
    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="subtabs">
        <input placeholder="Filter functions…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">All domains ({functions.length})</option>{domains.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        <span className="muted">{list.length} functions · {statements.length} statements</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {!q && !domain && statements.length > 0 && (
          <div>
            <div className="sidebar-section">Statements & directives</div>
            {statements.map((s) => <div key={s.name} className="fn-row"><span className="mono accent-text">{s.name}</span><span className="muted">{s.kind}</span><div className="fn-desc">{s.description}</div></div>)}
          </div>
        )}
        {grouped.map(([d, fns]) => (
          <div key={d}>
            <div className="sidebar-section">{d}</div>
            {fns.map((f) => (
              <div key={f.name} className="fn-row" onDoubleClick={() => void import('../language/monaco').then((m) => m.insertAtCursor(f.signature))} title="double-click to insert at cursor">
                <span className="mono" style={{ color: 'var(--accent-secondary)' }}>{f.signature}</span>
                {f.arrayMath && <span className="muted" style={{ marginLeft: 6 }}>array-math</span>}
                {f.legacy && <span style={{ marginLeft: 6, color: 'var(--warning)' }}>legacy · G302</span>}
                {f.see && <span className="muted link" style={{ marginLeft: 6 }} onClick={() => void import('../actions').then((m) => m.openDoc(f.see!))}>{f.see}</span>}
                <div className="fn-desc">{f.description}</div>
              </div>
            ))}
          </div>
        ))}
        {grouped.length === 0 && <div className="panel-placeholder"><span>No matching functions.</span></div>}
      </div>
    </div>
  )
}

function UnitReferencePanel() {
  const units = useLanguageStore((s) => s.units)
  const constants = useLanguageStore((s) => s.constants)
  const manifest = useLanguageStore((s) => s.manifest)
  return (
    <div style={{ padding: 12, fontSize: 12 }}>
      <div className="muted" style={{ marginBottom: 8 }}>Compound suffix syntax: <code>1.13e-10 m/s^2</code>, <code>3 kg*m^2/s^2</code>, <code>7 kg/(m*s^2)</code>. <code>3 m^2</code> is three square metres; <code>(3 m)^2</code> squares the quantity. Examples: {manifest?.unitExamples.join(', ')}</div>
      <div className="table-head"><span style={{ width: 90 }}>Unit</span><span style={{ width: 140 }}>Dimension</span><span style={{ flex: 1 }}>Detail</span></div>
      {units.map((u) => <div key={u.symbol} className="table-row"><span className="mono" style={{ width: 90, color: 'var(--accent)' }}>{u.symbol}</span><span style={{ width: 140 }}>{u.dimension}</span><span className="muted" style={{ flex: 1 }}>{u.description}</span></div>)}
      {constants.length > 0 && <><div className="sidebar-section" style={{ marginTop: 10 }}>Registered constants (read-only)</div>{constants.map((c) => <div key={c.canonical_id} className="table-row"><span className="mono" style={{ width: 230, color: 'var(--accent)' }}>{c.aliases.join(' · ')}</span><span style={{ flex: 1 }} className="muted">{c.detail ?? c.canonical_id}</span></div>)}</>}
    </div>
  )
}

export function BottomPanel() {
  const activeBottomTab = useAppStore((s) => s.activeBottomTab)
  const setActiveBottomTab = useAppStore((s) => s.setActiveBottomTab)
  const setBottomPanelOpen = useAppStore((s) => s.setBottomPanelOpen)
  const bottomMaximized = useAppStore((s) => s.bottomMaximized)
  const toggleBottomMaximized = useAppStore((s) => s.toggleBottomMaximized)
  const diagnostics = useEditorStore((s) => s.diagnostics)
  const running = useRunStore((s) => s.running)
  const problems = diagnostics.filter((d) => d.severity === 'error' || d.severity === 'warning').length
  const errors = diagnostics.some((d) => d.severity === 'error')

  const content = (() => {
    switch (activeBottomTab) {
      case 'problems': return <ProblemsPanel diagnostics={diagnostics} />
      case 'diagnostics': return <DiagnosticsRegistryPanel />
      case 'run': return <RunPanel />
      case 'evidence': return <EvidencePanel />
      case 'freeze-log': return <EvidencePanel />
      case 'audit-ledger': return <EvidencePanel />
      case 'ai-history': return <AIHistoryPanel />
      case 'structure': return <StructurePanel />
      case 'todo': return <TodoPanel />
      case 'environment': return <EnvironmentPanel />
      case 'function-reference': return <FunctionReferencePanel />
      case 'unit-reference': return <UnitReferencePanel />
      default: return null
    }
  })()

  return (
    <div className="bottom-panel">
      <div className="bottom-tabs" role="tablist" onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('.bottom-tab, button') === null || (e.target as HTMLElement).classList.contains('bottom-tab')) toggleBottomMaximized() }} title="Double-click to maximize / restore">
        {TABS.map((id) => (
          <button key={id} type="button" className={`bottom-tab${activeBottomTab === id ? ' active' : ''}`} role="tab" aria-selected={activeBottomTab === id} onClick={() => setActiveBottomTab(id)}>
            {TAB_LABELS[id]}
            {id === 'problems' && problems > 0 && <span className="count" style={{ color: errors ? 'var(--error)' : 'var(--warning)' }}>{problems}</span>}
            {id === 'run' && running && <span className="count">●</span>}
          </button>
        ))}
        <span className="grow" />
        <button type="button" className="icon-btn" title={bottomMaximized ? 'Restore (⇧⌘↑)' : 'Maximize (⇧⌘↑)'} onClick={toggleBottomMaximized}>{bottomMaximized ? '⤡' : '⤢'}</button>
        <button type="button" className="icon-btn" title="Hide (⌘2)" onClick={() => setBottomPanelOpen(false)}>⌄</button>
      </div>
      <div className="bottom-content">
        {/* The terminal stays mounted so shells survive tab switches. */}
        <TerminalPanel visible={activeBottomTab === 'terminal'} />
        {activeBottomTab !== 'terminal' && content}
      </div>
    </div>
  )
}

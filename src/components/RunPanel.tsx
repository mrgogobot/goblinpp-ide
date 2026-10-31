import { useEffect, useRef, useState } from 'react'

import { runAction } from '../actions'
import { shortHash } from '../run/cli'
import { shell } from '../platform/tauri'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useRunStore } from '../stores/runStore'
import { basename } from '../util/path'

function Pill({ status }: { status: string }) {
  const ok = status === 'PASS'
  const warn = status === 'PARTIAL' || status === 'UNKNOWN'
  return <span className="pill" style={{ background: ok ? 'var(--accent-secondary)' : warn ? 'var(--warning)' : 'var(--error)', color: '#101014' }}>{status}</span>
}

function SummaryCard() {
  const r = useRunStore((s) => s.lastRun)
  const openPath = useEditorStore((s) => s.openPath)
  const selectRunDir = useRunStore((s) => s.selectRunDir)
  const setActiveActivity = useAppStore((s) => s.setActiveActivity)
  const verifyRun = useRunStore((s) => s.verifyRun)
  const [collapsed, setCollapsed] = useState(false)
  if (!r) return null
  const rec = r.receipt
  const seals = rec?.sealed_artifacts ?? []
  const outputs = rec?.generated_artifacts ?? []
  return (
    <div className={`run-summary${collapsed ? ' collapsed' : ''}`}>
      <div className="run-summary-row">
        <Pill status={r.status} />
        <span className="mono" title={r.command}>{basename(r.file)}</span>
        <span className="muted">{r.profile === 'GO_PRIVATE' ? 'private script - no scientific receipt' : r.kind === 'check' ? 'check (preview only, no evidence)' : r.summary.EXECUTION_ENGINE ?? r.kind}</span>
        <span className="muted">{r.profile}</span>
        {r.summary.PARANOID_POSTFLIGHT && <span className="muted">postflight {r.summary.PARANOID_POSTFLIGHT}</span>}
        <span className="muted">{r.durationMs} ms</span>
        {r.runDir && <span className="mono muted" title={r.runDir}>RUN_DIR {basename(r.runDir)}</span>}
        <button type="button" className="run-summary-toggle" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Show run details' : 'Collapse run details'}>{collapsed ? '▸ details' : '▾ details'}</button>
      </div>
      <div className="run-summary-row">
        {r.summary.SOURCE_SHA256 && <span className="muted" title={r.summary.SOURCE_SHA256}>source {shortHash(r.summary.SOURCE_SHA256)}</span>}
        {r.summary.RECEIPT_CORE_SHA256 && <span className="muted" title={r.summary.RECEIPT_CORE_SHA256}>receipt {shortHash(r.summary.RECEIPT_CORE_SHA256)}</span>}
        {r.summary.LEDGER_HEAD_SHA256 && <span className="muted" title={r.summary.LEDGER_HEAD_SHA256}>ledger head {shortHash(r.summary.LEDGER_HEAD_SHA256)}</span>}
        {rec && <span className="muted">{seals.length} seals · {outputs.length} outputs{rec.freeze?.status ? ` · freeze ${rec.freeze.classification ?? rec.freeze.status}` : ''}</span>}
        {r.verify && <span style={{ color: r.verify.verified ? 'var(--accent-secondary)' : 'var(--error)' }}>verify {r.verify.status} ({r.verify.checks.filter((c) => c.pass).length}/{r.verify.checks.length})</span>}
      </div>
      {seals.length > 0 && (
        <div className="run-summary-row seals">
          {seals.map((s) => <span key={s.name} className="seal-chip" title={`${s.path} · ${s.sha256}`} onClick={() => r.runDir && void openPath(`${r.runDir}/${s.path}`)}>★ {s.name} <span className="muted">{shortHash(s.sha256, 8)}</span></span>)}
        </div>
      )}
      {r.error && (
        <div className="run-error">
          <div><strong>{r.error.code}</strong> {r.error.title}</div>
          {r.error.message.split('\n').slice(1).filter(Boolean).slice(0, 6).map((l, i) => <div key={i} className="mono" style={{ whiteSpace: 'pre-wrap' }}>{l}</div>)}
          <div className="settings-row" style={{ gap: 6, marginTop: 6 }}>
            <button type="button" className="toolbar-btn framed" onClick={() => { void import('../stores/aiStore').then((m) => m.useAiStore.getState().openForFix(r.error!.code, r.error!.message)) }}>Diagnose with AI</button>
            {r.status === 'PROTOCOL_VIOLATION' && <button type="button" className="toolbar-btn framed" onClick={() => runAction('run.revise')}>Revise…</button>}
          </div>
        </div>
      )}
      <div className="run-summary-row actions">
        {r.runDir && <button type="button" className="toolbar-btn framed" onClick={() => { selectRunDir(r.runDir); setActiveActivity('evidence') }}>Open RUN_DIR</button>}
        {r.runDir && <button type="button" className="toolbar-btn framed" onClick={() => void verifyRun(r.runDir!)}>Verify</button>}
        {r.runDir && <button type="button" className="toolbar-btn framed" onClick={() => void openPath(`${r.runDir}/receipt.json`)}>receipt.json</button>}
        {r.runDir && <button type="button" className="toolbar-btn framed" onClick={() => void shell.revealInFinder(r.runDir!)}>Finder</button>}
        {r.profile !== 'GO_PRIVATE' && <button type="button" className="toolbar-btn framed" onClick={() => runAction('run.freeze')}>Freeze</button>}
        <button type="button" className="toolbar-btn framed" onClick={() => runAction('run.revise')}>Revise…</button>
      </div>
    </div>
  )
}

export function RunPanel() {
  const output = useRunStore((s) => s.output)
  const running = useRunStore((s) => s.running)
  const awaitingInput = useRunStore((s) => s.awaitingInput)
  const awaitingSecret = useRunStore((s) => s.awaitingSecret)
  const sendInput = useRunStore((s) => s.sendInput)
  const clearOutput = useRunStore((s) => s.clearOutput)
  const [input, setInput] = useState('')
  const [wrap, setWrap] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }, [output, autoScroll])
  useEffect(() => { if (awaitingSecret) setInput('') }, [awaitingSecret])
  useEffect(() => { if (awaitingInput) inputRef.current?.focus() }, [awaitingInput])

  return (
    <div className="run-panel">
      <SummaryCard />
      <div className="run-toolbar">
        {running ? <button type="button" className="run-btn stop" onClick={() => runAction('run.stop')}>■ Stop</button> : <button type="button" className="run-btn" onClick={() => runAction('run.run')}>▶ Run</button>}
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.compile')} disabled={running}>Compile</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.check')} disabled={running}>Check</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.runArgs')} disabled={running}>Args…</button>
        <span className="toolbar-sep" />
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.freeze')} disabled={running}>Freeze</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.verify')} disabled={running}>Verify</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.status')} disabled={running}>Status</button>
        <button type="button" className="toolbar-btn" onClick={() => runAction('run.lineage')} disabled={running}>Lineage</button>
        <span className="grow" />
        <label className="muted settings-row" style={{ fontSize: 11 }}><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> wrap</label>
        <label className="muted settings-row" style={{ fontSize: 11 }}><input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> follow</label>
        <button type="button" className="icon-btn" onClick={clearOutput} title="Clear output">⌫</button>
      </div>
      <div ref={listRef} className={`run-output${wrap ? ' wrap' : ''}`}>
        {output.length === 0 && !running && <div className="muted" style={{ padding: '8px 12px' }}>No output yet. Press ⌃R or the Run button to execute the active .gbl file with the real goblin++ engine.</div>}
        {output.map((line, i) => (
          <div key={i} className={`run-line run-${line.kind}`}>
            <span className="run-time">{line.t}</span>
            <span className="run-text">{line.kind === 'input' ? `› ${line.text}` : line.text}</span>
          </div>
        ))}
        {running && <div className="run-line run-system"><span className="run-time" /><span className="run-text accent-text">⏳ running…</span></div>}
      </div>
      {running && (
        <div className={`run-stdin${awaitingInput ? ' waiting' : ''}`}>
          <span className="muted mono" style={{ fontSize: 11 }}>{awaitingSecret ? 'use the masked secret dialog' : awaitingInput ? 'program is waiting for input()' : 'stdin'}</span>
          <input disabled={awaitingSecret} type={awaitingSecret ? "password" : "text"} ref={inputRef} className="mono" placeholder="type a line and press Enter to send to the program" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void sendInput(input); setInput('') } }} />
        </div>
      )}
    </div>
  )
}

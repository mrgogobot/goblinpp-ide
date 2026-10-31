import { useEffect, useState } from 'react'
import { shortHash } from '../run/cli'
import { fs, shell } from '../platform/tauri'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import type { RunDirInfo } from '../stores/runStore'
import { basename, join } from '../util/path'

type Sub = 'runs' | 'seals' | 'freeze' | 'ledger'

function RunDirDetail({ info }: { info: RunDirInfo }) {
  const openPath = useEditorStore((s) => s.openPath)
  const verifyRun = useRunStore((s) => s.verifyRun)
  const history = useRunStore((s) => s.history)
  const showBottomTab = useAppStore((s) => s.showBottomTab)
  const [files, setFiles] = useState<string[]>([])
  useEffect(() => { fs.listDir(info.path).then((es) => setFiles(es.map((e) => e.name))).catch(() => setFiles([])) }, [info.path])
  const r = info.receipt
  const verify = history.find((h) => h.runDir === info.path)?.verify
  return (
    <div className="evidence-detail">
      <div className="run-summary-row">
        <span className="pill" style={{ background: info.status === 'PASS' ? 'var(--accent-secondary)' : 'var(--error)', color: '#101014' }}>{info.status}</span>
        <span className="mono">{info.name}</span>
      </div>
      <div className="kv">
        <span>source</span><span className="mono">{r?.source?.path ?? '?'} {shortHash(r?.source?.sha256)}</span>
        <span>engine</span><span>{r?.execution?.engine ?? '—'} · {r?.execution_profile ?? ''}</span>
        <span>started</span><span>{r?.started ?? '—'}</span>
        <span>receipt core</span><span className="mono">{shortHash(r?.receipt_core_sha256, 16)}</span>
        <span>ledger</span><span>{r?.ledger?.status ?? '—'} · {r?.ledger?.event_count ?? 0} events</span>
        <span>freeze</span><span>{r?.freeze?.classification ?? r?.freeze?.status ?? '—'}</span>
        {r?.paranoid_postflight && <><span>postflight</span><span>{r.paranoid_postflight.status}</span></>}
        {r?.final_state?.requested && <><span>final state</span><span>{r.final_state.capture_status}</span></>}
        {r?.failure && <><span>failure</span><span style={{ color: 'var(--error)' }}>{r.failure.code} {r.failure.message?.split('\n')[0]}</span></>}
        {r?.protocol_violation && <><span>violation</span><span style={{ color: 'var(--error)' }}>{r.protocol_violation.classification} {r.protocol_violation.message}</span></>}
        {verify && <><span>verify</span><span style={{ color: verify.verified ? 'var(--accent-secondary)' : 'var(--error)' }}>{verify.status} · {verify.checks.filter((c) => c.pass).length}/{verify.checks.length} checks</span></>}
      </div>
      {(r?.sealed_artifacts?.length ?? 0) > 0 && (
        <>
          <div className="sidebar-section">Sealed values</div>
          <div className="run-summary-row seals">{r!.sealed_artifacts!.map((s) => <span key={s.name} className="seal-chip" title={s.sha256} onClick={() => void openPath(join(info.path, s.path))}>★ {s.name} <span className="muted">{shortHash(s.sha256, 8)}</span></span>)}</div>
        </>
      )}
      {(r?.generated_artifacts?.length ?? 0) > 0 && (
        <>
          <div className="sidebar-section">Generated outputs</div>
          {r!.generated_artifacts!.map((g, i) => <div key={i} className="tree-row" onClick={() => { const p = String(g.path ?? g.name ?? ''); if (p) void openPath(join(info.path, p)) }}><span className="tree-label mono">{String(g.path ?? g.name ?? JSON.stringify(g))}</span></div>)}
        </>
      )}
      <div className="sidebar-section">Files</div>
      {files.map((f) => <div key={f} className="tree-row" onClick={() => void openPath(join(info.path, f))}><span className="tree-label mono">{f}</span></div>)}
      <div className="settings-row" style={{ gap: 6, padding: '8px 0', flexWrap: 'wrap' }}>
        <button type="button" className="run-btn" onClick={() => { showBottomTab('run'); void verifyRun(info.path) }}>Verify</button>
        <button type="button" className="toolbar-btn framed" onClick={() => void openPath(join(info.path, 'receipt.json'))}>receipt.json</button>
        <button type="button" className="toolbar-btn framed" onClick={() => void shell.revealInFinder(info.path)}>Finder</button>
        {verify && !verify.verified && <span className="muted" style={{ fontSize: 11 }}>failing: {verify.checks.filter((c) => !c.pass).map((c) => c.check).join(', ')}</span>}
      </div>
    </div>
  )
}

export function EvidencePanel({ compact = false }: { compact?: boolean }) {
  const runDirs = useRunStore((s) => s.runDirs)
  const scannedAt = useRunStore((s) => s.runDirsScannedAt)
  const scanRuns = useRunStore((s) => s.scanRuns)
  const selectedRunDir = useRunStore((s) => s.selectedRunDir)
  const selectRunDir = useRunStore((s) => s.selectRunDir)
  const freezeLog = useRunStore((s) => s.freezeLog)
  const fileStatus = useRunStore((s) => s.fileStatus)
  const audit = useRunStore((s) => s.auditLedger)
  const auditRefresh = useRunStore((s) => s.auditLedgerRefresh)
  const diffRuns = useRunStore((s) => s.diffRuns)
  const root = useProjectStore((s) => s.root)
  const showBottomTab = useAppStore((s) => s.showBottomTab)
  const [tab, setTab] = useState<Sub>('runs')
  const [diffA, setDiffA] = useState<string | null>(null)

  useEffect(() => { if (root && !scannedAt) void scanRuns() }, [root, scannedAt, scanRuns])
  const selected = runDirs.find((r) => r.path === selectedRunDir) ?? null
  const seals = runDirs.flatMap((r) => (r.receipt?.sealed_artifacts ?? []).map((s) => ({ ...s, run: r })))

  if (!root) return <div className="panel-placeholder"><span>Open a project to browse its RUN_DIRs, seals and custody ledger.</span></div>

  return (
    <div className="evidence" style={{ display: 'flex', flexDirection: compact ? 'column' : 'row', height: '100%', minHeight: 0 }}>
      <div style={{ flex: compact ? '0 0 auto' : '0 0 46%', display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: compact ? 'none' : '1px solid var(--border)', maxHeight: compact ? '55%' : undefined }}>
        <div className="subtabs">
          {([['runs', `RUN_DIRs (${runDirs.length})`], ['seals', `Seals (${seals.length})`], ['freeze', 'Freeze log'], ['ledger', 'Custody ledger']] as const).map(([id, label]) => (
            <button key={id} type="button" className={`subtab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{label}</button>
          ))}
          <span className="grow" />
          <button type="button" className="icon-btn" title="Rescan" onClick={() => { void scanRuns(); void auditRefresh(false) }}>⟳</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
          {tab === 'runs' && (
            <>
              {runDirs.length === 0 && <div className="muted" style={{ padding: 10 }}>No RUN_DIRs under runs/ yet. Every goblin++ run (including refusals) creates one.</div>}
              {runDirs.map((r) => (
                <div key={r.path} className={`tree-row evidence-run${selectedRunDir === r.path ? ' selected' : ''}`} onClick={() => selectRunDir(r.path)} onContextMenu={(e) => { e.preventDefault(); if (!diffA) setDiffA(r.path); else { showBottomTab('run'); void diffRuns(diffA, r.path); setDiffA(null) } }} title={diffA ? `right-click to diff against ${basename(diffA)}` : 'right-click twice on two runs to diff them'}>
                  <span className="status-dot" style={{ background: r.status === 'PASS' ? 'var(--accent-secondary)' : r.status === 'UNKNOWN' ? 'var(--fg-muted)' : 'var(--error)' }} />
                  <span className="tree-label mono" style={{ flex: 1 }}>{r.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{basename(r.source)} · {r.seals}★ · {r.engine.replace('rust-', '')}</span>
                </div>
              ))}
              {diffA && <div className="muted" style={{ padding: 8 }}>diff: first run {basename(diffA)} selected — right-click a second run. <button type="button" className="toolbar-btn" onClick={() => setDiffA(null)}>cancel</button></div>}
            </>
          )}
          {tab === 'seals' && (
            <>
              <div className="table-head"><span style={{ width: 110 }}>Name</span><span style={{ flex: 1 }}>SHA-256</span><span style={{ width: 150 }}>RUN_DIR</span></div>
              {seals.map((s, i) => (
                <div key={i} className="table-row" onClick={() => selectRunDir(s.run.path)} title="click: select run · double-click: copy hash" onDoubleClick={() => void navigator.clipboard?.writeText(s.sha256)}>
                  <span style={{ width: 110 }} className="accent-text">★ {s.name}</span>
                  <span style={{ flex: 1 }} className="mono">{shortHash(s.sha256, 20)}</span>
                  <span style={{ width: 150 }} className="muted mono">{s.run.name.slice(0, 15)}</span>
                </div>
              ))}
              {seals.length === 0 && <div className="muted" style={{ padding: 10 }}>No sealed values yet. Add <code>seal name</code> statements and run.</div>}
            </>
          )}
          {tab === 'freeze' && (
            <>
              {Object.values(fileStatus).filter((f) => f.frozen).map((f) => <div key={f.file} className="table-row"><span>🔒 {basename(f.file)}</span><span className="muted">{f.state}</span><span className="mono muted">{shortHash(f.sourceSha256)}</span></div>)}
              {freezeLog.length === 0 && <div className="muted" style={{ padding: 10 }}>freeze / revise / verify / run events of this session appear here.</div>}
              {freezeLog.map((e, i) => (
                <div key={i} className="table-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <span><span style={{ color: e.ok ? 'var(--accent-secondary)' : 'var(--error)', fontWeight: 700 }}>{e.type.toUpperCase()}</span> {e.file ? basename(e.file) : ''} <span className="muted">{e.detail ?? ''}</span></span>
                  <span className="muted" style={{ fontSize: 10 }}>{e.at}{e.hash ? ` · ${shortHash(e.hash)}` : ''}{e.reason ? ` · ${e.reason}` : ''}</span>
                </div>
              ))}
            </>
          )}
          {tab === 'ledger' && (
            <div style={{ padding: 10 }}>
              {!audit && <div className="muted">Not audited yet in this session.</div>}
              {audit && (
                <div className="kv">
                  <span>status</span><span style={{ color: audit.status === 'PASS' ? 'var(--accent-secondary)' : 'var(--error)', fontWeight: 700 }}>{audit.status}</span>
                  <span>events</span><span>{audit.events}</span>
                  <span>head</span><span className="mono">{shortHash(audit.head, 20)}</span>
                  <span>auth</span><span>{audit.detail || 'CHECKSUM_ONLY'}</span>
                  <span>ledger</span><span className="mono" style={{ wordBreak: 'break-all' }}>{audit.path || join(root, '.goblin/custody-ledger.jsonl')}</span>
                </div>
              )}
              <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>HASH CHAIN VERIFIED means byte integrity only; authorship is not authenticated and nothing here is encryption or legal admissibility.</div>
              <div className="settings-row" style={{ gap: 6, marginTop: 8 }}>
                <button type="button" className="toolbar-btn framed" onClick={() => { showBottomTab('run'); void auditRefresh(true) }}>Run audit-ledger</button>
                <button type="button" className="toolbar-btn framed" onClick={() => void useEditorStore.getState().openPath(join(root, '.goblin/custody-ledger.jsonl'))}>Open ledger</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0, fontSize: 12 }}>
        {selected ? <RunDirDetail info={selected} /> : <div className="panel-placeholder"><span className="title">Select a RUN_DIR</span><span>Receipt, sealed artifacts, outputs and verification live here.</span></div>}
      </div>
    </div>
  )
}

import { SecretFrames, isPrivateSource, secretValidation } from '../run/secretInput'
/*
 * Runs the real `goblin++` engine. Program output streams into the Run panel;
 * the trailing KEY=VALUE summary and RUN_DIR/receipt.json feed the summary card,
 * the Evidence panel and the freeze/verify workflow.
 */
import { create } from 'zustand'
import { parseGoblinError, parseSummary, profileOf, resultKind, splitProgramOutput, statusFromSummary } from '../run/cli'
import type { Profile, Receipt, RunStatus, Summary } from '../run/cli'
import { fs, isTauri, proc } from '../platform/tauri'
import type { ProcExitEvent, ProcOutputEvent } from '../platform/tauri'
import { basename, dirname, isUntitled, join } from '../util/path'
import { confirmDialog, promptDialog, toast, cancelSecretDialogs } from './dialogStore'
import { useEditorStore } from './editorStore'
import { useLanguageStore } from './languageStore'
import { useProjectStore } from './projectStore'
import { getSettings, useSettingsStore } from './settingsStore'

export type RunKind = 'run' | 'compile' | 'check'

export interface OutputLine { t: string; kind: 'stdout' | 'stderr' | 'system' | 'input' | 'summary'; text: string }

export interface RunRecord {
  id: string
  file: string
  cwd: string
  command: string
  kind: RunKind | 'subcommand'
  status: RunStatus
  summary: Summary
  receipt: Receipt | null
  runDir: string | null // absolute
  error: { code: string; title: string; message: string } | null
  profile: Profile
  at: string
  durationMs: number
  exitCode: number | null
  verify?: { verified: boolean; status: string; checks: { check: string; pass: boolean; detail?: string }[]; at: string }
}

export interface RunDirInfo {
  path: string
  name: string
  modifiedMs: number
  receipt: Receipt | null
  source: string
  status: string
  seals: number
  outputs: number
  profile: string
  engine: string
}

export interface FreezeEvent { type: 'freeze' | 'revise' | 'verify' | 'run' | 'status'; file?: string; hash?: string; reason?: string; at: string; detail?: string; ok: boolean }
export interface FileStatus { file: string; state: string; frozen: boolean; classification?: string; sourceSha256?: string; receiptPath?: string; at: number }

export interface RunConfig {
  id: string
  name: string
  kind: 'interpreter' | 'compiled' | 'check' | 'subcommand'
  file?: string
  args: string[]
  programArgs: string[]
  autoVerify: boolean
}

const stamp = () => new Date().toLocaleTimeString('en-GB', { hour12: false })
const uid = () => Math.random().toString(36).slice(2, 10)

interface RunState {
  output: OutputLine[]
  running: boolean
  currentProcId: string | null
  currentCommand: string | null
  awaitingInput: boolean
  awaitingSecret: boolean
  lastRun: RunRecord | null
  history: RunRecord[]
  runDirs: RunDirInfo[]
  runDirsScannedAt: number
  freezeLog: FreezeEvent[]
  fileStatus: Record<string, FileStatus>
  auditLedger: { status: string; events: number; head: string; path: string; detail: string; at: number } | null
  selectedRunDir: string | null
  runConfigOpen: boolean
  inlineRustAuthOpen: boolean
  inlineRustHashes: string[]
  programArgsByFile: Record<string, string>
  configs: RunConfig[]
  activeConfigId: string

  enginePath: () => string | null
  run: (kind: RunKind, opts?: { file?: string; programArgs?: string[]; silent?: boolean }) => Promise<RunRecord | null>
  runWithArgs: () => Promise<void>
  stop: () => Promise<void>
  sendInput: (text: string) => Promise<void>
  runSubcommand: (args: string[], opts?: { cwd?: string; label?: string; file?: string }) => Promise<{ code: number | null; stdout: string; stderr: string }>
  freezeCurrent: () => Promise<void>
  verifyRun: (runDir: string) => Promise<void>
  revise: () => Promise<void>
  refreshStatus: (file: string) => Promise<FileStatus | null>
  lineage: (file?: string) => Promise<void>
  auditLedgerRefresh: (show?: boolean) => Promise<void>
  doctor: () => Promise<void>
  capabilities: () => Promise<void>
  scanRuns: () => Promise<void>
  selectRunDir: (d: string | null) => void
  clearOutput: () => void
  setRunConfigOpen: (v: boolean) => void
  setInlineRustAuthOpen: (v: boolean) => void
  openInlineRustAuth: () => Promise<void>
  authoriseRust: (hash: string) => void
  setActiveConfig: (id: string) => void
  diffRuns: (a: string, b: string) => Promise<void>
}

function cwdFor(file: string): string {
  const root = useProjectStore.getState().root
  if (root && file.startsWith(root + '/')) return root
  return dirname(file)
}

function absRunDir(cwd: string, runDir: string | undefined): string | null {
  if (!runDir) return null
  if (runDir.startsWith('/')) return runDir
  return join(cwd, runDir.replace(/^\.\//, ''))
}

let listenersReady = false
let stdoutBuf = ''
let stderrBuf = ''
let collected = { stdout: '', stderr: '' }
let secretFrames = new SecretFrames()

async function ensureListeners(set: (fn: (s: RunState) => Partial<RunState>) => void, get: () => RunState) {
  if (listenersReady || !isTauri()) return
  listenersReady = true
  const push = (kind: OutputLine['kind'], text: string) => set((s) => ({ output: [...s.output, { t: stamp(), kind, text }] }))
  const flush = (stream: 'stdout' | 'stderr', data: string, final = false) => {
    let buf = (stream === 'stdout' ? stdoutBuf : stderrBuf) + data
    const lines = buf.split('\n')
    buf = final ? '' : lines.pop() ?? ''
    if (final && lines[lines.length - 1] === '') lines.pop()
    for (const line of lines) push(stream, line)
    if (stream === 'stdout') stdoutBuf = buf
    else stderrBuf = buf
    // A prompt without newline (input()) — surface it so the user can answer.
    if (!final && buf.trim()) {
      set(() => ({ awaitingInput: true }))
      push(stream, buf)
      if (stream === 'stdout') stdoutBuf = ''
      else stderrBuf = ''
    }
  }
  await proc.onOutput((e: ProcOutputEvent) => {
    if (e.id !== get().currentProcId) return
    if (e.stream === 'stdout') {collected.stdout += e.data;flush('stdout',e.data);return}
    for (const frame of secretFrames.push(e.data)) {
      if(frame.kind==='text'){collected.stderr += frame.text;flush('stderr',frame.text)}
      else if(frame.kind==='invalid'){void proc.closeStdin(e.id).catch(()=>{});push('stderr','Invalid secret-input request; stdin closed.')}
      else {
        set(()=>({awaitingSecret:true,awaitingInput:false}))
        void promptDialog('Goblin++ secret input',{secret:true,owner:e.id,message:frame.prompt,validate:secretValidation}).then(async answer=>{
          if(get().currentProcId!==e.id)return
          try {
            if(answer===null || secretValidation(answer))await proc.closeStdin(e.id)
            else await proc.write(e.id,answer+'\n')
          } catch { /* Child reports a redacted error. Never log the answer. */ }
          finally {if(get().currentProcId===e.id)set(()=>({awaitingSecret:false}))}
        })
      }
    }
  })
  await proc.onExit((e: ProcExitEvent) => {
    if (e.id !== get().currentProcId) return
    cancelSecretDialogs(e.id)
    for(const frame of secretFrames.push('',true))if(frame.kind==='text'){collected.stderr+=frame.text;flush('stderr',frame.text)}
    flush('stdout', '', true)
    flush('stderr', '', true)
    exitResolvers.get(e.id)?.(e)
    exitResolvers.delete(e.id)
  })
}
const exitResolvers = new Map<string, (e: ProcExitEvent) => void>()

export const useRunStore = create<RunState>((set, get) => ({
  output: [],
  running: false,
  currentProcId: null,
  currentCommand: null,
  awaitingInput: false,
  awaitingSecret: false,
  lastRun: null,
  history: [],
  runDirs: [],
  runDirsScannedAt: 0,
  freezeLog: [],
  fileStatus: {},
  auditLedger: null,
  selectedRunDir: null,
  runConfigOpen: false,
  inlineRustAuthOpen: false,
  inlineRustHashes: [],
  programArgsByFile: {},
  configs: [
    { id: 'interpreter', name: 'Run (reference interpreter)', kind: 'interpreter', args: [], programArgs: [], autoVerify: false },
    { id: 'compiled', name: 'Run --compile (native)', kind: 'compiled', args: ['--compile'], programArgs: [], autoVerify: false },
    { id: 'check', name: 'Check (preview only)', kind: 'check', args: [], programArgs: [], autoVerify: false },
    { id: 'doctor', name: 'goblin++ doctor', kind: 'subcommand', args: ['doctor'], programArgs: [], autoVerify: false },
    { id: 'capabilities', name: 'goblin++ capabilities', kind: 'subcommand', args: ['capabilities'], programArgs: [], autoVerify: false },
    { id: 'audit', name: 'goblin++ audit-ledger', kind: 'subcommand', args: ['audit-ledger'], programArgs: [], autoVerify: false },
  ],
  activeConfigId: 'interpreter',

  enginePath: () => useLanguageStore.getState().engine?.path ?? null,

  run: async (kind, opts = {}) => {
    if (!isTauri()) { toast('warning', 'Desktop app required', 'Running goblin++ needs the desktop application.'); return null }
    const editor = useEditorStore.getState()
    const file = opts.file ?? editor.activePath
    if (!file) { toast('info', 'Nothing to run', 'Open a .gbl file first.'); return null }
    if (isUntitled(file)) {
      const saved = await editor.saveAs(file)
      if (!saved) return null
      return get().run(kind, { ...opts, file: saved })
    }
    if (!file.endsWith('.gbl')) { toast('info', 'Not a Goblin++ file', `${basename(file)} is not a .gbl program.`); return null }
    if (get().running) { toast('warning', 'Already running', 'Stop the current run first.'); return null }
    const engine = get().enginePath()
    if (!engine) { toast('error', 'goblin++ not found', 'Set the engine path in Settings → Goblin++ → Engine.'); return null }

    const tab = editor.tabs.find((t) => t.path === file)
    if (tab && tab.content !== tab.savedContent) {
      if (getSettings().autoSaveBeforeRun) await editor.save(file)
      else {
        const r = await confirmDialog('Unsaved changes', `${tab.name} has unsaved changes. goblin++ runs the file on disk. Save first?`, { ok: 'Save and run', cancel: 'Cancel', third: 'Run saved version' })
        if (r === 'cancel') return null
        if (r === 'ok') await editor.save(file)
      }
    }

    await ensureListeners(set, get)
    const settings = getSettings()
    const source = await fs.readText(file)
    const privateRun = isPrivateSource(source)
    const cwd = cwdFor(file)
    if(privateRun){
      try {
        const caps=JSON.parse((await proc.run(engine,['capabilities','--json'],cwd)).stdout)
        if(!caps.confidential_functions?.includes('input_secret') || typeof caps.confidential_code_profile!=='string' || !caps.confidential_code_profile.includes('GO_PRIVATE'))throw new Error('unsupported')
      }catch{toast('error','Alpha.43 engine required','Private scripts need a matching Goblin++ executable. No source was run.');return null}
    }
    const rel = file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
    const args: string[] = []
    if (kind === 'check') args.push('check', rel)
    else {
      args.push('run', rel)
      if (kind === 'compile') args.push('--compile')
      const hash = settings.inlineRustHashes[file]
      const analysis = useLanguageStore.getState().analysisByPath[file]
      if (kind === 'compile' && analysis?.hasInlineRust && hash) args.push('--allow-inline-rust', hash)
      if (!privateRun && settings.runsRoot) args.push('--runs-root', settings.runsRoot)
      const programArgs = opts.programArgs ?? (get().programArgsByFile[file] ? get().programArgsByFile[file].split(/\s+/).filter(Boolean) : [])
      if (programArgs.length) args.push('--', ...programArgs)
    }
    const id = `run-${uid()}`
    const command = `goblin++ ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`
    secretFrames = new SecretFrames()
    collected = { stdout: '', stderr: '' }
    stdoutBuf = ''
    stderrBuf = ''
    set({ running: true, currentProcId: id, currentCommand: command, awaitingInput: false, awaitingSecret: false, output: [{ t: stamp(), kind: 'system', text: `$ ${command}` }, { t: stamp(), kind: 'system', text: `cwd ${cwd}` }] })
    const started = Date.now()
    const exitPromise = new Promise<ProcExitEvent>((resolve) => exitResolvers.set(id, resolve))
    try {
      await proc.spawn(id, engine, args, cwd, { GOBLIN_SECRET_PROMPT_PROTOCOL: 'hex-v1' })
    } catch (e) {
      set((s) => ({ running: false, currentProcId: null, output: [...s.output, { t: stamp(), kind: 'stderr', text: String(e) }] }))
      return null
    }
    const exit = await exitPromise
    const stdout = collected.stdout
    const stderr = collected.stderr
    const summary = parseSummary(stdout + '\n' + stderr)
    if(privateRun){
      for(const key of Object.keys(summary))if(!['RUN_STATUS','CHECK_STATUS','COMPILE_STATUS'].includes(key))delete summary[key]
      summary.EXECUTION_PROFILE='GO_PRIVATE';summary.CONFIDENTIAL_OPERATION='NO_RUN_RECEIPT'
    }
    const status = statusFromSummary(summary, exit.code, stdout + '\n' + stderr)
    const err = parseGoblinError(stderr) ?? parseGoblinError(stdout)
    const runDir = privateRun ? null : absRunDir(cwd, summary.RUN_DIR)
    let receipt: Receipt | null = null
    if (runDir) {
      try { receipt = JSON.parse(await fs.readText(join(runDir, 'receipt.json'))) as Receipt } catch { receipt = null }
    }
    const record: RunRecord = { id, file, cwd, command, kind, status, summary, receipt, runDir, error: err ? { code: err.code, title: err.title, message: err.message } : null, profile: privateRun ? 'GO_PRIVATE' : profileOf(receipt, source), at: new Date().toISOString(), durationMs: Date.now() - started, exitCode: exit.code }
    const k = resultKind(stdout, stderr, exit.code)
    const label = kind === 'check' ? (status === 'PASS' ? 'check PASS (preview only, no evidence)' : `check ${status}`) : `${status}${runDir ? ` · RUN_DIR ${summary.RUN_DIR}` : ''} · ${record.durationMs} ms · exit ${exit.code ?? (exit.signal != null ? `signal ${exit.signal}` : '?')}`
    set((s) => ({
      running: false, currentProcId: null, awaitingInput: false, awaitingSecret: false, lastRun: record,
      history: [record, ...s.history].slice(0, 200),
      output: [...s.output, { t: stamp(), kind: k === 'pass' ? 'system' : 'stderr', text: label }],
      freezeLog: privateRun || kind === 'check' ? s.freezeLog : [{ type: 'run' as const, file, hash: summary.SOURCE_SHA256, at: record.at, detail: `${status} ${summary.RUN_DIR ?? ''}`.trim(), ok: status === 'PASS' }, ...s.freezeLog].slice(0, 500),
    }))
    if (k === 'protocol-violation') toast('error', 'Protocol violation', err?.title ?? 'Frozen source changed or custody breach. The refusal is preserved as a verifiable run.')
    else if (k === 'machinery-failure' && !opts.silent) toast('error', `${err?.code ?? 'Run failed'}`, err?.title)
    if (!privateRun) {void get().refreshStatus(file);void get().scanRuns()}
    void useProjectStore.getState().refresh()
    if (kind !== 'check' && runDir && status === 'PASS' && settings.autoVerify) await get().verifyRun(runDir)
    return record
  },

  runWithArgs: async () => {
    const file = useEditorStore.getState().activePath
    if (!file) return
    const current = get().programArgsByFile[file] ?? ''
    const v = await promptDialog('Program arguments', { message: 'Space-separated arguments passed after "--" (available as argc / argv).', defaultValue: current, placeholder: 'e.g. 42 "two words"', ok: 'Run' })
    if (v === null) return
    set((s) => ({ programArgsByFile: { ...s.programArgsByFile, [file]: v } }))
    await get().run('run', { file, programArgs: v.match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) ?? [] })
  },

  stop: async () => {
    const id = get().currentProcId
    if (!id) return
    try { await proc.kill(id) } catch { /* ignore */ }
    set((s) => ({ output: [...s.output, { t: stamp(), kind: 'system', text: 'process stopped by user' }] }))
  },

  sendInput: async (text) => {
    const id = get().currentProcId
    if (!id || get().awaitingSecret) return
    set((s) => ({ awaitingInput: false, output: [...s.output, { t: stamp(), kind: 'input', text }] }))
    try { await proc.write(id, text + '\n') } catch (e) { toast('error', 'stdin closed', String(e)) }
  },

  runSubcommand: async (args, opts = {}) => {
    const engine = get().enginePath()
    if (!engine || !isTauri()) { toast('error', 'goblin++ not found', 'Set the engine path in Settings → Goblin++ → Engine.'); return { code: null, stdout: '', stderr: '' } }
    const cwd = opts.cwd ?? (opts.file ? cwdFor(opts.file) : useProjectStore.getState().root || undefined)
    const command = `goblin++ ${args.join(' ')}`
    set((s) => ({ output: [...s.output, { t: stamp(), kind: 'system', text: `$ ${command}` }] }))
    try {
      const r = await proc.run(engine, args, cwd)
      const lines: OutputLine[] = []
      for (const l of r.stdout.split('\n')) if (l.length) lines.push({ t: stamp(), kind: 'stdout', text: l })
      for (const l of r.stderr.split('\n')) if (l.length) lines.push({ t: stamp(), kind: 'stderr', text: l })
      lines.push({ t: stamp(), kind: r.code === 0 ? 'system' : 'stderr', text: `${opts.label ?? args[0]}: exit ${r.code ?? '?'} · ${r.duration_ms} ms` })
      set((s) => ({ output: [...s.output, ...lines] }))
      return { code: r.code, stdout: r.stdout, stderr: r.stderr }
    } catch (e) {
      set((s) => ({ output: [...s.output, { t: stamp(), kind: 'stderr', text: String(e) }] }))
      return { code: null, stdout: '', stderr: String(e) }
    }
  },

  freezeCurrent: async () => {
    const editor = useEditorStore.getState()
    const file = editor.activePath
    if (!file || isUntitled(file) || !file.endsWith('.gbl')) { toast('info', 'Freeze', 'Open a saved .gbl file to freeze it.'); return }
    const tab = editor.tabs.find((t) => t.path === file)
    if (tab && tab.content !== tab.savedContent) await editor.save(file)
    const cwd = cwdFor(file)
    const rel = file.slice(cwd.length + 1)
    const r = await get().runSubcommand(['freeze', rel, '--json'], { cwd, label: 'freeze', file })
    let hash: string | undefined
    try {
      const j = JSON.parse(r.stdout) as { receipt?: { source?: { sha256?: string }; source_sha256?: string } }
      hash = j.receipt?.source?.sha256 ?? j.receipt?.source_sha256
    } catch { /* text output */ }
    const ok = r.code === 0
    set((s) => ({ freezeLog: [{ type: 'freeze', file, hash, at: new Date().toISOString(), ok, detail: ok ? `${basename(file)}.freeze.json written` : (parseGoblinError(r.stderr)?.title ?? r.stderr.trim().split('\n')[0]) }, ...s.freezeLog] }))
    if (ok) toast('success', 'Frozen', `${basename(file)} is frozen. Edits now fail at run time — use Revise to create a child version.`)
    else toast('error', 'Freeze failed', parseGoblinError(r.stderr)?.title ?? r.stderr.trim().split('\n')[0])
    await get().refreshStatus(file)
    editor.setFrozen(file, ok || (get().fileStatus[file]?.frozen ?? false))
    void useProjectStore.getState().refresh()
  },

  verifyRun: async (runDir) => {
    const cwd = dirname(dirname(runDir))
    const r = await get().runSubcommand(['verify', runDir, '--json'], { cwd, label: 'verify' })
    let verified = r.code === 0
    let status = verified ? 'PASS' : 'FAIL'
    let checks: { check: string; pass: boolean; detail?: string }[] = []
    try {
      const j = JSON.parse(r.stdout) as { verified?: boolean; status?: string; checks?: { check: string; pass: boolean; detail?: string }[] }
      verified = !!j.verified
      status = j.status ?? status
      checks = j.checks ?? []
    } catch { /* text */ }
    const at = new Date().toISOString()
    set((s) => ({
      history: s.history.map((h) => (h.runDir === runDir ? { ...h, verify: { verified, status, checks, at } } : h)),
      lastRun: s.lastRun?.runDir === runDir ? { ...s.lastRun, verify: { verified, status, checks, at } } : s.lastRun,
      freezeLog: [{ type: 'verify', file: basename(runDir), at, ok: verified, detail: `${status} · ${checks.filter((c) => c.pass).length}/${checks.length} checks` }, ...s.freezeLog],
    }))
    const failing = checks.filter((c) => !c.pass)
    if (verified) toast('success', 'Verified', `${basename(runDir)} — ${checks.length} checks PASS`)
    else toast('error', 'Verification failed', failing.map((c) => c.check).slice(0, 4).join(', ') || status)
    const src = get().history.find((h) => h.runDir === runDir)?.file
    if (src) useEditorStore.getState().setVerifyFailed(src, !verified)
  },

  revise: async () => {
    const editor = useEditorStore.getState()
    const file = editor.activePath
    if (!file || isUntitled(file) || !file.endsWith('.gbl')) return
    const suggested = basename(file).replace(/(_R(\d+))?\.gbl$/, (_m, _g, n) => `_R${n ? Number(n) + 1 : 1}.gbl`)
    const child = await promptDialog('Create child revision', { message: 'Name of the new revision (created next to the parent).', defaultValue: suggested, ok: 'Next' })
    if (!child) return
    const reason = await promptDialog('Reason for the revision', { message: 'Recorded in the lineage receipt and custody ledger.', placeholder: 'document the scientific reason', ok: 'Revise' })
    if (!reason) return
    const cwd = cwdFor(file)
    const rel = file.slice(cwd.length + 1)
    const childRel = join(dirname(rel), child.endsWith('.gbl') ? child : `${child}.gbl`)
    const r = await get().runSubcommand(['revise', rel, childRel, '--reason', reason, '--json'], { cwd, label: 'revise', file })
    const ok = r.code === 0
    set((s) => ({ freezeLog: [{ type: 'revise', file: join(cwd, childRel), reason, at: new Date().toISOString(), ok, detail: ok ? `child of ${basename(file)}` : (parseGoblinError(r.stderr)?.title ?? r.stderr.trim().split('\n')[0]) }, ...s.freezeLog] }))
    if (ok) {
      toast('success', 'Revision created', childRel)
      await useProjectStore.getState().refresh()
      await editor.openPath(join(cwd, childRel))
    } else toast('error', 'Revise failed', parseGoblinError(r.stderr)?.title ?? r.stderr.trim().split('\n')[0])
  },

  refreshStatus: async (file) => {
    const engine = get().enginePath()
    if (!engine || !isTauri() || isUntitled(file) || !file.endsWith('.gbl')) return null
    const cwd = cwdFor(file)
    const rel = file.slice(cwd.length + 1)
    try {
      const r = await proc.run(engine, ['status', rel, '--json'], cwd)
      const j = JSON.parse(r.stdout) as { state?: string; freeze?: { classification?: string; current_source_sha256?: string; receipt_path?: string } }
      const state = j.state ?? 'UNKNOWN'
      const st: FileStatus = { file, state, frozen: state.startsWith('FROZEN'), classification: j.freeze?.classification, sourceSha256: j.freeze?.current_source_sha256, receiptPath: j.freeze?.receipt_path, at: Date.now() }
      set((s) => ({ fileStatus: { ...s.fileStatus, [file]: st } }))
      useEditorStore.getState().setFrozen(file, st.frozen)
      return st
    } catch {
      return null
    }
  },

  lineage: async (file) => {
    const f = file ?? useEditorStore.getState().activePath
    if (!f || isUntitled(f)) return
    const cwd = cwdFor(f)
    await get().runSubcommand(['lineage', f.slice(cwd.length + 1)], { cwd, label: 'lineage', file: f })
  },

  auditLedgerRefresh: async (show = true) => {
    const root = useProjectStore.getState().root
    if (!root) return
    const engine = get().enginePath()
    if (!engine || !isTauri()) return
    try {
      const r = show ? await get().runSubcommand(['audit-ledger', '--json'], { cwd: root, label: 'audit-ledger' }) : await proc.run(engine, ['audit-ledger', '--json'], root)
      let parsed: { status: string; events: number; head: string; path: string; detail: string } = { status: r.code === 0 ? 'PASS' : 'FAIL', events: 0, head: '', path: '', detail: '' }
      try {
        const j = JSON.parse(r.stdout) as Record<string, unknown>
        parsed = {
          status: String(j.status ?? j.ledger_status ?? parsed.status),
          events: Array.isArray(j.events) ? j.events.length : Number(j.events ?? j.event_count ?? 0),
          head: String(j.head_event_sha256 ?? ''),
          path: String(j.ledger ?? j.ledger_path ?? ''),
          detail: String(j.authentication ?? 'CHECKSUM_ONLY'),
        }
      } catch {
        const s = parseSummary(r.stdout)
        parsed = { status: s.LEDGER_STATUS ?? parsed.status, events: Number(s.EVENTS ?? 0), head: s.HEAD_EVENT_SHA256 ?? '', path: s.LEDGER ?? '', detail: s.AUTHENTICATION ?? '' }
      }
      set({ auditLedger: { ...parsed, at: Date.now() } })
    } catch { /* ignore */ }
  },

  doctor: async () => { await get().runSubcommand(['doctor'], { label: 'doctor' }) },
  capabilities: async () => { await get().runSubcommand(['capabilities'], { label: 'capabilities' }) },

  scanRuns: async () => {
    const root = useProjectStore.getState().root
    if (!root || !isTauri()) return
    const settings = getSettings()
    const roots = [join(root, 'runs')]
    if (settings.runsRoot) roots.push(settings.runsRoot.startsWith('/') ? settings.runsRoot : join(root, settings.runsRoot))
    const infos: RunDirInfo[] = []
    for (const r of roots) {
      let entries
      try { entries = await fs.listDir(r) } catch { continue }
      const dirs = entries.filter((e) => e.is_dir).sort((a, b) => b.modified_ms - a.modified_ms).slice(0, 150)
      for (const d of dirs) {
        let receipt: Receipt | null = null
        try { receipt = JSON.parse(await fs.readText(join(d.path, 'receipt.json'))) as Receipt } catch { receipt = null }
        infos.push({
          path: d.path, name: d.name, modifiedMs: d.modified_ms, receipt,
          source: receipt?.source?.path ?? '?', status: receipt?.status ?? 'UNKNOWN',
          seals: receipt?.sealed_artifacts?.length ?? 0, outputs: receipt?.generated_artifacts?.length ?? 0,
          profile: receipt?.execution_profile ?? '', engine: receipt?.execution?.engine ?? '',
        })
      }
    }
    infos.sort((a, b) => b.modifiedMs - a.modifiedMs)
    set({ runDirs: infos, runDirsScannedAt: Date.now() })
  },

  selectRunDir: (selectedRunDir) => set({ selectedRunDir }),
  clearOutput: () => set({ output: [] }),
  setRunConfigOpen: (runConfigOpen) => set({ runConfigOpen }),
  setInlineRustAuthOpen: (inlineRustAuthOpen) => set({ inlineRustAuthOpen }),

  openInlineRustAuth: async () => {
    const file = useEditorStore.getState().activePath
    const engine = get().enginePath()
    let hashes: string[] = []
    if (file && engine && !isUntitled(file)) {
      const cwd = cwdFor(file)
      try {
        const r = await proc.run(engine, ['check', file.slice(cwd.length + 1), '--json'], cwd)
        try {
          const j = JSON.parse(r.stdout) as { inline_rust?: { sha256?: string }[] }
          hashes = (j.inline_rust ?? []).map((b) => b.sha256 ?? '').filter((h) => /^[0-9a-f]{64}$/.test(h))
        } catch {
          hashes = [...(r.stdout + r.stderr).matchAll(/INLINE_RUST_\d+_SHA256=([0-9a-f]{64})/g)].map((m) => m[1])
        }
      } catch { /* ignore */ }
    }
    set({ inlineRustHashes: hashes, inlineRustAuthOpen: true })
  },

  authoriseRust: (hash) => {
    const file = useEditorStore.getState().activePath
    if (!file) return
    useSettingsStore.getState().update((s) => ({ inlineRustHashes: { ...s.inlineRustHashes, [file]: hash } }))
    set({ inlineRustAuthOpen: false })
    toast('success', 'Inline Rust authorised for this file', `--allow-inline-rust ${hash.slice(0, 12)}… will be passed to run --compile`)
  },

  setActiveConfig: (activeConfigId) => set({ activeConfigId }),

  diffRuns: async (a, b) => {
    const root = useProjectStore.getState().root
    await get().runSubcommand(['diff', a, b], { cwd: root || undefined, label: 'diff' })
  },
}))

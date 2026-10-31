import { isPrivateSource } from '../run/secretInput'
import { create } from 'zustand'
import { detectLanguageFolder, joinPath } from '../language/manifest'
import type { ConstantEntry, DiagnosticCode, FunctionEntry, LanguageDefinition, Manifest, Snippet, StatementEntry, UnitEntry } from '../language/manifest'
import { createBundledClient, createLocalClient, fallbackLanguageData } from '../language/lsp'
import type { GoblinLspClient, LspStatus } from '../language/lsp'
import { configureLanguageData } from '../language/monaco'
import { offsetToPosition } from '../language/parser'
import type { DocumentSymbol, ParseDiagnostic, ParseResult } from '../language/parser'
import { env, fs, isTauri, proc, settingsApi } from '../platform/tauri'
import { basename, dirname, isUntitled } from '../util/path'
import { useEditorStore } from './editorStore'
import type { Diagnostic } from './editorStore'
import { getSettings } from './settingsStore'

export type DetectionStatus = 'detecting' | 'found' | 'not-found'

interface CheckResult { status: 'PASS' | 'FAIL' | 'ERROR'; warnings: number; errors: number; at: number }

interface LanguageState {
  status: DetectionStatus
  lspStatus: LspStatus
  manifest: Manifest | null
  definition: LanguageDefinition | null
  functions: FunctionEntry[]
  statements: StatementEntry[]
  units: UnitEntry[]
  constants: ConstantEntry[]
  diagnosticCodes: DiagnosticCode[]
  snippets: Record<string, Snippet>
  languagePath: string
  languageSource: string
  diagnosticsByPath: Record<string, ParseDiagnostic[]>
  checkDiagnosticsByPath: Record<string, ParseDiagnostic[]>
  symbolsByPath: Record<string, DocumentSymbol[]>
  analysisByPath: Record<string, Pick<ParseResult, 'profile' | 'seals' | 'hasInlineRust' | 'imports'>>
  lastCheck: Record<string, CheckResult>
  client: GoblinLspClient
  engine: { path: string; source: string; version: string | null } | null

  detect: (projectRoot?: string) => Promise<void>
  resolveEngine: () => Promise<void>
  setLanguagePath: (path: string) => void
  analyzeAll: (files: { path: string; content: string }[]) => void
  checkFile: (path: string, content?: string) => Promise<void>
  readDoc: (name: string) => Promise<{ title: string; text: string } | null>
}

const bundled = createBundledClient()
const fallback = fallbackLanguageData()

function toEditorDiag(file: string, d: ParseDiagnostic): Diagnostic {
  return { code: d.code, severity: d.severity, message: d.message, file, line: d.line, column: d.column, endLine: d.endLine, endColumn: d.endColumn }
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  status: 'detecting',
  lspStatus: bundled.status,
  manifest: null,
  definition: null,
  functions: fallback.functions,
  statements: [],
  units: fallback.units,
  constants: [],
  diagnosticCodes: [],
  snippets: fallback.snippets,
  languagePath: '',
  languageSource: '',
  diagnosticsByPath: {},
  checkDiagnosticsByPath: {},
  symbolsByPath: {},
  analysisByPath: {},
  lastCheck: {},
  client: bundled,
  engine: null,

  detect: async (projectRoot) => {
    set({ status: 'detecting' })
    const explicit = get().languagePath || undefined
    const definition = await detectLanguageFolder({ explicitPath: explicit, projectRoot })
    if (definition) {
      const client = createLocalClient(definition)
      configureLanguageData(client.data)
      set({
        status: 'found', lspStatus: client.status, manifest: definition.manifest, definition,
        functions: client.data.functions, statements: client.data.statements, units: client.data.units, constants: client.data.constants,
        diagnosticCodes: definition.diagnostics, snippets: definition.snippets, languagePath: definition.root, languageSource: definition.source, client,
      })
    } else {
      const client = createBundledClient()
      configureLanguageData(client.data)
      set({ status: 'not-found', lspStatus: client.status, manifest: null, definition: null, functions: client.data.functions, statements: [], units: client.data.units, constants: [], diagnosticCodes: [], snippets: {}, languageSource: '', client })
    }
    get().analyzeAll(useEditorStore.getState().tabs.map((t) => ({ path: t.path, content: t.content })))
  },

  resolveEngine: async () => {
    if (!isTauri()) return
    try {
      const r = await env.resolveGoblin(getSettings().goblinPath || undefined)
      set({ engine: r.path ? { path: r.path, source: r.source, version: r.version } : null })
    } catch {
      set({ engine: null })
    }
  },

  setLanguagePath: (path) => set({ languagePath: path }),

  analyzeAll: (files) => {
    const client = get().client
    const diagnosticsByPath: Record<string, ParseDiagnostic[]> = { ...get().diagnosticsByPath }
    const symbolsByPath: Record<string, DocumentSymbol[]> = { ...get().symbolsByPath }
    const analysisByPath = { ...get().analysisByPath }
    const open = new Set(files.map((f) => f.path))
    for (const k of Object.keys(diagnosticsByPath)) if (!open.has(k)) { delete diagnosticsByPath[k]; delete symbolsByPath[k]; delete analysisByPath[k] }
    const flat: Diagnostic[] = []
    for (const f of files) {
      if (!f.path.endsWith('.gbl') && !isUntitled(f.path)) { diagnosticsByPath[f.path] = []; symbolsByPath[f.path] = []; continue }
      const r = client.analyze(f.path, f.content)
      diagnosticsByPath[f.path] = r.diagnostics
      symbolsByPath[f.path] = r.symbols
      analysisByPath[f.path] = { profile: r.profile, seals: r.seals, hasInlineRust: r.hasInlineRust, imports: r.imports }
      flat.push(...r.diagnostics.map((d) => ({ ...toEditorDiag(f.path, d), source: 'local' as const })))
    }
    const checkFlat: Diagnostic[] = []
    const checkByPath = { ...get().checkDiagnosticsByPath }
    for (const k of Object.keys(checkByPath)) if (!open.has(k)) delete checkByPath[k]
    for (const [p, ds] of Object.entries(checkByPath)) checkFlat.push(...ds.map((d) => ({ ...toEditorDiag(p, d), source: 'check' as const })))
    set({ diagnosticsByPath, symbolsByPath, analysisByPath, checkDiagnosticsByPath: checkByPath })
    useEditorStore.getState().setDiagnostics([...flat, ...checkFlat])
  },

  /**
   * Run `goblin++ check <file> --json` (preview only, no evidence) and merge its
   * diagnostics. Unsaved buffers are checked through a scratch copy unless they
   * import other files (relative imports would not resolve from the scratch dir).
   */
  checkFile: async (path, content) => {
    const engine = get().engine
    if (!isTauri() || !engine || !path.endsWith('.gbl') || isUntitled(path)) return
    const source = content ?? useEditorStore.getState().tabs.find((t) => t.path === path)?.content ?? ''
    let target = path
    let cwd = dirname(path)
    const tab = useEditorStore.getState().tabs.find((t) => t.path === path)
    if (tab && tab.content !== tab.savedContent) {
      if (isPrivateSource(source)) return // Do not write private buffers to automatic check scratch files.
      if (/^\s*import\s+"/m.test(source)) return
      try {
        const paths = await settingsApi.appPaths()
        const scratchDir = `${paths.data_dir}/check`
        target = `${scratchDir}/${basename(path)}`
        await fs.writeText(target, source)
        cwd = scratchDir
      } catch {
        return
      }
    }
    let res
    try {
      res = await proc.run(engine.path, ['check', target, '--json'], cwd)
    } catch {
      return
    }
    const diags: ParseDiagnostic[] = []
    let status: CheckResult['status'] = 'PASS'
    const placeByOffset = (msg: string, code: string, severity: ParseDiagnostic['severity']) => {
      const m = /\bat (?:position )?(\d+)\b/.exec(msg)
      const pos = m ? offsetToPosition(source, Number(m[1])) : { line: 1, column: 1 }
      const firstLine = msg.split('\n').map((l) => l.trim()).filter(Boolean)
      const message = `${code}: ${firstLine.slice(0, 3).join(' — ')}`
      diags.push({ code, severity, message, line: pos.line, column: pos.column, endLine: pos.line, endColumn: pos.column + 1 })
    }
    if (res.code === 2 || (!res.stdout.trim().startsWith('{') && res.stderr.trim())) {
      status = 'ERROR'
      const m = /GOBLIN ERROR (G\d{3})\s*\n+([\s\S]*)/.exec(res.stderr) ?? /GOBLIN ERROR (G\d{3})\s*\n+([\s\S]*)/.exec(res.stdout)
      if (m) placeByOffset(m[2].trim(), m[1], 'error')
      else if (res.stderr.trim()) placeByOffset(res.stderr.trim(), 'G999', 'error')
    } else {
      try {
        const report = JSON.parse(res.stdout) as { status: string; warnings?: string[]; diagnostic?: { code: string; message: string } | null }
        status = report.status === 'PASS' ? 'PASS' : 'FAIL'
        for (const w of report.warnings ?? []) {
          const fn = /^\s*(\w+)\(\) currently means/m.exec(w)?.[1]
          const code = /GOBLIN WARNING (G\d{3})/.exec(w)?.[1] ?? 'G302'
          const headline = w.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('GOBLIN WARNING'))[0] ?? 'warning'
          let placed = false
          if (fn) {
            const re = new RegExp(`\\b${fn}\\s*\\(`, 'g')
            const lines = source.split('\n')
            for (let i = 0; i < lines.length && !placed; i++) {
              let mm: RegExpExecArray | null
              re.lastIndex = 0
              while ((mm = re.exec(lines[i]))) {
                diags.push({ code, severity: 'warning', message: `${code} ${headline}: ${fn}() currently means radians; use ${fn}r() or ${fn}d().`, line: i + 1, column: mm.index + 1, endLine: i + 1, endColumn: mm.index + 1 + fn.length })
                placed = true
              }
            }
          }
          if (!placed) diags.push({ code, severity: 'warning', message: `${code} ${headline}`, line: 1, column: 1, endLine: 1, endColumn: 2 })
        }
        if (report.diagnostic) placeByOffset(report.diagnostic.message, report.diagnostic.code, 'error')
      } catch {
        status = 'ERROR'
      }
    }
    // Local parser already reports G302 at the same positions; keep the engine's version only.
    set((s) => ({
      checkDiagnosticsByPath: { ...s.checkDiagnosticsByPath, [path]: diags },
      diagnosticsByPath: { ...s.diagnosticsByPath, [path]: (s.diagnosticsByPath[path] ?? []).filter((d) => !(d.code === 'G302' && diags.some((x) => x.code === 'G302'))) },
      lastCheck: { ...s.lastCheck, [path]: { status, warnings: diags.filter((d) => d.severity === 'warning').length, errors: diags.filter((d) => d.severity === 'error').length, at: Date.now() } },
    }))
    useEditorStore.getState().mergeDiagnostics(path, 'check', diags.map((d) => toEditorDiag(path, d)))
    const local = get().diagnosticsByPath[path] ?? []
    useEditorStore.getState().mergeDiagnostics(path, 'local', local.map((d) => toEditorDiag(path, d)))
  },

  readDoc: async (name) => {
    const def = get().definition
    if (!def) return null
    const candidates = [joinPath(def.docsBase, name), joinPath(def.root, name), joinPath(def.docsBase, `${name}.md`)]
    for (const c of candidates) {
      try {
        const text = await def.fs.readText(c)
        if (def.fs.kind === 'web' && /^\s*<!doctype html/i.test(text)) continue
        return { title: name, text }
      } catch {
        /* next */
      }
    }
    return null
  },
}))

export function reanalyzeOpenFiles(): void {
  const files = useEditorStore.getState().tabs.map((t) => ({ path: t.path, content: t.content }))
  useLanguageStore.getState().analyzeAll(files)
}

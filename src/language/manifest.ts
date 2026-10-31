/*
 * The `goblin++` language-folder contract — types, parsers, the filesystem
 * abstraction, and auto-detection. The IDE ships a bundled copy of the folder
 * (generated from the goblin++ repository) under /goblin++ in its web assets;
 * a user-supplied folder (Settings → Goblin++ → Language Path) takes priority.
 */
import { fs as tauriFs, isTauri } from '../platform/tauri'

export type Severity = 'error' | 'warning' | 'info' | 'hint'

export interface ManifestLsp { binary: string; transport: string; capabilities: string[] }
export interface ManifestRustInline { grammar: string; authMode: string }
export interface ManifestCli { binary: string; subcommands: string[]; versionFlag: string }
export interface ManifestEvidence { runDirPrefix: string; receiptFile: string; ledgerFile: string; ledgerHeadFile?: string; freezeFileSuffix?: string }
export interface Manifest {
  name: string
  displayName: string
  version: string
  languageId: string
  fileExtensions: string[]
  grammar: string
  lsp: ManifestLsp
  snippets: string
  diagnostics: string
  themes: string
  docs: string
  docsIndex: string[]
  examples: string
  unitRegistry: string
  functions: string
  constants: string
  rustInline: ManifestRustInline
  cli: ManifestCli
  profiles: string[]
  evidence: ManifestEvidence
  unitSyntax: string
  unitExamples: string[]
  minIDEVersion: string
  minRustVersion: string
  license: string
  changelog: string
  repository: string
}

export interface FunctionEntry { name: string; signature: string; domain: string; description: string; snippet?: string; see?: string; arrayMath?: boolean; legacy?: boolean }
export interface StatementEntry { name: string; kind: string; description: string; snippet?: string | null }
export interface UnitEntry { symbol: string; dimension: string; description: string; siFactor?: number; dimensionVector?: number[] }
export interface ConstantEntry { canonical_id: string; aliases: string[]; detail?: string }
export interface DiagnosticCode { code: string; severity: Severity; message: string; see?: string; category?: string }
export interface Snippet { prefix: string; body: string[]; description?: string }
export interface GrammarVocabulary { keywords: string[]; literals: string[]; directives: string[]; builtins: string[]; units: string[]; constants: string[] }

export interface LanguageDefinition {
  root: string
  source: 'bundled' | 'explicit' | 'auto'
  manifest: Manifest
  functions: FunctionEntry[]
  statements: StatementEntry[]
  units: UnitEntry[]
  constants: ConstantEntry[]
  diagnostics: DiagnosticCode[]
  snippets: Record<string, Snippet>
  grammar: GrammarVocabulary | null
  docsBase: string
  examplesBase: string
  fs: FileSystem
}

export interface FileSystem {
  kind: 'web' | 'native'
  readText(path: string): Promise<string>
  exists(path: string): Promise<boolean>
}

export const webFileSystem: FileSystem = {
  kind: 'web',
  async readText(path) {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`readText ${path}: HTTP ${res.status}`)
    return res.text()
  },
  async exists(path) {
    try {
      const res = await fetch(path, { method: 'GET', headers: { Range: 'bytes=0-0' } })
      if (!(res.ok || res.status === 206)) return false
      // Tauri's asset server and Vite both fall back to index.html for unknown paths.
      const ct = res.headers.get('content-type') ?? ''
      if (path.endsWith('.json') && ct.includes('text/html')) return false
      return true
    } catch {
      return false
    }
  },
}

export const nativeFileSystem: FileSystem = {
  kind: 'native',
  readText: (path) => tauriFs.readText(path),
  exists: (path) => tauriFs.exists(path),
}

export function parseManifest(json: unknown): Manifest {
  const m = json as Partial<Manifest>
  if (!m || typeof m.name !== 'string' || typeof m.version !== 'string') {
    throw new Error('manifest.json is missing a required "name" or "version" field')
  }
  return {
    name: m.name,
    displayName: m.displayName ?? m.name,
    version: m.version,
    languageId: m.languageId ?? 'goblinpp',
    fileExtensions: m.fileExtensions ?? ['.gbl'],
    grammar: m.grammar ?? 'grammar/goblinpp.json',
    lsp: m.lsp ?? { binary: '', transport: 'none', capabilities: [] },
    snippets: m.snippets ?? 'snippets/goblinpp.json',
    diagnostics: m.diagnostics ?? 'diagnostics/codes.json',
    themes: m.themes ?? 'themes/',
    docs: m.docs ?? 'docs/',
    docsIndex: Array.isArray(m.docsIndex) ? m.docsIndex : [],
    examples: m.examples ?? 'examples/',
    unitRegistry: m.unitRegistry ?? 'units/registry.json',
    functions: m.functions ?? 'functions/registry.json',
    constants: m.constants ?? 'constants/registry.json',
    rustInline: m.rustInline ?? { grammar: 'grammar/rust.json', authMode: 'sha256-hash' },
    cli: m.cli ?? { binary: 'goblin++', subcommands: [], versionFlag: '--version' },
    profiles: m.profiles ?? ['everyday', 'GO_PARANOID', 'COMPLETELY_MAD'],
    evidence: m.evidence ?? { runDirPrefix: 'runs/', receiptFile: 'receipt.json', ledgerFile: '.goblin/custody-ledger.jsonl', freezeFileSuffix: '.freeze.json' },
    unitSyntax: m.unitSyntax ?? 'compound',
    unitExamples: m.unitExamples ?? [],
    minIDEVersion: m.minIDEVersion ?? '0.1.0',
    minRustVersion: m.minRustVersion ?? '1.92.0',
    license: m.license ?? 'MIT',
    changelog: m.changelog ?? 'CHANGELOG.md',
    repository: m.repository ?? 'https://github.com/mrgogobot/goblinpp',
  }
}

function arr<T>(o: unknown, key: string): T[] {
  const v = (o as Record<string, unknown> | null)?.[key]
  return Array.isArray(v) ? (v as T[]) : []
}
function parseSnippets(json: unknown): Record<string, Snippet> {
  if (!json || typeof json !== 'object') return {}
  const out: Record<string, Snippet> = {}
  for (const [key, val] of Object.entries(json as Record<string, { prefix?: string; body?: string[] | string; description?: string }>)) {
    if (val && typeof val.prefix === 'string' && val.body !== undefined) {
      out[key] = { prefix: val.prefix, body: Array.isArray(val.body) ? val.body : [val.body], description: val.description }
    }
  }
  return out
}
function parseGrammar(json: unknown): GrammarVocabulary | null {
  const o = json as { tokenCategories?: Partial<GrammarVocabulary> } | null
  if (!o?.tokenCategories) return null
  const t = o.tokenCategories
  return {
    keywords: t.keywords ?? [],
    literals: t.literals ?? [],
    directives: t.directives ?? [],
    builtins: t.builtins ?? [],
    units: t.units ?? [],
    constants: t.constants ?? [],
  }
}
async function readJson<T>(fsys: FileSystem, path: string, parse: (j: unknown) => T, fallback: T): Promise<T> {
  try {
    return parse(JSON.parse(await fsys.readText(path)))
  } catch {
    return fallback
  }
}

export function joinPath(root: string, p: string): string {
  return `${root.replace(/\/$/, '')}/${p.replace(/^\//, '')}`
}

export async function loadLanguageFolder(fsys: FileSystem, root: string, source: LanguageDefinition['source']): Promise<LanguageDefinition> {
  const join = (p: string) => joinPath(root, p)
  const manifest = parseManifest(JSON.parse(await fsys.readText(join('manifest.json'))))
  const [functionsDoc, units, constants, diagnostics, snippets, grammar] = await Promise.all([
    readJson(fsys, join(manifest.functions), (j) => j as Record<string, unknown>, {} as Record<string, unknown>),
    readJson(fsys, join(manifest.unitRegistry), (j) => arr<UnitEntry>(j, 'units'), []),
    readJson(fsys, join(manifest.constants), (j) => arr<ConstantEntry>(j, 'constants'), []),
    readJson(fsys, join(manifest.diagnostics), (j) => arr<DiagnosticCode>(j, 'codes'), []),
    readJson(fsys, join(manifest.snippets), parseSnippets, {}),
    readJson(fsys, join(manifest.grammar), parseGrammar, null),
  ])
  return {
    root,
    source,
    manifest,
    functions: arr<FunctionEntry>(functionsDoc, 'functions'),
    statements: arr<StatementEntry>(functionsDoc, 'statements'),
    units,
    constants,
    diagnostics,
    snippets,
    grammar,
    docsBase: join(manifest.docs),
    examplesBase: join(manifest.examples),
    fs: fsys,
  }
}

export interface DetectionOptions { explicitPath?: string; projectRoot?: string }

/** Walk `startDir` and its parents looking for `goblin++/manifest.json` or `goblinpp/manifest.json`. */
export function candidateRoots(startDir: string, stopDir: string): string[] {
  const out: string[] = []
  let dir = startDir.replace(/\/+$/, '') || '/'
  const stop = stopDir.replace(/\/+$/, '') || '/'
  for (let guard = 0; guard < 48; guard++) {
    for (const name of ['goblin++', 'goblinpp']) out.push(`${dir === '/' ? '' : dir}/${name}`)
    if (dir === stop || dir === '/' || dir === '') break
    dir = dir.slice(0, dir.lastIndexOf('/')) || '/'
  }
  return out
}

export async function detectLanguageFolder(opts: DetectionOptions = {}): Promise<LanguageDefinition | null> {
  if (isTauri()) {
    const tries: { root: string; source: LanguageDefinition['source'] }[] = []
    if (opts.explicitPath) tries.push({ root: opts.explicitPath, source: 'explicit' })
    if (opts.projectRoot) {
      const home = await tauriFs.homeDir().catch(() => '/')
      for (const r of candidateRoots(opts.projectRoot, home)) tries.push({ root: r, source: 'auto' })
    }
    for (const t of tries) {
      if (await nativeFileSystem.exists(joinPath(t.root, 'manifest.json'))) {
        try {
          return await loadLanguageFolder(nativeFileSystem, t.root, t.source)
        } catch {
          /* malformed, keep looking */
        }
      }
    }
  }
  for (const root of ['/goblin++', '/goblinpp']) {
    if (await webFileSystem.exists(joinPath(root, 'manifest.json'))) {
      try {
        return await loadLanguageFolder(webFileSystem, root, 'bundled')
      } catch {
        /* keep looking */
      }
    }
  }
  return null
}

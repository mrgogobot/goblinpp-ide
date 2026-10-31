/*
 * LSP-shaped client boundary. Goblin++ does not ship a language server yet, so
 * the client wraps the local analyser plus the engine's `check --json`
 * (driven from languageStore). A real `goblinpp-lsp --stdio` can replace it
 * behind the same interface.
 */
import { BUILTINS, CONSTANTS, DIRECTIVES, KEYWORDS, LITERALS, UNITS } from './builtins'
import type { ConstantEntry, FunctionEntry, GrammarVocabulary, LanguageDefinition, Snippet, StatementEntry, UnitEntry } from './manifest'
import { buildRegistry, parseDocument } from './parser'
import type { ParseResult, Registry } from './parser'

export interface LiveLanguageData {
  functions: FunctionEntry[]
  statements: StatementEntry[]
  units: UnitEntry[]
  constants: ConstantEntry[]
  snippets: Record<string, Snippet>
  registry: Registry
  vocabulary: GrammarVocabulary
  docsBase: string
  docsIndex: string[]
  version: string
}

export const FALLBACK_CODES = [
  { code: 'G302', severity: 'warning' as const, message: 'Ambiguous angle function — use the explicit r (radians) or d (degrees) suffix.' },
  { code: 'IDE100', severity: 'error' as const, message: 'Unbalanced block delimiter.' },
  { code: 'IDE101', severity: 'hint' as const, message: 'Inline Rust block present: native compilation requires an exact SHA-256 authorisation.' },
]

export function fallbackLanguageData(): LiveLanguageData {
  return {
    functions: BUILTINS,
    statements: [],
    units: UNITS.map((symbol) => ({ symbol, dimension: '', description: '' })),
    constants: [],
    snippets: {},
    registry: buildRegistry(FALLBACK_CODES),
    vocabulary: { keywords: KEYWORDS, literals: LITERALS, directives: DIRECTIVES, builtins: BUILTINS.map((b) => b.name), units: UNITS, constants: CONSTANTS },
    docsBase: '',
    docsIndex: [],
    version: '0.1.0-alpha.41',
  }
}

export type LspStatus = 'connected' | 'local' | 'unavailable'

export interface GoblinLspClient {
  readonly status: LspStatus
  readonly capabilities: string[]
  readonly data: LiveLanguageData
  analyze(uri: string, source: string): ParseResult
  dispose(): void
}

export function createLocalClient(definition: LanguageDefinition): GoblinLspClient {
  const registry = buildRegistry([...FALLBACK_CODES, ...definition.diagnostics])
  const fallback = fallbackLanguageData()
  const data: LiveLanguageData = {
    functions: definition.functions.length ? definition.functions : fallback.functions,
    statements: definition.statements,
    units: definition.units.length ? definition.units : fallback.units,
    constants: definition.constants,
    snippets: definition.snippets,
    registry,
    vocabulary: definition.grammar ?? fallback.vocabulary,
    docsBase: definition.docsBase,
    docsIndex: definition.manifest.docsIndex,
    version: definition.manifest.version,
  }
  return { status: 'local', capabilities: definition.manifest.lsp.capabilities, data, analyze: (_uri, source) => parseDocument(source, registry), dispose: () => {} }
}

export function createBundledClient(): GoblinLspClient {
  const data = fallbackLanguageData()
  return { status: 'unavailable', capabilities: [], data, analyze: (_uri, source) => parseDocument(source, data.registry), dispose: () => {} }
}

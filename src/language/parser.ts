/*
 * Lightweight local Goblin++ analysis: symbols, folding ranges and a few
 * preview diagnostics (unbalanced braces, legacy angle functions, inline Rust).
 * Authoritative diagnostics come from `goblin++ check --json` (see languageStore).
 */
import type { Severity } from './manifest'

export interface ParseDiagnostic { code: string; severity: Severity; message: string; line: number; column: number; endLine: number; endColumn: number }
export type SymbolKind = 'function' | 'directive' | 'seal' | 'rust' | 'variable' | 'import' | 'loop' | 'branch'
export interface DocumentSymbol { name: string; kind: SymbolKind; detail?: string; line: number; endLine?: number; children?: DocumentSymbol[] }
export interface FoldingRange { start: number; end: number; kind: string }
export interface ParseResult { diagnostics: ParseDiagnostic[]; symbols: DocumentSymbol[]; foldingRanges: FoldingRange[]; profile: 'everyday' | 'GO_PARANOID' | 'COMPLETELY_MAD'; seals: string[]; hasInlineRust: boolean; imports: string[] }
export interface Registry { byCode: Map<string, { severity: Severity; message: string; see?: string }> }

export const IDENT = '[A-Za-z_πħωΩΔΣλμσθ∇∂µÅ][A-Za-z0-9_πħωΩΔΣλμσθ∇∂µÅ]*'
const LEGACY_TRIG = /\b(sin|cos|tan|asin|acos|atan|atan2)\s*\(/g

export function buildRegistry(codes: { code: string; severity: Severity; message: string; see?: string }[]): Registry {
  return { byCode: new Map(codes.map((c) => [c.code, c])) }
}

/** Blank out `#` comments and string literals (keeping columns) and mark Rust block lines. */
export function stripSource(source: string): { lines: string[]; rust: boolean[] } {
  const raw = source.split('\n')
  const out: string[] = []
  const rust: boolean[] = []
  let inRust = false
  for (const line of raw) {
    const trimmed = line.trim()
    if (trimmed === 'RUST_INLINE_BEGIN') { inRust = true; out.push(line); rust.push(true); continue }
    if (trimmed === 'RUST_INLINE_END') { inRust = false; out.push(line); rust.push(true); continue }
    if (inRust) { out.push(' '.repeat(line.length)); rust.push(true); continue }
    rust.push(false)
    const chars = line.split('')
    let inStr = false
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i]
      if (inStr) {
        if (c === '\\' && i + 1 < chars.length) { chars[i] = ' '; chars[i + 1] = ' '; i++; continue }
        if (c === '"') { inStr = false; chars[i] = ' '; continue }
        chars[i] = ' '
        continue
      }
      if (c === '"') { inStr = true; chars[i] = ' '; continue }
      if (c === '#') { for (let j = i; j < chars.length; j++) chars[j] = ' '; break }
    }
    out.push(chars.join(''))
  }
  return { lines: out, rust }
}

function diag(registry: Registry, code: string, line: number, column: number, length: number, fallbackSeverity: Severity, message?: string): ParseDiagnostic {
  const info = registry.byCode.get(code)
  return { code, severity: info?.severity ?? fallbackSeverity, message: message ?? info?.message ?? code, line, column, endLine: line, endColumn: column + Math.max(1, length) }
}

export function parseDocument(source: string, registry: Registry): ParseResult {
  const { lines, rust } = stripSource(source)
  const rawLines = source.split('\n')
  const diagnostics: ParseDiagnostic[] = []
  const symbols: DocumentSymbol[] = []
  const foldingRanges: FoldingRange[] = []
  const seals: string[] = []
  const imports: string[] = []
  let profile: ParseResult['profile'] = 'everyday'
  let hasInlineRust = false
  const stack: { start: number; kind: string; symbol?: DocumentSymbol }[] = []
  let rustStart = -1
  const fnRe = new RegExp(`^\\s*g_func\\s+(${IDENT})\\s*\\(([^)]*)\\)`)
  const assignRe = new RegExp(`^\\s*(${IDENT})\\s*=(?!=)`)
  const sealRe = new RegExp(`^\\s*seal\\s+(${IDENT})`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (rust[i]) {
      if (trimmed === 'RUST_INLINE_BEGIN') {
        hasInlineRust = true
        rustStart = i
        symbols.push({ name: 'inline Rust', kind: 'rust', detail: 'RUST_INLINE_BEGIN … END', line: i + 1 })
        diagnostics.push(diag(registry, 'IDE101', i + 1, 1, 'RUST_INLINE_BEGIN'.length, 'hint'))
      } else if (trimmed === 'RUST_INLINE_END' && rustStart >= 0) {
        if (i > rustStart) foldingRanges.push({ start: rustStart, end: i, kind: 'rust' })
        rustStart = -1
      }
      continue
    }
    if (!trimmed) continue

    const dm = /^(GO_PARANOID|COMPLETELY_MAD|GO_LOOP_BUDGET|GO_NUMERIC_AUDIT)\b/.exec(trimmed)
    if (dm) {
      if (dm[1] === 'COMPLETELY_MAD') profile = 'COMPLETELY_MAD'
      else if (dm[1] === 'GO_PARANOID' && profile === 'everyday') profile = 'GO_PARANOID'
      symbols.push({ name: dm[1], kind: 'directive', detail: rawLines[i].trim().slice(dm[1].length).trim() || undefined, line: i + 1 })
    }

    const im = /^\s*import\s+"([^"]+)"/.exec(rawLines[i])
    if (im) { imports.push(im[1]); symbols.push({ name: im[1], kind: 'import', detail: 'import', line: i + 1 }) }

    const fn = fnRe.exec(line)
    let fnSymbol: DocumentSymbol | undefined
    if (fn) {
      fnSymbol = { name: fn[1], kind: 'function', detail: `g_func(${fn[2].trim()})`, line: i + 1, children: [] }
      symbols.push(fnSymbol)
    }

    const seal = sealRe.exec(line)
    if (seal) { seals.push(seal[1]); symbols.push({ name: seal[1], kind: 'seal', detail: 'seal', line: i + 1 }) }

    LEGACY_TRIG.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LEGACY_TRIG.exec(line)) !== null) {
      const r = m[1] === 'atan2' ? 'atan2r' : `${m[1]}r`
      const d = m[1] === 'atan2' ? 'atan2d' : `${m[1]}d`
      diagnostics.push(diag(registry, 'G302', i + 1, m.index + 1, m[1].length, 'warning', `G302 ambiguous angle function: ${m[1]}() currently means radians for compatibility. Use ${r}() (radians) or ${d}() (degrees).`))
    }

    const assign = assignRe.exec(line)
    if (assign && !fn && !seal && !dm) {
      const sym: DocumentSymbol = { name: assign[1], kind: 'variable', line: i + 1 }
      const enclosingFn = [...stack].reverse().find((s) => s.symbol?.kind === 'function')?.symbol
      if (stack.length === 0) symbols.push(sym)
      else if (enclosingFn) enclosingFn.children!.push(sym)
    }

    let opens = 0
    let closes = 0
    for (const ch of line) { if (ch === '{') opens++; else if (ch === '}') closes++ }
    for (let k = 0; k < opens; k++) stack.push({ start: i, kind: blockKindFor(line), symbol: k === 0 ? fnSymbol : undefined })
    for (let k = 0; k < closes; k++) {
      const top = stack.pop()
      if (!top) { diagnostics.push(diag(registry, 'IDE100', i + 1, line.indexOf('}') + 1, 1, 'error', 'Unbalanced "}" — no matching "{".')); continue }
      if (top.start < i) foldingRanges.push({ start: top.start, end: i, kind: top.kind })
      if (top.symbol) top.symbol.endLine = i + 1
    }
  }
  while (stack.length) {
    const top = stack.pop()!
    diagnostics.push(diag(registry, 'IDE100', top.start + 1, Math.max(1, lines[top.start].indexOf('{') + 1), 1, 'error', 'Unclosed "{" — block is never closed.'))
  }
  if (rustStart >= 0) diagnostics.push(diag(registry, 'IDE100', rustStart + 1, 1, 'RUST_INLINE_BEGIN'.length, 'error', 'RUST_INLINE_BEGIN without RUST_INLINE_END.'))

  diagnostics.sort((a, b) => a.line - b.line || a.column - b.column)
  return { diagnostics, symbols, foldingRanges, profile, seals, hasInlineRust, imports }
}

function blockKindFor(line: string): string {
  if (/^\s*g_func\b/.test(line)) return 'function'
  if (/^\s*(for|while)\b/.test(line)) return 'loop'
  if (/^\s*(if|\}\s*else|switch|case|default)\b/.test(line)) return 'conditional'
  return 'block'
}

/** Convert a 0-based character offset (as reported by the engine) to a 1-based line/column. */
export function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  let line = 1
  let col = 1
  const n = Math.min(offset, source.length)
  for (let i = 0; i < n; i++) {
    if (source.charCodeAt(i) === 10) { line++; col = 1 } else col++
  }
  return { line, column: col }
}

/** Conservative formatter: 4-space indentation by brace depth, trailing whitespace trimmed, strings/Rust untouched. */
export function formatSource(source: string, tabSize = 4): string {
  const raw = source.split('\n')
  const { lines, rust } = stripSource(source)
  const out: string[] = []
  let depth = 0
  for (let i = 0; i < raw.length; i++) {
    if (rust[i]) { out.push(raw[i].replace(/\s+$/, '')); continue }
    const stripped = lines[i]
    const content = raw[i].trim()
    if (!content) { out.push(''); continue }
    const leadingCloses = (/^\s*(\}+)/.exec(stripped)?.[1].length) ?? 0
    const level = Math.max(0, depth - leadingCloses)
    out.push(' '.repeat(level * tabSize) + content)
    for (const ch of stripped) { if (ch === '{') depth++; else if (ch === '}') depth = Math.max(0, depth - 1) }
  }
  return out.join('\n')
}

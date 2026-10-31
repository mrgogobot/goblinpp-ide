import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import { fallbackLanguageData } from './lsp'
import type { LiveLanguageData } from './lsp'
import { formatSource, parseDocument, IDENT } from './parser'
import type { ParseDiagnostic } from './parser'
import type { GrammarVocabulary } from './manifest'
import type { ThemeId } from '../theme/themes'

/* Bundle Monaco locally (no CDN). */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  },
}
loader.config({ monaco })

/* ---- live language data (mutated by the language store after detection) ---- */
let liveData: LiveLanguageData = fallbackLanguageData()
export function configureLanguageData(data: LiveLanguageData): void {
  liveData = data
  if (configured) monaco.languages.setMonarchTokensProvider('goblinpp', buildTokenizer(liveData.vocabulary))
}
export function getLiveData(): LiveLanguageData {
  return liveData
}

let onAuthoriseRust: (() => void) | null = null
export function setOnAuthoriseRust(fn: (() => void) | null): void { onAuthoriseRust = fn }
let onAskAi: ((diag: { code: string; message: string }) => void) | null = null
export function setOnAskAi(fn: ((diag: { code: string; message: string }) => void) | null): void { onAskAi = fn }
let onOpenDoc: ((doc: string) => void) | null = null
export function setOnOpenDoc(fn: ((doc: string) => void) | null): void { onOpenDoc = fn }

let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null
export function setActiveEditor(e: monaco.editor.IStandaloneCodeEditor | null): void { activeEditor = e }
export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null { return activeEditor }
export function insertAtCursor(text: string): void {
  if (!activeEditor) return
  const sel = activeEditor.getSelection()
  if (!sel) return
  activeEditor.executeEdits('ide-insert', [{ range: sel, text }])
  activeEditor.focus()
}
export function runEditorAction(id: string): void {
  const e = activeEditor
  if (!e) return
  e.focus()
  const a = e.getAction(id)
  if (a) void a.run()
  else e.trigger('ide', id, null)
}

function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function longestFirst(list: string[]): string[] { return [...new Set(list)].sort((a, b) => b.length - a.length) }
const W = 'A-Za-z0-9_πħωΩΔΣλμσθ∇∂µÅ'

interface MonarchLanguage extends monaco.languages.IMonarchLanguage { tokenizer: Record<string, monaco.languages.IMonarchLanguageRule[]> }

function buildTokenizer(vocab: GrammarVocabulary): MonarchLanguage {
  const keywords = longestFirst(vocab.keywords.filter((k) => k !== 'seal'))
  const directives = longestFirst(vocab.directives)
  const builtins = longestFirst(vocab.builtins)
  const units = longestFirst(vocab.units)
  const constants = longestFirst(vocab.constants)
  const literals = longestFirst(vocab.literals ?? ['true', 'false', 'argc'])
  const alt = (xs: string[]) => xs.map(escapeRegExp).join('|')
  const unitAtom = `(?:${alt(units)})(?:\\^-?\\d+|[²³])?`
  const unitGroup = `(?:\\(\\s*${unitAtom}(?:\\s*\\*\\s*${unitAtom})*\\s*\\)|${unitAtom})`
  const compound = new RegExp(`[ \\t]*(?:1\\s*\\/\\s*${unitGroup}|${unitGroup}(?:\\s*[*\\/]\\s*${unitGroup})*)(?![${W}])`)
  const numberRe = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/
  const idRe = new RegExp(IDENT)

  const tokenizer: Record<string, monaco.languages.IMonarchLanguageRule[]> = {
    root: [
      [/^\s*RUST_INLINE_BEGIN\s*$/, { token: 'directive', next: '@rust' }],
      [/#.*$/, 'comment'],
      [/"/, { token: 'string', next: '@string' }],
      [new RegExp(`(?:${alt(directives)})(?![${W}])`), 'directive'],
      [new RegExp(`\\bseal(?![${W}])`), 'seal'],
      [new RegExp(`\\b(?:${alt(keywords)})(?![${W}])`), 'keyword'],
      [new RegExp(`\\b(?:${alt(literals)})(?![${W}])`), 'literal'],
      [new RegExp(`\\b(?:${alt(builtins)})(?=\\s*\\()`), 'builtin'],
      [new RegExp(`\\bg_func\\s+(${IDENT})`), 'keyword'],
      [new RegExp(`(?:${alt(constants.filter((c) => /^[A-Za-z_]/.test(c)))})(?![${W}])`), { cases: { '@default': 'constant' } }],
      [/[πħ](?![A-Za-z0-9_])/, 'constant'],
      [numberRe, { token: 'number', next: '@afterNumber' }],
      [new RegExp(`(${IDENT})(?=\\s*\\()`), 'function.call'],
      [new RegExp(`(${IDENT})(?=\\s*=(?!=))`), 'variable.assign'],
      [/\b(and|or|not)\b/, 'operator.logical'],
      [/<=|>=|!=|==|≤|≥|≠|[<>]/, 'operator'],
      [/[+\-*/%^²³]/, 'operator'],
      [/=/, 'operator'],
      [/[{}]/, 'delimiter.curly'],
      [/[()]/, 'delimiter.parenthesis'],
      [/[[\]]/, 'delimiter.square'],
      [/[,:]/, 'delimiter'],
      [idRe, 'identifier'],
      [/\s+/, 'white'],
    ],
    afterNumber: [
      [compound, { token: 'unit', next: '@pop' }],
      [/(?=.|$)/, { token: '', next: '@pop' }],
    ],
    string: [
      [/\{\{|\}\}/, 'string.escape'],
      [new RegExp(`\\{${IDENT}(?::[^}]*)?\\}`), 'format'],
      [/\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4})/, 'string.escape'],
      [/[^\\"{}]+/, 'string'],
      [/[{}]/, 'string'],
      [/"/, { token: 'string', next: '@pop' }],
    ],
    rust: [
      [/^\s*RUST_INLINE_END\s*$/, { token: 'directive', next: '@pop' }],
      [/\/\/.*$/, 'comment'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/\b(fn|let|mut|return|if|else|for|while|loop|match|struct|enum|impl|use|pub|in|as|const|static|unsafe|where|type|trait|mod|ref|move|dyn)\b/, 'keyword'],
      [/\b(println|print|eprintln|format|vec|assert|assert_eq|panic)!/, 'builtin'],
      [/\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?:_?[iuf](?:8|16|32|64|128|size))?\b/, 'number'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, 'rust.ident'],
      [/[{}()[\]]/, 'delimiter'],
      [/./, 'rust'],
    ],
  }
  return { defaultToken: '', ignoreCase: false, tokenizer }
}

function wordAt(model: monaco.editor.ITextModel, position: monaco.Position): { word: string; startColumn: number; endColumn: number } | null {
  const line = model.getLineContent(position.lineNumber)
  const re = new RegExp(IDENT, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const start = m.index + 1
    const end = start + m[0].length
    if (position.column >= start && position.column <= end) return { word: m[0], startColumn: start, endColumn: end }
    if (start > position.column) break
  }
  return null
}

function docLink(see?: string): string {
  if (!see) return ''
  return `\n\n[Open ${see}](command:goblinpp.openDoc?${encodeURIComponent(JSON.stringify([see]))})`
}

function registerLanguage(m: typeof monaco): void {
  m.languages.register({ id: 'goblinpp', extensions: ['.gbl'], aliases: ['Goblin++', 'goblinpp', 'gbl'] })
  m.languages.setMonarchTokensProvider('goblinpp', buildTokenizer(liveData.vocabulary))
  m.languages.setLanguageConfiguration('goblinpp', {
    comments: { lineComment: '#' },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [{ open: '{', close: '}' }, { open: '[', close: ']' }, { open: '(', close: ')' }, { open: '"', close: '"' }],
    wordPattern: new RegExp(IDENT),
    indentationRules: { increaseIndentPattern: /\{\s*(#.*)?$/, decreaseIndentPattern: /^\s*\}/ },
    folding: { markers: { start: /^\s*RUST_INLINE_BEGIN\s*$/, end: /^\s*RUST_INLINE_END\s*$/ } },
  })

  m.languages.registerCompletionItemProvider('goblinpp', {
    triggerCharacters: ['_'],
    provideCompletionItems(model, position) {
      const d = liveData
      const w = wordAt(model, position)
      const range: monaco.IRange = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w?.startColumn ?? position.column, endColumn: position.column }
      const lineBefore = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const afterNumber = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*[A-Za-zµÅΩ]*$/.test(lineBefore)
      const S = m.languages.CompletionItemInsertTextRule.InsertAsSnippet
      const K = m.languages.CompletionItemKind
      const items: monaco.languages.CompletionItem[] = []

      if (afterNumber) {
        for (const u of d.units) items.push({ label: u.symbol, kind: K.Unit, detail: `unit · ${u.dimension}`, documentation: u.description, insertText: u.symbol, range, sortText: `0_${u.symbol}` })
      }
      for (const kw of d.vocabulary.keywords) items.push({ label: kw, kind: K.Keyword, insertText: kw, range, sortText: `3_${kw}` })
      for (const lit of d.vocabulary.literals ?? []) items.push({ label: lit, kind: K.Value, insertText: lit, range, sortText: `3_${lit}` })
      for (const st of d.statements) {
        items.push({ label: st.name, kind: K.Keyword, detail: st.kind === 'statement' ? 'statement' : st.kind, documentation: { value: st.description }, insertText: st.snippet ?? st.name, insertTextRules: st.snippet ? S : undefined, range, sortText: `2_${st.name}` })
      }
      for (const f of d.functions) {
        items.push({
          label: { label: f.name, description: f.domain },
          kind: K.Function,
          detail: f.signature,
          documentation: { value: `**${f.name}** — *${f.domain}*\n\n${f.description}${f.arrayMath ? '\n\nAlso element-wise over numeric arrays.' : ''}${f.legacy ? '\n\n⚠ Legacy name: produces a G302 warning; prefer the r/d suffixed form.' : ''}${docLink(f.see)}` },
          insertText: f.snippet ?? `${f.name}($1)`,
          insertTextRules: S,
          range,
          sortText: `${f.legacy ? '6' : '1'}_${f.name}`,
        })
      }
      for (const c of d.constants) for (const a of c.aliases) items.push({ label: a, kind: K.Constant, detail: c.canonical_id, documentation: c.detail, insertText: a, range, sortText: `4_${a}` })
      if (!afterNumber) for (const u of d.units) items.push({ label: u.symbol, kind: K.Unit, detail: `unit · ${u.dimension}`, insertText: u.symbol, range, sortText: `7_${u.symbol}` })
      for (const [key, s] of Object.entries(d.snippets)) {
        items.push({ label: { label: s.prefix, description: 'snippet' }, kind: K.Snippet, detail: key, documentation: s.description, insertText: s.body.join('\n'), insertTextRules: S, range, sortText: `5_${s.prefix}` })
      }
      // user-defined g_funcs and variables in this file
      const { symbols } = parseDocument(model.getValue(), d.registry)
      for (const s of symbols) {
        if (s.kind === 'function') items.push({ label: s.name, kind: K.Function, detail: s.detail, insertText: `${s.name}($1)`, insertTextRules: S, range, sortText: `0_${s.name}` })
        else if (s.kind === 'variable' && s.name !== w?.word) items.push({ label: s.name, kind: K.Variable, insertText: s.name, range, sortText: `0_${s.name}` })
      }
      return { suggestions: items }
    },
  })

  m.languages.registerHoverProvider('goblinpp', {
    provideHover(model, position) {
      const w = wordAt(model, position)
      if (!w) return null
      const d = liveData
      const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn }
      const fn = d.functions.find((f) => f.name === w.word)
      if (fn) return { range, contents: [{ value: `\`\`\`goblinpp\n${fn.signature}\n\`\`\`` }, { value: `**${fn.domain}** — ${fn.description}${fn.arrayMath ? '\n\n_Also element-wise over numeric arrays._' : ''}${fn.legacy ? '\n\n⚠ **G302**: legacy angle name; use the r/d suffixed form.' : ''}${docLink(fn.see)}`, isTrusted: true }] }
      const st = d.statements.find((s) => s.name === w.word)
      if (st) return { range, contents: [{ value: `**${st.name}** · ${st.kind}` }, { value: st.description }] }
      const c = d.constants.find((x) => x.aliases.includes(w.word))
      if (c) return { range, contents: [{ value: `**${w.word}** — registered constant \`${c.canonical_id}\`` }, { value: `${c.detail ?? ''}\n\nRead-only; cannot be assigned or shadowed. Aliases: ${c.aliases.join(', ')}` }] }
      const u = d.units.find((x) => x.symbol === w.word)
      if (u) return { range, contents: [{ value: `**${u.symbol}** — unit (${u.dimension})` }, { value: u.description }] }
      const { symbols } = parseDocument(model.getValue(), d.registry)
      const s = symbols.find((x) => x.name === w.word && (x.kind === 'function' || x.kind === 'variable' || x.kind === 'seal'))
      if (s) return { range, contents: [{ value: s.kind === 'function' ? `\`\`\`goblinpp\ng_func ${s.name}${s.detail?.replace(/^g_func/, '') ?? '()'}\n\`\`\`` : `**${s.name}** — ${s.kind === 'seal' ? 'sealed value' : 'variable'} (line ${s.line})` }] }
      if (d.vocabulary.directives.includes(w.word)) return { range, contents: [{ value: `**${w.word}** — directive` }] }
      return null
    },
  })

  m.languages.registerSignatureHelpProvider('goblinpp', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const before = model.getValueInRange({ startLineNumber: Math.max(1, position.lineNumber - 3), startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column })
      let depth = 0
      let name = ''
      let commas = 0
      for (let i = before.length - 1; i >= 0; i--) {
        const ch = before[i]
        if (ch === ')') depth++
        else if (ch === '(') {
          if (depth === 0) { name = new RegExp(`(${IDENT})\\s*$`).exec(before.slice(0, i))?.[1] ?? ''; break }
          depth--
        } else if (ch === ',' && depth === 0) commas++
      }
      if (!name) return null
      const fn = liveData.functions.find((f) => f.name === name)
      if (!fn) return null
      const inner = /\((.*)\)/.exec(fn.signature)?.[1] ?? ''
      const params = inner.split(',').map((p) => p.trim()).filter(Boolean)
      return {
        value: { signatures: [{ label: fn.signature, documentation: { value: fn.description }, parameters: params.map((p) => ({ label: p })) }], activeSignature: 0, activeParameter: Math.min(commas, Math.max(0, params.length - 1)) },
        dispose: () => {},
      }
    },
  })

  m.languages.registerDocumentSymbolProvider('goblinpp', {
    provideDocumentSymbols(model) {
      const { symbols } = parseDocument(model.getValue(), liveData.registry)
      const kindOf = (k: string) => ({ function: m.languages.SymbolKind.Function, directive: m.languages.SymbolKind.Property, seal: m.languages.SymbolKind.Constant, rust: m.languages.SymbolKind.Module, import: m.languages.SymbolKind.Package } as Record<string, monaco.languages.SymbolKind>)[k] ?? m.languages.SymbolKind.Variable
      const toSym = (s: typeof symbols[number]): monaco.languages.DocumentSymbol => ({
        name: s.name, detail: s.detail ?? s.kind, kind: kindOf(s.kind), tags: [],
        range: { startLineNumber: s.line, endLineNumber: s.endLine ?? s.line, startColumn: 1, endColumn: 1 },
        selectionRange: { startLineNumber: s.line, endLineNumber: s.line, startColumn: 1, endColumn: 1 },
        children: (s.children ?? []).map(toSym),
      })
      return symbols.map(toSym)
    },
  })

  m.languages.registerFoldingRangeProvider('goblinpp', {
    provideFoldingRanges(model) {
      const { foldingRanges } = parseDocument(model.getValue(), liveData.registry)
      return foldingRanges.map((f) => ({ start: f.start + 1, end: f.end + 1 }))
    },
  })

  m.languages.registerDocumentFormattingEditProvider('goblinpp', {
    provideDocumentFormattingEdits(model, options) {
      const formatted = formatSource(model.getValue(), options.tabSize)
      if (formatted === model.getValue()) return []
      return [{ range: model.getFullModelRange(), text: formatted }]
    },
  })

  m.languages.registerDefinitionProvider('goblinpp', {
    provideDefinition(model, position) {
      const w = wordAt(model, position)
      if (!w) return null
      const { symbols } = parseDocument(model.getValue(), liveData.registry)
      const target = symbols.find((s) => s.name === w.word && (s.kind === 'function' || s.kind === 'variable'))
      if (!target || target.line === position.lineNumber) return null
      return { uri: model.uri, range: { startLineNumber: target.line, startColumn: 1, endLineNumber: target.line, endColumn: 1 } }
    },
  })

  m.languages.registerCodeActionProvider('goblinpp', {
    provideCodeActions(model, _range, context) {
      const actions: monaco.languages.CodeAction[] = []
      for (const marker of context.markers) {
        if (marker.code === 'G302') {
          const w = wordAt(model, new m.Position(marker.startLineNumber, marker.startColumn))
          if (w && /^(sin|cos|tan|asin|acos|atan|atan2)$/.test(w.word)) {
            for (const [suffix, label] of [['r', 'radians'], ['d', 'degrees']] as const) {
              const fixed = `${w.word}${suffix}`
              actions.push({
                title: `Replace ${w.word}() with ${fixed}() (${label})`, kind: 'quickfix', diagnostics: [marker], isPreferred: suffix === 'r',
                edit: { edits: [{ resource: model.uri, versionId: model.getVersionId(), textEdit: { range: { startLineNumber: marker.startLineNumber, startColumn: w.startColumn, endLineNumber: marker.startLineNumber, endColumn: w.endColumn }, text: fixed } }] },
              })
            }
          }
        }
        if (marker.code === 'IDE101' || marker.code === 'G405') {
          actions.push({ title: 'Authorise inline Rust block (exact SHA-256)…', kind: 'quickfix', diagnostics: [marker], command: { id: 'goblinpp.authoriseRust', title: 'Authorise inline Rust' } })
        }
        if (typeof marker.code === 'string' && marker.severity >= m.MarkerSeverity.Warning) {
          actions.push({ title: `Ask AI about ${marker.code}`, kind: 'quickfix', diagnostics: [marker], command: { id: 'goblinpp.askAi', title: 'Ask AI', arguments: [marker.code, String(marker.message)] } })
        }
      }
      return { actions, dispose: () => {} }
    },
  })
}

/* ---- themes ---- */
interface MonacoThemeColors {
  base: 'vs' | 'vs-dark' | 'hc-black'
  bg: string; fg: string; keyword: string; builtin: string; unit: string; number: string; string: string; format: string; comment: string
  operator: string; delimiter: string; directive: string; seal: string; ident: string; constant: string; variable: string; call: string; literal: string
  rust: string; gutter: string; lineHighlight: string; selection: string; cursor: string
}

const THEME_COLORS: Record<ThemeId, MonacoThemeColors> = {
  goblin: {
    base: 'vs-dark', bg: '#242428', fg: '#dcdce4', keyword: '#c084fc', builtin: '#4ade80', unit: '#a78bfa', number: '#7dd3fc',
    string: '#a3e635', format: '#e879f9', comment: '#6b6b78', operator: '#d8d8e2', delimiter: '#b8b8c8', directive: '#a855f7', seal: '#39ff14',
    ident: '#dcdce4', constant: '#f0abfc', variable: '#e2e8f0', call: '#86efac', literal: '#fb923c', rust: '#c9c9d6', gutter: '#242428', lineHighlight: '#2d2d33', selection: '#4c1d95aa', cursor: '#39ff14',
  },
  darcula: {
    base: 'vs-dark', bg: '#2b2b2b', fg: '#a9b7c6', keyword: '#cc7832', builtin: '#66c434', unit: '#ff8000', number: '#6897bb',
    string: '#6a8759', format: '#bbb529', comment: '#808080', operator: '#a9b7c6', delimiter: '#a9b7c6', directive: '#ff8000', seal: '#ffd700',
    ident: '#a9b7c6', constant: '#9876aa', variable: '#a9b7c6', call: '#ffc66d', literal: '#cc7832', rust: '#a9b7c6', gutter: '#2b2b2b', lineHighlight: '#323232', selection: '#214283', cursor: '#ffd700',
  },
  light: {
    base: 'vs', bg: '#ffffff', fg: '#000000', keyword: '#000080', builtin: '#3e8c00', unit: '#d2691e', number: '#1750eb',
    string: '#067d17', format: '#3e8c00', comment: '#8c8c8c', operator: '#000000', delimiter: '#000000', directive: '#d2691e', seal: '#b8860b',
    ident: '#000000', constant: '#871094', variable: '#000000', call: '#00627a', literal: '#0033b3', rust: '#000000', gutter: '#f2f2f2', lineHighlight: '#f5f5f5', selection: '#b3d7ff', cursor: '#000000',
  },
  'high-contrast': {
    base: 'hc-black', bg: '#000000', fg: '#ffffff', keyword: '#ffffff', builtin: '#00ff00', unit: '#ffff00', number: '#00ffff',
    string: '#ff55ff', format: '#00ffff', comment: '#c0c0c0', operator: '#ffffff', delimiter: '#ffffff', directive: '#ffff00', seal: '#ffd700',
    ident: '#ffffff', constant: '#ff80ff', variable: '#ffffff', call: '#ffff80', literal: '#ffff00', rust: '#ffffff', gutter: '#000000', lineHighlight: '#1a1a1a', selection: '#ffffff', cursor: '#ffffff',
  },
  'new-ui': {
    base: 'vs-dark', bg: '#1e1e1e', fg: '#d4d4d4', keyword: '#cc7832', builtin: '#5bae1f', unit: '#e8a853', number: '#9cdcfe',
    string: '#ce9178', format: '#c9a264', comment: '#6a9955', operator: '#d4d4d4', delimiter: '#d4d4d4', directive: '#e8a853', seal: '#daa520',
    ident: '#d4d4d4', constant: '#c586c0', variable: '#9cdcfe', call: '#dcdcaa', literal: '#569cd6', rust: '#d4d4d4', gutter: '#1e1e1e', lineHighlight: '#2a2a2a', selection: '#264f78', cursor: '#daa520',
  },
}

export function monacoThemeName(theme: ThemeId): string { return `goblin-${theme}` }

function defineThemes(m: typeof monaco): void {
  ;(Object.keys(THEME_COLORS) as ThemeId[]).forEach((theme) => {
    const c = THEME_COLORS[theme]
    m.editor.defineTheme(monacoThemeName(theme), {
      base: c.base,
      inherit: true,
      rules: [
        { token: 'keyword', foreground: c.keyword, fontStyle: 'bold' },
        { token: 'directive', foreground: c.directive, fontStyle: 'bold' },
        { token: 'seal', foreground: c.seal, fontStyle: 'bold' },
        { token: 'builtin', foreground: c.builtin },
        { token: 'function.call', foreground: c.call },
        { token: 'variable.assign', foreground: c.variable },
        { token: 'constant', foreground: c.constant, fontStyle: 'italic' },
        { token: 'literal', foreground: c.literal },
        { token: 'unit', foreground: c.unit, fontStyle: 'bold' },
        { token: 'number', foreground: c.number },
        { token: 'string', foreground: c.string },
        { token: 'string.escape', foreground: c.format },
        { token: 'format', foreground: c.format, fontStyle: 'italic' },
        { token: 'comment', foreground: c.comment, fontStyle: 'italic' },
        { token: 'operator', foreground: c.operator },
        { token: 'operator.logical', foreground: c.keyword },
        { token: 'delimiter', foreground: c.delimiter },
        { token: 'identifier', foreground: c.ident },
        { token: 'rust', foreground: c.rust },
        { token: 'rust.ident', foreground: c.rust },
      ],
      colors: {
        'editor.background': c.bg,
        'editor.foreground': c.fg,
        'editorLineNumber.foreground': c.comment,
        'editorLineNumber.activeForeground': c.fg,
        'editor.lineHighlightBackground': c.lineHighlight,
        'editor.selectionBackground': c.selection,
        'editorCursor.foreground': c.cursor,
        'editorGutter.background': c.gutter,
        'editorIndentGuide.background1': c.lineHighlight,
        'editorIndentGuide.activeBackground1': c.comment,
        'editorBracketMatch.background': '#00000000',
        'editorBracketMatch.border': c.seal,
        'editorWhitespace.foreground': c.comment,
        'editorWidget.background': c.bg,
        'editorSuggestWidget.background': c.bg,
        'editorSuggestWidget.selectedBackground': c.lineHighlight,
        'editorHoverWidget.background': c.bg,
        'minimap.background': c.bg,
      },
    })
  })
}

let configured = false
export function setupMonaco(): void {
  if (configured) return
  registerLanguage(monaco)
  defineThemes(monaco)
  monaco.editor.addCommand({ id: 'goblinpp.authoriseRust', run: () => onAuthoriseRust?.() })
  monaco.editor.addCommand({ id: 'goblinpp.askAi', run: (_accessor, code: string, message: string) => onAskAi?.({ code, message }) })
  monaco.editor.addCommand({ id: 'goblinpp.openDoc', run: (_accessor, doc: string) => onOpenDoc?.(doc) })
  configured = true
}

const SEVERITY_TO_MARKER: Record<ParseDiagnostic['severity'], monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
  hint: monaco.MarkerSeverity.Hint,
}

export function applyDiagnostics(model: monaco.editor.ITextModel, diagnostics: ParseDiagnostic[], owner = 'goblinpp'): void {
  const markers = diagnostics.map<monaco.editor.IMarkerData>((d) => ({
    severity: SEVERITY_TO_MARKER[d.severity],
    message: d.message,
    code: d.code,
    source: owner === 'goblinpp-check' ? 'goblin++ check' : 'Goblin++ IDE',
    startLineNumber: d.line,
    startColumn: d.column,
    endLineNumber: d.endLine,
    endColumn: d.endColumn,
  }))
  monaco.editor.setModelMarkers(model, owner, markers)
}

export { monaco }

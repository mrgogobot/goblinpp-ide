import { useEffect, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { applyDiagnostics, monaco, monacoThemeName, setActiveEditor, setupMonaco } from '../language/monaco'
import { useEditorStore } from '../stores/editorStore'
import type { FileTab } from '../stores/editorStore'
import { useLanguageStore } from '../stores/languageStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTheme } from '../theme/ThemeContext'
import { runAction } from '../actions'
import { useAppStore } from '../stores/appStore'

export function MonacoEditor({ tab }: { tab: FileTab }) {
  const { path, content, language } = tab
  const updateContent = useEditorStore((s) => s.updateContent)
  const setCursor = useEditorStore((s) => s.setCursor)
  const pendingReveal = useEditorStore((s) => s.pendingReveal)
  const consumeReveal = useEditorStore((s) => s.consumeReveal)
  const saveViewState = useEditorStore((s) => s.saveViewState)
  const localDiags = useLanguageStore((s) => s.diagnosticsByPath[path] ?? [])
  const checkDiags = useLanguageStore((s) => s.checkDiagnosticsByPath[path] ?? [])
  const symbols = useLanguageStore((s) => s.symbolsByPath[path] ?? [])
  const prefs = useSettingsStore((s) => s.settings.editor)
  const hasBackground = useAppStore((s) => !!s.backgroundDataUrl)
  const { theme } = useTheme()
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const prevPath = useRef<string | null>(null)

  useEffect(() => { monaco.editor.setTheme(monacoThemeName(theme)) }, [theme])
  useEffect(() => () => setActiveEditor(null), [])

  // Persist/restore view state (cursor, scroll) per tab.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (prevPath.current && prevPath.current !== path) saveViewState(prevPath.current, editor.saveViewState())
    prevPath.current = path
    const t = setTimeout(() => {
      const vs = useEditorStore.getState().tabs.find((x) => x.path === path)?.viewState as monaco.editor.ICodeEditorViewState | undefined
      if (vs && !useEditorStore.getState().pendingReveal) editor.restoreViewState(vs)
      editor.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [path, saveViewState])

  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (editor && model) {
      applyDiagnostics(model, localDiags, 'goblinpp')
      applyDiagnostics(model, checkDiags, 'goblinpp-check')
    }
  }, [localDiags, checkDiags, path])

  // Gutter glyphs: ★ seal, ◆ directive, ⚡ inline Rust.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const decos = symbols.filter((s) => s.kind === 'seal' || s.kind === 'directive' || s.kind === 'rust').map<monaco.editor.IModelDeltaDecoration>((s) => ({
      range: new monaco.Range(s.line, 1, s.line, 1),
      options: { isWholeLine: false, glyphMarginClassName: s.kind === 'seal' ? 'gutter-seal' : s.kind === 'directive' ? 'gutter-directive' : 'gutter-rust', glyphMarginHoverMessage: { value: s.kind === 'seal' ? `seal **${s.name}** — snapshot preserved as a typed run artifact` : s.kind === 'directive' ? `**${s.name}** ${s.detail ?? ''}` : 'Inline Rust block — compiled runs need --allow-inline-rust <sha256>' } },
    }))
    if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection(decos)
    else decorationsRef.current.set(decos)
  }, [symbols, path])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !pendingReveal || pendingReveal.path !== path) return
    editor.revealLineInCenter(pendingReveal.line)
    editor.setPosition({ lineNumber: pendingReveal.line, column: pendingReveal.column })
    editor.focus()
    consumeReveal()
  }, [pendingReveal, path, consumeReveal])

  return (
    <div className={`monaco-wrap${hasBackground ? ' glass' : ''}`}>
      <Editor
        path={path}
        language={language}
        value={content}
        height="100%"
        theme={monacoThemeName(theme)}
        beforeMount={() => setupMonaco()}
        keepCurrentModel
        onMount={(editor) => {
          editorRef.current = editor
          setActiveEditor(editor)
          editor.onDidChangeCursorPosition((e) => setCursor(e.position.lineNumber, e.position.column))
          editor.onDidFocusEditorText(() => setActiveEditor(editor))
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => runAction('file.save'))
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runAction('run.run'))
          editor.addAction({ id: 'goblin.run', label: 'Goblin++: Run', contextMenuGroupId: 'goblin', contextMenuOrder: 1, run: () => runAction('run.run') })
          editor.addAction({ id: 'goblin.check', label: 'Goblin++: Check (preview)', contextMenuGroupId: 'goblin', contextMenuOrder: 2, run: () => runAction('run.check') })
          editor.addAction({ id: 'goblin.freeze', label: 'Goblin++: Freeze', contextMenuGroupId: 'goblin', contextMenuOrder: 3, run: () => runAction('run.freeze') })
          editor.addAction({ id: 'goblin.seal', label: 'Goblin++: Seal selected identifier', contextMenuGroupId: 'goblin', contextMenuOrder: 4, run: () => runAction('code.sealSelection') })
          editor.addAction({ id: 'goblin.ai', label: 'Ask AI about selection', contextMenuGroupId: 'goblin', contextMenuOrder: 9, run: () => runAction('ai.fix') })
          const model = editor.getModel()
          if (model) { applyDiagnostics(model, localDiags, 'goblinpp'); applyDiagnostics(model, checkDiags, 'goblinpp-check') }
          editor.focus()
        }}
        onChange={(value) => { if (!tab.readOnly) updateContent(path, value ?? '') }}
        options={{
          automaticLayout: true,
          readOnly: !!tab.readOnly,
          fontSize: prefs.fontSize,
          lineHeight: Math.round(prefs.fontSize * prefs.lineHeight),
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
          fontLigatures: prefs.ligatures,
          tabSize: prefs.tabSize,
          insertSpaces: true,
          wordWrap: prefs.wordWrap ? 'on' : 'off',
          lineNumbers: 'on',
          glyphMargin: true,
          minimap: { enabled: prefs.minimap },
          folding: true,
          renderWhitespace: prefs.renderWhitespace ? 'all' : 'selection',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          scrollBeyondLastLine: false,
          padding: { top: 10 },
          bracketPairColorization: { enabled: prefs.bracketColors },
          quickSuggestions: { other: true, comments: false, strings: true },
          suggestOnTriggerCharacters: true,
          snippetSuggestions: 'inline',
          renderLineHighlight: 'all',
          occurrencesHighlight: 'singleFile',
          unicodeHighlight: { ambiguousCharacters: false, nonBasicASCII: false },
          stickyScroll: { enabled: true },
        }}
      />
    </div>
  )
}

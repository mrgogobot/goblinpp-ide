/*
 * Open editor tabs. Paths are absolute, except new unsaved buffers which use
 * `untitled:<n>` until their first Save As. Content is kept in memory; the
 * Monaco component mirrors it.
 */
import { create } from 'zustand'
import { fs, isTauri } from '../platform/tauri'
import { basename, isProbablyBinary, isUntitled, languageForPath } from '../util/path'
import { confirmDialog, toast } from './dialogStore'

export interface FileTab {
  path: string
  name: string
  language: string
  content: string
  savedContent: string
  frozen?: boolean
  verifyFailed?: boolean
  readOnly?: boolean
  modifiedMs?: number
  viewState?: unknown
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

export interface Diagnostic {
  code: string
  severity: DiagnosticSeverity
  message: string
  file: string
  line: number // 1-based
  column: number // 1-based
  endLine?: number
  endColumn?: number
  source?: 'local' | 'check'
}

interface EditorState {
  tabs: FileTab[]
  activePath: string | null
  diagnostics: Diagnostic[]
  cursor: { line: number; column: number }
  history: string[]
  historyIndex: number
  untitledCounter: number
  pendingReveal: { path: string; line: number; column: number } | null

  openPath: (path: string, opts?: { line?: number; column?: number; preview?: boolean }) => Promise<void>
  openBuffer: (tab: Omit<FileTab, 'savedContent'> & { savedContent?: string }) => void
  newUntitled: (initial?: string) => string
  closeTab: (path: string, opts?: { force?: boolean }) => Promise<boolean>
  closeOthers: (path: string) => Promise<void>
  closeAll: () => Promise<boolean>
  setActive: (path: string) => void
  updateContent: (path: string, content: string) => void
  save: (path?: string) => Promise<string | null>
  saveAs: (path?: string) => Promise<string | null>
  saveAll: () => Promise<void>
  revert: (path: string) => Promise<void>
  renamePath: (from: string, to: string) => void
  setDiagnostics: (diagnostics: Diagnostic[]) => void
  mergeDiagnostics: (file: string, source: Diagnostic['source'], diagnostics: Diagnostic[]) => void
  setCursor: (line: number, column: number) => void
  setFrozen: (path: string, frozen: boolean) => void
  setVerifyFailed: (path: string, v: boolean) => void
  navigate: (dir: -1 | 1) => void
  consumeReveal: () => void
  saveViewState: (path: string, state: unknown) => void
  reloadIfChanged: () => Promise<void>
}

export function isDirty(tab: FileTab): boolean {
  return tab.content !== tab.savedContent
}

let saveAsHook: ((suggested: string) => Promise<string | null>) | null = null
export function setSaveAsPicker(fn: (suggested: string) => Promise<string | null>): void {
  saveAsHook = fn
}
let afterSaveHook: ((path: string) => void) | null = null
export function setAfterSave(fn: (path: string) => void): void {
  afterSaveHook = fn
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activePath: null,
  diagnostics: [],
  cursor: { line: 1, column: 1 },
  history: [],
  historyIndex: -1,
  untitledCounter: 1,
  pendingReveal: null,

  openPath: async (path, opts = {}) => {
    const existing = get().tabs.find((t) => t.path === path)
    if (existing) {
      get().setActive(path)
    } else {
      if (isProbablyBinary(path)) {
        toast('warning', 'Binary file', `${basename(path)} is not a text file. Use Reveal in Finder to open it externally.`)
        return
      }
      try {
        const content = await fs.readText(path)
        const st = await fs.stat(path)
        const frozen = await fs.exists(`${path}.freeze.json`).catch(() => false)
        const tab: FileTab = { path, name: basename(path), language: languageForPath(path), content, savedContent: content, modifiedMs: st.modified_ms, frozen: frozen && path.endsWith('.gbl') }
        set((s) => ({ tabs: [...s.tabs, tab] }))
        get().setActive(path)
      } catch (e) {
        toast('error', 'Could not open file', e instanceof Error ? e.message : String(e))
        return
      }
    }
    if (opts.line) set({ pendingReveal: { path, line: opts.line, column: opts.column ?? 1 } })
  },

  openBuffer: (tab) => {
    const savedContent = tab.savedContent ?? tab.content
    set((s) => (s.tabs.some((t) => t.path === tab.path) ? {} : { tabs: [...s.tabs, { ...tab, savedContent }] }))
    get().setActive(tab.path)
  },

  newUntitled: (initial = '') => {
    const n = get().untitledCounter
    const path = `untitled:${n}`
    const name = n === 1 ? 'untitled.gbl' : `untitled-${n}.gbl`
    set((s) => ({ untitledCounter: n + 1, tabs: [...s.tabs, { path, name, language: 'goblinpp', content: initial, savedContent: '' }] }))
    get().setActive(path)
    return path
  },

  closeTab: async (path, opts = {}) => {
    const tab = get().tabs.find((t) => t.path === path)
    if (!tab) return true
    if (!opts.force && isDirty(tab)) {
      const r = await confirmDialog('Unsaved changes', `Save changes to ${tab.name} before closing?`, { ok: 'Save', cancel: 'Cancel', third: "Don't Save" })
      if (r === 'cancel') return false
      if (r === 'ok') {
        const saved = await get().save(path)
        if (!saved) return false
      }
    }
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.path === path)
      const tabs = s.tabs.filter((t) => t.path !== path)
      let activePath = s.activePath
      if (activePath === path) {
        const fromHistory = [...s.history].reverse().find((h) => h !== path && tabs.some((t) => t.path === h))
        const next = fromHistory ?? tabs[idx]?.path ?? tabs[idx - 1]?.path ?? null
        activePath = next
      }
      return { tabs, activePath, history: s.history.filter((h) => h !== path) }
    })
    return true
  },

  closeOthers: async (path) => {
    for (const t of [...get().tabs]) if (t.path !== path) await get().closeTab(t.path)
  },

  closeAll: async () => {
    for (const t of [...get().tabs]) {
      const ok = await get().closeTab(t.path)
      if (!ok) return false
    }
    return true
  },

  setActive: (path) =>
    set((s) => {
      if (!s.tabs.some((t) => t.path === path)) return {}
      const history = [...s.history.slice(0, s.historyIndex + 1).filter((h) => h !== path), path].slice(-50)
      return { activePath: path, history, historyIndex: history.length - 1 }
    }),

  updateContent: (path, content) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content } : t)) })),

  save: async (path) => {
    const target = path ?? get().activePath
    if (!target) return null
    const tab = get().tabs.find((t) => t.path === target)
    if (!tab) return null
    if (isUntitled(target)) return get().saveAs(target)
    if (!isTauri()) {
      toast('warning', 'Web preview', 'Saving requires the desktop app.')
      return null
    }
    try {
      await fs.writeText(target, tab.content)
      const st = await fs.stat(target)
      set((s) => ({ tabs: s.tabs.map((t) => (t.path === target ? { ...t, savedContent: tab.content, modifiedMs: st.modified_ms } : t)) }))
      afterSaveHook?.(target)
      return target
    } catch (e) {
      toast('error', 'Save failed', e instanceof Error ? e.message : String(e))
      return null
    }
  },

  saveAs: async (path) => {
    const source = path ?? get().activePath
    if (!source) return null
    const tab = get().tabs.find((t) => t.path === source)
    if (!tab || !saveAsHook) return null
    const suggested = isUntitled(source) ? tab.name : source
    const dest = await saveAsHook(suggested)
    if (!dest) return null
    try {
      await fs.writeText(dest, tab.content)
      const st = await fs.stat(dest)
      set((s) => {
        const already = s.tabs.find((t) => t.path === dest && t.path !== source)
        const tabs = s.tabs
          .filter((t) => !(already && t.path === dest))
          .map((t) => (t.path === source ? { ...t, path: dest, name: basename(dest), language: languageForPath(dest), savedContent: tab.content, modifiedMs: st.modified_ms, frozen: false } : t))
        return { tabs, activePath: s.activePath === source ? dest : s.activePath, history: s.history.map((h) => (h === source ? dest : h)) }
      })
      afterSaveHook?.(dest)
      return dest
    } catch (e) {
      toast('error', 'Save failed', e instanceof Error ? e.message : String(e))
      return null
    }
  },

  saveAll: async () => {
    for (const t of get().tabs) if (isDirty(t)) await get().save(t.path)
  },

  revert: async (path) => {
    if (isUntitled(path)) return
    try {
      const content = await fs.readText(path)
      const st = await fs.stat(path)
      set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, savedContent: content, modifiedMs: st.modified_ms } : t)) }))
    } catch {
      /* ignore */
    }
  },

  renamePath: (from, to) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.path === from) return { ...t, path: to, name: basename(to), language: languageForPath(to) }
        if (t.path.startsWith(from + '/')) {
          const np = to + t.path.slice(from.length)
          return { ...t, path: np, name: basename(np) }
        }
        return t
      }),
      activePath: s.activePath === from ? to : s.activePath && s.activePath.startsWith(from + '/') ? to + s.activePath.slice(from.length) : s.activePath,
    })),

  setDiagnostics: (diagnostics) => set({ diagnostics }),

  mergeDiagnostics: (file, source, incoming) =>
    set((s) => ({ diagnostics: [...s.diagnostics.filter((d) => !(d.file === file && d.source === source)), ...incoming.map((d) => ({ ...d, source }))] })),

  setCursor: (line, column) => set({ cursor: { line, column } }),

  setFrozen: (path, frozen) => set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, frozen } : t)) })),
  setVerifyFailed: (path, v) => set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, verifyFailed: v } : t)) })),

  navigate: (dir) => {
    const { history, historyIndex, tabs } = get()
    let i = historyIndex + dir
    while (i >= 0 && i < history.length && !tabs.some((t) => t.path === history[i])) i += dir
    if (i < 0 || i >= history.length) return
    set({ historyIndex: i, activePath: history[i] })
  },

  consumeReveal: () => set({ pendingReveal: null }),

  saveViewState: (path, state) => set((s) => ({ tabs: s.tabs.map((t) => (t.path === path ? { ...t, viewState: state } : t)) })),

  reloadIfChanged: async () => {
    if (!isTauri()) return
    for (const t of get().tabs) {
      if (isUntitled(t.path)) continue
      try {
        const st = await fs.stat(t.path)
        if (!st.exists) continue
        if (t.modifiedMs && st.modified_ms > t.modifiedMs) {
          if (!isDirty(t)) {
            const content = await fs.readText(t.path)
            set((s) => ({ tabs: s.tabs.map((x) => (x.path === t.path ? { ...x, content, savedContent: content, modifiedMs: st.modified_ms } : x)) }))
          } else {
            set((s) => ({ tabs: s.tabs.map((x) => (x.path === t.path ? { ...x, modifiedMs: st.modified_ms } : x)) }))
            toast('warning', 'File changed on disk', `${t.name} was modified outside the IDE while you have unsaved edits.`)
          }
        }
        const frozen = t.path.endsWith('.gbl') ? await fs.exists(`${t.path}.freeze.json`) : false
        if (frozen !== !!t.frozen) set((s) => ({ tabs: s.tabs.map((x) => (x.path === t.path ? { ...x, frozen } : x)) }))
      } catch {
        /* ignore */
      }
    }
  },
}))

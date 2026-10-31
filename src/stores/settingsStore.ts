/*
 * Persistent IDE settings (one JSON document written by the Rust side to the
 * per-user config dir). UI-only preferences that are harmless to lose
 * (theme, keymap) also live in localStorage for synchronous first paint.
 */
import { create } from 'zustand'
import { isTauri, settingsApi } from '../platform/tauri'

export type BackgroundFit = 'cover' | 'contain' | 'stretch' | 'center' | 'tile'

export interface BackgroundSettings {
  path: string // absolute image path ('' = none); 'bundled:squirrel' for the sample
  opacity: number // 0..1
  fit: BackgroundFit
  blur: number // px
  dim: number // 0..1 extra darkening behind panels
}

export interface Settings {
  lastProject: string
  recentProjects: string[]
  openTabs: string[]
  activeTab: string
  goblinPath: string // '' = auto (bundled → ~/.local/bin → PATH)
  runsRoot: string // '' = engine default (./runs)
  autoVerify: boolean
  autoSaveBeforeRun: boolean
  defaultProfile: 'everyday' | 'GO_PARANOID' | 'COMPLETELY_MAD'
  checkOnSave: boolean
  checkWhileTyping: boolean
  inlineRustMode: 'hash' | 'refuse'
  inlineRustHashes: Record<string, string> // file path -> approved SHA-256
  editor: { fontSize: number; tabSize: number; wordWrap: boolean; minimap: boolean; renderWhitespace: boolean; bracketColors: boolean; ligatures: boolean; lineHeight: number }
  uiScale: number
  background: BackgroundSettings
  reopenLastProject: boolean
  showHiddenFiles: boolean
  terminalFontSize: number
  sidebarWidth: number
  bottomHeight: number
  aiPaneWidth: number
}

export const DEFAULT_SETTINGS: Settings = {
  lastProject: '',
  recentProjects: [],
  openTabs: [],
  activeTab: '',
  goblinPath: '',
  runsRoot: '',
  autoVerify: false,
  autoSaveBeforeRun: true,
  defaultProfile: 'everyday',
  checkOnSave: true,
  checkWhileTyping: true,
  inlineRustMode: 'hash',
  inlineRustHashes: {},
  editor: { fontSize: 14, tabSize: 4, wordWrap: false, minimap: false, renderWhitespace: false, bracketColors: true, ligatures: true, lineHeight: 1.55 },
  uiScale: 100,
  background: { path: '', opacity: 0.35, fit: 'cover', blur: 0, dim: 0.25 },
  reopenLastProject: true,
  showHiddenFiles: true,
  terminalFontSize: 13,
  sidebarWidth: 260,
  bottomHeight: 300,
  aiPaneWidth: 380,
}

const LS_KEY = 'goblin-ide.settings'

function loadLocal(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {}
  } catch {
    return {}
  }
}

function merge(base: Settings, patch: Partial<Settings>): Settings {
  return {
    ...base,
    ...patch,
    editor: { ...base.editor, ...(patch.editor ?? {}) },
    background: { ...base.background, ...(patch.background ?? {}) },
    inlineRustHashes: { ...base.inlineRustHashes, ...(patch.inlineRustHashes ?? {}) },
  }
}

interface SettingsState {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  update: (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void
  addRecentProject: (path: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist(settings: Settings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
  if (!isTauri()) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void settingsApi.save(settings as unknown as Record<string, unknown>).catch(() => {})
  }, 300)
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: merge(DEFAULT_SETTINGS, loadLocal()),
  loaded: false,

  load: async () => {
    if (isTauri()) {
      try {
        const remote = (await settingsApi.load()) as Partial<Settings>
        const merged = merge(merge(DEFAULT_SETTINGS, loadLocal()), remote)
        set({ settings: merged, loaded: true })
        try { localStorage.setItem(LS_KEY, JSON.stringify(merged)) } catch { /* ignore */ }
        return
      } catch {
        /* fall through */
      }
    }
    set({ loaded: true })
  },

  update: (patch) => {
    const current = get().settings
    const p = typeof patch === 'function' ? patch(current) : patch
    const next = merge(current, p)
    set({ settings: next })
    persist(next)
  },

  addRecentProject: (path) => {
    get().update((s) => ({ lastProject: path, recentProjects: [path, ...s.recentProjects.filter((p) => p !== path)].slice(0, 12) }))
  },
}))

export function getSettings(): Settings {
  return useSettingsStore.getState().settings
}

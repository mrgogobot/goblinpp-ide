import { create } from 'zustand'

export type ActivityId = 'project' | 'search' | 'scm' | 'run' | 'evidence' | 'ai' | 'settings'
export type AIPaneDock = 'right' | 'bottom' | 'floating'

export interface AppState {
  activeActivity: ActivityId
  setActiveActivity: (a: ActivityId) => void

  settingsOpen: boolean
  settingsSection: string
  openSettings: (section?: string) => void
  setSettingsSection: (section: string) => void
  closeSettings: () => void

  splashDone: boolean
  finishSplash: () => void

  aiPaneOpen: boolean
  aiPaneDock: AIPaneDock
  toggleAiPane: () => void
  setAiPaneOpen: (v: boolean) => void
  setAiPaneDock: (v: AIPaneDock) => void

  activeBottomTab: string
  setActiveBottomTab: (t: string) => void
  bottomPanelOpen: boolean
  toggleBottomPanel: () => void
  setBottomPanelOpen: (v: boolean) => void
  showBottomTab: (t: string) => void
  bottomMaximized: boolean
  toggleBottomMaximized: () => void

  leftSidebarOpen: boolean
  setLeftSidebarOpen: (v: boolean) => void

  quickOpen: { open: boolean; mode: 'files' | 'commands' }
  setQuickOpen: (open: boolean, mode?: 'files' | 'commands') => void

  backgroundDialogOpen: boolean
  setBackgroundDialogOpen: (v: boolean) => void
  backgroundDataUrl: string | null
  setBackgroundDataUrl: (v: string | null) => void

  searchQuery: string
  setSearchQuery: (q: string) => void

  isWeb: boolean
}

export const useAppStore = create<AppState>((set) => ({
  activeActivity: 'project',
  setActiveActivity: (activeActivity) => set({ activeActivity, leftSidebarOpen: true }),

  settingsOpen: false,
  settingsSection: 'general',
  openSettings: (section) => set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  closeSettings: () => set({ settingsOpen: false }),

  splashDone: false,
  finishSplash: () => set({ splashDone: true }),

  aiPaneOpen: false,
  aiPaneDock: 'right',
  toggleAiPane: () => set((s) => ({ aiPaneOpen: !s.aiPaneOpen })),
  setAiPaneOpen: (aiPaneOpen) => set({ aiPaneOpen }),
  setAiPaneDock: (aiPaneDock) => set({ aiPaneDock }),

  activeBottomTab: 'run',
  setActiveBottomTab: (activeBottomTab) => set({ activeBottomTab, bottomPanelOpen: true }),
  bottomPanelOpen: true,
  toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen, bottomMaximized: false })),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  showBottomTab: (t) => set({ activeBottomTab: t, bottomPanelOpen: true }),
  bottomMaximized: false,
  toggleBottomMaximized: () => set((s) => ({ bottomMaximized: !s.bottomMaximized, bottomPanelOpen: true })),

  leftSidebarOpen: true,
  setLeftSidebarOpen: (leftSidebarOpen) => set({ leftSidebarOpen }),

  quickOpen: { open: false, mode: 'files' },
  setQuickOpen: (open, mode) => set((s) => ({ quickOpen: { open, mode: mode ?? s.quickOpen.mode } })),

  backgroundDialogOpen: false,
  setBackgroundDialogOpen: (backgroundDialogOpen) => set({ backgroundDialogOpen }),
  backgroundDataUrl: null,
  setBackgroundDataUrl: (backgroundDataUrl) => set({ backgroundDataUrl }),

  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  isWeb: !(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window),
}))

import { create } from 'zustand'
import { defaultBindings, isMacPlatform } from '../keymap/keymap'

const KEY = 'goblin-ide.keymap'

function load(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : null
  } catch {
    return null
  }
}

interface KeymapState {
  isMac: boolean
  bindings: Record<string, string>
  setBinding: (action: string, combo: string) => void
  reset: () => void
  conflictActions: () => string[]
}

export const useKeymapStore = create<KeymapState>((set, get) => {
  const isMac = isMacPlatform()
  const defaults = defaultBindings(isMac)
  return {
    isMac,
    bindings: { ...defaults, ...(load() ?? {}) },

    setBinding: (action, combo) => {
      set((s) => ({ bindings: { ...s.bindings, [action]: combo } }))
      try {
        localStorage.setItem(KEY, JSON.stringify(get().bindings))
      } catch {
        /* ignore */
      }
    },

    reset: () => {
      set({ bindings: defaultBindings(get().isMac) })
      try {
        localStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    },

    conflictActions: () => {
      const bindings = get().bindings
      const byCombo = new Map<string, number>()
      for (const combo of Object.values(bindings)) {
        if (combo) byCombo.set(combo, (byCombo.get(combo) ?? 0) + 1)
      }
      return Object.keys(bindings).filter((a) => bindings[a] && (byCombo.get(bindings[a]) ?? 0) > 1)
    },
  }
})

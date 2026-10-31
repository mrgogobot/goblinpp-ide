import { create } from 'zustand'
import { env, isTauri } from '../platform/tauri'
import type { EnvCheck } from '../platform/tauri'
import { useLanguageStore } from './languageStore'
import { useProjectStore } from './projectStore'
import { getSettings } from './settingsStore'

export type { EnvCheck }

interface EnvironmentState {
  checks: EnvCheck[]
  status: 'idle' | 'detecting' | 'done'
  detectedAt: number
  detect: () => Promise<void>
}

function browserChecks(): EnvCheck[] {
  const loc = Intl.DateTimeFormat().resolvedOptions()
  return [
    { id: 'locale', name: 'Locale & timezone', detail: `${loc.locale}, ${loc.timeZone}`, status: 'ok' },
    { id: 'display', name: 'Display & DPI', detail: `${window.screen.width}×${window.screen.height} @ ${window.devicePixelRatio}×`, status: 'ok' },
  ]
}

export const useEnvironmentStore = create<EnvironmentState>((set) => ({
  checks: [],
  status: 'idle',
  detectedAt: 0,
  detect: async () => {
    set({ status: 'detecting' })
    const lang = useLanguageStore.getState()
    const langCheck: EnvCheck = {
      id: 'language',
      name: 'Language folder',
      detail: lang.manifest ? `Goblin++ ${lang.manifest.version} · ${lang.languageSource} · ${lang.languagePath}` : 'not found — fallback grammar',
      status: lang.manifest ? 'ok' : 'warn',
    }
    let native: EnvCheck[] = []
    if (isTauri()) {
      try {
        native = await env.detect(getSettings().goblinPath || undefined, useProjectStore.getState().root || undefined)
      } catch (e) {
        native = [{ id: 'native', name: 'Native detection', detail: e instanceof Error ? e.message : String(e), status: 'fail' }]
      }
    } else {
      native = [{ id: 'native', name: 'Desktop shell', detail: 'running in a web preview — processes and the filesystem are unavailable', status: 'warn' }]
    }
    set({ checks: [...native, langCheck, ...browserChecks()], status: 'done', detectedAt: Date.now() })
  },
}))

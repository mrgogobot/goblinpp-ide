import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { THEMES } from './themes'
import type { ThemeId } from './themes'

interface ThemeContextValue { theme: ThemeId; setTheme: (t: ThemeId) => void; themes: typeof THEMES }
const ThemeContext = createContext<ThemeContextValue | null>(null)
const STORAGE_KEY = 'goblin-ide.theme'

/** Imperative access for actions outside React (command palette, native menu). */
export const useTheme$ = { setTheme: (_t: ThemeId) => {}, get: (): ThemeId => 'goblin' }

export function readStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && THEMES.some((t) => t.id === stored)) return stored as ThemeId
  return 'goblin'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme)
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    useTheme$.get = () => theme
  }, [theme])
  const setTheme = useCallback((t: ThemeId) => setThemeState(t), [])
  useTheme$.setTheme = setTheme
  const value = useMemo(() => ({ theme, setTheme, themes: THEMES }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

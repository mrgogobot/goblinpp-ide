export type ThemeId = 'goblin' | 'darcula' | 'light' | 'high-contrast' | 'new-ui'
export interface ThemeMeta { id: ThemeId; label: string; kind: 'dark' | 'light' }
export const THEMES: ThemeMeta[] = [
  { id: 'goblin', label: 'Goblin Merch (charcoal · purple · electric green)', kind: 'dark' },
  { id: 'darcula', label: 'Darcula', kind: 'dark' },
  { id: 'new-ui', label: 'New UI', kind: 'dark' },
  { id: 'high-contrast', label: 'High Contrast', kind: 'dark' },
  { id: 'light', label: 'Light', kind: 'light' },
]
export function themeLabel(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.label.split(' (')[0] ?? id
}

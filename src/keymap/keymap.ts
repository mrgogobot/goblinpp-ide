/*
 * Keyboard shortcut model — IntelliJ-compatible defaults, remappable in
 * Settings → Keymap. Bindings use a canonical `mods+key` form (`meta+alt+i`).
 * Standard macOS file shortcuts (⌘N ⌘O ⌘S ⌘W ⌘,) live in the native menu.
 */
export interface KeyAction { id: string; label: string; group: string }

export const KEY_ACTIONS: KeyAction[] = [
  { id: 'run.run', label: 'Run', group: 'Run' },
  { id: 'run.compile', label: 'Compile and Run (--compile)', group: 'Run' },
  { id: 'run.check', label: 'Check (preview, no evidence)', group: 'Run' },
  { id: 'run.stop', label: 'Stop', group: 'Run' },
  { id: 'run.freeze', label: 'Freeze Current File', group: 'Run' },
  { id: 'run.verify', label: 'Verify Last Run', group: 'Run' },
  { id: 'run.revise', label: 'Revise…', group: 'Run' },
  { id: 'view.ai', label: 'Toggle AI Pane', group: 'View' },
  { id: 'ai.fix', label: 'AI: explain / fix selection', group: 'View' },
  { id: 'code.goToSeal', label: 'Go to next seal', group: 'Code' },
  { id: 'code.format', label: 'Reformat file', group: 'Code' },
  { id: 'view.structure', label: 'Structure view', group: 'View' },
  { id: 'edit.findInFiles', label: 'Find in Files', group: 'Edit' },
  { id: 'nav.quickOpen', label: 'Go to File', group: 'Navigate' },
  { id: 'nav.commandPalette', label: 'Find Action (command palette)', group: 'Navigate' },
  { id: 'nav.back', label: 'Back', group: 'Navigate' },
  { id: 'nav.forward', label: 'Forward', group: 'Navigate' },
  { id: 'view.project', label: 'Toggle Project tool window', group: 'View' },
  { id: 'view.bottom', label: 'Toggle bottom tool window', group: 'View' },
  { id: 'view.bottomMax', label: 'Maximize / restore bottom tool window', group: 'View' },
  { id: 'view.terminal', label: 'Terminal', group: 'View' },
  { id: 'view.newTerminal', label: 'New terminal session', group: 'View' },
  { id: 'view.problems', label: 'Problems', group: 'View' },
  { id: 'view.runPanel', label: 'Run tool window', group: 'View' },
  { id: 'file.nextTab', label: 'Next tab', group: 'File' },
  { id: 'file.prevTab', label: 'Previous tab', group: 'File' },
]

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/i.test(navigator.platform ?? '') || /Macintosh/i.test(navigator.userAgent)
}

const MOD_ORDER = ['alt', 'ctrl', 'meta', 'shift'] as const

export function canonicalCombo(mods: string[], key: string): string {
  const set = new Set(mods)
  const parts: string[] = MOD_ORDER.filter((m) => set.has(m))
  if (key) parts.push(key)
  return parts.join('+')
}

export function defaultBindings(isMac: boolean): Record<string, string> {
  const pick = (mac: string, win: string) => (isMac ? mac : win)
  const c = canonicalCombo
  return {
    'run.run': pick(c(['ctrl'], 'r'), c(['shift'], 'f10')),
    'run.compile': pick(c(['ctrl', 'shift'], 'r'), c(['ctrl', 'shift'], 'f10')),
    'run.check': pick(c(['meta', 'alt'], 'c'), c(['ctrl', 'alt'], 'c')),
    'run.stop': pick(c(['meta'], 'f2'), c(['ctrl'], 'f2')),
    'run.freeze': pick(c(['meta', 'alt'], 'f'), c(['ctrl', 'alt'], 'f')),
    'run.verify': pick(c(['meta', 'alt'], 'v'), c(['ctrl', 'alt'], 'v')),
    'run.revise': pick(c(['meta', 'alt'], 'r'), c(['ctrl', 'alt'], 'r')),
    'view.ai': pick(c(['meta', 'alt'], 'i'), c(['ctrl', 'alt'], 'i')),
    'ai.fix': pick(c(['meta'], 'l'), c(['ctrl'], 'l')),
    'code.goToSeal': pick(c(['meta', 'alt'], 's'), c(['ctrl', 'alt'], 's')),
    'code.format': pick(c(['meta', 'alt'], 'l'), c(['ctrl', 'alt'], 'l')),
    'view.structure': pick(c(['meta'], '7'), c(['ctrl'], 'f12')),
    'edit.findInFiles': pick(c(['meta', 'shift'], 'f'), c(['ctrl', 'shift'], 'f')),
    'nav.quickOpen': pick(c(['meta'], 'p'), c(['ctrl'], 'p')),
    'nav.commandPalette': pick(c(['meta', 'shift'], 'a'), c(['ctrl', 'shift'], 'a')),
    'nav.back': pick(c(['alt', 'meta'], 'left'), c(['ctrl', 'alt'], 'left')),
    'nav.forward': pick(c(['alt', 'meta'], 'right'), c(['ctrl', 'alt'], 'right')),
    'view.project': pick(c(['meta'], '1'), c(['alt'], '1')),
    'view.bottom': pick(c(['meta'], '2'), c(['alt'], '2')),
    'view.bottomMax': pick(c(['meta', 'shift'], 'up'), c(['ctrl', 'shift'], 'up')),
    'view.terminal': pick(c(['alt'], 'f12'), c(['alt'], 'f12')),
    'view.newTerminal': pick(c(['ctrl', 'shift'], '`'), c(['ctrl', 'shift'], '`')),
    'view.problems': pick(c(['meta'], '6'), c(['alt'], '6')),
    'view.runPanel': pick(c(['meta'], '4'), c(['alt'], '4')),
    'file.nextTab': pick(c(['ctrl'], 'tab'), c(['ctrl'], 'tab')),
    'file.prevTab': pick(c(['ctrl', 'shift'], 'tab'), c(['ctrl', 'shift'], 'tab')),
  }
}

function normalizeKey(key: string): string {
  const k = key.toLowerCase()
  if (k === ' ') return 'space'
  if (k === 'escape') return 'esc'
  if (k.startsWith('arrow')) return k.slice(5)
  if (k === 'dead') return ''
  return k
}

export function comboFromEvent(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.altKey) mods.push('alt')
  if (e.ctrlKey) mods.push('ctrl')
  if (e.metaKey) mods.push('meta')
  if (e.shiftKey) mods.push('shift')
  let key = ''
  if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    key = normalizeKey(e.key)
    // With Alt on macOS e.key becomes a symbol (e.g. ƒ); use the physical key instead.
    if (e.altKey && e.code) {
      const code = e.code
      if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase()
      else if (/^Digit\d$/.test(code)) key = code.slice(5)
      else if (/^Arrow/.test(code)) key = code.slice(5).toLowerCase()
      else if (code === 'Backquote') key = '`'
    }
  }
  return canonicalCombo(mods, key)
}

const MAC_SYMBOL: Record<string, string> = { meta: '⌘', alt: '⌥', ctrl: '⌃', shift: '⇧' }
const WIN_LABEL: Record<string, string> = { meta: 'Win', alt: 'Alt', ctrl: 'Ctrl', shift: 'Shift' }

export function displayCombo(combo: string, isMac: boolean): string {
  if (!combo) return ''
  const parts = combo.split('+')
  const key = parts.pop() ?? ''
  const mods = parts.filter((m) => m in (isMac ? MAC_SYMBOL : WIN_LABEL)).map((m) => (isMac ? MAC_SYMBOL[m] : WIN_LABEL[m]))
  if (isMac) {
    const ordered = ['⌃', '⌥', '⇧', '⌘']
    mods.sort((a, b) => ordered.indexOf(a) - ordered.indexOf(b))
  }
  const keyLabel = key === ',' ? ',' : key === 'space' ? 'Space' : key === 'esc' ? 'Esc' : key === 'left' ? '←' : key === 'right' ? '→' : key === 'tab' ? 'Tab' : key.toUpperCase()
  return [...mods, keyLabel].join(isMac ? '' : '+')
}

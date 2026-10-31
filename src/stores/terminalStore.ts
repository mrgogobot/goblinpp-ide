import { create } from 'zustand'

export interface TerminalSession { id: string; title: string; cwd: string; exited?: boolean }

interface TerminalState {
  sessions: TerminalSession[]
  activeId: string | null
  counter: number
  create: (cwd: string, title?: string) => string
  remove: (id: string) => void
  setActive: (id: string) => void
  rename: (id: string, title: string) => void
  markExited: (id: string) => void
  pendingCommands: Record<string, string[]>
  queueCommand: (id: string, cmd: string) => void
  takeCommands: (id: string) => string[]
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  sessions: [],
  activeId: null,
  counter: 1,
  pendingCommands: {},

  create: (cwd, title) => {
    const n = get().counter
    const id = `term-${n}`
    set((s) => ({ counter: n + 1, sessions: [...s.sessions, { id, title: title ?? (n === 1 ? 'Local' : `Local (${n})`), cwd }], activeId: id }))
    return id
  },
  remove: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id)
      const activeId = s.activeId === id ? (sessions[sessions.length - 1]?.id ?? null) : s.activeId
      return { sessions, activeId }
    }),
  setActive: (activeId) => set({ activeId }),
  rename: (id, title) => set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)) })),
  markExited: (id) => set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, exited: true } : x)) })),
  queueCommand: (id, cmd) => set((s) => ({ pendingCommands: { ...s.pendingCommands, [id]: [...(s.pendingCommands[id] ?? []), cmd] } })),
  takeCommands: (id) => {
    const cmds = get().pendingCommands[id] ?? []
    if (cmds.length) set((s) => ({ pendingCommands: { ...s.pendingCommands, [id]: [] } }))
    return cmds
  },
}))

import { isPrivateSource } from '../run/secretInput'
import { create } from 'zustand'
import { assembleContext } from '../ai/context'
import { providerById, resolveProvider } from '../ai/providers'
import type { ChatMessage, ProviderId } from '../ai/types'
import { insertAtCursor } from '../language/monaco'
import { sha256Hex } from '../run/sha256'
import { useAppStore } from './appStore'
import { useEditorStore } from './editorStore'
import { useLanguageStore } from './languageStore'
import { useRunStore } from './runStore'
import type { FunctionEntry } from '../language/manifest'

export interface Thread {
  id: string
  title: string
  provider: ProviderId
  model: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface RequestLogEntry {
  ts: number
  provider: string
  model: string
  bodyHash: string
}

const STORAGE_KEY = 'goblin-ide.ai'

const uid = () => Math.random().toString(36).slice(2, 10)

let currentAbort: AbortController | null = null

interface Persisted {
  threads: Thread[]
  provider: ProviderId
  model: string
  contextFree: boolean
  budgetTokens: number
  contextSources: Record<string, boolean>
}

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Persisted) : {}
  } catch {
    return {}
  }
}

function buildDocsExcerpt(functions: FunctionEntry[], source: string): string | undefined {
  const hits = functions.filter((f) => new RegExp(`\\b${f.name}\\s*\\(`).test(source)).slice(0, 5)
  if (!hits.length) return undefined
  return 'Relevant functions in the active file:\n' + hits.map((f) => `- ${f.name} (${f.domain}) — ${f.description}`).join('\n')
}

interface AiState {
  provider: ProviderId
  model: string
  apiKeys: Record<string, string>
  contextFree: boolean
  budgetTokens: number
  threads: Thread[]
  activeThreadId: string | null
  streaming: boolean
  streamedText: string
  lastUsedChars: number
  lastSources: string[]
  requestLog: RequestLogEntry[]
  contextSources: Record<string, boolean>

  setProvider: (p: ProviderId) => void
  setModel: (m: string) => void
  setApiKey: (provider: string, key: string) => void
  setContextFree: (v: boolean) => void
  setBudgetTokens: (n: number) => void
  toggleContextSource: (id: string) => void
  newThread: () => void
  selectThread: (id: string) => void
  deleteThread: (id: string) => void
  send: (prompt: string) => Promise<void>
  stop: () => void
  regenerate: () => Promise<void>
  togglePin: (messageId: string) => void
  applyLastCode: () => void
  openForFix: (code: string, message: string) => void
}

export const useAiStore = create<AiState>((set, get) => {
  const persisted = loadPersisted()

  const doStream = async (threadId: string, prompt: string, appendUser: boolean) => {
    const s = get()
    const editor = useEditorStore.getState()
    const run = useRunStore.getState()
    const lang = useLanguageStore.getState()

    const activeTab = editor.tabs.find((t) => t.path === editor.activePath)
    const openFiles = editor.tabs
      .filter((t) => t.path !== editor.activePath && !isPrivateSource(t.content))
      .map((t) => ({ path: t.path, snippet: t.content.split('\n').slice(0, 50).join('\n') }))
    const diagnostics = editor.diagnostics.map((d) => `${d.code}: ${d.message} (${d.file}:${d.line})`)

    const bundle = assembleContext({
      userPrompt: prompt,
      contextFree: s.contextFree || !!(activeTab && isPrivateSource(activeTab.content)),
      budgetChars: s.budgetTokens * 4,
      activeFile: s.contextSources['active-file'] && activeTab ? { path: activeTab.path, content: activeTab.content } : undefined,
      openFiles: s.contextSources['open-files'] ? openFiles : undefined,
      diagnostics: s.contextSources['diagnostics'] ? diagnostics : undefined,
      runDir: s.contextSources['run-dir'] && run.lastRun && run.lastRun.profile !== 'GO_PRIVATE' ? `${run.lastRun.command}\nstatus ${run.lastRun.status}${run.lastRun.runDir ? ` RUN_DIR ${run.lastRun.runDir}` : ''}${run.lastRun.error ? `\n${run.lastRun.error.code} ${run.lastRun.error.message}` : ''}` : undefined,
      sealLedger: s.contextSources['seal-ledger'] ? (run.lastRun?.receipt?.sealed_artifacts ?? []).map((x) => `${x.name} ${x.sha256}`) : undefined,
      freezeState: s.contextSources['freeze-state'] && activeTab && run.fileStatus[activeTab.path] ? `${activeTab.path} ${run.fileStatus[activeTab.path].state}` : undefined,
      docs: s.contextSources['docs'] ? buildDocsExcerpt(lang.functions, activeTab?.content ?? '') : undefined,
    })

    const history = get().threads.find((t) => t.id === threadId)?.messages ?? []
    const sendMessages = [
      { role: 'system', content: bundle.system },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: bundle.user },
    ]

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: prompt, ts: Date.now() }
    const assistantMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', ts: Date.now(), provider: s.provider, model: s.model }

    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId
          ? {
              ...t,
              title: t.messages.length === 0 ? prompt.slice(0, 42) : t.title,
              messages: appendUser ? [...t.messages, userMsg, assistantMsg] : [...t.messages, assistantMsg],
              updatedAt: Date.now(),
            }
          : t,
      ),
      streaming: true,
      streamedText: '',
      lastUsedChars: bundle.usedChars,
      lastSources: bundle.sources,
    }))

    const { provider, simulated } = resolveProvider(s.provider, s.apiKeys[s.provider])
    const controller = new AbortController()
    currentAbort = controller

    const applyDelta = (delta: string) =>
      set((state) => ({
        streamedText: state.streamedText + delta,
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, messages: t.messages.map((m) => (m.id === assistantMsg.id ? { ...m, content: m.content + delta } : m)) } : t,
        ),
      }))

    try {
      await provider.stream(
        { messages: sendMessages, model: s.model, provider: s.provider, apiKey: s.apiKeys[s.provider], baseUrl: providerById(s.provider).baseUrl },
        applyDelta,
        controller.signal,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'request failed'
      set((state) => ({
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, messages: t.messages.map((m) => (m.id === assistantMsg.id ? { ...m, content: `⚠ ${msg}` } : m)) } : t,
        ),
      }))
    } finally {
      const bodyHash = await sha256Hex(JSON.stringify(sendMessages))
      set((state) => ({
        streaming: false,
        requestLog: [{ ts: Date.now(), provider: simulated ? 'mock (simulated)' : s.provider, model: s.model, bodyHash: `${bodyHash.slice(0, 12)}…` }, ...state.requestLog].slice(0, 100),
      }))
      if (currentAbort === controller) currentAbort = null
    }
  }

  return {
    provider: persisted.provider ?? 'mock',
    model: persisted.model ?? 'goblin-assistant',
    apiKeys: {},
    contextFree: persisted.contextFree ?? false,
    budgetTokens: persisted.budgetTokens ?? 32000,
    threads: persisted.threads ?? [],
    activeThreadId: persisted.threads?.[0]?.id ?? null,
    streaming: false,
    streamedText: '',
    lastUsedChars: 0,
    lastSources: [],
    requestLog: [],
    contextSources: persisted.contextSources ?? {
      'active-file': true,
      'open-files': true,
      diagnostics: true,
      'run-dir': true,
      'seal-ledger': true,
      'freeze-state': true,
      docs: true,
    },

    setProvider: (provider) => {
      const cfg = providerById(provider)
      set({ provider, model: cfg.defaultModel })
    },
    setModel: (model) => set({ model }),
    setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
    setContextFree: (contextFree) => set({ contextFree }),
    setBudgetTokens: (budgetTokens) => set({ budgetTokens }),
    toggleContextSource: (id) => set((s) => ({ contextSources: { ...s.contextSources, [id]: !s.contextSources[id] } })),

    newThread: () => {
      const s = get()
      const id = uid()
      set({
        activeThreadId: id,
        threads: [{ id, title: 'New conversation', provider: s.provider, model: s.model, messages: [], createdAt: Date.now(), updatedAt: Date.now() }, ...s.threads],
      })
    },
    selectThread: (id) => set({ activeThreadId: id }),
    deleteThread: (id) =>
      set((s) => {
        const threads = s.threads.filter((t) => t.id !== id)
        return { threads, activeThreadId: s.activeThreadId === id ? (threads[0]?.id ?? null) : s.activeThreadId }
      }),

    send: async (prompt) => {
      let threadId = get().activeThreadId
      if (!threadId) {
        threadId = uid()
        const s = get()
        set({
          activeThreadId: threadId,
          threads: [{ id: threadId, title: prompt.slice(0, 42), provider: s.provider, model: s.model, messages: [], createdAt: Date.now(), updatedAt: Date.now() }, ...s.threads],
        })
      }
      await doStream(threadId, prompt, true)
    },

    stop: () => {
      currentAbort?.abort()
      set({ streaming: false })
    },

    regenerate: async () => {
      const s = get()
      const thread = s.threads.find((t) => t.id === s.activeThreadId)
      if (!thread) return
      const lastUser = [...thread.messages].reverse().find((m) => m.role === 'user')
      if (!lastUser) return
      const idx = thread.messages.lastIndexOf(lastUser)
      set((state) => ({
        threads: state.threads.map((t) => (t.id === state.activeThreadId ? { ...t, messages: t.messages.slice(0, idx + 1) } : t)),
      }))
      await doStream(thread.id, lastUser.content, false)
    },

    togglePin: (messageId) =>
      set((s) => ({
        threads: s.threads.map((t) => ({ ...t, messages: t.messages.map((m) => (m.id === messageId ? { ...m, pinned: !m.pinned } : m)) })),
      })),

    applyLastCode: () => {
      const s = get()
      const thread = s.threads.find((t) => t.id === s.activeThreadId)
      const lastAssistant = [...(thread?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
      if (!lastAssistant) return
      const m = /```(?:gbl|goblinpp|goblin)?\s*\n([\s\S]*?)```/.exec(lastAssistant.content)
      const code = m?.[1]?.trim()
      if (code) insertAtCursor(code)
    },

    openForFix: (code, message) => {
      useAppStore.getState().setAiPaneOpen(true)
      if (!get().activeThreadId) get().newThread()
      void get().send(`Fix this diagnostic: ${code} — ${message}`)
    },
  }
})

// Persist non-secret AI state (threads, provider/model, prefs) to localStorage.
let saveTimer: ReturnType<typeof setTimeout> | undefined
useAiStore.subscribe((s) => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ threads: s.threads, provider: s.provider, model: s.model, contextFree: s.contextFree, budgetTokens: s.budgetTokens, contextSources: s.contextSources }),
      )
    } catch {
      /* ignore */
    }
  }, 500)
})

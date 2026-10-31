import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { approxTokens } from '../ai/context'
import { PROVIDERS } from '../ai/providers'
import { useAiStore } from '../stores/aiStore'
import { useAppStore } from '../stores/appStore'
import { AIIcon, CloseIcon } from './icons'

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
    return <span key={i}>{p}</span>
  })
}

function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let inCode = false
  let codeBuf: string[] = []
  let buf: string[] = []
  let key = 0

  const flushText = () => {
    if (buf.length) {
      out.push(<p key={key++} style={{ margin: '4px 0' }}>{inline(buf.join(' '))}</p>)
      buf = []
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        out.push(<pre key={key++} className="ai-code">{codeBuf.join('\n')}</pre>)
        codeBuf = []
        inCode = false
      } else {
        flushText()
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }
    if (line.trim() === '') {
      flushText()
      continue
    }
    buf.push(line)
  }
  flushText()
  if (inCode) out.push(<pre key={key++} className="ai-code">{codeBuf.join('\n')}</pre>)
  return <>{out}</>
}

export function AIPane() {
  const aiPaneOpen = useAppStore((s) => s.aiPaneOpen)
  const setAiPaneOpen = useAppStore((s) => s.setAiPaneOpen)

  const provider = useAiStore((s) => s.provider)
  const setProvider = useAiStore((s) => s.setProvider)
  const model = useAiStore((s) => s.model)
  const setModel = useAiStore((s) => s.setModel)
  const contextFree = useAiStore((s) => s.contextFree)
  const setContextFree = useAiStore((s) => s.setContextFree)
  const threads = useAiStore((s) => s.threads)
  const activeThreadId = useAiStore((s) => s.activeThreadId)
  const streaming = useAiStore((s) => s.streaming)
  const send = useAiStore((s) => s.send)
  const stop = useAiStore((s) => s.stop)
  const regenerate = useAiStore((s) => s.regenerate)
  const togglePin = useAiStore((s) => s.togglePin)
  const applyLastCode = useAiStore((s) => s.applyLastCode)
  const newThread = useAiStore((s) => s.newThread)
  const lastUsedChars = useAiStore((s) => s.lastUsedChars)
  const lastSources = useAiStore((s) => s.lastSources)
  const budgetTokens = useAiStore((s) => s.budgetTokens)

  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const thread = threads.find((t) => t.id === activeThreadId) ?? null
  const cfg = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0]

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [thread?.messages, streaming])

  const submit = () => {
    const p = draft.trim()
    if (!p || streaming) return
    setDraft('')
    void send(p)
  }

  if (!aiPaneOpen) {
    return (
      <div className="ai-retract-tab" style={{ position: 'relative' }} onClick={() => setAiPaneOpen(true)} title="Open AI Assistant (⌥⌘I)" role="button" aria-label="Open AI Assistant">
        <span>AI ASSISTANT</span>
      </div>
    )
  }

  return (
    <aside className="ai-pane" aria-label="AI Assistant">
      <div className="ai-pane-header">
        <AIIcon size={16} />
        <span style={{ fontWeight: 600, flex: 1 }}>AI Assistant</span>
        <button type="button" className="toolbar-btn" onClick={newThread} title="New conversation">+</button>
        <select className="settings-select" style={{ maxWidth: 120 }} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} title="Provider">
          {PROVIDERS.filter((p) => p.enabled).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select className="settings-select" style={{ maxWidth: 130 }} value={model} onChange={(e) => setModel(e.target.value)} title="Model">
          {cfg.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button type="button" className="icon-btn" onClick={() => setAiPaneOpen(false)} title="Retract pane">
          <CloseIcon size={14} />
        </button>
      </div>

      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" id="ai-context-free" checked={contextFree} onChange={(e) => setContextFree(e.target.checked)} />
        <label htmlFor="ai-context-free" title="When on, only your prompt and a minimal system prompt are sent">🔒 Context-free mode</label>
        <span className="grow" />
        <span className="muted">{thread ? thread.messages.length : 0} msgs</span>
      </div>

      <div ref={scrollRef} className="ai-pane-body">
        {!thread || thread.messages.length === 0 ? (
          <div className="panel-placeholder" style={{ height: 'auto', padding: '12px 4px' }}>
            <span className="title">The AI Assistant is a tool, not the centrepiece.</span>
            <span>Ask it to <strong>explain</strong> this file, <strong>fix</strong> a diagnostic, or <strong>write</strong> a <code>g_func</code>. It retracts and stays out of the way.</span>
          </div>
        ) : (
          thread.messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 2 }}>
                {m.role === 'user' ? 'You' : 'Assistant'}
                {m.pinned ? ' · 📌' : ''}
              </div>
              <Markdown text={m.content} />
              {m.role === 'assistant' && m.content && (
                <div className="ai-actions">
                  <button type="button" onClick={() => navigator.clipboard?.writeText(m.content)}>Copy</button>
                  {/```gbl/.test(m.content) && <button type="button" onClick={applyLastCode}>Apply code</button>}
                  <button type="button" onClick={() => regenerate()}>Regenerate</button>
                  <button type="button" onClick={() => togglePin(m.id)}>{m.pinned ? 'Unpin' : 'Pin'}</button>
                </div>
              )}
            </div>
          ))
        )}
        {streaming && <div className="accent-text" style={{ fontSize: 12 }}>⚡ thinking…</div>}
      </div>

      <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
        {lastUsedChars > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-muted)' }}>
              <span>context ~{approxTokens(lastUsedChars)} tokens / {budgetTokens}</span>
              <span>{lastSources.join(', ')}</span>
            </div>
            <div style={{ height: 3, background: 'var(--bg-hover)', borderRadius: 2, marginTop: 3 }}>
              <div style={{ width: `${Math.min(100, (lastUsedChars / (budgetTokens * 4)) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        )}
        <div className="settings-row">
          <input
            style={{ flex: 1 }}
            placeholder={contextFree ? 'Ask (context-free)…' : 'Ask about this file…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          />
          {streaming ? (
            <button type="button" className="toolbar-btn" onClick={stop}>Stop</button>
          ) : (
            <button type="button" className="run-btn" onClick={submit} disabled={!draft.trim()}>Send</button>
          )}
        </div>
      </div>
    </aside>
  )
}

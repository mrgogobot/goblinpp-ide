import { useState } from 'react'
import { useAiStore } from '../stores/aiStore'
import { useAppStore } from '../stores/appStore'

export function AIHistoryPanel() {
  const threads = useAiStore((s) => s.threads)
  const requestLog = useAiStore((s) => s.requestLog)
  const selectThread = useAiStore((s) => s.selectThread)
  const deleteThread = useAiStore((s) => s.deleteThread)
  const setAiPaneOpen = useAppStore((s) => s.setAiPaneOpen)
  const [q, setQ] = useState('')

  const filtered = threads.filter(
    (t) => !q || t.title.toLowerCase().includes(q.toLowerCase()) || t.provider.includes(q.toLowerCase()),
  )

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ padding: 8 }}>
        <input placeholder="Search conversations…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} />
      </div>
      {filtered.length === 0 && <div className="panel-placeholder"><span>No AI conversations yet.</span></div>}
      {filtered.map((t) => (
        <div
          key={t.id}
          style={{ display: 'flex', gap: 8, padding: '6px 10px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
          onClick={() => { selectThread(t.id); setAiPaneOpen(true) }}
          title="Open conversation"
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
            <div className="muted">{t.provider} · {t.model} · {t.messages.length} msgs · {new Date(t.updatedAt).toLocaleString()}</div>
          </div>
          <button type="button" className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); deleteThread(t.id) }}>✕</button>
        </div>
      ))}

      {requestLog.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ padding: '4px 10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', fontSize: 11 }}>Request log (hash only)</div>
          {requestLog.slice(0, 20).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 10px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span className="muted" style={{ width: 80 }}>{new Date(r.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
              <span style={{ width: 120 }}>{r.provider}</span>
              <span>{r.model}</span>
              <span className="muted" style={{ flex: 1, textAlign: 'right' }}>{r.bodyHash}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

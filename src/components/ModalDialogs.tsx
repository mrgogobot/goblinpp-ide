import { useEffect, useState } from 'react'
import { useDialogStore, useToastStore } from '../stores/dialogStore'
import type { DialogSpec } from '../stores/dialogStore'

function Dialog({ d }: { d: DialogSpec }) {
  const close = useDialogStore((s) => s.close)
  const [value, setValue] = useState(d.defaultValue ?? '')
  const error = d.kind === 'prompt' && d.validate ? d.validate(value) : null
  const primary = d.buttons.find((b) => b.primary)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(d.id, { button: 'cancel' }) }
      if (e.key === 'Enter' && primary && d.kind !== 'choose' && !error) { e.preventDefault(); e.stopPropagation(); close(d.id, { button: primary.id, value }) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [d, value, error, primary, close])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(d.id, { button: 'cancel' }) }}>
      <div className="modal" role="dialog" aria-label={d.title}>
        <div className="modal-title">{d.title}</div>
        <div className="modal-body">
          {d.message && <p className="modal-message">{d.message}</p>}
          {d.kind === 'prompt' && (
            <>
              <input autoFocus value={value} placeholder={d.placeholder} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} style={{ width: '100%' }} />
              {error && value && <div className="hint" style={{ color: 'var(--error)' }}>{error}</div>}
            </>
          )}
          {d.kind === 'choose' && (
            <div className="modal-options">
              {(d.options ?? []).map((o) => (
                <button key={o.id} type="button" className="modal-option" onClick={() => close(d.id, { button: o.id })}>
                  <span>{o.label}</span>
                  {o.detail && <span className="muted mono" style={{ fontSize: 11 }}>{o.detail}</span>}
                </button>
              ))}
              {(d.options ?? []).length === 0 && <div className="muted">Nothing to choose from.</div>}
            </div>
          )}
        </div>
        <div className="modal-actions">
          {d.buttons.map((b) => (
            <button key={b.id} type="button" className={b.primary ? `run-btn${b.danger ? ' danger' : ''}` : 'toolbar-btn'} disabled={b.primary && d.kind === 'prompt' && (!!error || !value.trim())} onClick={() => close(d.id, { button: b.id, value })}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ModalDialogs() {
  const queue = useDialogStore((s) => s.queue)
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <>
      {queue.length > 0 && <Dialog key={queue[0].id} d={queue[0]} />}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <div className="toast-main">
              <strong>{t.title}</strong>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
              {t.actions && (
                <div className="toast-actions">
                  {t.actions.map((a) => <button key={a.label} type="button" onClick={() => { a.run(); dismiss(t.id) }}>{a.label}</button>)}
                </div>
              )}
            </div>
            <button type="button" className="tab-close" onClick={() => dismiss(t.id)} title="Dismiss">×</button>
          </div>
        ))}
      </div>
    </>
  )
}

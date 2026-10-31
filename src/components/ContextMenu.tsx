import { useEffect, useRef } from 'react'

export interface MenuItemSpec { label?: string; shortcut?: string; action?: () => void; separator?: boolean; disabled?: boolean; danger?: boolean }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItemSpec[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth) el.style.left = `${Math.max(0, x - r.width)}px`
    if (r.bottom > window.innerHeight) el.style.top = `${Math.max(0, y - r.height)}px`
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [x, y, onClose])
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div ref={ref} className="menu context-menu" style={{ position: 'fixed', left: x, top: y, zIndex: 2000 }} role="menu">
        {items.map((it, i) =>
          it.separator ? (
            <div className="menu-sep" key={`s${i}`} />
          ) : (
            <div key={`${it.label}-${i}`} role="menuitem" className={`menu-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`} onMouseDown={(e) => { e.stopPropagation(); if (it.disabled) return; onClose(); it.action?.() }}>
              <span>{it.label}</span>
              {it.shortcut && <span className="shortcut">{it.shortcut}</span>}
            </div>
          ),
        )}
      </div>
    </>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ACTIONS, runAction } from '../actions'
import { useAppStore } from '../stores/appStore'
import { useEditorStore } from '../stores/editorStore'
import { useKeymapStore } from '../stores/keymapStore'
import { useProjectStore } from '../stores/projectStore'
import { displayCombo } from '../keymap/keymap'
import { basename, relative } from '../util/path'

function fuzzyScore(q: string, text: string): number {
  if (!q) return 1
  const t = text.toLowerCase()
  const s = q.toLowerCase()
  if (t.includes(s)) return 100 - t.indexOf(s) + (basename(t).includes(s) ? 50 : 0)
  let ti = 0
  let score = 0
  for (const ch of s) {
    const idx = t.indexOf(ch, ti)
    if (idx < 0) return 0
    score += idx === ti ? 3 : 1
    ti = idx + 1
  }
  return score
}

export function QuickOpen() {
  const { open, mode } = useAppStore((s) => s.quickOpen)
  const setQuickOpen = useAppStore((s) => s.setQuickOpen)
  const fileIndex = useProjectStore((s) => s.fileIndex)
  const root = useProjectStore((s) => s.root)
  const tabs = useEditorStore((s) => s.tabs)
  const openPath = useEditorStore((s) => s.openPath)
  const bindings = useKeymapStore((s) => s.bindings)
  const isMac = useKeymapStore((s) => s.isMac)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(mode === 'commands' ? '>' : ''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open, mode])

  const isCmd = q.startsWith('>')
  const query = isCmd ? q.slice(1).trim() : q.trim()

  const results = useMemo(() => {
    if (isCmd) {
      return ACTIONS.filter((a) => !a.when || a.when()).map((a) => ({ a, s: fuzzyScore(query, `${a.group} ${a.label}`) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 40).map((x) => ({ kind: 'cmd' as const, id: x.a.id, label: x.a.label, detail: x.a.group, shortcut: bindings[x.a.id] ? displayCombo(bindings[x.a.id], isMac) : '' }))
    }
    const files = fileIndex.length ? fileIndex : tabs.map((t) => t.path)
    const list = files.map((p) => ({ p, s: fuzzyScore(query, relative(root, p)) })).filter((x) => x.s > 0)
    list.sort((x, y) => y.s - x.s || x.p.length - y.p.length)
    return list.slice(0, 40).map((x) => ({ kind: 'file' as const, id: x.p, label: basename(x.p), detail: relative(root, x.p), shortcut: '' }))
  }, [isCmd, query, fileIndex, tabs, root, bindings, isMac])

  useEffect(() => setSel(0), [q])
  if (!open) return null

  const choose = (i: number) => {
    const r = results[i]
    if (!r) return
    setQuickOpen(false)
    if (r.kind === 'cmd') runAction(r.id)
    else void openPath(r.id)
  }

  return (
    <div className="modal-overlay quick-open-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setQuickOpen(false) }}>
      <div className="quick-open">
        <input
          ref={inputRef}
          value={q}
          placeholder={isCmd ? 'Find action…' : 'Go to file (type > for actions)…'}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); choose(sel) }
            else if (e.key === 'Escape') { e.preventDefault(); setQuickOpen(false) }
          }}
        />
        <div className="quick-open-list">
          {results.map((r, i) => (
            <div key={r.id} className={`quick-open-item${i === sel ? ' selected' : ''}`} onMouseEnter={() => setSel(i)} onMouseDown={() => choose(i)}>
              <span className="qo-label">{r.kind === 'cmd' ? '⚡ ' : ''}{r.label}</span>
              <span className="qo-detail muted">{r.detail}</span>
              {r.shortcut && <span className="qo-shortcut muted">{r.shortcut}</span>}
            </div>
          ))}
          {results.length === 0 && <div className="muted" style={{ padding: 10 }}>{isCmd ? 'No matching actions.' : root ? 'No matching files.' : 'Open a folder to search its files.'}</div>}
        </div>
      </div>
    </div>
  )
}

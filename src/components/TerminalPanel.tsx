import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { isTauri, pty, shell } from '../platform/tauri'
import { useProjectStore } from '../stores/projectStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTerminalStore } from '../stores/terminalStore'
import type { TerminalSession } from '../stores/terminalStore'
import { useLanguageStore } from '../stores/languageStore'
import { useTheme } from '../theme/ThemeContext'
import { dirname } from '../util/path'

/* One global PTY event subscription, dispatched by terminal id. */
const terms = new Map<string, Terminal>()
/** Plain-text contents of a terminal's buffer (used by the self-test harness). */
export function getTerminalText(id: string, lastLines = 40): string {
  const t = terms.get(id)
  if (!t) return ''
  const buf = t.buffer.active
  const out: string[] = []
  for (let i = Math.max(0, buf.length - lastLines); i < buf.length; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '')
  return out.join('\n')
}
let subscribed = false
async function subscribe() {
  if (subscribed || !isTauri()) return
  subscribed = true
  await pty.onData((e) => terms.get(e.id)?.write(e.data))
  await pty.onExit((e) => {
    terms.get(e.id)?.write('\r\n\x1b[90m[process exited — press Enter to close]\x1b[0m\r\n')
    useTerminalStore.getState().markExited(e.id)
  })
}

function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}
function xtermTheme() {
  const bg = cssVar('--bg-editor', '#242428')
  return {
    background: bg,
    foreground: cssVar('--fg-text', '#dcdce4'),
    cursor: cssVar('--accent-secondary', '#39ff14'),
    cursorAccent: bg,
    selectionBackground: cssVar('--bg-selected', '#3a3245'),
    black: '#1b1b1f', red: '#ff5c5c', green: cssVar('--accent-secondary', '#39ff14'), yellow: '#f0c674', blue: '#7aa2f7', magenta: cssVar('--accent', '#a855f7'), cyan: '#7dd3fc', white: '#d8d8e2',
    brightBlack: '#6b6b78', brightRed: '#ff7b7b', brightGreen: '#8dff79', brightYellow: '#ffe08a', brightBlue: '#9db8ff', brightMagenta: '#d8b4fe', brightCyan: '#a5e8ff', brightWhite: '#ffffff',
  }
}

function TerminalView({ session, visible }: { session: TerminalSession; visible: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { theme } = useTheme()
  const fontSize = useSettingsStore((s) => s.settings.terminalFontSize)
  const takeCommands = useTerminalStore((s) => s.takeCommands)
  const pending = useTerminalStore((s) => s.pendingCommands[session.id])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Menlo, monospace",
      lineHeight: 1.2,
      allowProposedApi: true,
      scrollback: 5000,
      macOptionIsMeta: true,
      theme: xtermTheme(),
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => { void shell.openExternal(uri) }))
    term.open(host)
    fitRef.current = fit
    terms.set(session.id, term)
    try { fit.fit() } catch { /* hidden */ }

    let disposed = false
    const start = async () => {
      if (!isTauri()) {
        term.writeln('\x1b[33mThe terminal needs the desktop app (a real PTY). This is the web preview.\x1b[0m')
        return
      }
      await subscribe()
      const engineDir = useLanguageStore.getState().engine?.path
      const extra = engineDir ? [dirname(engineDir)] : []
      try {
        await pty.spawn(session.id, session.cwd || undefined, extra, term.rows, term.cols)
      } catch (e) {
        term.writeln(`\x1b[31mcould not start shell: ${String(e)}\x1b[0m`)
      }
    }
    void start()

    const d1 = term.onData((data) => { if (!disposed) void pty.write(session.id, data).catch(() => {}) })
    const d2 = term.onResize(({ rows, cols }) => { if (!disposed) void pty.resize(session.id, rows, cols).catch(() => {}) })
    const ro = new ResizeObserver(() => { if (host.offsetWidth > 0 && host.offsetHeight > 0) { try { fit.fit() } catch { /* ignore */ } } })
    ro.observe(host)

    return () => {
      disposed = true
      d1.dispose(); d2.dispose(); ro.disconnect()
      terms.delete(session.id)
      void pty.kill(session.id).catch(() => {})
      term.dispose()
    }
  }, [session.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = terms.get(session.id); if (t) t.options.theme = xtermTheme() }, [theme, session.id])
  useEffect(() => { const t = terms.get(session.id); if (t) { t.options.fontSize = fontSize; try { fitRef.current?.fit() } catch { /* ignore */ } } }, [fontSize, session.id])
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => { try { fitRef.current?.fit() } catch { /* ignore */ } terms.get(session.id)?.focus() }, 30)
    return () => clearTimeout(t)
  }, [visible, session.id])
  useEffect(() => {
    if (!pending?.length) return
    const t = setTimeout(() => { for (const c of takeCommands(session.id)) void pty.write(session.id, `${c}\n`).catch(() => {}) }, 400)
    return () => clearTimeout(t)
  }, [pending, session.id, takeCommands])

  return <div ref={hostRef} className="terminal-host" style={{ display: visible ? 'block' : 'none' }} onMouseUp={() => terms.get(session.id)?.focus()} />
}

export function TerminalPanel({ visible }: { visible: boolean }) {
  const sessions = useTerminalStore((s) => s.sessions)
  const activeId = useTerminalStore((s) => s.activeId)
  const create = useTerminalStore((s) => s.create)
  const remove = useTerminalStore((s) => s.remove)
  const setActive = useTerminalStore((s) => s.setActive)
  const queueCommand = useTerminalStore((s) => s.queueCommand)
  const root = useProjectStore((s) => s.root)
  const engine = useLanguageStore((s) => s.engine)
  const [quick, setQuick] = useState('')

  useEffect(() => { if (visible && sessions.length === 0) create(root) }, [visible, sessions.length, create, root])

  const runQuick = () => {
    const cmd = quick.trim()
    if (!cmd) return
    const id = activeId ?? create(root)
    const full = /^goblin(\+\+|pp)?\b/.test(cmd) ? cmd : `goblin++ ${cmd}`
    const bin = engine?.path && !engine.path.endsWith('/goblin++') ? full.replace(/^goblin\+\+/, JSON.stringify(engine.path)) : full
    queueCommand(id, bin)
    setQuick('')
  }

  return (
    <div className="terminal-panel" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="terminal-tabs">
        {sessions.map((s) => (
          <div key={s.id} className={`terminal-tab${s.id === activeId ? ' active' : ''}${s.exited ? ' exited' : ''}`} onClick={() => setActive(s.id)} title={s.cwd}>
            <span>{s.title}</span>
            <button type="button" className="tab-close" title="Close session" onClick={(e) => { e.stopPropagation(); remove(s.id) }}>×</button>
          </div>
        ))}
        <button type="button" className="icon-btn" title="New session (⌃⇧`)" onClick={() => create(root)}>+</button>
        <span className="grow" />
        <span className="muted" style={{ fontSize: 11, paddingRight: 8 }}>{root || '~'}</span>
      </div>
      <div className="terminal-views">
        {sessions.map((s) => <TerminalView key={s.id} session={s} visible={visible && s.id === activeId} />)}
        {sessions.length === 0 && <div className="panel-placeholder"><span>No terminal session.</span><button type="button" className="run-btn" onClick={() => create(root)}>Open a terminal</button></div>}
      </div>
      <div className="terminal-quick">
        <span className="accent-text mono" style={{ fontSize: 12 }}>goblin++</span>
        <input placeholder="quick-run: run experiment.gbl  ·  check file.gbl  ·  doctor" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runQuick() }} className="mono" />
        <button type="button" className="toolbar-btn framed" onClick={runQuick}>Run in terminal</button>
      </div>
    </div>
  )
}

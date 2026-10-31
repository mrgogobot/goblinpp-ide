import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { runAction, openProject } from './actions'
import { ActivityBar } from './components/ActivityBar'
import { BackgroundDialog, backgroundStyle, resolveBackgroundUrl } from './components/BackgroundDialog'
import { BottomPanel } from './components/BottomPanel'
import { EditorPane } from './components/EditorPane'
import { InlineRustAuthDialog } from './components/InlineRustAuthDialog'
import { ModalDialogs } from './components/ModalDialogs'
import { QuickOpen } from './components/QuickOpen'
import { Resizer } from './components/Resizer'
import { RunConfigDialog } from './components/RunConfigDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { Sidebar } from './components/Sidebar'
import { Splash } from './components/Splash'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { comboFromEvent } from './keymap/keymap'
import { setOnAskAi, setOnAuthoriseRust, setOnOpenDoc } from './language/monaco'
import { dialogs, fs, GBL_FILTER, isTauri, onMenuAction, settingsApi } from './platform/tauri'
import { useAppStore } from './stores/appStore'
import { setAfterSave, setSaveAsPicker, useEditorStore } from './stores/editorStore'
import { useKeymapStore } from './stores/keymapStore'
import { useLanguageStore } from './stores/languageStore'
import { useProjectStore } from './stores/projectStore'
import { useRunStore } from './stores/runStore'
import { getSettings, useSettingsStore } from './stores/settingsStore'
import { basename, dirname, isUntitled } from './util/path'
import { openDoc } from './actions'

const AIPane = lazy(() => import('./components/AIPane').then((m) => ({ default: m.AIPane })))

function useBootstrap() {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const settingsStore = useSettingsStore.getState()
      await settingsStore.load()
      const s = getSettings()
      // Hooks that need platform dialogs.
      setSaveAsPicker(async (suggested) => {
        const root = useProjectStore.getState().root
        const defaultPath = suggested.startsWith('/') ? suggested : root ? `${root}/${suggested}` : suggested
        return dialogs.saveFile({ title: 'Save As', defaultPath, filters: GBL_FILTER })
      })
      setAfterSave((path) => {
        void useProjectStore.getState().refresh()
        const lang = useLanguageStore.getState()
        if (getSettings().checkOnSave && path.endsWith('.gbl')) void lang.checkFile(path)
        void useRunStore.getState().refreshStatus(path)
      })
      setOnAuthoriseRust(() => void useRunStore.getState().openInlineRustAuth())
      setOnAskAi(({ code, message }) => void import('./stores/aiStore').then((m) => m.useAiStore.getState().openForFix(code, message)))
      setOnOpenDoc((doc) => void openDoc(doc))

      const lang = useLanguageStore.getState()
      await lang.resolveEngine()
      await lang.detect(s.lastProject || undefined)

      const requested = isTauri() ? await settingsApi.startupOpen().catch(() => [] as string[]) : []
      const selftest = requested.find((p) => p.startsWith('selftest:'))
      if (selftest) {
        const { runSelfTest } = await import('./selftest')
        void runSelfTest(selftest.slice('selftest:'.length))
      } else if (requested.length) {
        for (const p of requested) {
          const st = await fs.stat(p)
          if (st.is_dir) await openProject(p)
          else {
            if (!useProjectStore.getState().root) await openProject(dirname(p))
            await useEditorStore.getState().openPath(p)
          }
        }
      } else if (s.reopenLastProject && s.lastProject && isTauri() && (await fs.exists(s.lastProject).catch(() => false))) {
        await openProject(s.lastProject)
        for (const p of s.openTabs) if (await fs.exists(p).catch(() => false)) await useEditorStore.getState().openPath(p)
        if (s.activeTab && useEditorStore.getState().tabs.some((t) => t.path === s.activeTab)) useEditorStore.getState().setActive(s.activeTab)
      } else if (!isTauri()) {
        useEditorStore.getState().newUntitled('# Web preview — open the desktop app for files, runs and the terminal.\nGO_PARANOID\n\nmass = 2 kg\nenergy = mass * c^2\nprint("energy = {energy}")\nseal energy\n')
      }
      // Background image
      const url = await resolveBackgroundUrl(getSettings().background)
      useAppStore.getState().setBackgroundDataUrl(url)
    })()
  }, [])
}

export function App() {
  useBootstrap()
  const splashDone = useAppStore((s) => s.splashDone)
  const bottomPanelOpen = useAppStore((s) => s.bottomPanelOpen)
  const leftSidebarOpen = useAppStore((s) => s.leftSidebarOpen)
  const aiPaneOpen = useAppStore((s) => s.aiPaneOpen)
  const bottomMaximized = useAppStore((s) => s.bottomMaximized)
  const backgroundDataUrl = useAppStore((s) => s.backgroundDataUrl)
  const background = useSettingsStore((s) => s.settings.background)
  const sidebarWidth = useSettingsStore((s) => s.settings.sidebarWidth)
  const bottomHeight = useSettingsStore((s) => s.settings.bottomHeight)
  const update = useSettingsStore((s) => s.update)
  const tabs = useEditorStore((s) => s.tabs)
  const activePath = useEditorStore((s) => s.activePath)
  const analyzeAll = useLanguageStore((s) => s.analyzeAll)
  const [sizes, setSizes] = useState({ sidebar: sidebarWidth, bottom: bottomHeight })
  useEffect(() => setSizes({ sidebar: sidebarWidth, bottom: bottomHeight }), [sidebarWidth, bottomHeight])

  // Local analysis (debounced) whenever open files change.
  useEffect(() => {
    const t = setTimeout(() => analyzeAll(tabs.map((tab) => ({ path: tab.path, content: tab.content }))), 120)
    return () => clearTimeout(t)
  }, [tabs, analyzeAll])

  // Engine check while typing (debounced, scratch copy) for the active file.
  const activeContent = tabs.find((t) => t.path === activePath)?.content
  useEffect(() => {
    if (!activePath || !getSettings().checkWhileTyping || isUntitled(activePath) || !activePath.endsWith('.gbl')) return
    const t = setTimeout(() => void useLanguageStore.getState().checkFile(activePath), 700)
    return () => clearTimeout(t)
  }, [activePath, activeContent])

  // Persist open tabs.
  useEffect(() => {
    const t = setTimeout(() => update({ openTabs: tabs.map((x) => x.path).filter((p) => !isUntitled(p) && !p.startsWith('doc:')), activeTab: activePath && !isUntitled(activePath) ? activePath : '' }), 400)
    return () => clearTimeout(t)
  }, [tabs, activePath, update])

  // Native menu, keyboard shortcuts, drag-drop, focus refresh.
  useEffect(() => {
    let unlistenMenu: (() => void) | undefined
    let unlistenDrop: (() => void) | undefined
    if (isTauri()) {
      void onMenuAction((id) => runAction(id)).then((u) => { unlistenMenu = u })
      void getCurrentWebview().onDragDropEvent((ev) => {
        if (ev.payload.type !== 'drop') return
        const paths = ev.payload.paths
        void (async () => {
          for (const p of paths) {
            const st = await fs.stat(p)
            if (st.is_dir) await openProject(p)
            else await useEditorStore.getState().openPath(p)
          }
        })()
      }).then((u) => { unlistenDrop = u })
    }
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target && (target.classList?.contains('xterm-helper-textarea') || target.closest?.('.xterm'))) {
        // Let the shell have everything except the IDE-global view toggles.
        const combo = comboFromEvent(e)
        const b = useKeymapStore.getState().bindings
        const allowed = ['view.terminal', 'view.bottom', 'view.newTerminal', 'nav.commandPalette', 'nav.quickOpen', 'run.run']
        const action = allowed.find((id) => b[id] === combo)
        if (!action) return
        e.preventDefault(); e.stopPropagation(); runAction(action)
        return
      }
      const combo = comboFromEvent(e)
      const bindings = useKeymapStore.getState().bindings
      const action = Object.keys(bindings).find((id) => bindings[id] === combo)
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      runAction(action)
    }
    const onFocus = () => { void useEditorStore.getState().reloadIfChanged(); void useProjectStore.getState().refresh() }
    window.addEventListener('keydown', handler, true)
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('keydown', handler, true); window.removeEventListener('focus', onFocus); unlistenMenu?.(); unlistenDrop?.() }
  }, [])

  const hasBackground = !!backgroundDataUrl && !!background.path
  const projectName = useProjectStore((s) => s.name)
  useEffect(() => { document.title = projectName ? `${projectName} – Goblin++ IDE` : 'Goblin++ IDE' }, [projectName])
  void basename

  return (
    <div className={`app-shell${hasBackground ? ' has-background' : ''}`} style={hasBackground ? ({ ['--glass-alpha' as string]: String(Math.min(1, 0.35 + background.dim * 0.65)) } as React.CSSProperties) : undefined}>
      {hasBackground && <div className="app-background" style={backgroundStyle(background, backgroundDataUrl)} />}
      {!splashDone && <Splash />}
      <Toolbar />
      <div className="app-middle">
        <ActivityBar />
        {leftSidebarOpen && (
          <>
            <div style={{ width: sizes.sidebar, flex: `0 0 ${sizes.sidebar}px`, display: 'flex', minWidth: 0 }}><Sidebar /></div>
            <Resizer direction="horizontal" onResize={(d) => setSizes((s) => ({ ...s, sidebar: Math.max(180, Math.min(600, s.sidebar + d)) }))} onEnd={() => update({ sidebarWidth: sizes.sidebar })} />
          </>
        )}
        <div className={`editor-col${bottomPanelOpen && bottomMaximized ? ' bottom-max' : ''}`}>
          <EditorPane />
          {bottomPanelOpen && (
            <>
              <Resizer direction="vertical" onResize={(d) => setSizes((s) => ({ ...s, bottom: Math.max(120, Math.min(window.innerHeight - 220, s.bottom - d)) }))} onEnd={() => update({ bottomHeight: sizes.bottom })} />
              <div className="bottom-wrap" style={{ height: sizes.bottom, flex: `0 0 ${sizes.bottom}px` }}><BottomPanel /></div>
            </>
          )}
        </div>
        <Suspense fallback={null}>{(aiPaneOpen || true) && <AIPane />}</Suspense>
      </div>
      <StatusBar />
      <SettingsDialog />
      <BackgroundDialog />
      <RunConfigDialog />
      <InlineRustAuthDialog />
      <QuickOpen />
      <ModalDialogs />
    </div>
  )
}

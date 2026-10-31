import { useState } from 'react'
import { runAction } from '../actions'
import { isDirty, useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { shell } from '../platform/tauri'
import { isUntitled } from '../util/path'
import { ContextMenu } from './ContextMenu'
import { CloseIcon, LockIcon, WarnIcon } from './icons'

export function EditorTabs() {
  const tabs = useEditorStore((s) => s.tabs)
  const activePath = useEditorStore((s) => s.activePath)
  const setActive = useEditorStore((s) => s.setActive)
  const closeTab = useEditorStore((s) => s.closeTab)
  const closeOthers = useEditorStore((s) => s.closeOthers)
  const closeAll = useEditorStore((s) => s.closeAll)
  const revealPath = useProjectStore((s) => s.revealPath)
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  if (tabs.length === 0) return null
  return (
    <div className="editor-tabs" role="tablist">
      {tabs.map((tab) => {
        const dirty = isDirty(tab)
        return (
          <div
            key={tab.path}
            className={`tab${tab.path === activePath ? ' active' : ''}${tab.readOnly ? ' readonly' : ''}`}
            role="tab"
            aria-selected={tab.path === activePath}
            title={tab.path}
            onClick={() => setActive(tab.path)}
            onAuxClick={(e) => { if (e.button === 1) void closeTab(tab.path) }}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, path: tab.path }) }}
          >
            {tab.frozen && <LockIcon size={12} className="tab-lock" />}
            {tab.verifyFailed && <WarnIcon size={12} className="tab-warn" />}
            <span className={`tab-name${dirty ? ' tab-dirty' : ''}`}>{tab.name}</span>
            <button type="button" className="tab-close" title="Close (⌘W)" onClick={(e) => { e.stopPropagation(); void closeTab(tab.path) }}>
              {dirty ? <span className="dirty-dot">●</span> : <CloseIcon size={12} />}
            </button>
          </div>
        )
      })}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Close', shortcut: '⌘W', action: () => void closeTab(menu.path) },
            { label: 'Close Others', action: () => void closeOthers(menu.path) },
            { label: 'Close All', action: () => void closeAll() },
            { separator: true },
            { label: 'Save', action: () => { setActive(menu.path); runAction('file.save') } },
            { label: 'Save As…', action: () => { setActive(menu.path); runAction('file.saveAs') } },
            { separator: true },
            { label: 'Select in Project tree', disabled: isUntitled(menu.path) || menu.path.startsWith('doc:'), action: () => void revealPath(menu.path) },
            { label: 'Reveal in Finder', disabled: isUntitled(menu.path) || menu.path.startsWith('doc:'), action: () => void shell.revealInFinder(menu.path) },
            { label: 'Copy Path', action: () => void navigator.clipboard?.writeText(menu.path) },
          ]}
        />
      )}
    </div>
  )
}

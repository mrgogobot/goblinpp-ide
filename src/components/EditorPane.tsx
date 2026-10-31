import { runAction } from '../actions'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { relative } from '../util/path'
import { EditorTabs } from './EditorTabs'
import { MonacoEditor } from './MonacoEditor'
import { Welcome } from './Welcome'

export function EditorPane() {
  const tabs = useEditorStore((s) => s.tabs)
  const activePath = useEditorStore((s) => s.activePath)
  const root = useProjectStore((s) => s.root)
  const fileStatus = useRunStore((s) => (activePath ? s.fileStatus[activePath] : undefined))
  const activeTab = tabs.find((t) => t.path === activePath)

  return (
    <>
      <EditorTabs />
      {activeTab && !activeTab.readOnly && (
        <div className="breadcrumb">
          <span className="muted">{root && activeTab.path.startsWith(root + '/') ? relative(root, activeTab.path).split('/').slice(0, -1).join(' › ') : ''}</span>
          {root && activeTab.path.startsWith(root + '/') && relative(root, activeTab.path).includes('/') && <span className="muted"> › </span>}
          <span>{activeTab.name}</span>
          {fileStatus && <span className="muted" style={{ marginLeft: 'auto' }} title={fileStatus.classification ?? ''}>{fileStatus.frozen ? '🔒 ' : ''}{fileStatus.state}</span>}
        </div>
      )}
      <div className="editor-host">
        {activeTab?.frozen && (
          <div className="frozen-banner">
            <span>This file is <strong>frozen</strong>. Any change to its bytes makes the next run a protocol violation.</span>
            <button type="button" onClick={() => runAction('run.revise')}>Revise…</button>
            <button type="button" onClick={() => runAction('run.status')}>Status</button>
          </div>
        )}
        {activeTab ? <MonacoEditor tab={activeTab} /> : <Welcome />}
      </div>
    </>
  )
}

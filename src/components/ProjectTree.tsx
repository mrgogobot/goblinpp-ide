import { useState } from 'react'
import { runAction } from '../actions'
import { fs, shell } from '../platform/tauri'
import { confirmDialog, promptDialog, toast } from '../stores/dialogStore'
import { useEditorStore } from '../stores/editorStore'
import { useProjectStore } from '../stores/projectStore'
import type { TreeNode } from '../stores/projectStore'
import { useRunStore } from '../stores/runStore'
import { useAppStore } from '../stores/appStore'
import { basename, dirname, join } from '../util/path'
import { ContextMenu } from './ContextMenu'
import type { MenuItemSpec } from './ContextMenu'
import { ChevronDownIcon, ChevronRightIcon, LockIcon } from './icons'

function FileGlyph({ node }: { node: TreeNode }) {
  const ext = node.name.split('.').pop()?.toLowerCase()
  let glyph = '▪'
  let color = 'var(--fg-muted)'
  if (node.type === 'dir') { glyph = node.meta?.evidence ? '🗂' : node.meta?.runDir ? '🧾' : '▸'; color = 'var(--accent)' }
  else if (ext === 'gbl') { glyph = 'G'; color = 'var(--accent-secondary)' }
  else if (ext === 'json' || ext === 'jsonl') { glyph = '{}'; color = 'var(--accent)' }
  else if (ext === 'md') { glyph = 'M'; color = 'var(--fg-text)' }
  else if (ext === 'csv' || ext === 'tsv') { glyph = '▦'; color = 'var(--warning)' }
  else if (ext === 'fits' || ext === 'fit') { glyph = '✦'; color = 'var(--accent)' }
  else if (ext === 'png' || ext === 'svg' || ext === 'jpg') { glyph = '▣'; color = 'var(--fg-muted)' }
  else if (ext === 'log' || ext === 'txt') { glyph = '≡' }
  if (node.type === 'dir') return <span className="tree-icon" style={{ color, fontSize: 11 }}>{glyph === '▸' ? '' : glyph}</span>
  return <span className="tree-icon file" style={{ color, fontSize: node.name.endsWith('.gbl') ? 11 : 10, fontWeight: 700 }}>{glyph}</span>
}

export function nodeMenu(node: TreeNode | null, root: string, close: () => void): MenuItemSpec[] {
  const project = useProjectStore.getState()
  const editor = useEditorStore.getState()
  const dir = node ? (node.type === 'dir' ? node.path : dirname(node.path)) : root
  const items: MenuItemSpec[] = [
    { label: 'New File…', action: async () => { const name = await promptDialog('New File', { message: `in ${dir}`, defaultValue: 'untitled.gbl', ok: 'Create' }); if (!name) return; const p = join(dir, name.trim()); if (await fs.exists(p)) { toast('error', 'File exists', p); return } await fs.writeText(p, name.endsWith('.gbl') ? '# New Goblin++ program\n\n' : ''); await project.refresh(); await project.revealPath(p); await editor.openPath(p) } },
    { label: 'New Folder…', action: async () => { const name = await promptDialog('New Folder', { message: `in ${dir}`, defaultValue: 'folder', ok: 'Create' }); if (!name) return; await fs.createDir(join(dir, name.trim())); await project.refresh(); await project.expand(dir) } },
    { separator: true },
  ]
  if (node) {
    if (node.type === 'file' && node.name.endsWith('.gbl')) {
      items.push(
        { label: 'Run', action: () => { void editor.openPath(node.path).then(() => runAction('run.run')) } },
        { label: 'Check (preview)', action: () => { void editor.openPath(node.path).then(() => runAction('run.check')) } },
        { label: 'Freeze', action: () => { void editor.openPath(node.path).then(() => runAction('run.freeze')) } },
        { label: 'Status', action: () => { void editor.openPath(node.path).then(() => runAction('run.status')) } },
        { separator: true },
      )
    }
    if (node.meta?.runDir) {
      items.push(
        { label: 'Verify this RUN_DIR', action: () => { useAppStore.getState().showBottomTab('run'); void useRunStore.getState().verifyRun(node.path) } },
        { label: 'Show in Evidence', action: () => { useRunStore.getState().selectRunDir(node.path); useAppStore.getState().setActiveActivity('evidence') } },
        { separator: true },
      )
    }
    items.push(
      { label: 'Rename…', action: async () => { const name = await promptDialog('Rename', { defaultValue: node.name, ok: 'Rename' }); if (!name || name === node.name) return; const to = join(dirname(node.path), name.trim()); try { await fs.rename(node.path, to); editor.renamePath(node.path, to); await project.refresh() } catch (e) { toast('error', 'Rename failed', String(e)) } } },
      { label: 'Duplicate', action: async () => { const base = node.name.replace(/(\.[^.]*)?$/, (m) => `_copy${m}`); try { await fs.copy(node.path, join(dirname(node.path), base)); await project.refresh() } catch (e) { toast('error', 'Copy failed', String(e)) } } },
      { label: 'Move to Trash', danger: true, action: async () => { const r = await confirmDialog('Move to Trash', `Move ${node.name} to the Trash?`, { ok: 'Move to Trash', danger: true }); if (r !== 'ok') return; try { await fs.trash(node.path); for (const t of editor.tabs) if (t.path === node.path || t.path.startsWith(node.path + '/')) await editor.closeTab(t.path, { force: true }); await project.refresh() } catch (e) { toast('error', 'Delete failed', String(e)) } } },
      { separator: true },
      { label: 'Copy Path', action: () => { void navigator.clipboard?.writeText(node.path) } },
      { label: 'Copy Relative Path', action: () => { void navigator.clipboard?.writeText(node.path.startsWith(root + '/') ? node.path.slice(root.length + 1) : node.path) } },
      { label: 'Reveal in Finder', action: () => { void shell.revealInFinder(node.path) } },
    )
  } else {
    items.push({ label: 'Reveal in Finder', action: () => { void shell.revealInFinder(root) } })
  }
  items.push({ separator: true }, { label: 'Synchronize', action: () => { void project.refresh() } })
  void close
  return items
}

function NodeRow({ node, depth, onMenu }: { node: TreeNode; depth: number; onMenu: (e: React.MouseEvent, node: TreeNode) => void }) {
  const expanded = useProjectStore((s) => s.expanded[node.path] ?? false)
  const toggleExpand = useProjectStore((s) => s.toggleExpand)
  const select = useProjectStore((s) => s.select)
  const selected = useProjectStore((s) => s.selectedPath === node.path)
  const openPath = useEditorStore((s) => s.openPath)
  const activePath = useEditorStore((s) => s.activePath)
  const frozen = useEditorStore((s) => s.tabs.find((t) => t.path === node.path)?.frozen)
  const isDir = node.type === 'dir'

  const onClick = () => {
    select(node.path)
    if (isDir) void toggleExpand(node.path)
    else void openPath(node.path)
  }
  return (
    <>
      <div
        className={`tree-row${selected ? ' selected' : ''}${activePath === node.path ? ' active' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); select(node.path); onMenu(e, node) }}
        role="treeitem"
        aria-expanded={isDir ? expanded : undefined}
        title={node.path}
      >
        <span className="tree-chevron">{isDir ? (expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />) : null}</span>
        <FileGlyph node={node} />
        <span className={`tree-label${node.name.startsWith('.') ? ' muted' : ''}`}>{node.name}</span>
        {(frozen || node.meta?.frozenReceipt) && <span className="tree-badge" title={frozen ? 'frozen source' : 'freeze receipt'}><LockIcon size={11} /></span>}
      </div>
      {isDir && expanded && (node.loaded ? (node.children?.length ? node.children.map((child) => <NodeRow key={child.path} node={child} depth={depth + 1} onMenu={onMenu} />) : <div className="tree-row muted" style={{ paddingLeft: 26 + depth * 14 }}>empty</div>) : <div className="tree-row muted" style={{ paddingLeft: 26 + depth * 14 }}>loading…</div>)}
    </>
  )
}

export function ProjectTree() {
  const tree = useProjectStore((s) => s.tree)
  const root = useProjectStore((s) => s.root)
  const name = useProjectStore((s) => s.name)
  const error = useProjectStore((s) => s.error)
  const [menu, setMenu] = useState<{ x: number; y: number; node: TreeNode | null } | null>(null)

  if (!root) {
    return (
      <div className="panel-placeholder">
        <span className="title">No project open</span>
        <span>Open a folder or create a project to see its files here.</span>
        <div className="settings-row" style={{ gap: 6, marginTop: 8 }}>
          <button type="button" className="run-btn" onClick={() => runAction('file.openFolder')}>Open Folder…</button>
          <button type="button" className="toolbar-btn framed" onClick={() => runAction('file.newProject')}>New Project…</button>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-body" role="tree" aria-label="Project tree" onContextMenu={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: null }) } }}>
      <div className="tree-root-row" title={root} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, node: null }) }}>
        <span className="tree-icon" style={{ color: 'var(--accent)' }}>◆</span>
        <span className="tree-label" style={{ fontWeight: 600 }}>{name || basename(root)}</span>
        <span className="muted mono" style={{ marginLeft: 'auto', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{root}</span>
      </div>
      {error && <div className="muted" style={{ padding: 8, color: 'var(--error)' }}>{error}</div>}
      {tree.map((node) => <NodeRow key={node.path} node={node} depth={0} onMenu={(e, n) => setMenu({ x: e.clientX, y: e.clientY, node: n })} />)}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={nodeMenu(menu.node, root, () => setMenu(null))} onClose={() => setMenu(null)} />}
    </div>
  )
}

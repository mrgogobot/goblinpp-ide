/*
 * Project (folder) state backed by the real filesystem. Directory children load
 * lazily on expand; `refresh()` re-reads every expanded directory.
 */
import { create } from 'zustand'
import { fs } from '../platform/tauri'
import type { DirEntry } from '../platform/tauri'
import { basename, languageForPath } from '../util/path'
import { getSettings } from './settingsStore'

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  language?: string
  children?: TreeNode[]
  loaded?: boolean
  size?: number
  modifiedMs?: number
  meta?: { evidence?: boolean; runDir?: boolean; frozenReceipt?: boolean; example?: boolean }
}

interface ProjectState {
  root: string
  name: string
  tree: TreeNode[]
  expanded: Record<string, boolean>
  selectedPath: string | null
  loading: boolean
  error: string | null
  fileIndex: string[]
  indexedAt: number

  openProject: (root: string) => Promise<void>
  closeProject: () => void
  loadChildren: (dirPath: string) => Promise<void>
  toggleExpand: (path: string) => Promise<void>
  expand: (path: string) => Promise<void>
  refresh: () => Promise<void>
  select: (path: string | null) => void
  revealPath: (path: string) => Promise<void>
  rebuildIndex: () => Promise<void>
}

function toNode(e: DirEntry): TreeNode {
  const isEvidence = e.name === '.goblin'
  const runDir = /^\d{8}T\d{6}(\.\d+)?Z_[0-9a-f]{6,}$/.test(e.name)
  return {
    name: e.name,
    path: e.path,
    type: e.is_dir ? 'dir' : 'file',
    language: e.is_dir ? undefined : languageForPath(e.path),
    children: e.is_dir ? [] : undefined,
    loaded: !e.is_dir,
    size: e.size,
    modifiedMs: e.modified_ms,
    meta: {
      evidence: isEvidence || e.name === 'runs',
      runDir,
      frozenReceipt: e.name.endsWith('.freeze.json'),
    },
  }
}

function updateNode(nodes: TreeNode[], path: string, fn: (n: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === path) return fn(n)
    if (n.children && path.startsWith(n.path + '/')) return { ...n, children: updateNode(n.children, path, fn) }
    return n
  })
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  root: '',
  name: '',
  tree: [],
  expanded: {},
  selectedPath: null,
  loading: false,
  error: null,
  fileIndex: [],
  indexedAt: 0,

  openProject: async (root) => {
    set({ loading: true, error: null, root, name: basename(root), tree: [], expanded: {}, selectedPath: null, fileIndex: [] })
    try {
      const entries = await fs.listDir(root, getSettings().showHiddenFiles)
      set({ tree: entries.map(toNode), loading: false })
      // Pre-expand the usual suspects.
      for (const n of entries.filter((e) => e.is_dir && ['examples', 'src', 'lib'].includes(e.name)).slice(0, 2)) {
        await get().expand(n.path)
      }
      void get().rebuildIndex()
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
    }
  },

  closeProject: () => set({ root: '', name: '', tree: [], expanded: {}, selectedPath: null, fileIndex: [] }),

  loadChildren: async (dirPath) => {
    try {
      const entries = await fs.listDir(dirPath, getSettings().showHiddenFiles)
      const children = entries.map(toNode)
      set((s) => ({ tree: updateNode(s.tree, dirPath, (n) => ({ ...n, children, loaded: true })) }))
    } catch {
      set((s) => ({ tree: updateNode(s.tree, dirPath, (n) => ({ ...n, children: [], loaded: true })) }))
    }
  },

  toggleExpand: async (path) => {
    const open = !get().expanded[path]
    set((s) => ({ expanded: { ...s.expanded, [path]: open } }))
    if (open) await get().loadChildren(path)
  },

  expand: async (path) => {
    set((s) => ({ expanded: { ...s.expanded, [path]: true } }))
    await get().loadChildren(path)
  },

  refresh: async () => {
    const { root, expanded } = get()
    if (!root) return
    try {
      const entries = await fs.listDir(root, getSettings().showHiddenFiles)
      // keep already-loaded children for expanded dirs
      const prev = new Map<string, TreeNode>()
      const walk = (nodes: TreeNode[]) => nodes.forEach((n) => { prev.set(n.path, n); if (n.children) walk(n.children) })
      walk(get().tree)
      const rebuild = (es: DirEntry[]): TreeNode[] => es.map((e) => {
        const n = toNode(e)
        const old = prev.get(e.path)
        return old && old.type === 'dir' ? { ...n, children: old.children, loaded: old.loaded } : n
      })
      set({ tree: rebuild(entries) })
      const dirs = Object.keys(expanded).filter((p) => expanded[p])
      for (const d of dirs) await get().loadChildren(d)
      void get().rebuildIndex()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  select: (selectedPath) => set({ selectedPath }),

  revealPath: async (path) => {
    const { root } = get()
    if (!root || !path.startsWith(root + '/')) return
    const rel = path.slice(root.length + 1).split('/')
    let cur = root
    for (let i = 0; i < rel.length - 1; i++) {
      cur = `${cur}/${rel[i]}`
      if (!get().expanded[cur]) await get().expand(cur)
    }
    set({ selectedPath: path })
  },

  rebuildIndex: async () => {
    const { root } = get()
    if (!root) return
    try {
      const files = await fs.indexFiles(root, 20000)
      set({ fileIndex: files, indexedAt: Date.now() })
    } catch {
      /* ignore */
    }
  },
}))

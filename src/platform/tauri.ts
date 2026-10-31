/*
 * Thin typed bridge to the Rust side. Everything the IDE needs from the OS goes
 * through here: filesystem, processes, PTYs, dialogs, settings, environment.
 * In a plain browser (no Tauri) the calls reject, and the UI shows a notice.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { open as openDialog, save as saveDialog, message as messageDialog } from '@tauri-apps/plugin-dialog'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface DirEntry { name: string; path: string; is_dir: boolean; size: number; modified_ms: number }
export interface FileStat { exists: boolean; is_dir: boolean; size: number; modified_ms: number }
export interface SearchMatch { path: string; line: number; column: number; text: string }
export interface Captured { code: number | null; stdout: string; stderr: string; duration_ms: number }
export interface ResolvedBinary { path: string; source: string; version: string | null }
export interface EnvCheck { id: string; name: string; detail: string; status: 'ok' | 'warn' | 'fail' }
export interface AppPaths { config_dir: string; data_dir: string; log_dir: string; exe_dir: string; resource_dir: string; settings_file: string }

export const fs = {
  listDir: (path: string, showHidden = true) => invoke<DirEntry[]>('fs_list_dir', { path, showHidden }),
  readText: (path: string) => invoke<string>('fs_read_text', { path }),
  readBase64: (path: string) => invoke<string>('fs_read_base64', { path }),
  writeText: (path: string, content: string) => invoke<void>('fs_write_text', { path, content }),
  createDir: (path: string) => invoke<void>('fs_create_dir', { path }),
  exists: (path: string) => invoke<boolean>('fs_exists', { path }),
  stat: (path: string) => invoke<FileStat>('fs_stat', { path }),
  rename: (from: string, to: string) => invoke<void>('fs_rename', { from, to }),
  copy: (from: string, to: string) => invoke<void>('fs_copy', { from, to }),
  trash: (path: string) => invoke<void>('fs_trash', { path }),
  homeDir: () => invoke<string>('fs_home_dir'),
  search: (opts: { root: string; query: string; regex?: boolean; caseSensitive?: boolean; include?: string[]; exclude?: string[]; maxResults?: number }) =>
    invoke<SearchMatch[]>('fs_search', { root: opts.root, query: opts.query, regex: opts.regex ?? false, caseSensitive: opts.caseSensitive ?? false, include: opts.include ?? [], exclude: opts.exclude ?? [], maxResults: opts.maxResults ?? 2000 }),
  indexFiles: (root: string, maxFiles = 20000) => invoke<string[]>('fs_index_files', { root, maxFiles }),
}

export const shell = {
  revealInFinder: (path: string) => invoke<void>('reveal_in_finder', { path }),
  openExternal: (url: string) => invoke<void>('open_external', { url }),
}

export interface ProcOutputEvent { id: string; stream: 'stdout' | 'stderr'; data: string }
export interface ProcExitEvent { id: string; code: number | null; signal: number | null }

export const proc = {
  spawn: (id: string, program: string, args: string[], cwd?: string, env?: Record<string, string>) =>
    invoke<number>('proc_spawn', { id, program, args, cwd: cwd ?? null, env: env ?? null }),
  write: (id: string, data: string) => invoke<void>('proc_write', { id, data }),
  closeStdin: (id: string) => invoke<void>('proc_close_stdin', { id }),
  kill: (id: string) => invoke<void>('proc_kill', { id }),
  run: (program: string, args: string[], cwd?: string, env?: Record<string, string>, stdin?: string) =>
    invoke<Captured>('proc_run', { program, args, cwd: cwd ?? null, env: env ?? null, stdin: stdin ?? null }),
  onOutput: (fn: (e: ProcOutputEvent) => void): Promise<UnlistenFn> => listen<ProcOutputEvent>('proc-output', (ev) => fn(ev.payload)),
  onExit: (fn: (e: ProcExitEvent) => void): Promise<UnlistenFn> => listen<ProcExitEvent>('proc-exit', (ev) => fn(ev.payload)),
}

export const pty = {
  spawn: (id: string, cwd?: string, extraPath: string[] = [], rows?: number, cols?: number) =>
    invoke<void>('spawn_terminal', { id, cwd: cwd ?? null, extraPath, rows: rows ?? null, cols: cols ?? null }),
  write: (id: string, data: string) => invoke<void>('write_terminal', { id, data }),
  resize: (id: string, rows: number, cols: number) => invoke<void>('resize_terminal', { id, rows, cols }),
  kill: (id: string) => invoke<void>('kill_terminal', { id }),
  onData: (fn: (e: { id: string; data: string }) => void) => listen<{ id: string; data: string }>('terminal-data', (ev) => fn(ev.payload)),
  onExit: (fn: (e: { id: string; code: number | null }) => void) => listen<{ id: string; code: number | null }>('terminal-exit', (ev) => fn(ev.payload)),
}

export const env = {
  detect: (configuredGoblin?: string, projectRoot?: string) => invoke<EnvCheck[]>('env_detect', { configuredGoblin: configuredGoblin ?? null, projectRoot: projectRoot ?? null }),
  resolveGoblin: (configured?: string) => invoke<ResolvedBinary>('resolve_goblin_binary', { configured: configured ?? null }),
}

export const settingsApi = {
  load: () => invoke<Record<string, unknown>>('settings_load'),
  save: (value: Record<string, unknown>) => invoke<void>('settings_save', { value }),
  appPaths: () => invoke<AppPaths>('app_paths'),
  log: (line: string) => invoke<void>('log_append', { line }).catch(() => {}),
  startupOpen: () => invoke<string[]>('startup_open'),
}

export const dialogs = {
  async pickFolder(title = 'Open Folder'): Promise<string | null> {
    const r = await openDialog({ directory: true, multiple: false, title })
    return typeof r === 'string' ? r : null
  },
  async pickFile(opts: { title?: string; filters?: { name: string; extensions: string[] }[]; defaultPath?: string } = {}): Promise<string | null> {
    const r = await openDialog({ directory: false, multiple: false, title: opts.title ?? 'Open File', filters: opts.filters, defaultPath: opts.defaultPath })
    return typeof r === 'string' ? r : null
  },
  async pickFiles(opts: { title?: string; filters?: { name: string; extensions: string[] }[] } = {}): Promise<string[]> {
    const r = await openDialog({ directory: false, multiple: true, title: opts.title ?? 'Open Files', filters: opts.filters })
    if (Array.isArray(r)) return r
    return typeof r === 'string' ? [r] : []
  },
  async saveFile(opts: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] } = {}): Promise<string | null> {
    const r = await saveDialog({ title: opts.title ?? 'Save As', defaultPath: opts.defaultPath, filters: opts.filters })
    return typeof r === 'string' ? r : null
  },
  message: (text: string, title = 'Goblin++ IDE', kind: 'info' | 'warning' | 'error' = 'info') => messageDialog(text, { title, kind }),
}

export const GBL_FILTER = [{ name: 'Goblin++ source', extensions: ['gbl'] }, { name: 'All files', extensions: ['*'] }]
export const IMAGE_FILTER = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'] }]

export function onMenuAction(fn: (id: string) => void): Promise<UnlistenFn> {
  return listen<string>('menu-action', (ev) => fn(ev.payload))
}

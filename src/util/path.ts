/** Small POSIX-style path helpers (the IDE targets macOS/Linux first). */
export function basename(p: string): string {
  const s = p.replace(/\/+$/, '')
  const i = s.lastIndexOf('/')
  return i >= 0 ? s.slice(i + 1) : s
}
export function dirname(p: string): string {
  const s = p.replace(/\/+$/, '')
  const i = s.lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  return s.slice(0, i)
}
export function extname(p: string): string {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i > 0 ? b.slice(i) : ''
}
export function join(...parts: string[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (part.startsWith('/')) out.length = 0
    for (const seg of part.split('/')) {
      if (!seg || seg === '.') continue
      if (seg === '..') out.pop()
      else out.push(seg)
    }
  }
  const abs = parts[0]?.startsWith('/') ?? false
  return (abs ? '/' : '') + out.join('/')
}
export function relative(root: string, p: string): string {
  const r = root.replace(/\/+$/, '') + '/'
  return p.startsWith(r) ? p.slice(r.length) : p
}
export function isUntitled(p: string): boolean {
  return p.startsWith('untitled:')
}
export function languageForPath(path: string): string {
  const ext = extname(path).toLowerCase()
  switch (ext) {
    case '.gbl': return 'goblinpp'
    case '.json': return 'json'
    case '.md': return 'markdown'
    case '.rs': return 'rust'
    case '.py': return 'python'
    case '.sh': case '.zsh': case '.bash': return 'shell'
    case '.yaml': case '.yml': return 'yaml'
    case '.toml': return 'ini'
    case '.html': return 'html'
    case '.css': return 'css'
    case '.js': case '.mjs': return 'javascript'
    case '.ts': return 'typescript'
    case '.xml': case '.svg': return 'xml'
    case '.csv': case '.tsv': case '.txt': case '.log': case '.jsonl': case '.ecsv': return 'plaintext'
    default: return 'plaintext'
  }
}
export function isProbablyBinary(path: string): boolean {
  return /\.(fits|fit|fts|npy|npz|png|jpe?g|gif|webp|pdf|zip|gz|tar|dmg|app|o|bin|exe|dylib|so|icns|ico|woff2?|ttf|otf)$/i.test(path)
}

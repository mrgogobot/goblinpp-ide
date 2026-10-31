/** Secret requests are control frames, never ordinary console input or output. */
export const SECRET_PREFIX = 'GOBLIN_SECRET_PROMPT_V1\t'
export const isPrivateSource = (source: string) => source.split('\n').some(line => line.split('#')[0].trim().replace(/^\uFEFF/, '') === 'GO_PRIVATE')
export function decodeSecretPrompt(line: string): string | null {
  if (!line.startsWith(SECRET_PREFIX)) return null
  const hex = line.slice(SECRET_PREFIX.length)
  if (hex.length > 8192 || hex.length % 2 || !/^[0-9a-f]*$/.test(hex)) return null
  try {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], byte => parseInt(byte, 16))
    const prompt = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return /[\u0000-\u001f\u007f-\u009f]/u.test(prompt) ? null : prompt
  } catch { return null }
}
export type SecretFrame = { kind: 'text'; text: string } | { kind: 'secret'; prompt: string } | { kind: 'invalid' }
export class SecretFrames {
  private pending = ''
  push(data: string, final = false): SecretFrame[] {
    this.pending += data
    const out: SecretFrame[] = []
    let newline: number
    while ((newline = this.pending.indexOf('\n')) !== -1) {
      const line = this.pending.slice(0, newline).replace(/\r$/, '')
      this.pending = this.pending.slice(newline + 1)
      if (line.startsWith(SECRET_PREFIX)) {
        const prompt = decodeSecretPrompt(line)
        out.push(prompt === null ? { kind: 'invalid' } : { kind: 'secret', prompt })
      } else out.push({ kind: 'text', text: line + '\n' })
    }
    const candidate = SECRET_PREFIX.startsWith(this.pending) || this.pending.startsWith(SECRET_PREFIX)
    if (this.pending.length > 8220 && candidate) { out.push({ kind: 'invalid' }); this.pending = '' }
    else if (this.pending && (final || !candidate)) {
      out.push(final && candidate ? { kind: 'invalid' } : { kind: 'text', text: this.pending })
      this.pending = ''
    }
    return out
  }
}
export function secretValidation(value: string): string | null {
  return !value || new TextEncoder().encode(value).length > 4096 || /[\r\n\0]/u.test(value)
    ? 'Enter 1-4096 UTF-8 bytes, without newline or NUL.' : null
}

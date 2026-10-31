/** SHA-256 via the Web Crypto API (available on localhost/secure contexts). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function shortHash(h: string, n = 12): string {
  return h.length > n ? `${h.slice(0, n)}…` : h
}

export function isSha256Hex(s: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(s)
}

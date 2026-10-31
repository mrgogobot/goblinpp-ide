import type { AiProvider, ProviderConfig, ProviderId, StreamRequest } from './types'

export const PROVIDERS: ProviderConfig[] = [
  { id: 'mock', name: 'Local (simulated)', enabled: true, models: ['goblin-assistant'], defaultModel: 'goblin-assistant', requiresKey: false },
  { id: 'openai', name: 'OpenAI', enabled: true, baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3'], defaultModel: 'gpt-4o', requiresKey: true },
  { id: 'anthropic', name: 'Anthropic', enabled: true, baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-3-5-haiku', 'claude-3-5-sonnet'], defaultModel: 'claude-sonnet-4-20250514', requiresKey: true },
  { id: 'google', name: 'Google', enabled: true, models: ['gemini-2.0-flash', 'gemini-2.0-pro'], defaultModel: 'gemini-2.0-flash', requiresKey: true },
  { id: 'ollama', name: 'Local – Ollama', enabled: true, baseUrl: 'http://localhost:11434/v1', models: ['llama3.2', 'qwen2.5-coder', 'mistral'], defaultModel: 'llama3.2', requiresKey: false },
  { id: 'custom', name: 'Custom endpoint', enabled: true, baseUrl: '', models: [], defaultModel: '', requiresKey: true },
]

export function providerById(id: ProviderId): ProviderConfig {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function buildMockResponse(lastUser: string): string {
  const q = lastUser.toLowerCase()
  if (/fix|g302|g304|g501|diagnostic|error|warning/.test(q)) {
    return `Here's how to address that diagnostic.

**G302** (unsuffixed trig) is a migration warning. Goblin++ distinguishes radians from degrees explicitly, so \`sin\`/ \`cos\`/ \`tan\` are ambiguous and rejected.

Replace:

\`\`\`gbl
a = sin(30)   // G302
\`\`\`

with a suffixed form:

\`\`\`gbl
a = sind(30)  // degrees
b = sinr(0.5) // radians
\`\`\`

This keeps the unit intent explicit and re-arms the evidence profile.`
  }
  if (/explain|what does|understand/.test(q)) {
    return `Sure — here's what's happening.

The code computes a dimensioned quantity (\`kg*m^2/s^2\`, i.e. joules) and then \`seal\`s it into the evidence ledger. \`GO_PARANOID\` turns on the paranoid profile, which re-hashes the source at the end of the run and compares it to the start hash, so any post-parse mutation is caught.

The \`seal\` statement writes a SHA-256 receipt — a tamper-evident fingerprint, not encryption. It proves the value you verified is the value in the ledger.`
  }
  if (/g_func|compute|write|function|redshift|error from|generate/.test(q)) {
    return `Here's a \`g_func\` for that:

\`\`\`gbl
g_func redshift_err(z: value, z_err: value) -> value {
    // First-order propagation of a redshift uncertainty.
    return sqrt(z_err * z_err)
}

z     = fits_column("data/catalogue.fits", 1, "Z", 0)
z_err = fits_column("data/catalogue.fits", 1, "Z_ERR", 0)
dz    = redshift_err(z, z_err)

print("redshift = {z:.4f} +/- {dz:.4f}")
seal dz
\`\`\`

It reads two FITS columns, propagates the error, and seals the result so the computation is reproducible and verifiable.`
  }
  return `I can help with Goblin++: writing \`g_func\`s, working with dimensioned quantities, FITS/CSV/plot helpers, the \`freeze → run → verify\` evidence workflow, or sealing values.

Try asking me to *explain* the current file, *fix* a diagnostic, or *write* a \`g_func\` for a scientific computation.`
}

/** Streaming mock assistant — works offline, no API key. */
export const mockProvider: AiProvider = {
  id: 'mock',
  async stream(req, onDelta, signal) {
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? ''
    const response = buildMockResponse(lastUser)
    const words = response.split(/(?<=\s)/)
    for (const word of words) {
      if (signal.aborted) return
      onDelta(word)
      await sleep(18)
    }
  },
}

function parseSseChunk(buffer: string): string[] {
  return buffer
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .filter((d) => d && d !== '[DONE]')
}

/** Real OpenAI-compatible chat-completions streaming (OpenAI, Ollama, vLLM, custom). */
export function openAiCompatibleProvider(baseUrl: string, apiKey: string): AiProvider {
  return {
    id: 'openai',
    async stream(req, onDelta, signal) {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: true,
        }),
      })

      if (res.status === 429) {
        throw new Error('Rate limit (429) — wait a moment and retry.')
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Provider error ${res.status}: ${text.slice(0, 200)}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (const chunk of parseSseChunk(buffer)) {
          try {
            const json = JSON.parse(chunk)
            const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? ''
            if (delta) onDelta(delta)
          } catch {
            // partial chunk — ignore
          }
        }
        buffer = buffer.slice(buffer.lastIndexOf('\n') + 1)
      }
    },
  }
}

/**
 * Resolve a working provider for the selected provider id.
 * Falls back to the simulated assistant when no key is configured, the provider
 * is local, or its real transport isn't wired yet.
 */
export function resolveProvider(id: ProviderId, apiKey?: string): { provider: AiProvider; simulated: boolean } {
  const cfg = providerById(id)
  if (id === 'mock' || id === 'anthropic' || id === 'google') {
    return { provider: mockProvider, simulated: true }
  }
  if (id === 'ollama' && !apiKey) {
    // Ollama needs no key; but without a daemon the mock keeps the demo alive.
    return { provider: mockProvider, simulated: true }
  }
  if (cfg.requiresKey && !apiKey) {
    return { provider: mockProvider, simulated: true }
  }
  return { provider: openAiCompatibleProvider(cfg.baseUrl ?? '', apiKey ?? ''), simulated: false }
}

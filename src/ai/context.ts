import { isPrivateSource } from '../run/secretInput'
/*
 * Context assembly (§5.2). Bounded by a token budget with a priority order:
 * user prompt > active file > diagnostics > RUN_DIR > seal ledger >
 * freeze state > docs > open files.
 */

export interface ContextInput {
  userPrompt: string
  contextFree: boolean
  budgetChars: number
  activeFile?: { path: string; content: string }
  openFiles?: { path: string; snippet: string }[]
  diagnostics?: string[]
  runDir?: string
  sealLedger?: string[]
  freezeState?: string
  docs?: string
}

export interface ContextBundle {
  system: string
  user: string
  usedChars: number
  sources: string[]
}

export function approxTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

export function assembleContext(input: ContextInput): ContextBundle {
  if (input.contextFree || (input.activeFile && isPrivateSource(input.activeFile.content))) {
    return {
      system: 'You are the Goblin++ IDE assistant. Answer directly. (Context-free mode: no file or evidence data is attached.)',
      user: input.userPrompt,
      usedChars: input.userPrompt.length,
      sources: ['user prompt'],
    }
  }

  const ordered: { label: string; text: string; priority: number }[] = [
    { label: 'user prompt', text: input.userPrompt, priority: 0 },
    { label: 'active file', text: input.activeFile ? `# FILE: ${input.activeFile.path}\n${input.activeFile.content}` : '', priority: 1 },
    { label: 'diagnostics', text: input.diagnostics?.join('\n') ?? '', priority: 2 },
    { label: 'RUN_DIR', text: input.runDir ?? '', priority: 3 },
    { label: 'seal ledger', text: input.sealLedger?.join('\n') ?? '', priority: 4 },
    { label: 'freeze state', text: input.freezeState ?? '', priority: 5 },
    { label: 'docs', text: input.docs ?? '', priority: 6 },
    { label: 'open files', text: input.openFiles?.filter(f=>!isPrivateSource(f.snippet)).map((f) => `${f.path}\n${f.snippet}`).join('\n\n') ?? '', priority: 7 },
  ].filter((p) => p.text.trim().length > 0)

  let used = 0
  const included: { label: string; text: string }[] = []
  for (const p of ordered) {
    const remaining = input.budgetChars - used
    if (remaining <= 0) break
    const text = p.text.length > remaining ? p.text.slice(0, remaining) : p.text
    included.push({ label: p.label, text })
    used += text.length
  }

  const system =
    'You are the Goblin++ IDE assistant, specialised in the evidence-first scientific language Goblin++ (Rust engine goblin++ 0.1.0-alpha.43). Facts: comments start with #; quantities are written `2 kg`, `1.13e-10 m/s^2`, `4.7 kΩ`; directives GO_PARANOID / COMPLETELY_MAD go first; `seal name` snapshots a value; g_func defines functions with explicit return; trig uses sinr/sind (sin() is legacy G302); ordinary science runs produce RUN_DIR receipts; GO_PRIVATE scripts call input_secret/encrypt_text/encrypt_file/decrypt_text/decrypt_file/read_text/display_file without scientific receipts, and must not contain hardcoded secrets; the workflow is freeze → run → verify → revise. Be concise and prefer code in ```goblinpp fences.'

  const contextText = included
    .filter((p) => p.label !== 'user prompt')
    .map((p) => `--- ${p.label} ---\n${p.text}`)
    .join('\n\n')

  return {
    system,
    user: contextText ? `${contextText}\n\n--- user ---\n${input.userPrompt}` : input.userPrompt,
    usedChars: used,
    sources: included.map((p) => p.label),
  }
}

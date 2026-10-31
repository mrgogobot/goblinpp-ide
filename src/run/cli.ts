/*
 * Types and parsers for the real `goblin++` command-line contract.
 *
 *  - Runs print a trailing block of `KEY=VALUE` lines (RUN_STATUS, RUN_DIR, …).
 *  - Errors print `GOBLIN ERROR Gxxx` followed by a blank line and the message.
 *  - `--json` subcommands print one JSON document (run: {run_dir, receipt}).
 */

export type RunStatus = 'PASS' | 'FAIL' | 'MACHINERY_FAIL' | 'PROTOCOL_VIOLATION' | 'PARTIAL' | 'REFUSED' | 'UNKNOWN'
export type Profile = 'everyday' | 'GO_PARANOID' | 'COMPLETELY_MAD'

export interface SealedArtifact { name: string; path: string; sha256: string }
export interface GeneratedArtifact { path?: string; name?: string; sha256?: string; kind?: string; [k: string]: unknown }

/** The subset of goblin.run-receipt.v2 the IDE displays. */
export interface Receipt {
  schema?: string
  goblin_version?: string
  status: string
  started?: string
  finished?: string
  execution?: { engine?: string; compiler?: unknown }
  execution_profile?: string
  paranoid_mode?: boolean
  paranoid_postflight?: { status?: string; source_bytes_equal_at_postflight?: boolean } | null
  source?: { path?: string; sha256?: string }
  canonical_source?: { sha256?: string }
  sealed_artifacts?: SealedArtifact[]
  generated_artifacts?: GeneratedArtifact[]
  data_imports?: unknown[]
  module_imports?: unknown[]
  inline_rust?: unknown[]
  stdout_sha256?: string
  stderr_sha256?: string
  freeze?: { status?: string; classification?: string }
  ledger?: { status?: string; event_count?: number; head_event_sha256?: string }
  final_state?: { requested?: boolean; capture_status?: string }
  protocol_violation?: { classification?: string; message?: string } | null
  failure?: { code?: string; type?: string; message?: string; classification?: string | null } | null
  receipt_core_sha256?: string
  rng?: { usage?: string }
  resources?: { used_loop_iterations?: number; effective_loop_budget?: number }
  interaction?: unknown
}

export type Summary = Record<string, string>

/** Parse the trailing `KEY=VALUE` block printed by run/compile/status/etc. */
export function parseSummary(text: string): Summary {
  const out: Summary = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]{2,})=(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2]
  }
  return out
}

export interface GoblinErrorInfo { code: string; title: string; message: string; category: 'MACHINERY_FAIL' | 'PROTOCOL_VIOLATION' }

export function parseGoblinError(text: string): GoblinErrorInfo | null {
  const pv = /GOBLIN PROTOCOL VIOLATION\s*\n+([\s\S]*)/.exec(text)
  if (pv) {
    const body = pv[1].trim()
    return { code: 'G401', title: body.split('\n')[0]?.trim() ?? 'protocol violation', message: body, category: 'PROTOCOL_VIOLATION' }
  }
  const m = /GOBLIN ERROR (G\d{3})\s*\n+([\s\S]*?)(?:\n[A-Z][A-Z0-9_]{2,}=|$)/.exec(text)
  if (!m) return null
  const body = m[2].trim()
  return { code: m[1], title: body.split('\n')[0]?.trim() ?? m[1], message: body, category: 'MACHINERY_FAIL' }
}

export function statusFromSummary(summary: Summary, exitCode: number | null, text: string): RunStatus {
  const s = summary.RUN_STATUS ?? summary.COMPILE_STATUS ?? summary.VERIFICATION_STATUS
  if (s === 'PASS') return 'PASS'
  if (s === 'MACHINERY_FAIL') return 'MACHINERY_FAIL'
  if (s === 'PROTOCOL_VIOLATION' || /GOBLIN PROTOCOL VIOLATION/.test(text)) return 'PROTOCOL_VIOLATION'
  if (s === 'PARTIAL') return 'PARTIAL'
  if (s === 'REFUSED') return 'REFUSED'
  if (s === 'FAIL') return 'FAIL'
  if (/GOBLIN ERROR G\d+/.test(text)) return 'MACHINERY_FAIL'
  if (exitCode === 0) return 'PASS'
  if (exitCode === null) return 'UNKNOWN'
  return 'FAIL'
}

export type ResultKind = 'pass' | 'failure' | 'machinery-failure' | 'verification-failure' | 'protocol-violation'

/** Mirrors the VS Code extension's classification so the UI copy stays consistent. */
export function resultKind(stdout: string, stderr: string, exitCode: number | null): ResultKind {
  const text = `${stdout}\n${stderr}`
  if (/PROTOCOL_VIOLATION|LEDGER_STATUS=FAIL|FREEZE_RECEIPT=FAIL|STATE=(?:FROZEN_INVALID|FROZEN_UNREGISTERED|.*(?:FAILURE|TAMPERED|CHANGE_AFTER_FREEZE|MISMATCH|MISSING))/.test(text)) return 'protocol-violation'
  if (/VERIFICATION_STATUS=FAIL/.test(text)) return 'verification-failure'
  if (/MACHINERY_FAIL|GOBLIN ERROR G\d+/.test(text)) return 'machinery-failure'
  return exitCode === 0 ? 'pass' : 'failure'
}

export function profileOf(receipt: Receipt | null, source: string): Profile {
  const p = receipt?.execution_profile?.toUpperCase()
  if (p === 'COMPLETELY_MAD') return 'COMPLETELY_MAD'
  if (p === 'GO_PARANOID' || p === 'PARANOID') return 'GO_PARANOID'
  if (/^\s*COMPLETELY_MAD\b/m.test(source)) return 'COMPLETELY_MAD'
  if (/^\s*GO_PARANOID\b/m.test(source)) return 'GO_PARANOID'
  return 'everyday'
}

export function shortHash(h: string | undefined | null, n = 12): string {
  if (!h) return '—'
  return h.length > n ? `${h.slice(0, n)}…` : h
}

/** Strip the trailing KEY=VALUE summary block from program output. */
export function splitProgramOutput(stdout: string): { program: string; summary: string } {
  const lines = stdout.split('\n')
  let i = lines.length
  while (i > 0 && (lines[i - 1].trim() === '' || /^[A-Z][A-Z0-9_]{2,}=/.test(lines[i - 1]))) i--
  return { program: lines.slice(0, i).join('\n'), summary: lines.slice(i).join('\n') }
}

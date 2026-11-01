import { stripSource } from '../language/parser'

/** Probe only direct new builtin calls; quoted strings/comments are not capabilities. */
export const NETWORK_FUNCTIONS = [
  'net_demo_credentials', 'net_pair_credentials', 'net_allow', 'net_timeout', 'net_listen', 'net_connect',
  'net_accept', 'net_send', 'net_receive', 'net_close', 'net_address', 'net_peer_sha256',
  'e2e_keygen', 'e2e_public_key', 'e2e_encrypt', 'e2e_decrypt',
] as const
export function missingNetworkFunctions(source: string, capabilities: unknown): string[] {
  const available = new Set(Array.isArray(capabilities) ? capabilities.filter((v): v is string => typeof v === 'string') : [])
  const code = stripSource(source).lines.join('\n')
  return NETWORK_FUNCTIONS.filter(name => new RegExp(`\\b${name}\\s*\\(`).test(code) && !available.has(name))
}

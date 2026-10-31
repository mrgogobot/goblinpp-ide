export type ProviderId = 'mock' | 'openai' | 'anthropic' | 'google' | 'ollama' | 'custom'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  ts: number
  pinned?: boolean
  provider?: string
  model?: string
}

export interface ProviderConfig {
  id: ProviderId
  name: string
  enabled: boolean
  baseUrl?: string
  models: string[]
  defaultModel: string
  requiresKey: boolean
}

export interface StreamRequest {
  messages: { role: string; content: string }[]
  model: string
  provider: ProviderId
  apiKey?: string
  baseUrl?: string
}

export interface AiProvider {
  id: ProviderId
  stream(req: StreamRequest, onDelta: (text: string) => void, signal: AbortSignal): Promise<void>
}

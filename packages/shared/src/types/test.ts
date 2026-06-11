export interface TestMessage {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  latency?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
  model?: string
  timestamp: string
}

export interface TestSession {
  id: string
  promptId: string
  messages: TestMessage[]
  model: string
  createdAt: string
}

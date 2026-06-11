export interface MetricSummary {
  totalCalls: number
  totalTokens: number
  totalCost: number
  avgLatency: number
  errorRate: number
  period: string
}

export interface DailyMetric {
  date: string
  calls: number
  tokens: number
  cost: number
  avgLatency: number
  errors: number
}

export interface LogEntry {
  id: string
  promptId: string
  promptName: string
  model: string
  userQuery: string
  response: string
  inputTokens: number
  outputTokens: number
  latency: number
  cost: number
  status: "success" | "error"
  errorMessage?: string
  createdAt: string
  endpointId?: string
  endpointPath?: string
  environment?: string
  apiKeyId?: string
  apiKeyName?: string
}

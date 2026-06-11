import type { MetricSummary, DailyMetric, LogEntry } from "./monitoring"

/* ─── Period Filter ─── */

export type UsagePeriod = "7d" | "14d" | "30d" | "90d" | "custom"

export interface UsageDateRange {
  from: string // "YYYY-MM-DD"
  to: string
}

/* ─── Breakdown Types ─── */

export interface ModelUsage {
  modelId: string
  modelName: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
}

export interface AgentUsageSummary {
  agentId: string
  agentName: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  avgLatency: number
  errorRate: number
}

export interface PromptUsageSummary {
  promptId: string
  promptName: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  avgLatency: number
  errorRate: number
}

export interface EndpointUsageSummary {
  endpointId: string
  endpointPath: string
  promptId: string
  promptName: string
  environment: string
  modelId: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  avgLatency: number
  errorRate: number
  status: "active" | "paused" | "inactive"
}

export interface ApiKeyUsageSummary {
  apiKeyId: string
  apiKeyName: string
  keyMasked: string
  environment: string
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
  avgLatency: number
  errorRate: number
  lastUsedAt: string | null
  status: "active" | "revoked" | "expired"
}

/* ─── Insight Types ─── */

export type InsightSeverity = "info" | "warning" | "success" | "critical"

export interface UsageInsight {
  id: string
  icon: string
  severity: InsightSeverity
  title: string
  description: string
  metric?: string
}

/* ─── Prompt-Endpoint Tree ─── */

export interface EndpointInTree {
  endpointId: string
  endpointPath: string
  environment: string
  modelId: string
  modelName: string
  calls: number
  cost: number
  avgLatency: number
  errorRate: number
  status: "active" | "paused" | "inactive"
}

export interface PromptWithEndpoints {
  promptId: string
  promptName: string
  calls: number
  totalTokens: number
  cost: number
  avgLatency: number
  errorRate: number
  endpoints: EndpointInTree[]
}

/* ─── Environment Distribution ─── */

export interface EnvironmentDistribution {
  environment: string
  calls: number
  tokens: number
  cost: number
  percentage: number
}

/* ─── API Key Activity ─── */

export interface ApiKeyActivity extends ApiKeyUsageSummary {
  accessedEndpointPaths: string[]
}

/* ─── Provider Breakdown ─── */

export interface ProviderBreakdownRow {
  modelId: string
  modelName: string
  providerId: string | null
  providerName: string
  providerSlug: string | null
  calls: number
  totalTokens: number
  cost: number
  costPercentage: number
}

/* ─── Agent Card ─── */

export interface AgentCardData extends AgentUsageSummary {
  sparkline: number[]
  environmentSplit: { prod: number; staging: number; dev: number }
}

/* ─── V2 Data Envelopes ─── */

export interface GlobalUsageDataV2 {
  summary: MetricSummary
  dailyMetrics: DailyMetric[]
  agentCards: AgentCardData[]
  providerBreakdown: ProviderBreakdownRow[]
  environmentDistribution: EnvironmentDistribution[]
  insights: UsageInsight[]
}

export interface ProjectUsageDataV2 {
  summary: MetricSummary
  dailyMetrics: DailyMetric[]
  promptEndpointTree: PromptWithEndpoints[]
  apiKeyActivity: ApiKeyActivity[]
  environmentDistribution: EnvironmentDistribution[]
  insights: UsageInsight[]
  recentLogs: LogEntry[]
}

/* ─── Detail Usage (kept for usage-summary-panel) ─── */

export interface DetailUsageData {
  summary: MetricSummary
  dailyMetrics: DailyMetric[]
  logs: LogEntry[]
}

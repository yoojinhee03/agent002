// ============================================================
// Evaluation
// ============================================================

export type MetricType = 'accuracy' | 'faithfulness' | 'relevance' | 'latency' | 'cost' | 'format'

export interface EvalRunConfig {
  model?: string
  promptVersionId?: string
  temperature?: number
  parallelism: number
  judgeModel: string
  metrics: MetricType[]
}

export interface EvalScores {
  accuracy?: number
  faithfulness?: number
  relevance?: number
  latencyMs?: number
  costUsd?: number
  formatValid?: boolean
  overall?: number
}

export interface EvalSummary {
  totalCases: number
  passedCases: number
  failedCases: number
  avgAccuracy?: number
  avgLatencyMs: number
  totalCostUsd: number
  avgFaithfulness?: number
  scoreDistribution: Record<string, number>
}

export interface EvalDataset {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  _count?: { testCases: number; runs: number }
}

export interface EvalTestCase {
  id: string
  datasetId: string
  input: { message: string; variables?: Record<string, string> }
  expected: { output?: string; criteria?: string[] } | null
  metadata: { tags?: string[]; category?: string; difficulty?: string } | null
  caseOrder: number
  createdAt: string
}

export interface EvalRun {
  id: string
  datasetId: string
  agentId: string | null
  workflowId: string | null
  name: string | null
  config: EvalRunConfig
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  summary: EvalSummary | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface EvalResult {
  id: string
  runId: string
  testCaseId: string
  output: Record<string, unknown>
  scores: EvalScores
  judgeOutput: { reasoning: string } | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  createdAt: string
}

export interface CreateEvalDatasetRequest {
  name: string
  description?: string
}

export interface CreateEvalTestCaseRequest {
  input: EvalTestCase['input']
  expected?: EvalTestCase['expected']
  metadata?: EvalTestCase['metadata']
}

export interface CreateEvalRunRequest {
  datasetId: string
  agentId?: string
  workflowId?: string
  name?: string
  config: EvalRunConfig
}

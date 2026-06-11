// ============================================================
// Agent Run (에이전트 실행 기록)
// ============================================================

import type { NodeType } from './workflow'

export type { NodeType }
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_input'
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WorkflowRun {
  id: string
  workflowId?: string
  agentId?: string
  projectId?: string
  endpointId?: string
  apiKeyId?: string
  modelId?: string
  environment?: string
  status: RunStatus
  input: Record<string, unknown>
  output?: unknown
  errorMessage?: string
  totalCost?: number
  totalTokens?: number
  totalSteps?: number
  latencyMs?: number
  startedAt: string
  completedAt?: string
  traces?: StepTrace[]
}

export interface StepTrace {
  id: string
  runId: string
  nodeId: string
  nodeName: string
  nodeType: NodeType
  status: StepStatus
  input: Record<string, unknown>
  output?: unknown
  errorMessage?: string
  startedAt: string
  completedAt?: string
  latency?: number   // ms
  cost?: number
  tokens?: number
  retries: number
}

// ============================================================
// Run Stream Events (WebSocket)
// ============================================================

export type RunEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'plan.created'     // 신규 계획 생성 이벤트
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'step.output'      // LLM 스트리밍 델타
  | 'waiting_input'    // Human-in-the-loop 대기

export interface RunEvent {
  type: RunEventType
  runId: string
  timestamp: string
  data?: unknown
}

export interface StepStartedEvent extends RunEvent {
  type: 'step.started'
  data: {
    nodeId: string
    nodeName: string
    nodeType: NodeType
  }
}

export interface StepCompletedEvent extends RunEvent {
  type: 'step.completed'
  data: StepTrace
}

export interface WaitingInputEvent extends RunEvent {
  type: 'waiting_input'
  data: {
    nodeId: string
    prompt: string
    timeoutSeconds?: number
  }
}

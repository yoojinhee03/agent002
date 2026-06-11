// ============================================================
// Thread (대화/상호작용 세션)
// ============================================================

export type ThreadStatus = 'active' | 'paused' | 'completed' | 'failed' | 'archived'

export interface Thread {
  id: string
  projectId: string
  agentId?: string
  teamId?: string
  title?: string
  status: ThreadStatus
  metadata: Record<string, unknown>
  userId?: string
  createdAt: string
  updatedAt: string
}

export interface CreateThreadRequest {
  agentId?: string
  teamId?: string
  agentDeploymentId?: string
  title?: string
  metadata?: Record<string, unknown>
}

import type { WsStepStartedEvent } from './hitl'

export interface ThreadMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCallInfo[]
  intermediateSteps?: WsStepStartedEvent[]
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface ToolCallInfo {
  id: string
  name: string
  args: Record<string, unknown>
  result?: unknown
}

export interface SendMessageRequest {
  content: string
  /** 스트리밍 응답 여부 */
  stream?: boolean
}

export interface ThreadCheckpoint {
  id: string
  threadId: string
  checkpoint: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
}

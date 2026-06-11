// ============================================================
// Human-in-the-Loop (HITL 상호작용)
// ============================================================

export type InteractionType = 'approval' | 'input' | 'choice' | 'edit'
export type InteractionStatus = 'pending' | 'approved' | 'rejected' | 'timed_out' | 'cancelled'

export interface HumanInteraction {
  id: string
  threadId: string
  nodeId: string
  type: InteractionType
  status: InteractionStatus
  prompt: string
  options?: ChoiceOption[]
  agentContext?: Record<string, unknown>
  response?: unknown
  respondedBy?: string
  timeoutAt?: string
  timeoutAction?: 'cancel' | 'auto_approve' | 'escalate'
  escalateTo?: string
  createdAt: string
  respondedAt?: string
  /** deepagents HITL — 인터럽트 상세 */
  actionRequests?: Array<{ name: string; args: Record<string, unknown> }>
  reviewConfigs?: Array<{ actionName: string; allowedDecisions: string[] }>
  toolName?: string
  toolArgs?: Record<string, unknown>
  allowedDecisions?: string[]
  /**
   * "수정" 의도로 reject 한 경우 사용자가 입력한 자연어 수정문.
   * DB 의 response.editPrompt 를 listByThread / WS 평탄화 단계에서 끌어올린 값.
   */
  editPrompt?: string
  /**
   * deepagents 에 전송된 edit 결정의 도구 인자 (변경 후 args).
   * DB 의 response.editedAction 을 listByThread 단계에서 끌어올린 값. history 에서
   * "원본 args → 수정 후 args" 비교 표시에 사용.
   */
  editedAction?: {
    name: string
    args: Record<string, unknown>
  }
}

export interface ChoiceOption {
  label: string
  value: string
  description?: string
}

export interface RespondInteractionRequest {
  /** approval: true/false, input: 문자열, choice: 선택값, edit: 수정된 텍스트 */
  response: unknown
}

// ============================================================
// 공통 Envelope — 모든 WebSocket 이벤트의 기반 필드
// ============================================================

export interface EventEnvelope {
  threadId: string   // 대화 세션
  turnId: string     // 사용자 메시지 1개 → AI 응답 1개 단위
  timestamp: string  // ISO8601 UTC
}

// ============================================================
// stepType — 실행 단계 종류
// ============================================================

export type StepType = 'llm' | 'tool' | 'agent' | 'planner' | 'reasoning' | 'condition' | 'human'

// ============================================================
// WebSocket Events
// ============================================================

/** HITL 승인/입력 요청 */
export interface HitlRequestEvent {
  type: 'hitl.request'
  interaction: HumanInteraction
  threadId: string
  timestamp: string
}

/** HITL 타임아웃 경고 */
export interface HitlTimeoutWarningEvent {
  type: 'hitl.timeout_warning'
  interactionId: string
  threadId: string
  timeoutAt: string
  timestamp: string
}

/** 스레드 상태 변경 (thread.update → thread.updated) */
export interface ThreadUpdatedEvent extends EventEnvelope {
  type: 'thread.updated'
  status: 'active' | 'paused' | 'failed' | 'archived'
}

// ──────────────────────────────────────────────────────────────
// Turn 이벤트 — 사용자 메시지 1개 = 1 Turn
// ──────────────────────────────────────────────────────────────

/** AI 응답 턴 시작 */
export interface TurnStartedEvent extends EventEnvelope {
  type: 'turn.started'
}

/** AI 응답 턴 완료 */
export interface TurnCompletedEvent extends EventEnvelope {
  type: 'turn.completed'
  finalContent: string  // 최종 응답 전문 (클라이언트가 재조립 불필요)
}

// ──────────────────────────────────────────────────────────────
// Agent 토큰 이벤트 — LLM 출력 스트리밍
// ──────────────────────────────────────────────────────────────

/**
 * LLM 응답 토큰 스트리밍 (기존 agent.streaming type='agent.streaming')
 * stepId: 어느 스트림 세션의 토큰인지 (서브 에이전트 구분용)
 */
export interface AgentTokenEvent extends EventEnvelope {
  type: 'agent.token'
  stepId: string        // 스트림 묶음 ID (같은 응답 세션의 토큰은 동일 stepId)
  parentStepId?: string // 서브 에이전트 내 토큰이면 부모 agent step ID
  depth: number         // 0=루트, 1=서브 에이전트, N=N단계 중첩
  content: string
  delta: boolean        // true=증분 추가, false=전체 교체
  done: boolean
}

/**
 * 추론(Chain-of-Thought) 토큰 스트리밍 (기존 agent.streaming type='agent.reasoning')
 */
export interface AgentReasoningEvent extends EventEnvelope {
  type: 'agent.reasoning'
  stepId: string
  parentStepId?: string
  depth: number
  content: string
  delta: boolean
  done: boolean
}

// ──────────────────────────────────────────────────────────────
// Step 이벤트 — 실행 단계 (도구 호출, 에이전트, LLM 등)
// ──────────────────────────────────────────────────────────────

/** 단계 시작 (기존 step.progress status='started') */
export interface WsStepStartedEvent extends EventEnvelope {
  type: 'step.started'
  stepId: string
  parentStepId?: string  // 중첩 단계의 부모 stepId
  depth: number          // 0=루트, 1=서브 에이전트 내부, N=N단계 중첩
  stepType: StepType
  name: string           // 표시용 이름 (예: "web_search", "Agent B > web_search")
  nodeId: string         // 노드 식별자 (예: "tools:web_search", "agent:agent-b")
  input?: unknown
}

/** 단계 완료 (기존 step.progress status='completed') */
export interface WsStepCompletedEvent extends EventEnvelope {
  type: 'step.completed'
  stepId: string
  parentStepId?: string
  depth: number
  stepType: StepType
  name: string
  nodeId: string
  output?: unknown
  latencyMs: number
}

/** 단계 실패 (기존 step.progress status='failed') */
export interface WsStepFailedEvent extends EventEnvelope {
  type: 'step.failed'
  stepId: string
  parentStepId?: string
  depth: number
  stepType: StepType
  name: string
  nodeId: string
  error: string
  latencyMs: number
}

// ──────────────────────────────────────────────────────────────
// Plan 이벤트
// ──────────────────────────────────────────────────────────────

/** 실행 계획의 단일 항목 — deepagents `write_todos` 출력 포맷과 동일 */
export interface TodoStep {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** 에이전트가 수립한 실행 계획 — `write_todos` 호출마다 전체 목록이 최신 상태로 재전송됨 */
export interface PlanCreatedEvent extends EventEnvelope {
  type: 'plan.created'
  steps: TodoStep[]
}

// ──────────────────────────────────────────────────────────────
// Agent Assistant 이벤트 — 시나리오 → main+sub 자동 설계 메타 에이전트
// ──────────────────────────────────────────────────────────────

/** Assistant가 캔버스에 추가 제안한 노드 (status='proposed'로 점선 미리보기) */
export interface AssistantNodeProposedEvent {
  type: 'assistant.node_proposed'
  threadId: string
  timestamp: string
  kind: 'main' | 'sub'
  node: {
    id: string
    type: 'mainAgent' | 'subAgent'
    position: { x: number; y: number }
    data: Record<string, unknown>
  }
}

/** Assistant 세션 종료 — pending nodes/edges 확정, "적용" 버튼 활성화 신호 */
export interface AssistantSessionCompleteEvent {
  type: 'assistant.session_complete'
  threadId: string
  timestamp: string
  summary: string
  finalNodes: Array<{
    id: string
    type: 'mainAgent' | 'subAgent'
    position: { x: number; y: number }
    data: Record<string, unknown>
  }>
  finalEdges: Array<{
    id: string
    source: string
    target: string
  }>
}

// ──────────────────────────────────────────────────────────────
// 유니온 타입
// ──────────────────────────────────────────────────────────────

export type WebSocketEvent =
  | HitlRequestEvent
  | HitlTimeoutWarningEvent
  | ThreadUpdatedEvent
  | TurnStartedEvent
  | TurnCompletedEvent
  | AgentTokenEvent
  | AgentReasoningEvent
  | WsStepStartedEvent
  | WsStepCompletedEvent
  | WsStepFailedEvent
  | PlanCreatedEvent
  | AssistantNodeProposedEvent
  | AssistantSessionCompleteEvent

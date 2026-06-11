// ============================================================
// Agent (자율 에이전트 정의)
// ============================================================

export type AgentType = 'single' | 'supervisor' | 'worker' | 'swarm_member'

export type AgentArchitecture = 'react' | 'plan_execute' | 'tool_calling' | 'custom_graph'

export interface AgentConfig {
  temperature?: number
  maxTokens?: number
  maxIterations?: number
  [key: string]: unknown
}

export interface HitlPolicy {
  /** 도구 호출 전 승인 필요 여부 */
  requireToolApproval?: boolean
  /** 특정 도구만 승인 필요 (toolId 목록) */
  approvalRequiredTools?: string[]
  /** 최종 응답 전 검토 필요 여부 */
  requireOutputReview?: boolean
  /** 자동 승인 타임아웃 (초, null이면 무제한 대기) */
  autoApproveTimeoutSeconds?: number | null
  /** 타임아웃 시 행동 */
  timeoutAction?: 'cancel' | 'auto_approve' | 'escalate'
  /** 에스컬레이션 대상 (userId 또는 role) */
  escalateTo?: string
}

export interface Agent {
  id: string
  projectId: string
  name: string
  slug: string
  description: string
  type: AgentType
  architecture: AgentArchitecture
  architectures?: AgentArchitecture[]
  systemPrompt: string
  modelId: string
  toolIds: string[]
  toolGroupIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: Array<{ serverId: string; toolName: string }>
  builtinToolIds?: string[]
  skillIds?: string[]
  graphDefinition?: Record<string, unknown>
  config: AgentConfig
  hitlPolicy?: HitlPolicy
  enabled: boolean
  createdAt: string
  updatedAt: string
  // Step 0: New configs
  reasoningConfig?: ReasoningConfig
  memoryConfig?: MemoryConfig
  guardrailsConfig?: GuardrailsConfig
  planningConfig?: PlanningConfig
  outputSchema?: Record<string, unknown>
  toolPermissions?: ToolPermissionsMap
  /** 활성(active) 상태의 AgentDeployment 가 1건 이상 존재하는지 (목록 응답에서만 포함). */
  hasActiveDeployment?: boolean
}

export interface CreateAgentRequest {
  name: string
  slug?: string
  description?: string
  type?: AgentType
  architecture?: AgentArchitecture
  systemPrompt: string
  modelId: string
  toolIds?: string[]
  toolGroupIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: Array<{ serverId: string; toolName: string }>
  builtinToolIds?: string[]
  skillIds?: string[]
  graphDefinition?: Record<string, unknown>
  config?: AgentConfig
  hitlPolicy?: HitlPolicy
  toolPermissions?: ToolPermissionsMap
}

export interface UpdateAgentRequest {
  name?: string
  description?: string
  type?: AgentType
  architecture?: AgentArchitecture
  architectures?: AgentArchitecture[]
  systemPrompt?: string
  modelId?: string
  toolIds?: string[]
  toolGroupIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: Array<{ serverId: string; toolName: string }>
  builtinToolIds?: string[]
  skillIds?: string[]
  graphDefinition?: Record<string, unknown>
  config?: AgentConfig
  hitlPolicy?: HitlPolicy
  enabled?: boolean
  reasoningConfig?: ReasoningConfig
  memoryConfig?: MemoryConfig
  guardrailsConfig?: GuardrailsConfig
  planningConfig?: PlanningConfig
  outputSchema?: Record<string, unknown>
  toolPermissions?: ToolPermissionsMap
}

// ============================================================
// Step 0: 신규 Config 타입
// ============================================================

export interface ReasoningConfig {
  thinkingDepth?: 1 | 2 | 3 | 4 | 5
  stepLimit?: number
  cotVisible?: boolean
  reactThoughtVisible?: boolean
  // Plan-Execute 전용
  planningDepth?: number
  replanningTrigger?: 'never' | 'on_failure' | 'always'
  // Tool Calling 전용
  parallelToolExecution?: boolean
}

export interface MemoryConfig {
  shortTerm?: {
    enabled: boolean
    backend: 'redis' | 'in_memory'
    ttlSeconds: number
  }
  longTerm?: {
    enabled: boolean
    backend: 'postgresql'
    maxEntries: number
  }
  strategy?: 'summary' | 'raw_log' | 'hybrid'
  windowSize?: number
  autoSummarizeThreshold?: number
}

export interface OutputFilter {
  type: 'regex' | 'keyword' | 'llm_check'
  pattern: string
  action: 'block' | 'mask' | 'warn'
  replacement?: string
}

export interface GuardrailsConfig {
  blockedTopics?: string[]
  outputFilters?: OutputFilter[]
  jsonSchemaValidation?: boolean
  safetyLevel?: 'low' | 'medium' | 'high'
  maxOutputLength?: number
  piiDetection?: boolean
}

export interface PlanningConfig {
  decomposition?: boolean
  orchestrationMode?: 'sequential' | 'parallel' | 'conditional'
  subAgents?: {
    enabled: boolean
    agentIds: string[]
    maxConcurrent: number
    delegationStrategy: 'round_robin' | 'capability_based' | 'load_balanced'
  }
  // Hybrid Agent 위임 설정 (H-2)
  delegation?: {
    enabled: boolean
    delegationMode: 'always' | 'on_complexity' | 'on_keyword' | 'manual'
    delegatableTeamIds: string[]
    delegationTrigger?: string
    maxDelegationDepth: number
  }
}

// ============================================================
// Track K: Tool Permission Manager
// ============================================================

export type ToolPolicy = 'auto' | 'requires_approval' | 'restricted' | 'disabled'

export interface ToolPermission {
  toolId: string
  policy: ToolPolicy
  conditions?: string
  cardId?: string
}

export interface ToolPermissionEntry {
  policy: ToolPolicy
  conditions?: string
  cardId?: string
}

export type ToolPermissionValue = ToolPolicy | ToolPermissionEntry
export type ToolPermissionsMap = Record<string, ToolPermissionValue>

// ============================================================
// Track K: Agent Run Scheduler
// ============================================================

export interface AgentSchedule {
  id: string
  name: string
  cron: string
  input: Record<string, unknown>
  enabled: boolean
  lastRunAt: string | null
  createdAt: string
}

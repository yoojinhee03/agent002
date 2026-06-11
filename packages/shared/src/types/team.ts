// ============================================================
// AgentTeam (다중 에이전트 협업)
// ============================================================

export type TeamTopology = 'supervisor' | 'swarm' | 'sequential' | 'parallel'

export interface TeamConfig {
  /** Supervisor: 라우팅 프롬프트 */
  routingPrompt?: string
  /** Swarm: 최대 핸드오프 횟수 */
  maxHandoffs?: number
  /** Sequential/Parallel: 결과 병합 전략 */
  mergeStrategy?: 'concat' | 'last' | 'custom'
  [key: string]: unknown
}

export interface TeamAgent {
  id: string
  teamId: string
  agentId?: string
  subTeamId?: string
  role: string
  routingCondition?: string
  order: number
  // 확장: 에이전트 상세 (join 시)
  agent?: {
    id: string
    name: string
    slug: string
    type: string
    architecture: string
    modelId: string
  }
  // 확장: Nested Team 상세 (join 시)
  subTeam?: {
    id: string
    name: string
    slug: string
    topology: TeamTopology
  }
}

export interface AgentTeam {
  id: string
  projectId: string
  name: string
  slug: string
  description: string
  topology: TeamTopology
  config: TeamConfig
  enabled: boolean
  createdAt: string
  updatedAt: string
  teamAgents?: TeamAgent[]
}

export interface CreateTeamRequest {
  name: string
  slug?: string
  description?: string
  topology?: TeamTopology
  config?: TeamConfig
}

export interface UpdateTeamRequest {
  name?: string
  description?: string
  topology?: TeamTopology
  config?: TeamConfig
  enabled?: boolean
}

export interface AddTeamAgentRequest {
  agentId: string
  role?: string
  routingCondition?: string
  order?: number
}

export interface AddSubTeamRequest {
  subTeamId: string
  role?: string
  order?: number
}

import type { CredentialKind } from "./user-credential"

export interface ClientAgentEnv {
  id: string
  name: string
  slug: string
  color: string
}

export interface SkillRef {
  id: string
  name: string
  description?: string
}

export type ToolRefKind = 'builtin' | 'custom' | 'mcp'

export interface ToolRef {
  kind: ToolRefKind
  id: string
  label: string
  description?: string
  mcpServerId?: string
  mcpServerName?: string
  credentialMode?: 'shared' | 'per_user'
  requiresCredential: boolean
  credentialTargetId?: string
}

export interface SubAgentRef {
  id: string
  name: string
  role?: string
  modelName?: string
  skills: SkillRef[]
  tools: ToolRef[]
}

export interface AgentComposition {
  main: {
    skills: SkillRef[]
    tools: ToolRef[]
  }
  subAgents: SubAgentRef[]
}

export interface ClientAgentCard {
  deploymentId: string
  agentId: string
  slug: string
  name: string
  description: string
  type: string
  architecture: string
  env: ClientAgentEnv
  version: number
  publicPath: string
  starters: string[]
  deployedAt: string
  composition: AgentComposition
}

export interface RequiredCredential {
  kind: CredentialKind
  targetId: string
  label: string
  reason: string
}

export interface ClientAgentDetail extends ClientAgentCard {
  requiredCredentials: RequiredCredential[]
  missingCredentials: RequiredCredential[]
}

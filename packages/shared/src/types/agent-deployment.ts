import type { DeploymentStatus } from "./deployment"

export interface AgentDeployment {
  id: string
  projectId: string
  agentId: string
  environmentId: string
  version: number
  status: DeploymentStatus
  publicPath: string
  snapshot: Record<string, unknown>
  description?: string | null
  deployedBy: string
  deployedAt: string
  undeployedAt?: string | null
  env?: { id: string; name: string; slug: string; color: string }
}

export type AgentDeploymentApiKeyStatus = "active" | "revoked" | "expired"

export interface AgentDeploymentApiKey {
  id: string
  name: string
  keyMasked: string
  scopes: string[]
  status: AgentDeploymentApiKeyStatus
  enabled: boolean
  validFrom?: string | null
  expiresAt?: string | null
  lastUsedAt?: string | null
  createdAt: string
}

export interface IssuedAgentDeploymentApiKey extends AgentDeploymentApiKey {
  rawKey: string
  keyPrefix: string
  keySuffix: string
}

export interface CreateAgentDeploymentRequest {
  environmentId: string
  description?: string
}

export interface IssueDeploymentApiKeyRequest {
  name: string
  scopes?: string[]
  validFrom?: string
  expiresAt?: string
}

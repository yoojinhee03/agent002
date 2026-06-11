export type DeploymentStatus = "active" | "inactive" | "deploying" | "failed" | "pending_approval"

export interface DeploymentEnvironment {
  id: string
  projectId: string
  name: string           // "Development", "Staging", "Production", or custom
  slug: string           // "dev", "staging", "prod", etc.
  color: string          // Tailwind color prefix like "blue", "amber", "emerald"
  order: number          // display order
  approvalRequired: boolean
  createdAt: string
}

export interface Deployment {
  id: string
  projectId: string
  promptId: string
  promptName: string
  environmentId: string
  environment: string    // env slug for convenience
  versionId: string
  versionNumber: number
  status: DeploymentStatus
  endpointPath: string   // auto-generated: /api/v1/prompts/{slug}/{env}/run
  trafficPolicy: "immediate" | "canary"
  canaryPercent?: number
  deployedBy: string
  deployedAt: string
  rollbackFrom?: number  // if this was a rollback, previous version number
}

export interface DeploymentLog {
  id: string
  projectId: string
  promptId: string
  promptName: string
  action: "deploy" | "promote" | "rollback" | "pause" | "resume" | "undeploy"
  fromVersion?: number
  toVersion?: number
  environment: string
  performedBy: string
  performedAt: string
  note?: string
}

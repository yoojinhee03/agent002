export interface ApiKey {
  id: string
  name: string
  key: string              // masked except last 4 chars
  projectId: string
  // Scope: "*" = all, or specific environment slug, or "endpoint" for per-endpoint
  environment: string
  // Per-endpoint binding: empty = all endpoints in the environment
  endpointIds: string[]
  scopes: string[]
  validFrom: string | null   // start date (ISO)
  expiresAt: string | null   // end date (ISO)
  enabled: boolean           // soft toggle (separate from status)
  createdAt: string
  lastUsedAt: string | null
  status: "active" | "revoked" | "expired"
}

export interface EndpointVariable {
  name: string
  type: string       // "string" | "number" | "boolean" | "array" | "object"
  required: boolean
  defaultValue: string
  description?: string
}

export interface Endpoint {
  id: string
  deploymentId: string
  promptId: string
  promptName: string
  projectSlug: string    // URL-safe project name: "my-project"
  promptSlug: string     // URL-safe prompt name: "customer-support-router"
  path: string           // /api/v1/prompts/{projectSlug}/{promptSlug}/{env}/run
  method: "POST"
  environment: string
  versionNumber: number
  versionId: string      // to look up snapshot for rendering
  modelId: string
  variables: EndpointVariable[]
  responseType: "prompt" | string   // extensible — future: "chat", "classification", etc.
  description?: string              // endpoint-level description
  status: "active" | "paused" | "inactive"
  createdAt: string
  updatedAt: string
  prompt?: {
    description: string
  }
}

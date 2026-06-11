export interface Provider {
  id: string
  name: string       // "OpenAI", "Anthropic", "Google"
  slug: string       // "openai", "anthropic", "google"
  type?: "cloud" | "local"
  iconUrl?: string
  apiKeyConfigured: boolean
  apiKey?: string    // masked storage (e.g. "sk-...xxxxx")
  endpoint?: string  // base URL for local providers
  models: Model[]
}

export interface DiscoveredModel {
  id: string
  name: string
  contextWindow: number
  size?: string
}

export interface Model {
  id: string
  name: string
  providerId: string
  contextWindow: number
  inputPrice: number   // per 1M tokens
  outputPrice: number  // per 1M tokens
  capabilities: string[]
  enabled: boolean
  isCustom?: boolean
}

/** Flat model with provider metadata — returned by getEnabledModels */
export interface EnabledModel extends Model {
  providerName: string
  providerSlug: string
}

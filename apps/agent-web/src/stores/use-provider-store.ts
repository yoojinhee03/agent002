import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { mockApi } from "@/lib/api-client"
import type { Provider, Model, EnabledModel, DiscoveredModel } from "@/types/provider"

interface ProviderState {
  providers: Provider[]
  loading: boolean

  loadProviders: () => Promise<void>
  configureApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  removeApiKey: (providerId: string) => Promise<boolean>
  testConnection: (providerId: string) => Promise<{ success: boolean; message: string }>
  toggleModel: (providerId: string, modelId: string, enabled: boolean) => Promise<void>
  getEnabledModels: () => EnabledModel[]
  addCustomModel: (providerId: string, model: Omit<Model, "providerId">) => Promise<Model | undefined>
  removeCustomModel: (providerId: string, modelId: string) => Promise<boolean>
  configureEndpoint: (providerId: string, endpoint: string) => Promise<boolean>
  discoverLocalModels: (providerId: string) => Promise<DiscoveredModel[]>
  addLocalProvider: (name: string, endpoint: string) => Promise<Provider | undefined>
  deleteLocalProvider: (providerId: string) => Promise<boolean>
}

export const useProviderStore = create<ProviderState>()(
  immer((set, get) => ({
    providers: [],
    loading: false,

    loadProviders: async () => {
      set((s) => { s.loading = true })
      try {
        const providers = await mockApi.providers.list()
        set((s) => {
          s.providers = Array.isArray(providers) ? providers : []
          s.loading = false
        })
      } catch (error) {
        console.error("Failed to load providers:", error)
        set((s) => { s.loading = false })
      }
    },

    configureApiKey: async (providerId, apiKey) => {
      const result = await mockApi.providers.configure(providerId, apiKey)
      if (!result) return false
      set((s) => {
        const idx = s.providers.findIndex((p) => p.id === providerId)
        if (idx !== -1) {
          s.providers[idx].apiKeyConfigured = result.apiKeyConfigured
          s.providers[idx].apiKey = result.apiKey
        }
      })
      return true
    },

    removeApiKey: async (providerId) => {
      const ok = await mockApi.providers.removeApiKey(providerId)
      if (!ok) return false
      set((s) => {
        const idx = s.providers.findIndex((p) => p.id === providerId)
        if (idx !== -1) {
          s.providers[idx].apiKeyConfigured = false
          s.providers[idx].apiKey = undefined
        }
      })
      return true
    },

    testConnection: async (providerId) => {
      return mockApi.providers.testConnection(providerId)
    },

    toggleModel: async (providerId, modelId, enabled) => {
      const ok = await mockApi.providers.toggleModel(providerId, modelId, enabled)
      if (!ok) return
      set((s) => {
        const provider = s.providers.find((p) => p.id === providerId)
        if (!provider) return
        const model = provider.models.find((m) => m.id === modelId)
        if (model) model.enabled = enabled
      })
    },

    getEnabledModels: () => {
      const { providers } = get()
      const result: EnabledModel[] = []
      for (const p of providers) {
        if (!p.apiKeyConfigured) continue
        for (const m of p.models) {
          if (!m.enabled) continue
          result.push({ ...m, providerName: p.name, providerSlug: p.slug })
        }
      }
      return result
    },

    addCustomModel: async (providerId, model) => {
      const result = await mockApi.providers.addCustomModel(providerId, model)
      if (!result) return undefined
      set((s) => {
        const provider = s.providers.find((p) => p.id === providerId)
        if (provider) provider.models.push(result)
      })
      return result
    },

    removeCustomModel: async (providerId, modelId) => {
      const ok = await mockApi.providers.deleteCustomModel(providerId, modelId)
      if (!ok) return false
      set((s) => {
        const provider = s.providers.find((p) => p.id === providerId)
        if (provider) {
          const idx = provider.models.findIndex((m) => m.id === modelId)
          if (idx !== -1) provider.models.splice(idx, 1)
        }
      })
      return true
    },

    configureEndpoint: async (providerId, endpoint) => {
      const ok = await mockApi.providers.configureEndpoint(providerId, endpoint)
      if (!ok) return false
      set((s) => {
        const provider = s.providers.find((p) => p.id === providerId)
        if (provider) {
          provider.endpoint = endpoint
          provider.apiKeyConfigured = endpoint.trim().length > 0
        }
      })
      return true
    },

    discoverLocalModels: async (providerId) => {
      return mockApi.providers.discoverLocalModels(providerId)
    },

    addLocalProvider: async (name, endpoint) => {
      const result = await mockApi.providers.addLocalProvider(name, endpoint)
      if (!result) return undefined
      set((s) => { s.providers.push(result) })
      return result
    },

    deleteLocalProvider: async (providerId) => {
      const ok = await mockApi.providers.deleteLocalProvider(providerId)
      if (!ok) return false
      set((s) => {
        const idx = s.providers.findIndex((p) => p.id === providerId)
        if (idx !== -1) s.providers.splice(idx, 1)
      })
      return true
    },
  }))
)

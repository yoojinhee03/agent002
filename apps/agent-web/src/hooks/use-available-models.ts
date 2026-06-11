import { useMemo, useEffect, useState } from "react"
import { useProviderStore } from "@/stores/use-provider-store"
import { useUserStore } from "@/stores/use-user-store"
import { mockApi } from "@/lib/api-client"
import type { EnabledModel } from "@/types/provider"

interface AvailableModelsResult {
  models: EnabledModel[]
  grouped: Record<string, EnabledModel[]>
  defaultModelId: string | undefined
  loading: boolean
}

/**
 * Combines global provider state with project-level model filtering.
 * If no projectId, returns all globally enabled models.
 */
export function useAvailableModels(projectId?: string): AvailableModelsResult {
  const providers = useProviderStore((s) => s.providers)
  const loadProviders = useProviderStore((s) => s.loadProviders)
  const getEnabledModels = useProviderStore((s) => s.getEnabledModels)

  const [projectConfig, setProjectConfig] = useState<{
    allowAllModels: boolean
    allowedModelIds: string[]
    defaultModelId?: string
  } | null>(null)
  const [loading, setLoading] = useState(true)

  const { currentUser, isAuthenticated } = useUserStore()

  // Load providers if not loaded
  useEffect(() => {
    if (isAuthenticated && providers.length === 0) {
      loadProviders()
    }
  }, [isAuthenticated, providers.length, loadProviders])

  // Load project config
  useEffect(() => {
    if (!projectId) {
      setProjectConfig(null)
      setLoading(false)
      return
    }
    let cancelled = false
    mockApi.projects.getById(projectId).then((p) => {
      if (cancelled) return
      if (p) {
        setProjectConfig({
          allowAllModels: p.allowAllModels,
          allowedModelIds: p.allowedModelIds,
          defaultModelId: p.defaultModelId,
        })
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectId])

  const result = useMemo(() => {
    const allEnabled = getEnabledModels()

    let models: EnabledModel[]
    if (!projectId || !projectConfig || projectConfig.allowAllModels) {
      models = allEnabled
    } else {
      const allowed = new Set(projectConfig.allowedModelIds)
      models = allEnabled.filter((m) => allowed.has(m.id))
    }

    // Group by provider
    const grouped: Record<string, EnabledModel[]> = {}
    for (const m of models) {
      if (!grouped[m.providerName]) grouped[m.providerName] = []
      grouped[m.providerName].push(m)
    }

    const defaultModelId =
      projectConfig?.defaultModelId ?? models[0]?.id

    return { models, grouped, defaultModelId, loading }
  }, [providers, projectId, projectConfig, loading, getEnabledModels])

  return result
}

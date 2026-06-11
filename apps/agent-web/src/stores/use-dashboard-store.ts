import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { apiClient } from "@/lib/api-client"
import type { DashboardOverview } from "@/types/dashboard"
import type { RunSource } from "@agent-studio/shared"

interface DashboardState {
  overview: DashboardOverview | null
  isLoading: boolean
  source: RunSource
  setSource: (source: RunSource, projectId: string) => Promise<void>
  loadDashboard: (projectId: string, source?: RunSource) => Promise<void>
}

export const useDashboardStore = create<DashboardState>()(
  immer((set, get) => ({
    overview: null,
    isLoading: false,
    source: 'all',

    setSource: async (source, projectId) => {
      set((s) => { s.source = source })
      await get().loadDashboard(projectId, source)
    },

    loadDashboard: async (projectId, source) => {
      const target = source ?? get().source
      set((s) => { s.isLoading = true })
      try {
        const overview = await apiClient.dashboard.getOverview(projectId, target)
        set((s) => {
          s.overview = overview
          s.source = target
          s.isLoading = false
        })
      } catch {
        set((s) => { s.isLoading = false })
      }
    },
  }))
)

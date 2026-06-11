import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { apiClient } from "@/lib/api-client"
import type {
  UsagePeriod,
  UsageDateRange,
  GlobalUsageDataV2,
  ProjectUsageDataV2,
} from "@/types/usage"
import type { RunSource } from "@agent-studio/shared"

function computeDateRange(period: UsagePeriod): UsageDateRange {
  const to = new Date()
  const from = new Date()
  const days = { "7d": 7, "14d": 14, "30d": 30, "90d": 90, custom: 30 }
  from.setDate(from.getDate() - days[period])
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  }
}

interface UsageState {
  period: UsagePeriod
  dateRange: UsageDateRange
  source: RunSource

  globalUsage: GlobalUsageDataV2 | null
  isLoadingGlobal: boolean

  projectUsage: ProjectUsageDataV2 | null
  isLoadingProject: boolean

  setPeriod: (period: UsagePeriod) => void
  setDateRange: (range: UsageDateRange) => void
  setSource: (source: RunSource) => void
  loadGlobalUsage: () => Promise<void>
  loadProjectUsage: (projectId: string) => Promise<void>
}

export const useUsageStore = create<UsageState>()(
  immer((set, get) => ({
    period: "30d",
    dateRange: computeDateRange("30d"),
    source: "all",

    globalUsage: null,
    isLoadingGlobal: false,

    projectUsage: null,
    isLoadingProject: false,

    setPeriod: (period) => {
      set((state) => {
        state.period = period
        if (period !== "custom") {
          state.dateRange = computeDateRange(period)
        }
      })
    },

    setDateRange: (range) => {
      set((state) => {
        state.period = "custom"
        state.dateRange = range
      })
    },

    setSource: (source) => {
      set((state) => {
        state.source = source
      })
    },

    loadGlobalUsage: async () => {
      set((state) => {
        state.isLoadingGlobal = true
      })
      const { dateRange, source } = get()
      const data = await apiClient.usage.getGlobalUsage(dateRange.from, dateRange.to, source)
      set((state) => {
        state.globalUsage = data
        state.isLoadingGlobal = false
      })
    },

    loadProjectUsage: async (projectId) => {
      set((state) => {
        state.isLoadingProject = true
      })
      const { dateRange, source } = get()
      const data = await apiClient.usage.getProjectUsage(projectId, dateRange.from, dateRange.to, source)
      set((state) => {
        state.projectUsage = data
        state.isLoadingProject = false
      })
    },
  }))
)

import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { apiClient } from "@/lib/api-client"
import type { DailyMetric, LogEntry, MetricSummary } from "@/types/monitoring"
import type { RunSource } from "@agent-studio/shared"

interface MonitoringState {
  summary: MetricSummary | null
  dailyMetrics: DailyMetric[]
  logs: LogEntry[]
  isLoading: boolean
  source: RunSource
  setSource: (source: RunSource) => Promise<void>
  loadAll: () => Promise<void>
  loadLogs: (options?: { workflowId?: string; status?: string; limit?: number }) => Promise<void>
}

export const useMonitoringStore = create<MonitoringState>()(
  immer((set, get) => ({
    summary: null,
    dailyMetrics: [],
    logs: [],
    isLoading: false,
    source: 'all',

    setSource: async (source) => {
      set((s) => { s.source = source })
      await get().loadAll()
    },

    loadAll: async () => {
      set((s) => { s.isLoading = true })
      const source = get().source
      try {
        const [summary, dailyMetrics, logs] = await Promise.all([
          apiClient.monitoring.getSummary(source),
          apiClient.monitoring.getDailyMetrics(source),
          apiClient.monitoring.getLogs({ limit: 50, source }),
        ])
        set((s) => {
          s.summary = summary
          s.dailyMetrics = dailyMetrics
          s.logs = logs
          s.isLoading = false
        })
      } catch {
        set((s) => { s.isLoading = false })
      }
    },

    loadLogs: async (options) => {
      const source = get().source
      try {
        const logs = await apiClient.monitoring.getLogs({ ...options, source })
        set((s) => { s.logs = logs })
      } catch {
        // 로그만 실패한 경우 기존 데이터 유지
      }
    },
  })),
)

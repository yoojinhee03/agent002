"use client"

import { useEffect } from "react"
import { useUsageStore } from "@/stores/use-usage-store"
import { PeriodFilter } from "@/components/usage/period-filter"
import { UsageSummaryCards } from "@/components/usage/usage-summary-cards"
import { UsageDailyCharts } from "@/components/usage/usage-daily-charts"
import { InsightCards } from "@/components/usage/insight-cards"
import { AgentCards } from "@/components/usage/agent-cards"
import { ProviderBreakdown } from "@/components/usage/provider-breakdown"
import { EnvironmentDistributionChart } from "@/components/usage/environment-distribution"
import { SourceToggle } from "@/components/shared/source-toggle"
import { BarChart3, Loader2 } from "lucide-react"

export default function GlobalUsagePage() {
  const { globalUsage, isLoadingGlobal, loadGlobalUsage, period, dateRange, source, setSource } = useUsageStore()

  useEffect(() => {
    loadGlobalUsage()
  }, [loadGlobalUsage, period, dateRange, source])

  const periodLabel = period === "custom" ? "" : period.replace("d", "일")

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Usage</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceToggle value={source} onChange={setSource} disabled={isLoadingGlobal} />
          <PeriodFilter />
        </div>
      </div>

      {isLoadingGlobal || !globalUsage ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-fg-subtle)]" />
        </div>
      ) : (
        <div className="space-y-6">
          <UsageSummaryCards summary={globalUsage.summary} />
          <UsageDailyCharts data={globalUsage.dailyMetrics} periodLabel={periodLabel} />
          <InsightCards insights={globalUsage.insights} />
          <AgentCards data={globalUsage.agentCards} />
          <ProviderBreakdown data={globalUsage.providerBreakdown} />
          <EnvironmentDistributionChart data={globalUsage.environmentDistribution} />
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect } from "react"
import { Activity, Coins, Cpu, Clock, AlertTriangle, Loader2 } from "lucide-react"
import { useMonitoringStore } from "@/stores/use-monitoring-store"
import { SummaryCard } from "@/components/dashboard/summary-card"
import { UsageChart } from "@/components/dashboard/usage-chart"
import { ExecutionLogTable } from "@/components/usage/execution-log-table"
import { SourceToggle } from "@/components/shared/source-toggle"

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatCost(c: number): string {
  return `$${c.toFixed(4)}`
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function MonitoringPage() {
  const { summary, dailyMetrics, logs, isLoading, loadAll, source, setSource } = useMonitoringStore()

  useEffect(() => {
    loadAll()
  }, [loadAll])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2">
            <Activity className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">모니터링</h1>
            <p className="text-xs text-[var(--color-fg-subtle)]">최근 30일 전체 시스템 운영 현황</p>
          </div>
        </div>
        <SourceToggle value={source} onChange={setSource} disabled={isLoading} />
      </div>

      {isLoading && !summary ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-fg-subtle)]" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard
              label="총 호출"
              value={formatNumber(summary?.totalCalls ?? 0)}
              subtitle={summary?.period}
              icon={Activity}
              color="text-blue-400"
              bgColor="bg-blue-500/10"
            />
            <SummaryCard
              label="총 토큰"
              value={formatNumber(summary?.totalTokens ?? 0)}
              subtitle={summary?.period}
              icon={Cpu}
              color="text-violet-400"
              bgColor="bg-violet-500/10"
            />
            <SummaryCard
              label="총 비용"
              value={formatCost(summary?.totalCost ?? 0)}
              subtitle={summary?.period}
              icon={Coins}
              color="text-amber-400"
              bgColor="bg-amber-500/10"
            />
            <SummaryCard
              label="평균 지연시간"
              value={formatLatency(summary?.avgLatency ?? 0)}
              subtitle={summary?.period}
              icon={Clock}
              color="text-emerald-400"
              bgColor="bg-emerald-500/10"
            />
            <SummaryCard
              label="에러율"
              value={`${(summary?.errorRate ?? 0).toFixed(2)}%`}
              subtitle={summary?.period}
              icon={AlertTriangle}
              color="text-red-400"
              bgColor="bg-red-500/10"
            />
          </div>

          <UsageChart data={dailyMetrics} title="일별 호출량 (30일)" />

          <ExecutionLogTable logs={logs} loading={isLoading} />
        </div>
      )}
    </div>
  )
}

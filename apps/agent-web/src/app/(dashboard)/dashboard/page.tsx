"use client"

import { useEffect, useMemo } from "react"
import {
  LayoutDashboard,
  Bot,
  Zap,
  Coins,
  Key,
  Users,
} from "lucide-react"
import { useDashboardStore } from "@/stores/use-dashboard-store"
import { useUserStore } from "@/stores/use-user-store"
import { SummaryCard } from "@/components/dashboard/summary-card"
import { UsageChart } from "@/components/dashboard/usage-chart"
import { TokenCostChart } from "@/components/dashboard/token-cost-chart"
import { AgentStatusTable } from "@/components/dashboard/agent-status-table"
import { TopAgentsChart } from "@/components/dashboard/top-agents-chart"
import { SourceToggle } from "@/components/shared/source-toggle"

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export default function DashboardPage() {
  const { overview, isLoading, loadDashboard, source, setSource } = useDashboardStore()
  const activeProjectId = useUserStore((s) => s.activeProjectId)

  useEffect(() => {
    if (activeProjectId) {
      loadDashboard(activeProjectId)
    }
  }, [loadDashboard, activeProjectId])

  const summaryData = useMemo(() => {
    if (!overview) return null

    const agents = overview.agents ?? []
    const apiKeys = overview.apiKeys ?? []
    const members = overview.members ?? []

    const totalAgents = agents.length
    const enabledAgents = agents.filter((a) => a.enabled).length
    const disabledAgents = totalAgents - enabledAgents

    const activeApiKeys = apiKeys.filter((k) => k.status === "active" && k.enabled).length

    const activeMembers = members.filter((m) => m.status === "active").length

    return {
      totalAgents,
      enabledAgents,
      disabledAgents,
      totalCalls: overview.metricSummary?.totalCalls ?? 0,
      totalCost: overview.metricSummary?.totalCost ?? 0,
      activeApiKeys,
      activeMembers,
    }
  }, [overview])

  const headerRow = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-[#3b82f6]" />
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
      </div>
      <SourceToggle
        value={source}
        disabled={isLoading || !activeProjectId}
        onChange={(next) => {
          if (activeProjectId) setSource(next, activeProjectId)
        }}
      />
    </div>
  )

  if (isLoading || !overview || !summaryData) {
    return (
      <div className="p-4 md:p-6">
        {headerRow}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[110px] animate-pulse rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      {headerRow}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          label="Total Agents"
          value={summaryData.totalAgents}
          subtitle={`Enabled ${summaryData.enabledAgents} · Disabled ${summaryData.disabledAgents}`}
          icon={Bot}
          color="text-blue-400"
          bgColor="bg-blue-400/10"
        />
        <SummaryCard
          label="API Calls (30d)"
          value={formatCompact(summaryData.totalCalls)}
          icon={Zap}
          color="text-purple-400"
          bgColor="bg-purple-400/10"
        />
        <SummaryCard
          label="Total Cost (30d)"
          value={`$${summaryData.totalCost.toFixed(2)}`}
          icon={Coins}
          color="text-yellow-400"
          bgColor="bg-yellow-400/10"
        />
        <SummaryCard
          label="Active API Keys"
          value={summaryData.activeApiKeys}
          icon={Key}
          color="text-orange-400"
          bgColor="bg-orange-400/10"
        />
        <SummaryCard
          label="Team Members"
          value={summaryData.activeMembers}
          icon={Users}
          color="text-cyan-400"
          bgColor="bg-cyan-400/10"
        />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <UsageChart data={overview.dailyMetrics ?? []} />
        <TokenCostChart data={overview.dailyMetrics ?? []} />
      </div>

      {/* Agent Status Table */}
      <div className="mb-6">
        <AgentStatusTable
          agents={overview.agents ?? []}
          runs={overview.recentRuns ?? []}
        />
      </div>

      {/* Bottom Row: Top Agents */}
      <div className="grid grid-cols-1 gap-4">
        <TopAgentsChart
          agents={overview.agents ?? []}
          runs={overview.recentRuns ?? []}
        />
      </div>
    </div>
  )
}

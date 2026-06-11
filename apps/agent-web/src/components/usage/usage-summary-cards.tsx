"use client"

import { SummaryCard } from "@/components/dashboard/summary-card"
import { Phone, DollarSign, Clock, AlertTriangle } from "lucide-react"
import type { MetricSummary } from "@/types/monitoring"

interface UsageSummaryCardsProps {
  summary: MetricSummary
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

export function UsageSummaryCards({ summary }: UsageSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <SummaryCard
        label="총 호출"
        value={formatNumber(summary.totalCalls)}
        icon={Phone}
        color="text-blue-400"
        bgColor="bg-blue-500/10"
      />
      <SummaryCard
        label="총 비용"
        value={`$${summary.totalCost.toFixed(2)}`}
        icon={DollarSign}
        color="text-amber-400"
        bgColor="bg-amber-500/10"
      />
      <SummaryCard
        label="평균 레이턴시"
        value={`${summary.avgLatency.toLocaleString()}ms`}
        icon={Clock}
        color="text-purple-400"
        bgColor="bg-purple-500/10"
      />
      <SummaryCard
        label="에러율"
        value={`${summary.errorRate}%`}
        icon={AlertTriangle}
        color="text-red-400"
        bgColor="bg-red-500/10"
      />
    </div>
  )
}

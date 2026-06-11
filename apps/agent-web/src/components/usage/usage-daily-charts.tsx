"use client"

import { UsageChart } from "@/components/dashboard/usage-chart"
import type { DailyMetric } from "@/types/monitoring"

interface UsageDailyChartsProps {
  data: DailyMetric[]
  periodLabel?: string
}

export function UsageDailyCharts({ data, periodLabel }: UsageDailyChartsProps) {
  const suffix = periodLabel ? ` (${periodLabel})` : ""
  return <UsageChart data={data} title={`API Calls${suffix}`} />
}

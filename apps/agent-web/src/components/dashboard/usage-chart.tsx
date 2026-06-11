"use client"

import { useEffect, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { DailyMetric } from "@/types/monitoring"

interface UsageChartProps {
  data: DailyMetric[]
  title?: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function UsageChart({ data, title = "API Calls (30일)" }: UsageChartProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="card">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="h-[220px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-subtle)]">
            데이터 없음 (0건)
          </div>
        ) : mounted ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="callsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="var(--color-fg-subtle)"
              fontSize={11}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tickFormatter={formatNumber}
              stroke="var(--color-fg-subtle)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={45}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [Number(value).toLocaleString(), "Calls"]}
            />
            <Area
              type="monotone"
              dataKey="calls"
              stroke="#3b82f6"
              fill="url(#callsGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  )
}

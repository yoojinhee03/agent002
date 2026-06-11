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

interface TokenCostChartProps {
  data: DailyMetric[]
  title?: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function TokenCostChart({ data, title = "Tokens & Cost (30일)" }: TokenCostChartProps) {
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
              <linearGradient id="tokensGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
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
              yAxisId="tokens"
              tickFormatter={formatTokens}
              stroke="var(--color-fg-subtle)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <YAxis
              yAxisId="cost"
              orientation="right"
              tickFormatter={(v: number) => `$${v.toFixed(1)}`}
              stroke="var(--color-fg-subtle)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value, name) => {
                const v = Number(value)
                if (name === "tokens") return [formatTokens(v), "Tokens"]
                return [`$${v.toFixed(2)}`, "Cost"]
              }}
            />
            <Area
              yAxisId="tokens"
              type="monotone"
              dataKey="tokens"
              stroke="#10b981"
              fill="url(#tokensGradient)"
              strokeWidth={2}
            />
            <Area
              yAxisId="cost"
              type="monotone"
              dataKey="cost"
              stroke="#f59e0b"
              fill="url(#costGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
        ) : null}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Tokens
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          Cost ($)
        </span>
      </div>
    </div>
  )
}

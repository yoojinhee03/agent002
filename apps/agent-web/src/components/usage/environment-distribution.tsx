"use client"

import type { EnvironmentDistribution } from "@/types/usage"

const envColors: Record<string, string> = {
  prod: "#10b981",
  staging: "#f59e0b",
  dev: "#3b82f6",
}

const envLabels: Record<string, string> = {
  prod: "Production",
  staging: "Staging",
  dev: "Development",
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

interface EnvironmentDistributionChartProps {
  data: EnvironmentDistribution[]
}

export function EnvironmentDistributionChart({ data }: EnvironmentDistributionChartProps) {
  if (data.length === 0) return null

  const total = data.reduce((s, d) => s + d.calls, 0) || 1

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Environment Distribution</h3>

      {/* Stacked bar */}
      <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-[var(--color-bg)]">
        {data.map((d) => (
          <div
            key={d.environment}
            style={{
              width: `${(d.calls / total) * 100}%`,
              backgroundColor: envColors[d.environment] ?? "var(--color-fg-subtle)",
            }}
            className="transition-all"
          />
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {data.map((d) => (
          <div
            key={d.environment}
            className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-3"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: envColors[d.environment] ?? "var(--color-fg-subtle)" }}
              />
              <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                {envLabels[d.environment] ?? d.environment}
              </span>
            </div>
            <p className="text-sm font-bold text-foreground">{d.percentage}%</p>
            <div className="mt-1 flex gap-3 text-xs text-[var(--color-fg-subtle)]">
              <span>{formatNumber(d.calls)} calls</span>
              <span>${d.cost.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

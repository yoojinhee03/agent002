"use client"

import type { ProviderBreakdownRow } from "@/types/usage"

interface ProviderBreakdownProps {
  data: ProviderBreakdownRow[]
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

const PROVIDER_BAR_COLOR: Record<string, string> = {
  openai: "bg-emerald-500",
  anthropic: "bg-amber-500",
  google: "bg-blue-500",
  azure: "bg-cyan-500",
}

function providerColor(slug: string | null) {
  if (slug && PROVIDER_BAR_COLOR[slug]) return PROVIDER_BAR_COLOR[slug]
  return "bg-violet-500"
}

export function ProviderBreakdown({ data }: ProviderBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Provider · Model 비용 분해</h3>
        <p className="py-6 text-center text-sm text-muted-foreground">아직 모델 비용 데이터가 없습니다</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Provider · Model 비용 분해</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border-strong)] text-left text-xs text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Provider</th>
              <th className="pb-3 pr-4 font-medium">Model</th>
              <th className="pb-3 pr-4 text-right font-medium">Calls</th>
              <th className="pb-3 pr-4 text-right font-medium">Tokens</th>
              <th className="pb-3 pr-4 text-right font-medium">Cost</th>
              <th className="pb-3 font-medium">% of Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.modelId} className="border-b border-[var(--color-border-strong)]/50 last:border-0">
                <td className="py-3 pr-4 text-foreground">{row.providerName}</td>
                <td className="py-3 pr-4 font-medium text-foreground">{row.modelName}</td>
                <td className="py-3 pr-4 text-right font-mono text-foreground">{formatNumber(row.calls)}</td>
                <td className="py-3 pr-4 text-right font-mono text-foreground">{formatNumber(row.totalTokens)}</td>
                <td className="py-3 pr-4 text-right font-mono text-foreground">${row.cost.toFixed(4)}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded bg-[var(--color-border-strong)]">
                      <div
                        className={`h-full ${providerColor(row.providerSlug)}`}
                        style={{ width: `${Math.min(row.costPercentage, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{row.costPercentage.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts"
import type { AgentCardData } from "@/types/usage"

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

interface AgentCardsProps {
  data: AgentCardData[]
}

export function AgentCards({ data }: AgentCardsProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Agents</h3>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No agents yet</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((agent) => {
            const sparkData = agent.sparkline.map((v, i) => ({ i, v }))

            return (
              <div
                key={agent.agentId}
                onClick={() => router.push(`/agents/${agent.agentId}`)}
                className="cursor-pointer rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-4 transition-colors hover:border-border-strong hover:bg-bg"
              >
                <p className="mb-2 text-sm font-semibold text-foreground">{agent.agentName}</p>

                <div className="mb-3 h-[48px]">
                  {mounted && <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <AreaChart data={sparkData}>
                      <defs>
                        <linearGradient id={`spark-${agent.agentId}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="#3b82f6"
                        fill={`url(#spark-${agent.agentId})`}
                        strokeWidth={1.5}
                      />
                    </AreaChart>
                  </ResponsiveContainer>}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[var(--color-fg-subtle)]">Calls</span>
                    <p className="font-bold text-foreground">{formatNumber(agent.calls)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-fg-subtle)]">Cost</span>
                    <p className="font-bold text-foreground">${agent.cost.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-fg-subtle)]">Latency</span>
                    <p className="font-bold text-foreground">{agent.avgLatency}ms</p>
                  </div>
                  <div>
                    <span className="text-[var(--color-fg-subtle)]">Error Rate</span>
                    <p className="font-bold text-foreground">{agent.errorRate}%</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

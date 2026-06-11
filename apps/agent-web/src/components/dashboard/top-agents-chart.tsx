"use client"

import { useEffect, useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { Agent, WorkflowRun } from "@agent-studio/shared"

interface TopAgentsChartProps {
  agents: Agent[]
  runs: WorkflowRun[]
}

export function TopAgentsChart({ agents, runs }: TopAgentsChartProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const agentNameById = new Map(agents.map((a) => [a.id, a.name]))

  const grouped = new Map<string, { name: string; calls: number; cost: number }>()
  for (const run of runs) {
    const agentId = (run as { agentId?: string }).agentId
    if (!agentId) continue
    const name = agentNameById.get(agentId) ?? agentId.slice(0, 8)
    const entry = grouped.get(agentId) ?? { name, calls: 0, cost: 0 }
    entry.calls++
    entry.cost += Number(run.totalCost ?? 0)
    grouped.set(agentId, entry)
  }

  const data = [...grouped.values()]
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5)

  if (data.length === 0) {
    return (
      <div className="card">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Top Agents by Usage</h3>
        <p className="py-8 text-center text-sm text-muted-foreground">No usage data yet</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Top Agents by Usage</h3>
      <div className="h-[200px]">
        {mounted && <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
            <XAxis type="number" stroke="var(--color-fg-subtle)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              stroke="var(--color-fg-subtle)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface-3)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value) => [Number(value), "Calls"]}
            />
            <Bar dataKey="calls" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>}
      </div>
    </div>
  )
}

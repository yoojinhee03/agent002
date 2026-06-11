import type { Agent, WorkflowRun } from "@agent-studio/shared"

interface AgentStatusTableProps {
  agents: Agent[]
  runs: WorkflowRun[]
}

export function AgentStatusTable({ agents, runs }: AgentStatusTableProps) {
  const statsByAgent = new Map<string, { calls: number; cost: number }>()
  for (const run of runs) {
    const agentId = (run as { agentId?: string }).agentId
    if (!agentId) continue
    const entry = statsByAgent.get(agentId) ?? { calls: 0, cost: 0 }
    entry.calls++
    entry.cost += Number(run.totalCost ?? 0)
    statsByAgent.set(agentId, entry)
  }

  return (
    <div className="card">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Agent Status</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Agent</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 text-right font-medium">Calls</th>
              <th className="pb-3 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const stats = statsByAgent.get(agent.id) ?? { calls: 0, cost: 0 }
              return (
                <tr key={agent.id} className="border-b border-[var(--color-border-subtle)] last:border-0">
                  <td className="py-3 pr-4 font-medium text-foreground">{agent.name}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        agent.enabled
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-zinc-500/10 text-zinc-400"
                      }`}
                    >
                      {agent.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono text-foreground">{stats.calls.toLocaleString()}</td>
                  <td className="py-3 text-right font-mono text-foreground">${stats.cost.toFixed(3)}</td>
                </tr>
              )
            })}
            {agents.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">
                  No agents yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

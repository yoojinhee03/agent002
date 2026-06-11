"use client"

import { cn } from "@/lib/utils"
import type { LogEntry } from "@/types/monitoring"

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

interface ExecutionLogTableProps {
  logs: LogEntry[]
  loading?: boolean
}

export function ExecutionLogTable({ logs, loading }: ExecutionLogTableProps) {
  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border-strong)] px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Execution Logs</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border-strong)] text-left text-[var(--color-fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-4 py-2.5 font-medium">Prompt</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Model</th>
              <th className="hidden px-4 py-2.5 font-medium text-right sm:table-cell">Input</th>
              <th className="hidden px-4 py-2.5 font-medium text-right sm:table-cell">Output</th>
              <th className="hidden px-4 py-2.5 font-medium text-right md:table-cell">Latency</th>
              <th className="hidden px-4 py-2.5 font-medium text-right md:table-cell">Cost</th>
              <th className="px-4 py-2.5 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                  로딩 중...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                  실행 기록이 없습니다.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-[var(--color-border-strong)]/50 transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <td className="px-4 py-2.5 text-[var(--color-fg-muted)]">{formatDate(log.createdAt)}</td>
                  <td className="max-w-[140px] truncate px-4 py-2.5 text-[var(--color-fg)]">
                    {log.promptName}
                  </td>
                  <td className="hidden px-4 py-2.5 text-[var(--color-fg-muted)] sm:table-cell">{log.model}</td>
                  <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-muted)] sm:table-cell">
                    {log.inputTokens.toLocaleString()}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-muted)] sm:table-cell">
                    {log.outputTokens.toLocaleString()}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-muted)] md:table-cell">{log.latency}ms</td>
                  <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-muted)] md:table-cell">
                    ${log.cost.toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={cn(
                        "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                        log.status === "success"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      )}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

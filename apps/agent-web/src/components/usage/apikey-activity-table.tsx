"use client"

import React, { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ApiKeyActivity } from "@/types/usage"

const envColors: Record<string, { bg: string; text: string }> = {
  prod: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  staging: { bg: "bg-amber-500/15", text: "text-amber-400" },
  dev: { bg: "bg-blue-500/15", text: "text-blue-400" },
  "*": { bg: "bg-purple-500/15", text: "text-purple-400" },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  revoked: { bg: "bg-red-500/10", text: "text-red-400" },
  expired: { bg: "bg-[var(--color-border-strong)]", text: "text-[var(--color-fg-subtle)]" },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

interface ApiKeyActivityTableProps {
  data: ApiKeyActivity[]
}

export function ApiKeyActivityTable({ data }: ApiKeyActivityTableProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border-strong)] px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">API Key Activity</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-border-strong)] text-left text-[var(--color-fg-subtle)]">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Key</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Env</th>
              <th className="px-4 py-2.5 text-right font-medium">Calls</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Cost</th>
              <th className="hidden px-4 py-2.5 text-right font-medium md:table-cell">Last Used</th>
              <th className="px-4 py-2.5 text-center font-medium">Status</th>
              <th className="hidden px-4 py-2.5 text-center font-medium sm:table-cell">Endpoints</th>
            </tr>
          </thead>
          <tbody>
            {data.map((ak) => {
              const env = envColors[ak.environment] ?? envColors.dev
              const status = statusColors[ak.status] ?? statusColors.expired
              const isExpanded = expandedKey === ak.apiKeyId

              return (
                <React.Fragment key={ak.apiKeyId}>
                  <tr
                    className="border-b border-[var(--color-border-strong)]/50 transition-colors hover:bg-[var(--color-surface-2)]"
                  >
                    <td className="px-4 py-2.5 text-[var(--color-fg)]">{ak.apiKeyName}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-[var(--color-fg-subtle)] sm:table-cell">{ak.keyMasked}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", env.bg, env.text)}>
                        {ak.environment === "*" ? "all" : ak.environment}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[var(--color-fg-muted)]">{ak.calls.toLocaleString()}</td>
                    <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-muted)] md:table-cell">${ak.cost.toFixed(2)}</td>
                    <td className="hidden px-4 py-2.5 text-right text-[var(--color-fg-subtle)] md:table-cell">
                      {ak.lastUsedAt ? formatDate(ak.lastUsedAt) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", status.bg, status.text)}>
                        {ak.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-2.5 text-center sm:table-cell">
                      {ak.accessedEndpointPaths.length > 0 ? (
                        <button
                          onClick={() => setExpandedKey(isExpanded ? null : ak.apiKeyId)}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-border-strong)]"
                        >
                          {ak.accessedEndpointPaths.length}
                          {isExpanded
                            ? <ChevronDown className="h-3 w-3" />
                            : <ChevronRight className="h-3 w-3" />
                          }
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--color-fg-subtle)]">—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="bg-[var(--color-bg)] px-8 py-2">
                        <div className="space-y-1">
                          {ak.accessedEndpointPaths.map((path) => (
                            <code key={path} className="block text-xs text-[var(--color-fg-subtle)]">
                              {path}
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[var(--color-fg-subtle)]">
                  API 키가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

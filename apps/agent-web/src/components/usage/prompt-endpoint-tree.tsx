"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PromptWithEndpoints } from "@/types/usage"

const envColors: Record<string, { bg: string; text: string }> = {
  prod: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  staging: { bg: "bg-amber-500/15", text: "text-amber-400" },
  dev: { bg: "bg-blue-500/15", text: "text-blue-400" },
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  paused: { bg: "bg-amber-500/15", text: "text-amber-400" },
  inactive: { bg: "bg-[var(--color-border-strong)]", text: "text-[var(--color-fg-subtle)]" },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

interface PromptEndpointTreeProps {
  data: PromptWithEndpoints[]
}

export function PromptEndpointTree({ data }: PromptEndpointTreeProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    data.slice(0, 3).forEach((p) => { init[p.promptId] = true })
    return init
  })

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Prompts & Endpoints</h3>
      <div className="space-y-2">
        {data.map((prompt) => {
          const isOpen = expanded[prompt.promptId] ?? false

          return (
            <div
              key={prompt.promptId}
              className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] overflow-hidden"
            >
              {/* Prompt header */}
              <button
                onClick={() => toggle(prompt.promptId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg"
              >
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
                  : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
                }
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{prompt.promptName}</span>
                    {prompt.endpoints.length > 0 && (
                      <span className="rounded bg-[var(--color-border-strong)] px-1.5 py-0.5 text-xs text-[var(--color-fg-muted)]">
                        {prompt.endpoints.length} endpoints
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[var(--color-fg-subtle)]">
                    <span>{formatNumber(prompt.calls)} calls</span>
                    <span>${prompt.cost.toFixed(2)}</span>
                    <span>{prompt.avgLatency}ms</span>
                    <span className={prompt.errorRate > 2 ? "text-amber-400" : ""}>
                      {prompt.errorRate}% error
                    </span>
                  </div>
                </div>
              </button>

              {/* Endpoints */}
              {isOpen && prompt.endpoints.length > 0 && (
                <div className="border-t border-[var(--color-border-strong)]/50">
                  {prompt.endpoints.map((ep, i) => {
                    const env = envColors[ep.environment] ?? envColors.dev
                    const status = statusColors[ep.status] ?? statusColors.inactive

                    return (
                      <div
                        key={ep.endpointId}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 pl-10",
                          i < prompt.endpoints.length - 1 && "border-b border-[var(--color-border-strong)]/30"
                        )}
                      >
                        <div className="h-3 w-px bg-[var(--color-border-strong)]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="max-w-full truncate text-xs text-[var(--color-fg-muted)] sm:max-w-[280px]">
                              {ep.endpointPath}
                            </code>
                            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", env.bg, env.text)}>
                              {ep.environment}
                            </span>
                            <span className="text-xs text-[var(--color-fg-subtle)]">{ep.modelName}</span>
                            <span className={cn("rounded px-1.5 py-0.5 text-xs", status.bg, status.text)}>
                              {ep.status}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-[var(--color-fg-subtle)]">
                            <span>{formatNumber(ep.calls)} calls</span>
                            <span>${ep.cost.toFixed(2)}</span>
                            <span>{ep.avgLatency}ms</span>
                            <span className={ep.errorRate > 2 ? "text-amber-400" : ""}>
                              {ep.errorRate}% error
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {isOpen && prompt.endpoints.length === 0 && (
                <div className="border-t border-[var(--color-border-strong)]/50 px-4 py-3 pl-10 text-xs italic text-[var(--color-fg-subtle)]">
                  배포된 엔드포인트가 없습니다
                </div>
              )}
            </div>
          )
        })}

        {data.length === 0 && (
          <div className="py-6 text-center text-xs text-[var(--color-fg-subtle)]">프롬프트가 없습니다</div>
        )}
      </div>
    </div>
  )
}

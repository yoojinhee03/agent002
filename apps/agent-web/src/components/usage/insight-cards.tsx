"use client"

import {
  DollarSign,
  Zap,
  AlertTriangle,
  TrendingUp,
  Activity,
  Key,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { UsageInsight } from "@/types/usage"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  DollarSign,
  Zap,
  AlertTriangle,
  TrendingUp,
  Activity,
  Key,
}

const severityStyles: Record<string, { border: string; bg: string; icon: string }> = {
  info: { border: "border-blue-500/30", bg: "bg-blue-500/5", icon: "text-blue-400" },
  warning: { border: "border-amber-500/30", bg: "bg-amber-500/5", icon: "text-amber-400" },
  success: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", icon: "text-emerald-400" },
  critical: { border: "border-red-500/30", bg: "bg-red-500/5", icon: "text-red-400" },
}

interface InsightCardsProps {
  insights: UsageInsight[]
}

export function InsightCards({ insights }: InsightCardsProps) {
  if (insights.length === 0) return null

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {insights.map((insight) => {
        const style = severityStyles[insight.severity] ?? severityStyles.info
        const Icon = iconMap[insight.icon] ?? Activity

        return (
          <div
            key={insight.id}
            className={cn(
              "flex min-w-[200px] shrink-0 items-start gap-3 rounded-lg border p-3 sm:min-w-[240px]",
              style.border,
              style.bg
            )}
          >
            <div className={cn("mt-0.5 rounded-md p-1.5", style.bg)}>
              <Icon className={cn("h-3.5 w-3.5", style.icon)} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-foreground">{insight.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-fg-muted)]">{insight.description}</p>
              {insight.metric && (
                <p className="mt-1 text-xs font-bold text-foreground">{insight.metric}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

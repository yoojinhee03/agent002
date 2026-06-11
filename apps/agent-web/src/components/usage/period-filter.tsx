"use client"

import { useState } from "react"
import { useUsageStore } from "@/stores/use-usage-store"
import type { UsagePeriod } from "@/types/usage"
import { cn } from "@/lib/utils"

const PRESETS: { label: string; value: UsagePeriod }[] = [
  { label: "7일", value: "7d" },
  { label: "14일", value: "14d" },
  { label: "30일", value: "30d" },
  { label: "90일", value: "90d" },
]

export function PeriodFilter() {
  const { period, dateRange, setPeriod, setDateRange } = useUsageStore()
  const [showCustom, setShowCustom] = useState(period === "custom")

  return (
    <div className="flex items-center gap-2">
      {PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => {
            setPeriod(p.value)
            setShowCustom(false)
          }}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            period === p.value
              ? "bg-blue-500/20 text-blue-400"
              : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          )}
        >
          {p.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={cn(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
          period === "custom"
            ? "bg-blue-500/20 text-blue-400"
            : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        )}
      >
        Custom
      </button>

      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-fg)]"
          />
          <span className="text-xs text-[var(--color-fg-subtle)]">~</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-fg)]"
          />
        </div>
      )}
    </div>
  )
}

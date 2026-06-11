"use client"

import { cn } from "@/lib/utils"
import { RUN_SOURCE_LABEL, RUN_SOURCES, type RunSource } from "@agent-studio/shared"

interface SourceToggleProps {
  value: RunSource
  onChange: (next: RunSource) => void
  className?: string
  disabled?: boolean
}

export function SourceToggle({ value, onChange, className, disabled }: SourceToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="Traffic source"
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-0.5",
        className,
      )}
    >
      {RUN_SOURCES.map((src) => {
        const active = src === value
        return (
          <button
            key={src}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !active && onChange(src)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-[5px] transition-colors",
              active
                ? "bg-[#3b82f6] text-white"
                : "text-[var(--color-fg-muted)] hover:text-white hover:bg-[#22252f]",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {RUN_SOURCE_LABEL[src]}
          </button>
        )
      })}
    </div>
  )
}

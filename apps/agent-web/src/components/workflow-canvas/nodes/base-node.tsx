'use client'

import { Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'

interface BaseNodeProps {
  selected?: boolean
  hasInput?: boolean
  hasOutput?: boolean
  color: string          // tailwind border color class
  icon: React.ReactNode
  label: string
  children?: React.ReactNode
  badge?: string
}

export function BaseNode({ selected, hasInput = true, hasOutput = true, color, icon, label, children, badge }: BaseNodeProps) {
  return (
    <div
      className={cn(
        'min-w-[180px] rounded-lg border-2 bg-[var(--color-surface)] shadow-sm transition-shadow',
        color,
        selected && 'shadow-md ring-2 ring-offset-1 ring-primary/50',
      )}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !bg-background !border-muted-foreground"
        />
      )}

      {/* Header */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-md', color.replace('border-', 'bg-').replace('-500', '-50'))}>
        <span className="text-lg">{icon}</span>
        <span className="text-xs font-semibold text-foreground truncate flex-1">{label}</span>
        {badge && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {badge}
          </span>
        )}
      </div>

      {/* Body */}
      {children && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          {children}
        </div>
      )}

      {hasOutput && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !bg-background !border-muted-foreground"
        />
      )}
    </div>
  )
}

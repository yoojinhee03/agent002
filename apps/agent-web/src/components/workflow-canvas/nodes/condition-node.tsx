'use client'

import { NodeProps, Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'

export function ConditionNode({ data, selected }: NodeProps) {
  const config = (data.config as Record<string, string>) ?? {}
  return (
    <div className={cn('min-w-[180px] rounded-lg border-2 border-amber-500 bg-card shadow-sm', selected && 'shadow-md ring-2 ring-offset-1 ring-primary/50')}>
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-2 !bg-background !border-muted-foreground" />

      <div className="flex items-center gap-2 px-3 py-2 rounded-t-md bg-amber-50">
        <span className="text-lg">🔀</span>
        <span className="text-xs font-semibold text-foreground truncate flex-1">{data.label as string}</span>
      </div>

      {config.expression && (
        <div className="px-3 py-2 text-xs text-muted-foreground">
          <p className="font-mono text-xs truncate">{config.expression}</p>
        </div>
      )}

      {/* True / False 핸들 */}
      <div className="flex justify-between px-4 pb-2 text-xs text-muted-foreground">
        <span>✓ {config.trueLabel ?? 'True'}</span>
        <span>✗ {config.falseLabel ?? 'False'}</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%' }} className="!w-3 !h-3 !border-2 !bg-background !border-green-500" />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%' }} className="!w-3 !h-3 !border-2 !bg-background !border-red-500" />
    </div>
  )
}

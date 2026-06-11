'use client'

import { NodeProps, Handle, Position } from '@xyflow/react'
import { cn } from '@/lib/utils'

export function StartNode({ selected }: NodeProps) {
  return (
    <div className={cn('w-16 h-16 rounded-full border-2 border-green-500 bg-green-50 flex items-center justify-center shadow-sm', selected && 'ring-2 ring-offset-1 ring-primary/50')}>
      <span className="text-2xl">▶</span>
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-2 !bg-background !border-muted-foreground" />
    </div>
  )
}

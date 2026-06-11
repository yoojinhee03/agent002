'use client'

import { NodeProps } from '@xyflow/react'
import { BaseNode } from './base-node'

export function ToolNode({ data, selected }: NodeProps) {
  const config = (data.config as Record<string, string>) ?? {}
  return (
    <BaseNode
      selected={selected}
      color="border-blue-500"
      icon="🔧"
      label={data.label as string}
      badge={config.toolId ? 'tool' : undefined}
    >
      {config.toolId && (
        <p className="text-xs font-mono truncate">ID: {config.toolId as string}</p>
      )}
    </BaseNode>
  )
}

'use client'

import { NodeProps } from '@xyflow/react'
import { BaseNode } from './base-node'

export function LLMNode({ data, selected }: NodeProps) {
  const config = (data.config as Record<string, string>) ?? {}
  return (
    <BaseNode
      selected={selected}
      color="border-purple-500"
      icon="🤖"
      label={data.label as string}
      badge={config.modelId ? String(config.modelId).split('/').pop() : undefined}
    >
      {config.userPrompt && (
        <p className="line-clamp-2 text-xs">{config.userPrompt as string}</p>
      )}
    </BaseNode>
  )
}

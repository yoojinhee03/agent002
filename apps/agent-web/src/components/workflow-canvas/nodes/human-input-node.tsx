'use client'

import { NodeProps } from '@xyflow/react'
import { BaseNode } from './base-node'

export function HumanInputNode({ data, selected }: NodeProps) {
  const config = (data.config as Record<string, unknown>) ?? {}
  return (
    <BaseNode selected={selected} color="border-orange-500" icon="🙋" label={data.label as string} badge="HITL">
      {!!config.prompt && <p className="line-clamp-2 text-xs">{config.prompt as string}</p>}
    </BaseNode>
  )
}

'use client'

import { NodeProps } from '@xyflow/react'
import { BaseNode } from './base-node'

export function TransformNode({ data, selected }: NodeProps) {
  return (
    <BaseNode selected={selected} color="border-teal-500" icon="⚙️" label={data.label as string} badge="JS">
      <p className="text-xs">데이터 변환</p>
    </BaseNode>
  )
}

'use client'

import { NodeProps } from '@xyflow/react'
import { BaseNode } from './base-node'

export function AgentNode({ data, selected }: NodeProps) {
  const config = (data.config as Record<string, string>) ?? {}
  return (
    <BaseNode
      selected={selected}
      color="border-indigo-500"
      icon="🤖"
      label={data.label as string}
      badge={config.agentId ? 'Agent' : config.teamId ? 'Team' : undefined}
    >
      {config.agentId || config.teamId ? (
        <p className="line-clamp-1 text-xs text-[var(--color-fg-muted)]">
          {config.agentId ? `Agent: ${config.agentId.slice(0, 8)}…` : `Team: ${config.teamId!.slice(0, 8)}…`}
        </p>
      ) : (
        <p className="text-xs text-[var(--color-fg-subtle)] italic">Select Agent…</p>
      )}
    </BaseNode>
  )
}

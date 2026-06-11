'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { AgentArchitecture } from '@agent-studio/shared'
import { useAgentGraphResources } from './agent-graph-resources'
import { NodeResourceChips } from './NodeResourceChips'

export interface MainAgentNodeData extends Record<string, unknown> {
  agentName: string
  architecture: AgentArchitecture
  modelName: string
  isSelected: boolean
  isSupervisor: boolean
  proposed?: boolean
  // Agent Assistant propose 시 운반되는 필드 — handleApplyProposed 가 agent 본체에 반영.
  // 직접 캔버스 main 노드를 편집할 때는 사용 안 함 (Agent.builtinToolIds 등이 source of truth).
  systemPrompt?: string
  builtinToolIds?: string[]
  toolIds?: string[]
  mcpServerIds?: string[]
  skillIds?: string[]
  toolPermissions?: Record<string, 'auto' | 'requires_approval' | 'restricted' | 'disabled'>
  /** 실행 중 현재 호출 중인 도구 이름 (raw). builtinDisplayNames 로 해석. parentStepId 가 없는 루트 도구 호출 시 set. */
  currentTool?: string
  /** 메인 에이전트가 실행 중인지 — sub-agent 와 동일한 시안 글로우 적용용. */
  isRunning?: boolean
}

const ARCH_LABELS: Record<AgentArchitecture, string> = {
  react: 'Deep Autonomous',
  tool_calling: 'Fast',
  plan_execute: 'Planning',
  custom_graph: 'Custom Graph',
}

const ARCH_COLORS: Record<AgentArchitecture, string> = {
  react: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  tool_calling: 'text-green-400 border-green-500/30 bg-green-500/10',
  plan_execute: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  custom_graph: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
}

function MainAgentNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as MainAgentNodeData
  const { agentName, architecture, modelName, proposed, currentTool, isRunning } = nodeData
  const isSelected = selected ?? nodeData.isSelected
  const archLabel = ARCH_LABELS[architecture] ?? architecture
  const archColor = ARCH_COLORS[architecture] ?? 'text-fg-subtle border-border bg-[var(--color-surface-2)]'

  const { modelsById, builtinDisplayNames } = useAgentGraphResources()
  const modelInfo = modelName ? modelsById[modelName] : undefined
  const modelDisplay = modelInfo?.name ?? modelName ?? ''
  const currentToolDisplay = currentTool ? (builtinDisplayNames[currentTool] ?? currentTool) : null

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border bg-bg p-3 transition-all',
        'w-[280px] min-h-[120px]',
        'border-border',
        isSelected && !proposed && 'border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.35)]',
        isRunning && !proposed && 'sub-agent-node-running',
        proposed && 'border-dashed border-amber-400/70 opacity-70',
      )}
    >
      {/* 상단: 에이전트 이름 + 뱃지 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate text-xs font-bold text-fg">{agentName}</p>
          <p className="mt-0.5 truncate text-xs text-fg-subtle">Main Agent</p>
        </div>
        <span className={cn('shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-bold', archColor)}>
          {archLabel}
        </span>
      </div>

      {/* 실행 중 도구 라벨 */}
      {isRunning && currentToolDisplay && (
        <div className="flex items-center gap-1.5 rounded-md border border-[#22D3EE]/30 bg-[#22D3EE]/5 px-1.5 py-0.5">
          <span className="text-xs leading-none text-[#22D3EE]">▸</span>
          <span className="truncate text-xs font-medium text-[#22D3EE]">{currentToolDisplay}</span>
          <span className="ml-auto h-1 w-1 shrink-0 animate-pulse rounded-full bg-[#22D3EE]" />
        </div>
      )}

      {/* 중앙: 도구/스킬 칩 그룹 */}
      <NodeResourceChips
        toolIds={nodeData.toolIds}
        builtinToolIds={nodeData.builtinToolIds}
        mcpServerIds={nodeData.mcpServerIds}
        skillIds={nodeData.skillIds}
        toolPermissions={nodeData.toolPermissions}
        expanded={Boolean(isSelected)}
      />

      {/* 하단: 모델명 */}
      <div className="mt-auto flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1">
        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-400" />
        <span className="truncate text-xs text-fg">{modelDisplay || '모델 미설정'}</span>
        {modelInfo?.providerSlug && (
          <span className="ml-auto shrink-0 text-xs text-fg-subtle">{modelInfo.providerSlug}</span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-2 !border-[#3B82F6] !bg-bg"
      />
    </div>
  )
}

export const MainAgentNode = memo(MainAgentNodeComponent)

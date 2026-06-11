'use client'

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentGraphResources } from './agent-graph-resources'
import { NodeResourceChips } from './NodeResourceChips'

export type SubAgentRole = 'search' | 'analyze' | 'generate' | 'validate' | 'tool'
export type SubAgentStatus = 'idle' | 'running' | 'done' | 'error' | 'proposed'

export interface SubAgentNodeData extends Record<string, unknown> {
  agentName: string
  role: SubAgentRole
  modelName: string
  toolNames: string[]
  status: SubAgentStatus
  onDelete: (id: string) => void
  // Agent-like fields for settings panel
  architecture?: string
  description?: string
  systemPrompt?: string
  config?: Record<string, unknown>
  guardrailsConfig?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  toolIds?: string[]
  toolGroupIds?: string[]
  mcpServerIds?: string[]
  mcpToolRefs?: Array<{ serverId: string; toolName: string }>
  builtinToolIds?: string[]
  skillIds?: string[]
  toolPermissions?: Record<string, 'auto' | 'requires_approval' | 'restricted' | 'disabled'>
  /** 실행 중 현재 호출 중인 도구 이름 (raw). builtinDisplayNames 로 사람 이름으로 해석. */
  currentTool?: string
}

// 외부(저장된 graphDefinition, 어시스턴트 제안) 데이터를 SubAgentNodeData 형태로 정규화한다.
// 과거 저장본이나 LLM 응답에 누락된 필드가 있어도 노드 렌더링이 깨지지 않도록 기본값을 채운다.
export function normalizeSubAgentData(
  raw: Record<string, unknown>,
): Omit<SubAgentNodeData, 'onDelete'> {
  const r = raw as Partial<SubAgentNodeData>
  return {
    ...r,
    agentName: r.agentName ?? '',
    role: r.role ?? 'analyze',
    modelName: r.modelName ?? '',
    toolNames: r.toolNames ?? [],
    status: r.status ?? 'idle',
    toolIds: r.toolIds ?? [],
    toolGroupIds: r.toolGroupIds ?? [],
    mcpServerIds: r.mcpServerIds ?? [],
    mcpToolRefs: r.mcpToolRefs ?? [],
    builtinToolIds: r.builtinToolIds ?? [],
    skillIds: r.skillIds ?? [],
  } as Omit<SubAgentNodeData, 'onDelete'>
}

const ROLE_ICONS: Record<SubAgentRole, string> = {
  search: '🔍',
  analyze: '📊',
  generate: '✏️',
  validate: '✓',
  tool: '⚙️',
}

const ROLE_LABELS: Record<SubAgentRole, string> = {
  search: '검색',
  analyze: '분석',
  generate: '생성',
  validate: '검증',
  tool: '도구',
}

const STATUS_DOT: Record<SubAgentStatus, string> = {
  idle: 'bg-[#5C6478]',
  running: 'bg-[#22D3EE] animate-pulse',
  done: 'bg-green-400',
  error: 'bg-red-400',
  proposed: 'bg-amber-400/70',
}

function SubAgentNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as SubAgentNodeData
  const { agentName, role, modelName, status, onDelete, currentTool } = nodeData
  const isSelected = selected
  const { modelsById, builtinDisplayNames } = useAgentGraphResources()

  const modelInfo = modelName ? modelsById[modelName] : undefined
  const modelDisplay = modelInfo?.name ?? modelName ?? ''

  const isRunning = status === 'running'
  const isProposed = status === 'proposed'
  const currentToolDisplay = currentTool ? (builtinDisplayNames[currentTool] ?? currentTool) : null

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 rounded-xl border bg-bg p-3 transition-all',
        'w-[260px] min-h-[120px]',
        // 기본 보더
        'border-border',
        // 선택(Selection) — 파랑 솔리드 보더 + 정적 그림자
        isSelected && !isProposed && 'border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.35)]',
        // 실행(Running) — 시안 펄스 글로우 (보더 색은 선택 여부에 따라 결정)
        isRunning && !isProposed && 'sub-agent-node-running',
        // Proposed — 단독 분기
        isProposed && 'border-dashed border-amber-400/70 opacity-70',
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-2 !border-[#3B82F6] !bg-bg"
      />

      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete(id)
        }}
        className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-red-500/10 hover:text-red-400"
      >
        <X className="h-3 w-3" />
      </button>

      {/* 상단: 역할 아이콘 + 이름 + status dot */}
      <div className="flex items-start gap-2 pr-5">
        <span className="shrink-0 text-base leading-none">{ROLE_ICONS[role]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-xs font-bold text-fg">{agentName}</p>
            <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
          </div>
          <p className="mt-0.5 text-xs text-fg-subtle">
            {ROLE_LABELS[role]}
          </p>
        </div>
      </div>

      {/* 실행 중 도구 라벨 — running 일 때만 노출 */}
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
        mcpToolRefs={nodeData.mcpToolRefs}
        skillIds={nodeData.skillIds}
        toolPermissions={nodeData.toolPermissions}
        expanded={Boolean(isSelected)}
      />

      {/* 하단: 모델명 */}
      <div className="mt-auto flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-0.5">
        <span className="truncate text-xs text-fg">
          {modelDisplay || '모델 미설정'}
        </span>
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

export const SubAgentNode = memo(SubAgentNodeComponent)

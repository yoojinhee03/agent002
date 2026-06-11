'use client'

import { useState } from 'react'
import { X, ChevronDown, Settings2 } from 'lucide-react'
import type { Agent, UpdateAgentRequest } from '@agent-studio/shared'
import type { EnabledModel } from '@/types/provider'
import type { Node } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { ResizeHandle } from '@/components/agents/flow/ResizeHandle'
import { BasicTab } from '@/components/agents/builder/BasicTab'
import { PromptTab } from '@/components/agents/builder/PromptTab'
import { ToolsTab } from '@/components/agents/builder/ToolsTab'
import { SkillsTab } from '@/components/agents/builder/SkillsTab'
import { OutputSchemaTab } from '@/components/agents/builder/OutputSchemaTab'
import { GuardrailsTab } from '@/components/agents/builder/GuardrailsTab'
import type { SubAgentNodeData } from './SubAgentNode'

type SettingsTab = 'basic' | 'prompt' | 'tools' | 'skills' | 'model' | 'io' | 'guardrails' | 'handoff'

interface AgentFlowSettingsPanelProps {
  agent: Agent
  agentId: string
  projectId: string
  nodeId: string
  nodes: Node[]
  onChange: (changes: UpdateAgentRequest) => void
  onSubAgentChange: (nodeId: string, changes: Partial<SubAgentNodeData>) => void
  onClose: () => void
  models: EnabledModel[]
  /** 좌측 가장자리 드래그로 변경되는 패널 폭 (px). 미지정 시 420 사용. */
  width?: number
  /** 좌측 핸들 드래그 시 호출 — delta < 0 일수록 마우스가 왼쪽으로 이동(패널이 커짐). */
  onResize?: (deltaPx: number) => void
}

const TAB_LIST: { id: SettingsTab; label: string; disabled?: boolean }[] = [
  { id: 'basic', label: '기본' },
  { id: 'prompt', label: '프롬프트' },
  { id: 'tools', label: '도구' },
  { id: 'skills', label: 'Skills' },
  { id: 'model', label: '모델' },
  { id: 'io', label: 'I/O' },
  { id: 'guardrails', label: '가드레일' },
  { id: 'handoff', label: 'Handoff', disabled: true },
]

function ModelTab({
  agent,
  models,
  onChange,
}: {
  agent: Agent
  models: EnabledModel[]
  onChange: (changes: UpdateAgentRequest) => void
}) {
  const temperature = (agent.config?.temperature as number | undefined) ?? 0.7
  const maxTokens = (agent.config?.maxTokens as number | undefined) ?? 4096

  return (
    <div className="space-y-6 px-6 pt-4">
      {/* 모델 선택 */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase text-fg-subtle">Brain Model</label>
        <div className="relative">
          <select
            value={agent.modelId ?? ''}
            onChange={(e) => onChange({ modelId: e.target.value })}
            className="w-full appearance-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-[#3B82F6]/50 focus:outline-none"
          >
            {models.length === 0 && (
              <option value={agent.modelId}>{agent.modelId || '모델 없음'}</option>
            )}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase text-fg-subtle">Temperature</label>
          <span className="text-xs font-bold text-[#3B82F6]">{temperature.toFixed(1)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) =>
            onChange({ config: { ...agent.config, temperature: parseFloat(e.target.value) } })
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--color-surface-2)] accent-[#3B82F6]"
        />
        <div className="flex justify-between text-xs text-fg-subtle">
          <span>정확 (0)</span>
          <span>창의 (2)</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase text-fg-subtle">Max Tokens</label>
          <span className="text-xs font-bold text-[#3B82F6]">{maxTokens.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={256}
          max={32768}
          step={256}
          value={maxTokens}
          onChange={(e) =>
            onChange({ config: { ...agent.config, maxTokens: parseInt(e.target.value) } })
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[var(--color-surface-2)] accent-[#3B82F6]"
        />
        <div className="flex justify-between text-xs text-fg-subtle">
          <span>256</span>
          <span>32,768</span>
        </div>
      </div>
    </div>
  )
}

function HandoffTab({
  agent,
  onChange,
}: {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}) {
  const handoffCondition =
    (agent.config?.handoffCondition as string | undefined) ?? ''
  const handoffTarget = (agent.config?.handoffTarget as string | undefined) ?? ''

  return (
    <div className="space-y-6 px-6 pt-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase text-fg-subtle">핸드오프 조건</label>
        <textarea
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-[#3B82F6]/50 focus:outline-none"
          placeholder="어떤 조건에서 다른 에이전트로 전환할지 설명하세요"
          defaultValue={handoffCondition}
          onBlur={(e) =>
            onChange({ config: { ...agent.config, handoffCondition: e.target.value } })
          }
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase text-fg-subtle">대상 에이전트</label>
        <div className="relative">
          <select
            value={handoffTarget}
            onChange={(e) =>
              onChange({ config: { ...agent.config, handoffTarget: e.target.value } })
            }
            className="w-full appearance-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-[#3B82F6]/50 focus:outline-none"
          >
            <option value="">에이전트를 선택하세요</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        </div>
        <p className="text-xs text-fg-subtle">
          핸드오프 대상 에이전트를 선택합니다. Sub Agent 추가 후 선택 가능합니다.
        </p>
      </div>
    </div>
  )
}

function SubAgentSettingsPanel({
  nodeId,
  nodeData,
  projectId,
  models,
  activeTab,
  onTabChange,
  onSubAgentChange,
  onClose,
  width,
  onResize,
}: {
  nodeId: string
  nodeData: SubAgentNodeData
  projectId: string
  models: EnabledModel[]
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  onSubAgentChange: (nodeId: string, changes: Partial<SubAgentNodeData>) => void
  onClose: () => void
  width?: number
  onResize?: (deltaPx: number) => void
}) {

  const syntheticAgent: Agent = {
    id: nodeId,
    name: nodeData.agentName,
    architecture: (nodeData.architecture as Agent['architecture']) ?? 'react',
    architectures: [(nodeData.architecture as Agent['architecture']) ?? 'react'],
    modelId: nodeData.modelName,
    description: nodeData.description ?? '',
    systemPrompt: nodeData.systemPrompt ?? '',
    config: nodeData.config ?? {},
    guardrailsConfig: nodeData.guardrailsConfig ?? {},
    outputSchema: nodeData.outputSchema ?? {},
    toolIds: nodeData.toolIds ?? [],
    toolGroupIds: nodeData.toolGroupIds ?? [],
    mcpServerIds: nodeData.mcpServerIds ?? [],
    mcpToolRefs: nodeData.mcpToolRefs ?? [],
    builtinToolIds: nodeData.builtinToolIds ?? [],
    skillIds: nodeData.skillIds ?? [],
    toolPermissions: nodeData.toolPermissions ?? {},
    projectId,
    type: 'single',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Agent

  const handleChange = (changes: UpdateAgentRequest) => {
    const nodeChanges: Partial<SubAgentNodeData> = {}
    if (changes.name !== undefined) nodeChanges.agentName = changes.name
    if (changes.architecture !== undefined) nodeChanges.architecture = changes.architecture
    if (changes.modelId !== undefined) nodeChanges.modelName = changes.modelId
    if (changes.description !== undefined) nodeChanges.description = changes.description
    if (changes.systemPrompt !== undefined) nodeChanges.systemPrompt = changes.systemPrompt
    if (changes.config !== undefined) nodeChanges.config = changes.config as Record<string, unknown>
    if (changes.guardrailsConfig !== undefined) nodeChanges.guardrailsConfig = changes.guardrailsConfig as Record<string, unknown>
    if (changes.outputSchema !== undefined) nodeChanges.outputSchema = changes.outputSchema as Record<string, unknown>
    if (changes.toolIds !== undefined) nodeChanges.toolIds = changes.toolIds
    if (changes.toolGroupIds !== undefined) nodeChanges.toolGroupIds = changes.toolGroupIds
    if (changes.mcpServerIds !== undefined) nodeChanges.mcpServerIds = changes.mcpServerIds
    if (changes.mcpToolRefs !== undefined) nodeChanges.mcpToolRefs = changes.mcpToolRefs
    if (changes.builtinToolIds !== undefined) nodeChanges.builtinToolIds = changes.builtinToolIds
    if (changes.skillIds !== undefined) nodeChanges.skillIds = changes.skillIds
    if (changes.toolPermissions !== undefined) {
      nodeChanges.toolPermissions = changes.toolPermissions as SubAgentNodeData['toolPermissions']
    }
    onSubAgentChange(nodeId, nodeChanges)
  }

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-bg"
      style={{ width: width ?? 420 }}
    >
      {onResize && <ResizeHandle direction="horizontal" edge="left" onResize={onResize} />}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-blue-500/40" />
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-4 w-0.5 shrink-0 rounded-full bg-blue-500/70" />
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-400">속성 편집</span>
          <span className="truncate text-sm font-semibold text-fg">{nodeData.agentName}</span>
          <span className="shrink-0 rounded-full border border-border bg-bg px-1.5 py-0.5 text-[10px] font-semibold text-fg-subtle">
            Sub
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-3 py-1.5 scrollbar-none">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.id}
            disabled={tab.disabled}
            title={tab.disabled ? '준비 중' : undefined}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1 text-xs font-bold uppercase transition-colors flex items-center gap-1.5',
              tab.disabled
                ? 'cursor-not-allowed text-fg-subtle opacity-60'
                : activeTab === tab.id
                  ? 'bg-[var(--color-surface-2)] text-[#3B82F6]'
                  : 'text-fg-subtle hover:text-fg',
            )}
          >
            {tab.label}
            {tab.disabled && (
              <span className="rounded-full border border-border bg-bg px-1 py-0.5 text-[8px] font-semibold normal-case text-fg-subtle">
                준비 중
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'basic' && <BasicTab agent={syntheticAgent} onChange={handleChange} />}
        {activeTab === 'prompt' && (
          <PromptTab agent={syntheticAgent} agentId={nodeId} onChange={handleChange} />
        )}
        {activeTab === 'tools' && (
          <ToolsTab agent={syntheticAgent} projectId={projectId} onChange={handleChange} hideTeammates />
        )}
        {activeTab === 'skills' && (
          <SkillsTab agent={syntheticAgent} onChange={handleChange} />
        )}
        {activeTab === 'model' && (
          <ModelTab agent={syntheticAgent} models={models} onChange={handleChange} />
        )}
        {activeTab === 'io' && <OutputSchemaTab agent={syntheticAgent} onChange={handleChange} />}
        {activeTab === 'guardrails' && <GuardrailsTab agent={syntheticAgent} onChange={handleChange} />}
        {activeTab === 'handoff' && <HandoffTab agent={syntheticAgent} onChange={handleChange} />}
      </div>
    </div>
  )
}

export function AgentFlowSettingsPanel({
  agent,
  agentId,
  projectId,
  nodeId,
  nodes,
  onChange,
  onSubAgentChange,
  onClose,
  models,
  width,
  onResize,
}: AgentFlowSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('basic')

  // Sub agent 노드 선택 시 전용 패널 렌더링
  if (nodeId !== 'main') {
    const node = nodes.find((n) => n.id === nodeId)
    if (node) {
      return (
        <SubAgentSettingsPanel
          key={nodeId}
          nodeId={nodeId}
          nodeData={node.data as SubAgentNodeData}
          projectId={projectId}
          models={models}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onSubAgentChange={onSubAgentChange}
          onClose={onClose}
          width={width}
          onResize={onResize}
        />
      )
    }
  }

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-l border-border bg-bg"
      style={{ width: width ?? 420 }}
    >
      {onResize && <ResizeHandle direction="horizontal" edge="left" onResize={onResize} />}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-blue-500/40" />
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-4 w-0.5 shrink-0 rounded-full bg-blue-500/70" />
          <Settings2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-blue-400">속성 편집</span>
          <span className="truncate text-sm font-semibold text-fg">{agent.name}</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-3 py-1.5 scrollbar-none">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.id}
            disabled={tab.disabled}
            title={tab.disabled ? '준비 중' : undefined}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1 text-xs font-bold uppercase transition-colors flex items-center gap-1.5',
              tab.disabled
                ? 'cursor-not-allowed text-fg-subtle opacity-60'
                : activeTab === tab.id
                  ? 'bg-[var(--color-surface-2)] text-[#3B82F6]'
                  : 'text-fg-subtle hover:text-fg',
            )}
          >
            {tab.label}
            {tab.disabled && (
              <span className="rounded-full border border-border bg-bg px-1 py-0.5 text-[8px] font-semibold normal-case text-fg-subtle">
                준비 중
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'basic' && <BasicTab agent={agent} onChange={onChange} />}
        {activeTab === 'prompt' && (
          <PromptTab agent={agent} agentId={agentId} onChange={onChange} />
        )}
        {activeTab === 'tools' && (
          <ToolsTab agent={agent} projectId={projectId} onChange={onChange} hideTeammates />
        )}
        {activeTab === 'skills' && <SkillsTab agent={agent} onChange={onChange} />}
        {activeTab === 'model' && (
          <ModelTab agent={agent} models={models} onChange={onChange} />
        )}
        {activeTab === 'io' && <OutputSchemaTab agent={agent} onChange={onChange} />}
        {activeTab === 'guardrails' && <GuardrailsTab agent={agent} onChange={onChange} />}
        {activeTab === 'handoff' && <HandoffTab agent={agent} onChange={onChange} />}
      </div>
    </div>
  )
}

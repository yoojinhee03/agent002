'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import type { CreateAgentRequest } from '@agent-studio/shared'

interface TemplateDefinition {
  id: string
  name: string
  description: string
  icon: string
  architecture: CreateAgentRequest['architecture']
  toolHints: string[]
  systemPrompt: string
  modelId: string
  config: Record<string, unknown>
}

const TEMPLATES: TemplateDefinition[] = [
  {
    id: 'qa-bot',
    name: 'Q&A Bot',
    description: '웹 검색을 활용한 질문 답변 에이전트. Tavily 등 MCP 검색 서버를 연결해 최신 정보를 조회합니다.',
    icon: '💬',
    architecture: 'react',
    toolHints: [],
    systemPrompt: 'You are a helpful Q&A assistant. Use search tools to find accurate and up-to-date information to answer user questions. Always cite your sources.',
    modelId: 'gpt-4o-mini',
    config: { maxIterations: 10 },
  },
  {
    id: 'analyst',
    name: 'Analyst',
    description: '데이터 분석 및 인사이트 도출 특화 에이전트. Plan & Execute 아키텍처로 체계적으로 분석합니다.',
    icon: '📊',
    architecture: 'plan_execute',
    toolHints: [],
    systemPrompt: 'You are a data analyst expert. Break down complex analysis tasks into structured steps. Provide clear insights, identify patterns, and present findings with supporting evidence.',
    modelId: 'gpt-4o',
    config: { planningDepth: 3, maxIterations: 15 },
  },
  {
    id: 'coder',
    name: 'Coder',
    description: '코드 작성 및 디버깅 에이전트. Python REPL 도구로 코드를 실행하고 검증합니다.',
    icon: '💻',
    architecture: 'tool_calling',
    toolHints: ['python_repl'],
    systemPrompt: 'You are an expert software engineer. Write clean, efficient, and well-documented code. Test your solutions by executing them, debug issues methodically, and explain your approach clearly.',
    modelId: 'gpt-4o',
    config: { parallelToolExecution: false },
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: '심층 조사 및 리포트 작성 에이전트. Tavily/Firecrawl 등 MCP 검색 서버로 다양한 소스를 탐색합니다.',
    icon: '🔍',
    architecture: 'react',
    toolHints: [],
    systemPrompt: 'You are a thorough research assistant. Conduct comprehensive research using multiple sources, synthesize information objectively, and produce well-structured reports with citations.',
    modelId: 'gpt-4o',
    config: { maxIterations: 20, reactMaxIterations: 20 },
  },
  {
    id: 'planner',
    name: 'Planner',
    description: '복잡한 작업을 하위 에이전트에 위임하는 플래너. Sub-agent 오케스트레이션을 지원합니다.',
    icon: '🗺️',
    architecture: 'plan_execute',
    toolHints: [],
    systemPrompt: 'You are a strategic planner and orchestrator. Decompose complex tasks into manageable sub-tasks, delegate to appropriate sub-agents, coordinate execution, and synthesize results into coherent outcomes.',
    modelId: 'gpt-4o',
    config: { planningDepth: 5, maxIterations: 30 },
  },
  {
    id: 'custom',
    name: 'Custom',
    description: '빈 설정으로 시작하는 커스텀 에이전트. 직접 모든 설정을 구성하세요.',
    icon: '⚙️',
    architecture: 'react',
    toolHints: [],
    systemPrompt: 'You are a helpful assistant.',
    modelId: 'gpt-4o-mini',
    config: {},
  },
]

interface Props {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onCreated: () => void
}

export function TemplateGallery({ isOpen, onClose, projectId, onCreated }: Props) {
  const [creating, setCreating] = useState<string | null>(null)
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({})

  if (!isOpen) return null

  const handleCreate = async (template: TemplateDefinition) => {
    const name = nameOverrides[template.id]?.trim() || template.name
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    setCreating(template.id)
    try {
      await apiClient.agents.create(projectId, {
        name,
        slug,
        description: template.description,
        architecture: template.architecture,
        systemPrompt: template.systemPrompt,
        modelId: template.modelId,
        config: template.config,
      })
      onCreated()
      onClose()
    } finally {
      setCreating(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-[var(--color-fg)]">템플릿으로 Agent 생성</h2>
            <p className="text-xs text-[var(--color-fg-subtle)]">미리 구성된 템플릿을 선택하여 빠르게 시작하세요</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 템플릿 그리드 */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {TEMPLATES.map(template => (
              <div
                key={template.id}
                className="flex flex-col rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-4 transition-colors hover:border-border-strong"
              >
                <div className="mb-3 flex items-start justify-between">
                  <span className="text-2xl">{template.icon}</span>
                  <span className={cn(
                    'rounded px-1.5 py-0.5 text-xs uppercase font-semibold',
                    template.architecture === 'react' && 'bg-blue-500/15 text-blue-400',
                    template.architecture === 'plan_execute' && 'bg-purple-500/15 text-purple-400',
                    template.architecture === 'tool_calling' && 'bg-green-500/15 text-green-400',
                  )}>
                    {template.architecture}
                  </span>
                </div>
                <p className="text-sm font-semibold text-[var(--color-fg)]">{template.name}</p>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--color-fg-subtle)]">{template.description}</p>

                {template.toolHints.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.toolHints.map(hint => (
                      <span key={hint} className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)]">
                        {hint}
                      </span>
                    ))}
                  </div>
                )}

                <input
                  className="mt-3 w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                  placeholder={template.name}
                  value={nameOverrides[template.id] ?? ''}
                  onChange={e => setNameOverrides(prev => ({ ...prev, [template.id]: e.target.value }))}
                />

                <button
                  onClick={() => handleCreate(template)}
                  disabled={creating !== null}
                  className={cn(
                    'mt-2 rounded-md py-1.5 text-xs font-medium transition-colors',
                    creating === template.id
                      ? 'bg-blue-600/50 text-blue-300 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40',
                  )}
                >
                  {creating === template.id ? '생성 중...' : '이 템플릿으로 시작'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { X, Bot, Wrench, LayoutGrid, History, Shield, FileOutput, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Agent, UpdateAgentRequest, MemoryConfig, GuardrailsConfig, ReasoningConfig } from '@agent-studio/shared'
import { BasicTab } from './BasicTab'
import { ToolsTab } from './ToolsTab'
import { PlanningTab } from './PlanningTab'
import { ReasoningTab } from './ReasoningTab'
import { GuardrailsTab } from './GuardrailsTab'
import { OutputSchemaTab } from './OutputSchemaTab'

type DrawerTab = 'basic' | 'tools' | 'planning' | 'guardrails' | 'output'

const DRAWER_TABS: { id: DrawerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'basic',      label: '기본',     icon: Bot },
  { id: 'tools',      label: '도구',     icon: Wrench },
  { id: 'planning',   label: '플래닝',   icon: LayoutGrid },
  { id: 'guardrails', label: '가드레일', icon: Shield },
  { id: 'output',     label: '출력',     icon: FileOutput },
]

function isDeepAgentOn(agent: Agent): boolean {
  const mem = (agent.memoryConfig as MemoryConfig) ?? {}
  const guard = (agent.guardrailsConfig as GuardrailsConfig) ?? {}
  const reason = (agent.reasoningConfig as ReasoningConfig) ?? {}
  const hasMemory = mem.strategy !== undefined && mem.strategy !== 'raw_log'
  const hasGuardrails = (guard.blockedTopics?.length ?? 0) > 0 || (guard.outputFilters?.length ?? 0) > 0 || !!guard.piiDetection
  const hasReasoning = !!reason.stepLimit || !!reason.cotVisible || (reason.thinkingDepth ?? 3) > 3
  return hasMemory || hasGuardrails || hasReasoning
}

interface Props {
  open: boolean
  onClose: () => void
  agent: Agent
  projectId: string
  agentId: string
  onChange: (changes: UpdateAgentRequest) => void
  initialTab?: DrawerTab
}

export function AgentSettingsDrawer({ open, onClose, agent, projectId, agentId: _agentId, onChange, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab ?? 'basic')

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab ?? 'basic')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const deepAgentOn = isDeepAgentOn(agent)

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col bg-[var(--color-bg)] border-l border-[var(--color-border)]',
          'transition-transform duration-300 ease-in-out shadow-2xl',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-[var(--color-fg)]">에이전트 설정</span>
            <div className={cn(
              'flex items-center gap-1 rounded-md px-2 py-0.5',
              deepAgentOn ? 'bg-blue-500/15' : 'bg-[var(--color-surface-2)]',
            )}>
              <Zap className={cn('h-3 w-3', deepAgentOn ? 'text-blue-400' : 'text-[var(--color-fg-subtle)]')} />
              <span className={cn('text-xs font-bold uppercase', deepAgentOn ? 'text-blue-400' : 'text-[var(--color-fg-subtle)]')}>
                DeepAgent {deepAgentOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex overflow-x-auto border-b border-[var(--color-border)] px-4">
          {DRAWER_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-bold uppercase transition-all',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
              )}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'basic' && (
            <BasicTab agent={agent} onChange={onChange} />
          )}
          {activeTab === 'tools' && (
            <ToolsTab agent={agent} projectId={projectId} onChange={onChange} />
          )}
          {activeTab === 'planning' && (
            <div className="divide-y divide-[var(--color-surface-2)]">
              <PlanningTab agent={agent} projectId={projectId} onChange={onChange} />
              <ReasoningTab agent={agent} onChange={onChange} />
            </div>
          )}
          {activeTab === 'guardrails' && (
            <GuardrailsTab agent={agent} onChange={onChange} />
          )}
          {activeTab === 'output' && (
            <OutputSchemaTab agent={agent} onChange={onChange} />
          )}
        </div>
      </div>
    </>
  )
}

'use client'

import type {
  Agent, UpdateAgentRequest, PlanningConfig, ReasoningConfig, AgentArchitecture,
} from '@agent-studio/shared'
import { cn } from '@/lib/utils'
import { Brain, Zap, ListOrdered, Layers, Check, Lock } from 'lucide-react'

interface Props {
  agent: Agent
  projectId: string
  onChange: (changes: UpdateAgentRequest) => void
}

// ── Architecture definitions ──────────────────────────────────────────────────

const ARCHITECTURES: {
  id: AgentArchitecture
  name: string
  badge: string
  badgeColor: string
  icon: React.ComponentType<{ className?: string }>
  iconColor: string
  desc: string
  disabled?: boolean
}[] = [
  {
    id: 'react',
    name: 'Deep Autonomous Agent',
    badge: 'DeepAgents',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    icon: Brain,
    iconColor: 'text-purple-400',
    desc: 'LangChain DeepAgents 아키텍처를 사용하여 복잡한 목표를 스스로 계획하고 해결합니다.',
  },
  {
    id: 'tool_calling',
    name: '빠른 도구 사용 (Fast)',
    badge: 'LangGraph',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: Zap,
    iconColor: 'text-yellow-400',
    desc: '지시사항에 따라 즉각적으로 도구를 호출합니다. 간단한 작업에 최적입니다.',
  },
  {
    id: 'plan_execute',
    name: '계획 및 실행 (Planning)',
    badge: 'LangGraph',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: ListOrdered,
    iconColor: 'text-cyan-400',
    desc: '먼저 전체 실행 계획을 세운 뒤 하나씩 작업을 완수합니다.',
  },
  {
    id: 'custom_graph',
    name: '커스텀 그래프 (Expert)',
    badge: 'LangGraph',
    badgeColor: 'text-[var(--color-fg-subtle)] bg-[var(--color-surface-2)] border-[var(--color-border-strong)]',
    icon: Layers,
    iconColor: 'text-[var(--color-fg-subtle)]',
    desc: 'LangGraph를 이용해 고유한 대화 흐름을 직접 설계합니다.',
    disabled: true,
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function DisabledField({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-35 select-none">{children}</div>
      <div className="absolute inset-0 flex items-center justify-end px-3">
        <span className="rounded border border-[var(--color-border-strong)] bg-bg px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)]">현재 버전에서 지원되지 않습니다</span>
      </div>
    </div>
  )
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        enabled ? 'bg-blue-600' : 'bg-[var(--color-border-strong)]',
      )}
    >
      <div className={cn(
        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
        enabled ? 'translate-x-4' : 'translate-x-0.5',
      )} />
    </button>
  )
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 space-y-4', className)}>
      {children}
    </div>
  )
}

/** 전용 설정 섹션 래퍼 — 해당 아키텍처가 선택되지 않으면 잠금 표시 */
function ExclusiveSection({
  archName,
  archColor,
  active,
  children,
}: {
  archName: string
  archColor: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-4 rounded-xl border p-4', active ? 'border-[var(--color-border)]' : 'border-dashed border-[var(--color-border)]')}>
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('h-1.5 w-1.5 rounded-full', active ? archColor : 'bg-[var(--color-border-strong)]')} />
          <span className={cn('text-xs font-bold uppercase tracking-wide', active ? 'text-[var(--color-fg-muted)]' : 'text-fg-subtle')}>
            {archName} 전용 설정
          </span>
        </div>
        {!active && (
          <div className="flex items-center gap-1 text-xs text-fg-subtle">
            <Lock className="h-2.5 w-2.5" />
            <span>위에서 선택 시 활성화</span>
          </div>
        )}
      </div>

      {/* 설정 내용 */}
      <div className={cn('space-y-4', !active && 'pointer-events-none select-none opacity-30')}>
        {children}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PlanningTab({ agent, projectId: _projectId, onChange }: Props) {
  const enabledSet = new Set<AgentArchitecture>(
    agent.architectures?.length ? agent.architectures : [agent.architecture ?? 'react'],
  )

  const cfg: PlanningConfig = (agent.planningConfig as PlanningConfig) ?? {}
  const rcfg: ReasoningConfig = (agent.reasoningConfig as ReasoningConfig) ?? {}

  const updatePlanning = (patch: Partial<PlanningConfig>) =>
    onChange({ planningConfig: { ...cfg, ...patch } })

  const updateReasoning = (patch: Partial<ReasoningConfig>) =>
    onChange({ reasoningConfig: { ...rcfg, ...patch } })

  const toggleArch = (id: AgentArchitecture) => {
    const next = new Set(enabledSet)
    if (next.has(id)) {
      if (next.size === 1) return
      next.delete(id)
    } else {
      next.add(id)
    }
    const arr = ARCHITECTURES.map(a => a.id).filter(a => next.has(a))
    onChange({ architectures: arr, architecture: arr[0] })
  }

  const showReact = enabledSet.has('react')
  const showFast = enabledSet.has('tool_calling')
  const showPlan = enabledSet.has('plan_execute')

  return (
    <div className="space-y-6 p-6">

      {/* ── Section 1: 동작 방식 선택 ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-fg)]">동작 방식 (Working Method)</h3>
          <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
            하나 또는 여러 방식을 선택할 수 있습니다. 여러 개 선택 시 채팅에서 방식을 전환하며 대화할 수 있습니다.
          </p>
        </div>

        {enabledSet.size > 1 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            <span className="text-xs text-blue-400">
              {enabledSet.size}가지 방식 활성화 — 각 방식의 전용 설정이 아래에 펼쳐집니다.
            </span>
          </div>
        )}

        <div className="space-y-2">
          {ARCHITECTURES.map(a => {
            const Icon = a.icon
            const selected = enabledSet.has(a.id)
            const disabled = !!a.disabled
            return (
              <button
                key={a.id}
                disabled={disabled}
                onClick={() => !disabled && toggleArch(a.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all',
                  selected
                    ? 'border-blue-500/60 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.08)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]',
                  disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <div className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
                  selected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)] bg-transparent',
                )}>
                  {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', a.iconColor)} />
                    <span className={cn('text-xs font-bold', selected ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]')}>
                      {a.name}
                    </span>
                    <span className={cn('rounded-full border px-1.5 py-0.5 text-xs font-bold', a.badgeColor)}>
                      {a.badge}
                    </span>
                    {disabled && <span className="text-xs text-[var(--color-fg-subtle)]">준비 중</span>}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-fg-subtle)]">{a.desc}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Section 2: Deep Autonomous Agent 전용 ── */}
      <ExclusiveSection archName="Deep Autonomous Agent" archColor="bg-purple-400" active={showReact}>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[var(--color-fg)]">하위 에이전트 생성 허용</div>
              <div className="text-xs text-[var(--color-fg-subtle)]">복잡한 하위 작업을 별도 에이전트에 위임합니다</div>
            </div>
            <Toggle
              enabled={cfg.subAgents?.enabled ?? false}
              onChange={v =>
                updatePlanning({
                  subAgents: {
                    enabled: v,
                    agentIds: cfg.subAgents?.agentIds ?? [],
                    maxConcurrent: cfg.subAgents?.maxConcurrent ?? 2,
                    delegationStrategy: cfg.subAgents?.delegationStrategy ?? 'capability_based',
                  },
                })
              }
            />
          </div>

          {cfg.subAgents?.enabled && (
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">Max Spawns</div>
                <input
                  type="number" min={1} max={5}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-xs text-[var(--color-fg)] focus:outline-none"
                  value={cfg.subAgents.maxConcurrent}
                  onChange={e => updatePlanning({ subAgents: { ...cfg.subAgents!, maxConcurrent: parseInt(e.target.value) } })}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">Hierarchy</div>
                <select
                  className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-xs text-[var(--color-fg)] focus:outline-none"
                  value={cfg.subAgents.delegationStrategy}
                  onChange={e => updatePlanning({ subAgents: { ...cfg.subAgents!, delegationStrategy: e.target.value as 'round_robin' | 'capability_based' | 'load_balanced' } })}
                >
                  <option value="capability_based">Capability-based</option>
                  <option value="round_robin">Round Robin</option>
                  <option value="load_balanced">Load Balanced</option>
                </select>
              </div>
            </div>
          )}
        </Card>
      </ExclusiveSection>

      {/* ── Section 3: 빠른 도구 사용 전용 ── */}
      <ExclusiveSection archName="빠른 도구 사용" archColor="bg-yellow-400" active={showFast}>
        <DisabledField>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[var(--color-fg)]">도구 병렬 실행</div>
                <div className="text-xs text-[var(--color-fg-subtle)]">여러 도구를 동시에 호출하여 응답 속도를 향상합니다</div>
              </div>
              <Toggle
                enabled={rcfg.parallelToolExecution ?? false}
                onChange={v => updateReasoning({ parallelToolExecution: v })}
              />
            </div>
          </Card>
        </DisabledField>
      </ExclusiveSection>

      {/* ── Section 4: 계획 및 실행 전용 ── */}
      <ExclusiveSection archName="계획 및 실행" archColor="bg-cyan-400" active={showPlan}>
        <Card>
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">실행 전략</div>
            <div className="space-y-1.5">
              {([
                ['sequential', '순차 실행', '하나가 끝나면 다음 단계 진행'],
                ['parallel',   '병렬 실행', '독립적인 단계들을 동시에 수행'],
                ['conditional','동적 분기', '상황에 따라 단계를 실시간으로 조정'],
              ] as const).map(([val, label, desc]) => {
                const active = (cfg.orchestrationMode ?? 'sequential') === val
                return (
                  <button
                    key={val}
                    onClick={() => updatePlanning({ orchestrationMode: val })}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all',
                      active ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-[var(--color-border)] hover:bg-[var(--color-surface)]',
                    )}
                  >
                    <div className={cn('h-2 w-2 shrink-0 rounded-full', active ? 'bg-cyan-400' : 'bg-[var(--color-border-strong)]')} />
                    <div>
                      <div className={cn('text-xs font-bold', active ? 'text-cyan-400' : 'text-[var(--color-fg)]')}>{label}</div>
                      <div className="text-xs text-[var(--color-fg-subtle)]">{desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </Card>

        <Card>
          <DisabledField>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[var(--color-fg)]">계획 깊이 (Planning Depth)</div>
                <div className="text-xs text-[var(--color-fg-subtle)]">계획 단계의 세분화 수준 (1=큰 단계, 5=세부 단계)</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={1} max={5} step={1}
                  className="w-24 accent-cyan-500 cursor-pointer"
                  value={rcfg.planningDepth ?? 2}
                  onChange={e => updateReasoning({ planningDepth: parseInt(e.target.value) })}
                />
                <span className="w-4 text-center text-xs font-bold text-cyan-400">{rcfg.planningDepth ?? 2}</span>
              </div>
            </div>
          </DisabledField>

          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <div className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">재계획 트리거</div>
            <div className="flex gap-2">
              {([
                ['never',      '사용 안 함'],
                ['on_failure', '실패 시'],
                ['always',     '항상'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => updateReasoning({ replanningTrigger: val })}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-center text-xs font-bold transition-all',
                    (rcfg.replanningTrigger ?? 'on_failure') === val
                      ? 'border-cyan-500/50 bg-cyan-500/5 text-cyan-400'
                      : 'border-[var(--color-border)] bg-bg text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface)]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[var(--color-fg)]">하위 에이전트 위임</div>
              <div className="text-xs text-[var(--color-fg-subtle)]">계획의 특정 단계를 하위 에이전트에게 위임합니다</div>
            </div>
            <Toggle
              enabled={cfg.delegation?.enabled ?? false}
              onChange={v =>
                updatePlanning({
                  delegation: {
                    enabled: v,
                    delegationMode: cfg.delegation?.delegationMode ?? 'on_complexity',
                    delegatableTeamIds: cfg.delegation?.delegatableTeamIds ?? [],
                    maxDelegationDepth: cfg.delegation?.maxDelegationDepth ?? 2,
                  },
                })
              }
            />
          </div>
        </Card>
      </ExclusiveSection>

    </div>
  )
}

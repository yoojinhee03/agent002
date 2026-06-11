'use client'

import type { Agent, UpdateAgentRequest, ReasoningConfig } from '@agent-studio/shared'
import { cn } from '@/lib/utils'
import { Zap, LayoutList } from 'lucide-react'

function DeepAgentBadge() {
  return (
    <span className="flex items-center gap-0.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-blue-500">
      <Zap className="h-2 w-2" />DeepAgent
    </span>
  )
}

function PlanningBadge() {
  return (
    <span className="flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-500">
      <LayoutList className="h-2 w-2" />Planning
    </span>
  )
}

interface Props {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}

function Section({ label, desc, children }: { label: React.ReactNode; desc: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">{label}</div>
        <div className="text-xs text-[var(--color-fg-subtle)]">{desc}</div>
      </div>
      {children}
    </div>
  )
}

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

function Toggle({ enabled, onToggle, onLabel, offLabel }: {
  enabled: boolean; onToggle: (v: boolean) => void; onLabel: string; offLabel: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5">
      <div className="text-xs font-medium text-[var(--color-fg)]">{enabled ? onLabel : offLabel}</div>
      <button
        onClick={() => onToggle(!enabled)}
        className={cn(
          'relative h-4 w-8 rounded-full transition-colors',
          enabled ? 'bg-blue-600' : 'bg-[var(--color-border-strong)]',
        )}
      >
        <div className={cn(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
          enabled ? 'translate-x-4' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  )
}

export function ReasoningTab({ agent, onChange }: Props) {
  const cfg: ReasoningConfig = (agent.reasoningConfig as ReasoningConfig) ?? {}

  const update = (patch: Partial<ReasoningConfig>) => {
    onChange({ reasoningConfig: { ...cfg, ...patch } })
  }

  const depth = cfg.thinkingDepth ?? 3
  const stepLimit = cfg.stepLimit ?? 40

  return (
    <div className="space-y-6 px-6 pt-2 pb-6">

      {/* 공통 설정 안내 */}
      <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)]" />
        <span className="text-xs text-[var(--color-fg-subtle)]">
          아래 설정은 선택된 모든 동작 방식에 공통으로 적용됩니다.
          동작 방식별 전용 설정은 위 <span className="font-bold text-[var(--color-fg-muted)]">동작 방식</span> 섹션에서 확인하세요.
        </span>
      </div>

      {/* Thinking Depth */}
      <DisabledField>
        <Section
          label="Thinking Depth"
          desc="높을수록 더 깊이 추론하지만 느려집니다. 4 이상 시 DeepAgent 활성화."
        >
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <input
                type="range" min={1} max={5} step={1}
                className="flex-1 accent-blue-500 h-1.5 rounded-lg bg-[var(--color-surface-2)] appearance-none cursor-pointer"
                value={depth}
                onChange={e => update({ thinkingDepth: parseInt(e.target.value) as ReasoningConfig['thinkingDepth'] })}
              />
              <span className={cn('w-6 text-center text-xs font-bold', depth >= 4 ? 'text-blue-400' : 'text-[var(--color-fg-muted)]')}>
                {depth}
              </span>
            </div>
            <div className="flex justify-between text-xs font-bold text-[var(--color-fg-subtle)]">
              <span>FAST</span>
              <span>NORMAL</span>
              <span className={cn(depth >= 4 ? 'text-blue-400' : '')}>
                DEEP{depth >= 4 ? ' ⚡' : ''}
              </span>
            </div>
          </div>
        </Section>
      </DisabledField>

      {/* Step Limit */}
      <Section
        label={
          <div className="flex items-center gap-1.5">
            <span>Step Limit</span>
            <DeepAgentBadge />
            <PlanningBadge />
          </div>
        }
        desc="최대 실행 단계 수 (초과 시 강제 종료). 설정 시 고급 추론 엔진 활성화."
      >
        <input
          type="number" min={1} max={200}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none"
          value={stepLimit}
          onChange={e => update({ stepLimit: parseInt(e.target.value) })}
        />
      </Section>

      {/* CoT Visibility - Only for Reasoning-capable architectures */}
      {(agent.architecture === 'react' || agent.architecture === 'plan_execute') && (
        <DisabledField>
          <Section
            label={
              <div className="flex items-center gap-1.5">
                <span>Show Thinking Process</span>
                <DeepAgentBadge />
                <PlanningBadge />
              </div>
            }
            desc="사용자에게 사고 과정을 보여줄지 여부. 활성화 시 고급 추론 엔진 실행."
          >
            <Toggle
              enabled={cfg.cotVisible ?? true}
              onToggle={v => update({ cotVisible: v })}
              onLabel="공개 (Visible)"
              offLabel="비공개 (Hidden)"
            />
          </Section>
        </DisabledField>
      )}

    </div>
  )
}

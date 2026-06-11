'use client'

import { CheckCircle2, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAgentAssistantStore, type AssistantStep } from '@/stores/use-agent-assistant-store'

interface StepRow {
  key: AssistantStep
  label: string
  hint: string
}

const STEPS: StepRow[] = [
  { key: 'parsing', label: '요청 파싱', hint: '사용자 의도 분석' },
  { key: 'clarifying', label: '명확화 질문', hint: '모호한 부분 식별' },
  { key: 'structuring', label: 'Agent 구조 설계', hint: 'Main + Sub agents' },
  { key: 'tool_mapping', label: '도구 매핑', hint: 'Builtin · MCP · Skill' },
  { key: 'complete', label: '완료', hint: '캔버스 미리보기 준비' },
]

function rowState(current: AssistantStep, step: AssistantStep): 'done' | 'active' | 'pending' {
  const order: AssistantStep[] = ['idle', 'parsing', 'clarifying', 'structuring', 'tool_mapping', 'complete']
  const ci = order.indexOf(current)
  const si = order.indexOf(step)
  if (ci > si) return 'done'
  if (ci === si) return 'active'
  return 'pending'
}

export function AssistantGenerationLog() {
  const currentStep = useAgentAssistantStore((s) => s.currentStep)
  const pendingNodes = useAgentAssistantStore((s) => s.pendingNodes)
  const messages = useAgentAssistantStore((s) => s.messages)
  const error = useAgentAssistantStore((s) => s.error)

  const mainCount = pendingNodes.filter((n) => n.type === 'mainAgent').length
  const subCount = pendingNodes.filter((n) => n.type === 'subAgent').length
  const turnCount = messages.filter((m) => m.role === 'user').length

  return (
    <div className="flex w-[280px] flex-col gap-3 border-l border-border bg-bg p-4 text-fg">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-fg-subtle">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
        생성 로그
      </div>

      <div className="rounded-md border border-border bg-bg p-3 text-xs text-fg-muted">
        <div className="flex justify-between">
          <span>턴 수</span>
          <span className="text-fg">{turnCount}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span>제안된 노드</span>
          <span className="text-fg">
            Main {mainCount} · Sub {subCount}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          const state = rowState(currentStep, step.key)
          return (
            <div key={step.key} className="flex items-start gap-2 text-xs">
              <div className="mt-0.5 shrink-0">
                {state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                ) : state === 'active' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <Circle className="h-4 w-4 text-fg-subtle" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    'flex items-center gap-1',
                    state === 'done'
                      ? 'text-fg'
                      : state === 'active'
                        ? 'text-blue-300'
                        : 'text-fg-subtle',
                  )}
                >
                  <span className="text-xs text-fg-subtle">{idx + 1}</span>
                  <span className="font-medium">{step.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-fg-subtle">{step.hint}</p>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}

'use client'

import type { TodoStep } from '@agent-studio/shared'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function TodoListCard({
  steps,
  streamingHint = false,
  cancelled = false,
}: {
  steps: TodoStep[]
  streamingHint?: boolean
  cancelled?: boolean
}) {
  const total = steps.length
  const completed = steps.filter((s) => s.status === 'completed').length
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
  // 모델이 답변 생성 중이고 아직 in_progress 마킹을 보내지 않았을 때만 첫 pending 항목에 hint 표시.
  // write_todos가 도착해 실제 in_progress 가 잡히면 자동으로 hint 비활성.
  // cancelled 인 경우 hint 는 의미가 없으므로 비활성.
  const hasInProgress = steps.some((s) => s.status === 'in_progress')
  const hintIdx =
    streamingHint && !cancelled && !hasInProgress
      ? steps.findIndex((s) => s.status !== 'completed')
      : -1

  if (total === 0) return null

  return (
    <div className="py-1">
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-bg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border-strong)]">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">Todo List</span>
            {cancelled && (
              <span className="rounded-full px-1.5 py-0.5 text-xs font-bold text-pink-400"
                    style={{ background: 'rgba(244,114,182,0.18)' }}>
                취소됨
              </span>
            )}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)] tabular-nums">
            {completed}/{total}
          </span>
        </div>

        <div className="h-0.5 bg-[var(--color-surface-2)]">
          <div
            className="h-full bg-emerald-500/80 transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <ul className="px-4 py-3 space-y-2">
          {steps.map((step, i) => (
            <TodoRow key={i} step={step} isHint={i === hintIdx} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function TodoRow({ step, isHint = false }: { step: TodoStep; isHint?: boolean }) {
  const isDone = step.status === 'completed'
  const isActive = step.status === 'in_progress'

  return (
    <li className="flex items-start gap-3">
      <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center">
        {isDone ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500">
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="2.5 6.5 5 9 9.5 3.5" />
            </svg>
          </span>
        ) : isActive ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/10 shadow-[0_0_8px_rgba(251,191,36,0.5)]">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          </span>
        ) : isHint ? (
          <span className="flex h-4 w-4 items-center justify-center rounded-full border-2 border-amber-400/70 bg-amber-400/5">
            <Loader2 className="h-2.5 w-2.5 animate-spin text-amber-400" />
          </span>
        ) : (
          <span className="h-4 w-4 rounded-full border-2 border-border-strong" />
        )}
      </span>
      <span
        className={cn(
          'flex-1 text-sm leading-relaxed',
          isDone && 'text-[var(--color-fg-subtle)] line-through',
          isActive && 'text-fg font-medium',
          isHint && 'text-fg',
          !isDone && !isActive && !isHint && 'text-fg',
        )}
      >
        {step.content}
      </span>
      {isHint && (
        <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-bold tracking-wider text-amber-400">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          WORKING
        </span>
      )}
    </li>
  )
}

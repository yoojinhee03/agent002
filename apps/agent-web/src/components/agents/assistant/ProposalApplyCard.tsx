'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'

interface ProposalApplyCardProps {
  pendingMainCount: number
  pendingSubCount: number
  onApply: (mode: 'replace' | 'merge') => Promise<void> | void
  onCancel: () => void
}

export function ProposalApplyCard({
  pendingMainCount,
  pendingSubCount,
  onApply,
  onCancel,
}: ProposalApplyCardProps) {
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-xs text-fg">
        <div className="flex items-center gap-2 text-amber-300">
          <Sparkles className="h-3.5 w-3.5" />
          <span className="font-semibold">제안된 구조를 캔버스에 적용</span>
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          Main {pendingMainCount}개 · Sub {pendingSubCount}개의 제안 노드를 어떻게 적용할까요?
        </p>

        <div className="mt-3 space-y-1.5">
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-bg p-2 hover:border-amber-400/40">
            <input
              type="radio"
              name="proposal-apply-mode"
              checked={mode === 'replace'}
              onChange={() => setMode('replace')}
              disabled={submitting}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-xs font-semibold">대체 (Replace)</div>
              <p className="text-xs text-fg-muted">
                기존 노드를 모두 제거하고 제안 구조로 교체합니다.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-bg p-2 hover:border-amber-400/40">
            <input
              type="radio"
              name="proposal-apply-mode"
              checked={mode === 'merge'}
              onChange={() => setMode('merge')}
              disabled={submitting}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-xs font-semibold">병합 (Merge)</div>
              <p className="text-xs text-fg-muted">
                기존 main 은 유지하고 제안 sub agent 만 추가합니다.
              </p>
            </div>
          </label>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-border px-2.5 py-1 text-xs text-fg-muted hover:border-amber-400/40 hover:text-fg disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={async () => {
              setSubmitting(true)
              try {
                await onApply(mode)
              } finally {
                setSubmitting(false)
              }
            }}
            disabled={submitting}
            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-60"
          >
            {submitting ? '적용 중…' : '적용'}
          </button>
        </div>
      </div>
    </div>
  )
}

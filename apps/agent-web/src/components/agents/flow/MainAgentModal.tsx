'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Agent, UpdateAgentRequest } from '@agent-studio/shared'
import type { EnabledModel } from '@/types/provider'

interface MainAgentModalProps {
  open: boolean
  agent: Agent
  models: EnabledModel[]
  onChange: (changes: UpdateAgentRequest) => void
  onClose: () => void
}

export function MainAgentModal({
  open,
  agent,
  models,
  onChange,
  onClose,
}: MainAgentModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && nameRef.current) {
      nameRef.current.value = agent.name
    }
    if (open && descRef.current) {
      descRef.current.value = agent.description ?? ''
    }
  }, [open, agent.name, agent.description])

  if (!open) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose()
  }

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="w-[520px] rounded-2xl border border-border bg-bg shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-bold text-fg">Main Agent 설정</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 내용 */}
        <div className="space-y-5 px-6 py-5">
          {/* Agent Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-fg-subtle">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              defaultValue={agent.name}
              onBlur={(e) => onChange({ name: e.target.value })}
              placeholder="에이전트 이름을 입력하세요"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-[#3B82F6]/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-fg-subtle">
              Description (Scenario)
            </label>
            <textarea
              ref={descRef}
              rows={3}
              defaultValue={agent.description ?? ''}
              onBlur={(e) => onChange({ description: e.target.value })}
              placeholder="이 에이전트의 역할과 목적을 설명하세요"
              className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-[#3B82F6]/50 focus:outline-none"
            />
          </div>

          {/* Brain Model */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase text-fg-subtle">Brain Model</label>
            <select
              value={agent.modelId ?? ''}
              onChange={(e) => onChange({ modelId: e.target.value })}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:border-[#3B82F6]/50 focus:outline-none"
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
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex justify-end border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#3B82F6] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}

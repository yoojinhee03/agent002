'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'
import type { AssistantMessage } from '@/stores/use-skill-assistant-store'

interface SkillChoicesPanelProps {
  message: AssistantMessage
}

export function SkillChoicesPanel({ message }: SkillChoicesPanelProps) {
  const att = message.choices
  const isStreaming = useSkillAssistantStore((s) => s.isStreaming)
  const sendMessage = useSkillAssistantStore((s) => s.sendMessage)
  const toggleCollapsed = useSkillAssistantStore((s) => s.toggleChoicesCollapsed)
  const setConsumed = useSkillAssistantStore((s) => s.setChoicesConsumed)
  const [custom, setCustom] = useState('')

  if (!att || att.choices.length === 0) return null

  const handlePick = async (value: string) => {
    if (isStreaming || !value.trim()) return
    setConsumed(message.id)
    await sendMessage(value)
  }

  const handleCustomSend = async () => {
    const t = custom.trim()
    if (!t) return
    setCustom('')
    await handlePick(t)
  }

  if (att.collapsed) {
    return (
      <button
        type="button"
        onClick={() => toggleCollapsed(message.id)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-bg/60 px-2.5 py-1 text-[11px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
      >
        <ChevronDown className="h-3 w-3" />
        선택지 {att.choices.length}개 보기
        {att.consumed && <span className="text-fg-subtle">· 선택 완료</span>}
      </button>
    )
  }

  return (
    <div className="mt-1.5 w-full rounded-xl border border-border bg-bg/60 p-2 text-fg">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-muted">
          선택지
          {att.consumed && (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-300">
              선택 완료
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => toggleCollapsed(message.id)}
          aria-label="선택지 닫기"
          className="rounded p-0.5 text-fg-subtle hover:bg-[var(--color-surface-2)] hover:text-fg"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="space-y-1">
        {att.choices.map((c, idx) => (
          <button
            key={`${idx}-${c.label}`}
            type="button"
            onClick={() => void handlePick(c.value)}
            disabled={isStreaming}
            className={cn(
              'flex w-full items-start gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-left text-xs text-fg transition-colors',
              'hover:border-blue-400/40 hover:bg-[var(--color-surface-2)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
            <span className="flex-1 break-words">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 rounded-lg border border-border bg-[var(--color-surface-2)] px-2 py-1">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void handleCustomSend()
            }
          }}
          placeholder="직접 입력…"
          disabled={isStreaming}
          className="flex-1 bg-transparent text-xs text-fg placeholder:text-fg-subtle outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleCustomSend()}
          disabled={isStreaming || !custom.trim()}
          aria-label="직접 입력 전송"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
        >
          <Send className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import type { AgentEditPatch } from '@/stores/use-agent-assistant-store'

interface EditApplyCardProps {
  edit: AgentEditPatch
  onApply: () => Promise<void> | void
  onCancel: () => void
}

const FIELD_LABEL_KO: Record<string, string> = {
  agentName: '이름',
  architecture: '아키텍처',
  modelId: '모델',
  systemPrompt: '시스템 프롬프트',
  builtinToolIds: 'Builtin 도구',
  toolIds: 'DB 도구',
  mcpServerIds: 'MCP 서버',
  skillIds: 'Skill',
  toolPermissions: '도구 실행 정책',
  subAgentPermissions: '서브에이전트 권한',
}

const POLICY_LABEL_KO: Record<string, string> = {
  auto: 'Auto',
  requires_approval: '승인 필요(HITL)',
  restricted: '제한',
  disabled: '비활성',
}

function formatPolicyDict(dict: Record<string, string>): string {
  return Object.entries(dict)
    .map(([tool, policy]) => `${tool} → ${POLICY_LABEL_KO[policy] ?? policy}`)
    .join(', ')
}

function formatValue(key: string, value: unknown): string {
  if (key === 'toolPermissions' && value && typeof value === 'object') {
    return formatPolicyDict(value as Record<string, string>)
  }
  if (key === 'subAgentPermissions' && Array.isArray(value)) {
    return value
      .map((p) => {
        const patch = p as { agentName: string; toolPermissions: Record<string, string> }
        return `${patch.agentName}: ${formatPolicyDict(patch.toolPermissions)}`
      })
      .join(' / ')
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '(모두 제거)'
    return value.join(', ')
  }
  if (typeof value === 'string') {
    return value.length > 200 ? value.slice(0, 200) + '…' : value
  }
  return String(value)
}

export function EditApplyCard({ edit, onApply, onCancel }: EditApplyCardProps) {
  const [submitting, setSubmitting] = useState(false)

  // changeSummary 는 카드 헤더에만 쓰고, 변경 필드 목록에서는 제외.
  const changedFields = Object.entries(edit).filter(
    ([k, v]) => k !== 'changeSummary' && v !== undefined,
  )

  return (
    <div className="w-full rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-xs text-fg">
      <div className="flex items-center gap-2 text-amber-300">
        <Pencil className="h-3.5 w-3.5" />
        <span className="font-semibold">변경 사항 적용</span>
      </div>
      {edit.changeSummary && (
        <p className="mt-1 text-xs text-fg-muted">{edit.changeSummary}</p>
      )}

      <div className="mt-2 space-y-1 rounded-md border border-border bg-bg p-2">
        {changedFields.length === 0 ? (
          <p className="text-xs text-fg-subtle">변경 항목 없음</p>
        ) : (
          changedFields.map(([key, value]) => (
            <div key={key} className="text-xs">
              <span className="font-semibold text-amber-200">
                {FIELD_LABEL_KO[key] ?? key}
              </span>
              <span className="ml-2 whitespace-pre-wrap break-words text-fg-muted">
                {formatValue(key, value)}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="mt-2 flex justify-end gap-2">
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
              await onApply()
            } finally {
              setSubmitting(false)
            }
          }}
          disabled={submitting}
          className="rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-60"
        >
          {submitting ? '적용 중…' : '변경 적용'}
        </button>
      </div>
    </div>
  )
}

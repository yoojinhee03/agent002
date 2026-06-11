'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { ToolGroup } from '@agent-studio/shared'

interface Props {
  projectId: string
  onCreated: (group: ToolGroup) => void
  onClose: () => void
}

export function CreateToolGroupDialog({ projectId, onCreated, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'rest' | 'code'>('rest')
  const [validationError, setValidationError] = useState('')

  const createMutation = useApiMutation({
    mutationFn: () => apiClient.toolGroups.create(projectId, { name: name.trim(), description: description.trim(), type }),
    successMessage: MSG.toolGroup.created,
    onSuccess: (group) => {
      onCreated(group as ToolGroup)
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setValidationError('그룹 이름을 입력하세요.'); return }
    setValidationError('')
    createMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold text-[var(--color-fg)]">새 Tool 그룹</h2>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">그룹 유형</label>
            <div className="flex gap-2">
              {(['rest', 'code'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-medium border transition-colors',
                    type === t
                      ? t === 'rest'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-purple-500 bg-purple-500/10 text-purple-400'
                      : 'border-[var(--color-border)] text-[var(--color-fg-subtle)] hover:border-[var(--color-border-strong)]',
                  )}
                >
                  {t === 'rest' ? '🌐 REST API' : '💻 Code'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              {type === 'rest'
                ? 'HTTP 엔드포인트를 도구로 등록합니다. OpenAPI 스펙으로 일괄 가져오기 가능.'
                : 'JavaScript 코드를 도구로 등록합니다.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">그룹 이름 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: My API Tools"
              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">설명 (선택)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="그룹 설명을 입력하세요"
              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {validationError && <p className="text-xs text-red-400">{validationError}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] rounded-lg border border-[var(--color-border)] transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {createMutation.isPending ? '생성 중...' : '생성'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

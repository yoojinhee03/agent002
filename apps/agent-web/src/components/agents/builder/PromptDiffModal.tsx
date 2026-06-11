'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type { PromptVersion } from '@agent-studio/shared'
import { X, GitCompare, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useConfirm } from '@/components/shared/confirm-dialog'

// ============================================================
// 타입
// ============================================================

interface Props {
  agentId: string
  isOpen: boolean
  onClose: () => void
}

// ============================================================
// 간단한 라인 diff 유틸
// ============================================================

type DiffLine =
  | { kind: 'equal';   text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'added';   text: string }

function computeDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')

  const aSet = new Set(aLines)
  const bSet = new Set(bLines)

  const result: DiffLine[] = []

  for (const line of aLines) {
    if (bSet.has(line)) {
      result.push({ kind: 'equal', text: line })
    } else {
      result.push({ kind: 'removed', text: line })
    }
  }

  for (const line of bLines) {
    if (!aSet.has(line)) {
      result.push({ kind: 'added', text: line })
    }
  }

  return result
}

// ============================================================
// VersionSelect
// ============================================================

function VersionSelect({
  versions,
  value,
  onChange,
  label,
}: {
  versions: PromptVersion[]
  value: string
  onChange: (id: string) => void
  label: string
}) {
  return (
    <div className="flex-1 space-y-1">
      <div className="text-xs font-semibold uppercase text-[var(--color-fg-subtle)]">{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-2.5 py-1.5 text-xs text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none"
      >
        <option value="">버전 선택</option>
        {versions.map(v => (
          <option key={v.id} value={v.id}>
            v{v.version}
            {v.createdBy ? ` — ${v.createdBy}` : ''}
            {' · '}
            {new Date(v.createdAt).toLocaleDateString('ko-KR')}
          </option>
        ))}
      </select>
    </div>
  )
}

// ============================================================
// DiffView
// ============================================================

function DiffView({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-[var(--color-fg-subtle)]">
        두 버전을 선택하면 diff가 표시됩니다
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border-strong)] bg-bg">
      <table className="w-full border-collapse font-mono text-xs">
        <tbody>
          {lines.map((line, i) => (
            <tr
              key={i}
              className={cn(
                line.kind === 'removed' && 'bg-red-500/10',
                line.kind === 'added'   && 'bg-green-500/10',
              )}
            >
              <td className={cn(
                'select-none w-6 px-2 py-0.5 text-center text-xs border-r border-[var(--color-border-strong)]',
                line.kind === 'removed' && 'text-red-500',
                line.kind === 'added'   && 'text-green-500',
                line.kind === 'equal'   && 'text-[var(--color-fg-subtle)]',
              )}>
                {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '}
              </td>
              <td className={cn(
                'px-3 py-0.5 whitespace-pre leading-relaxed',
                line.kind === 'removed' && 'text-red-300',
                line.kind === 'added'   && 'text-green-300',
                line.kind === 'equal'   && 'text-[var(--color-fg-muted)]',
              )}>
                {line.text || '\u00A0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// PromptDiffModal
// ============================================================

export function PromptDiffModal({ agentId, isOpen, onClose }: Props) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [versionA, setVersionA] = useState('')
  const [versionB, setVersionB] = useState('')
  const confirm = useConfirm()

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    apiClient.agents.listPromptVersions(agentId)
      .then(list => {
        setVersions(list)
        if (list.length >= 2) {
          setVersionA(list[0].id)
          setVersionB(list[1].id)
        } else if (list.length === 1) {
          setVersionA(list[0].id)
        }
      })
      .catch(() => toast.error('버전 목록 로드에 실패했습니다'))
      .finally(() => setLoading(false))
  }, [isOpen, agentId])

  const restoreMutation = useApiMutation({
    mutationFn: (versionId: string) =>
      apiClient.agents.restorePromptVersion(agentId, versionId),
    successMessage: (_, versionId) => {
      const v = versions.find((x) => x.id === versionId)
      return v ? `v${v.version} ${MSG.promptVersion.rolledBack}` : MSG.promptVersion.rolledBack
    },
    onSuccess: () => onClose(),
  })

  const handleRestore = useCallback(async (versionId: string) => {
    if (!versionId) return
    const version = versions.find(v => v.id === versionId)
    if (!version) return
    const ok = await confirm({
      title: '버전 복원',
      message: `v${version.version} 버전으로 복원할까요?`,
      confirmText: '복원',
    })
    if (!ok) return
    await restoreMutation.mutate(versionId)
  }, [versions, confirm, restoreMutation])

  if (!isOpen) return null

  const selectedA = versions.find(v => v.id === versionA)
  const selectedB = versions.find(v => v.id === versionB)
  const diffLines = selectedA && selectedB
    ? computeDiff(selectedA.systemPrompt, selectedB.systemPrompt)
    : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-bold text-[var(--color-fg)]">Prompt Diff 비교</h2>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-fg-subtle)]" />}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 버전 선택 영역 */}
        <div className="flex items-end gap-3 border-b border-[var(--color-border)] px-5 py-3">
          <VersionSelect
            versions={versions}
            value={versionA}
            onChange={setVersionA}
            label="비교 대상 A (이전)"
          />
          <div className="mb-1 shrink-0 text-xs text-[var(--color-fg-subtle)]">vs</div>
          <VersionSelect
            versions={versions}
            value={versionB}
            onChange={setVersionB}
            label="비교 대상 B (이후)"
          />
        </div>

        {/* Diff 뷰 */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-xs text-[var(--color-fg-subtle)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              버전 목록 로딩 중...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--color-fg-subtle)]">
              <p className="text-xs">저장된 프롬프트 버전이 없습니다</p>
            </div>
          ) : (
            <>
              {/* 범례 */}
              {diffLines.length > 0 && (
                <div className="mb-3 flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-green-500/20 border border-green-500/30" />
                    <span className="text-green-400">추가됨 (B에만 있음)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-red-500/20 border border-red-500/30" />
                    <span className="text-red-400">삭제됨 (A에만 있음)</span>
                  </span>
                </div>
              )}
              <DiffView lines={diffLines} />
            </>
          )}
        </div>

        {/* 복원 버튼 영역 */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            {selectedA && (
              <button
                onClick={() => handleRestore(versionA)}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-40"
              >
                {restoreMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />
                }
                v{selectedA.version}로 복원
              </button>
            )}
            {selectedB && selectedB.id !== selectedA?.id && (
              <button
                onClick={() => handleRestore(versionB)}
                disabled={restoreMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-40"
              >
                {restoreMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RotateCcw className="h-3.5 w-3.5" />
                }
                v{selectedB.version}로 복원
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-[var(--color-surface-2)] px-4 py-1.5 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

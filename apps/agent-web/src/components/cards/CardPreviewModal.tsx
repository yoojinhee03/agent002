'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Eye, X, Pencil, Loader2 } from 'lucide-react'
import { apiClient, type CardDefinition } from '@/lib/api-client'
import { HitlCardRenderer } from '@/components/dynamic-cards/HitlCardRenderer'
import { cn } from '@/lib/utils'

type EditMode = 'none' | 'direct' | 'nl'

const STATE_PILLS: Array<{ id: EditMode; label: string; hint: string }> = [
  { id: 'none', label: '일반', hint: '기본 상태 — 인자 표시 + 4버튼' },
  { id: 'direct', label: '직접 수정', hint: 'directEdit 버튼 누른 상태 — 인자 폼 노출' },
  { id: 'nl', label: '자연어 수정', hint: 'nlEdit 버튼 누른 상태 — NL 입력 노출' },
]

interface Props {
  cardId: string | null
  onClose: () => void
}

export function CardPreviewModal({ cardId, onClose }: Props) {
  const [def, setDef] = useState<CardDefinition | null>(null)
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState<EditMode>('none')

  useEffect(() => {
    if (!cardId) {
      setDef(null)
      setEditMode('none')
      return
    }
    let cancelled = false
    setLoading(true)
    apiClient.cards
      .getLatest(cardId)
      .then((row) => {
        if (!cancelled) setDef(row)
      })
      .catch((err) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : '카드 정의 조회 실패')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [cardId])

  if (!cardId) return null

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-blue-300" />
            <h2 className="text-sm font-semibold text-fg">카드 미리보기</h2>
            {def && (
              <>
                <span className="font-mono text-[11px] text-blue-300">{def.cardId}</span>
                <span className="rounded border border-border bg-bg/40 px-1.5 py-0.5 text-[10px] text-fg-subtle">
                  v{def.version}
                </span>
                <span className="text-[11px] text-fg-muted">{def.name}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={`/cards/builder/${encodeURIComponent(cardId)}`}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
            >
              <Pencil className="h-3 w-3" />
              편집으로 열기
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-fg-muted hover:bg-bg/40 hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 border-b border-border bg-bg/40 px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-fg-subtle">상태 미리보기</span>
          {STATE_PILLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setEditMode(p.id)}
              title={p.hint}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
                editMode === p.id
                  ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                  : 'border-border bg-[var(--color-surface-2)] text-fg-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)] px-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-fg-subtle">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : def ? (
            <HitlCardRenderer
              payload={def.payload as Record<string, unknown>}
              sampleData={def.sampleData as Record<string, unknown>}
              layout={def.layout}
              argSchema={
                Array.isArray(def.argSchema)
                  ? (def.argSchema as never)
                  : null
              }
              mode="preview"
              editMode={editMode}
              setEditMode={setEditMode}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

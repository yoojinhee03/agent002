'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Layers, Loader2, Eye, Pencil, Copy, ChevronDown, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { CardDefinition } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { CardPreviewModal } from '@/components/cards/CardPreviewModal'
import { PresetPicker } from '@/components/cards-builder/PresetPicker'
import { useUserStore } from '@/stores/use-user-store'

interface CardGroup {
  cardId: string
  latest: CardDefinition
  versions: CardDefinition[]
}

function groupByCardId(rows: CardDefinition[]): CardGroup[] {
  const map = new Map<string, CardDefinition[]>()
  for (const row of rows) {
    if (!map.has(row.cardId)) map.set(row.cardId, [])
    map.get(row.cardId)!.push(row)
  }
  const groups: CardGroup[] = []
  for (const [cardId, list] of map) {
    list.sort((a, b) => b.version - a.version)
    groups.push({ cardId, latest: list[0], versions: list })
  }
  groups.sort((a, b) => a.cardId.localeCompare(b.cardId))
  return groups
}

const GALLERY_COLLAPSED_KEY = 'cards-page:gallery-collapsed'

function sanitizeCardId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function CardsPage() {
  const router = useRouter()
  const projectId = useUserStore((s) => s.activeProjectId)
  const [groups, setGroups] = useState<CardGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [galleryCollapsed, setGalleryCollapsed] = useState(false)
  const [cloneSource, setCloneSource] = useState<CardDefinition | null>(null)
  const [cloneTargetId, setCloneTargetId] = useState('')
  const [previewCardId, setPreviewCardId] = useState<string | null>(null)
  const [showPresetPicker, setShowPresetPicker] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setGalleryCollapsed(window.localStorage.getItem(GALLERY_COLLAPSED_KEY) === '1')
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await apiClient.cards.list()
        if (!cancelled) setGroups(groupByCardId(rows))
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '카드 정의 조회 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleGallery = () => {
    setGalleryCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(GALLERY_COLLAPSED_KEY, next ? '1' : '0')
      }
      return next
    })
  }

  const filtered = groups.filter((g) =>
    filter
      ? g.cardId.toLowerCase().includes(filter.toLowerCase()) ||
        g.latest.name.toLowerCase().includes(filter.toLowerCase())
      : true,
  )

  const templates = useMemo(() => groups.slice(0, 12), [groups])

  const existingIds = useMemo(() => new Set(groups.map((g) => g.cardId)), [groups])

  const openClone = (src: CardDefinition) => {
    setCloneSource(src)
    setCloneTargetId(`${src.cardId}-copy`)
  }

  const submitClone = () => {
    if (!cloneSource) return
    const next = sanitizeCardId(cloneTargetId)
    if (!next) {
      toast.error('새 cardId 를 입력하세요')
      return
    }
    if (existingIds.has(next)) {
      toast.error('이미 존재하는 cardId 입니다')
      return
    }
    router.push(
      `/cards/builder/new?cloneFrom=${encodeURIComponent(cloneSource.cardId)}&cloneVersion=${cloneSource.version}&newCardId=${encodeURIComponent(next)}`,
    )
    setCloneSource(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-fg">Card Definitions</h1>
          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-300">
            {groups.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowPresetPicker(true)}
          className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          <Plus className="h-4 w-4" />
          새 카드
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {templates.length > 0 && (
          <div className="mb-5 rounded border border-border bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={toggleGallery}
              className="flex w-full items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs font-medium text-fg-muted hover:text-fg"
            >
              {galleryCollapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
              템플릿 갤러리
              <span className="text-fg-subtle">— 이 카드들을 복제해 빠르게 시작하세요</span>
              <span className="ml-auto text-[10px] text-fg-subtle">{templates.length}</span>
            </button>
            {!galleryCollapsed && (
              <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 lg:grid-cols-4">
                {templates.map((g) => (
                  <div
                    key={g.cardId}
                    className="flex flex-col rounded border border-border bg-[var(--color-surface-2)] p-3 hover:border-purple-400/40"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-fg">{g.latest.name}</span>
                      <span className="shrink-0 rounded border border-border bg-bg/40 px-1 py-0.5 text-[9px] text-fg-subtle">
                        v{g.latest.version}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="truncate font-mono text-[10px] text-blue-300">{g.cardId}</span>
                    </div>
                    <div className="mt-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openClone(g.latest)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-purple-600/20 px-2 py-1 text-[10px] text-purple-200 hover:bg-purple-600/30"
                      >
                        <Copy className="h-3 w-3" />
                        이 템플릿으로 시작
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewCardId(g.cardId)}
                        className="inline-flex items-center justify-center rounded border border-border px-1.5 py-1 text-[10px] text-fg-muted hover:text-fg"
                      >
                        <Eye className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-3">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="cardId 또는 이름 검색..."
            className="w-full max-w-sm rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-blue-400/60"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-fg-subtle">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-fg-subtle">
            {filter ? '검색 결과 없음' : '카드 정의가 없습니다. 새 카드를 만들어보세요.'}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="border-b border-border text-fg-subtle">
              <tr>
                <th className="px-2 py-2 text-left font-medium">cardId</th>
                <th className="px-2 py-2 text-left font-medium">이름</th>
                <th className="px-2 py-2 text-left font-medium">최신</th>
                <th className="px-2 py-2 text-left font-medium">버전 수</th>
                <th className="px-2 py-2 text-left font-medium">수정일</th>
                <th className="px-2 py-2 text-right font-medium">액션</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.cardId} className="border-b border-border/40 hover:bg-bg/40">
                  <td className="px-2 py-2 font-mono text-blue-300">{g.cardId}</td>
                  <td className="px-2 py-2 text-fg">{g.latest.name}</td>
                  <td className="px-2 py-2 text-fg-muted">v{g.latest.version}</td>
                  <td className="px-2 py-2 text-fg-subtle">{g.versions.length}</td>
                  <td className="px-2 py-2 text-fg-subtle">
                    {new Date(g.latest.updatedAt).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Link
                        href={`/cards/builder/${encodeURIComponent(g.cardId)}`}
                        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
                      >
                        <Pencil className="h-3 w-3" />
                        편집
                      </Link>
                      <button
                        type="button"
                        onClick={() => openClone(g.latest)}
                        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:border-purple-400/40 hover:text-fg"
                      >
                        <Copy className="h-3 w-3" />
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewCardId(g.cardId)}
                        className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
                      >
                        <Eye className="h-3 w-3" />
                        미리보기
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CardPreviewModal cardId={previewCardId} onClose={() => setPreviewCardId(null)} />

      <PresetPicker
        open={showPresetPicker}
        projectId={projectId}
        onClose={() => setShowPresetPicker(false)}
        onSelect={(result) => {
          setShowPresetPicker(false)
          const params = new URLSearchParams({ preset: result.preset.id })
          if (result.toolKey) params.set('fromTool', result.toolKey)
          router.push(`/cards/builder/new?${params.toString()}`)
        }}
      />

      {cloneSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setCloneSource(null)}
        >
          <div
            className="w-full max-w-md rounded border border-border bg-[var(--color-surface)] p-4 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-fg">카드 복제</div>
              <button
                type="button"
                onClick={() => setCloneSource(null)}
                className="rounded p-1 text-fg-muted hover:bg-bg/40 hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3 text-[11px] text-fg-subtle">
              원본:{' '}
              <span className="font-mono text-blue-300">
                {cloneSource.cardId}@v{cloneSource.version}
              </span>
            </div>
            <label className="mb-1 block text-[11px] text-fg-muted">새 cardId</label>
            <input
              type="text"
              autoFocus
              value={cloneTargetId}
              onChange={(e) => setCloneTargetId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitClone()
              }}
              placeholder="my-new-card"
              className="mb-3 w-full rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs text-blue-300 outline-none focus:border-blue-400/60"
            />
            <div className="mb-3 text-[10px] text-fg-subtle">
              사용 가능 문자: 소문자/숫자/하이픈/언더스코어. 자동 정규화됩니다 →{' '}
              <span className="font-mono text-fg-muted">{sanitizeCardId(cloneTargetId) || '(비어 있음)'}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCloneSource(null)}
                className="rounded border border-border px-2 py-1 text-xs text-fg-muted hover:text-fg"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitClone}
                className="inline-flex items-center gap-1 rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500"
              >
                <Copy className="h-3 w-3" />
                복제하고 빌더 열기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

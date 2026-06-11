'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileCode2,
  FileText,
  GitCompare,
  Loader2,
  Maximize2,
  Pencil,
  Send,
  Wrench,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeLineDiff } from '@/lib/diff-utils'
import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'
import type { SkillEditPayload } from '@/stores/use-skill-assistant-store'
import { SkillPayloadDetailModal } from '@/components/skills/assistant/SkillPayloadDetailModal'

export interface SkillEditCurrent {
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  files: { path: string; content: string }[]
}

interface SkillEditCardProps {
  current: SkillEditCurrent
  payload: SkillEditPayload
  applied?: boolean
  canceled?: boolean
  onApply: (payload: SkillEditPayload) => Promise<void> | void
  onCancel?: () => void
}

type Tab = 'summary' | 'instructions' | 'tools' | 'files'
type DiffLine = { type: 'unchanged' | 'added' | 'removed'; content: string }

function MultilineDiff({ before, after }: { before: string; after: string }) {
  const lines = useMemo<DiffLine[]>(
    () => computeLineDiff(before || '', after || '') as DiffLine[],
    [before, after],
  )
  return (
    <pre className="rounded border border-border bg-bg p-1.5 text-[11px] leading-relaxed">
      {lines.map((line, idx) => (
        <div
          key={idx}
          className={cn(
            'whitespace-pre-wrap break-words px-1',
            line.type === 'added' && 'bg-emerald-500/10 text-emerald-300',
            line.type === 'removed' && 'bg-red-500/10 text-red-300',
            line.type === 'unchanged' && 'text-fg-subtle',
          )}
        >
          <span className="mr-1 select-none opacity-60">
            {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
          </span>
          {line.content || ' '}
        </div>
      ))}
    </pre>
  )
}

export function SkillEditCard({
  current,
  payload,
  applied: appliedProp,
  canceled: canceledProp,
  onApply,
  onCancel,
}: SkillEditCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  // 변경점(diff) ↔ 현재(병합 후 전체) 토글. 기본은 변경점.
  const [showDiff, setShowDiff] = useState(true)
  const isStreaming = useSkillAssistantStore((s) => s.isStreaming)
  const sendMessage = useSkillAssistantStore((s) => s.sendMessage)
  const applied = appliedProp ?? false
  const canceled = canceledProp ?? false

  const prevPayloadRef = useRef(payload)
  useEffect(() => {
    if (prevPayloadRef.current !== payload) {
      setRefining(false)
      setExpanded(true)
      prevPayloadRef.current = payload
    }
  }, [payload])

  useEffect(() => {
    if (!isStreaming && refining) {
      const t = setTimeout(() => setRefining(false), 200)
      return () => clearTimeout(t)
    }
  }, [isStreaming, refining])

  // 적용/취소되면 자동 축소.
  useEffect(() => {
    if (appliedProp || canceledProp) setExpanded(false)
  }, [appliedProp, canceledProp])

  const handleRefine = async () => {
    const text = refineText.trim()
    if (!text || isStreaming) return
    setRefineText('')
    setRefining(true)
    await sendMessage(text)
  }

  const handleApply = async () => {
    if (applied) return
    setSubmitting(true)
    try {
      await onApply(payload)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    onCancel?.()
  }

  const addedTools = useMemo(() => {
    if (payload.allowedTools === undefined) return []
    const cur = new Set(current.allowedTools)
    return payload.allowedTools.filter((t) => !cur.has(t))
  }, [payload.allowedTools, current.allowedTools])

  const removedTools = useMemo(() => {
    if (payload.allowedTools === undefined) return []
    const next = new Set(payload.allowedTools)
    return current.allowedTools.filter((t) => !next.has(t))
  }, [payload.allowedTools, current.allowedTools])

  const changedFields = useMemo<string[]>(() => {
    const out: string[] = []
    if (payload.name !== undefined && payload.name !== current.name) out.push('이름')
    if (payload.description !== undefined && payload.description !== current.description) out.push('설명')
    if (payload.instructions !== undefined && payload.instructions !== current.instructions)
      out.push('Instructions')
    if (addedTools.length > 0 || removedTools.length > 0) out.push('도구')
    if ((payload.addFiles?.length ?? 0) > 0) out.push(`파일+${payload.addFiles!.length}`)
    if ((payload.removeFilePaths?.length ?? 0) > 0)
      out.push(`파일-${payload.removeFilePaths!.length}`)
    return out
  }, [payload, current, addedTools, removedTools])

  const hasNoChange = changedFields.length === 0
  const showLoading = refining || (isStreaming && !applied && !canceled)
  const isFinal = applied || canceled

  // 병합 결과(현재 ⊕ patch) — '현재' 보기 모드에 사용.
  const mergedName = payload.name ?? current.name
  const mergedDescription = payload.description ?? current.description
  const mergedInstructions = payload.instructions ?? current.instructions
  const mergedTools = payload.allowedTools ?? current.allowedTools
  const removeSet = new Set(payload.removeFilePaths ?? [])
  const addList = payload.addFiles ?? []
  const mergedFiles = [
    ...current.files.filter((f) => !removeSet.has(f.path)),
    ...addList,
  ]

  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-2xl border text-xs text-fg shadow-lg',
        applied
          ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5'
          : canceled
            ? 'border-red-500/40 bg-gradient-to-b from-red-500/10 to-bg/40 grayscale-[40%]'
            : 'border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-amber-500/5',
      )}
    >
      {(applied || canceled) && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-1',
            applied ? 'bg-emerald-500' : 'bg-red-500/60',
          )}
        />
      )}
      {canceled && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.04) 0 6px, transparent 6px 14px)',
          }}
        />
      )}
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <div
          className={cn(
            'flex items-center gap-1.5',
            applied ? 'text-emerald-300' : canceled ? 'text-fg-subtle' : 'text-amber-300',
          )}
        >
          {applied ? (
            <Check className="h-4 w-4" />
          ) : canceled ? (
            <Pencil className="h-4 w-4 opacity-50" />
          ) : (
            <Pencil className="h-4 w-4" />
          )}
          <span
            className={cn(
              'text-sm font-semibold',
              canceled && 'line-through decoration-red-400/60',
            )}
          >
            {applied ? '적용 완료된 수정' : canceled ? '취소된 수정 제안' : '스킬 수정 제안'}
          </span>
          <span className="text-fg-muted">— {current.name}</span>
        </div>
        {showLoading && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[10px] font-medium text-amber-100">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            개선 반영 중…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {applied && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
              <Check className="h-2.5 w-2.5" />
              적용됨
            </span>
          )}
          {canceled && (
            <span className="flex items-center gap-1 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-fg-subtle">
              <XCircle className="h-2.5 w-2.5" />
              취소됨
            </span>
          )}
          <button
            onClick={() => setShowDiff((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors',
              showDiff
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-border bg-bg text-fg-muted hover:border-emerald-400/40 hover:text-fg',
            )}
            title={showDiff ? '병합 후 현재 내용 보기' : '변경점만 보기'}
          >
            <GitCompare className="h-3 w-3" />
            {showDiff ? '변경점' : '현재'}
          </button>
          <button
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted hover:border-amber-400/40 hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" />
            전체 보기
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-border bg-bg p-1 text-fg-muted hover:border-amber-400/40 hover:text-fg"
            aria-label={expanded ? '접기' : '펼치기'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* 상단 요약 영역 */}
      <div className="shrink-0 border-b border-border/60 bg-bg/40 px-3 py-2.5">
        {payload.changeSummary ? (
          <p className="line-clamp-2 text-[11px] text-fg-muted">{payload.changeSummary}</p>
        ) : (
          <p className="text-[11px] text-fg-subtle">변경 사항 요약 없음 — 전체 보기 참고.</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {hasNoChange && <span className="text-[10px] text-fg-subtle">변경 없음</span>}
          {changedFields.map((field) => (
            <span
              key={field}
              className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-100"
            >
              {field}
            </span>
          ))}
        </div>
      </div>

      {/* 탭 + 본문 */}
      {expanded && (
        <>
          <div className="flex shrink-0 gap-1 border-b border-border/60 bg-bg/30 px-2 py-1">
            <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<Pencil className="h-3 w-3" />}>
              요약
            </TabButton>
            <TabButton active={tab === 'instructions'} onClick={() => setTab('instructions')} icon={<FileText className="h-3 w-3" />}>
              Instructions
            </TabButton>
            <TabButton active={tab === 'tools'} onClick={() => setTab('tools')} icon={<Wrench className="h-3 w-3" />}>
              도구
            </TabButton>
            <TabButton active={tab === 'files'} onClick={() => setTab('files')} icon={<FileCode2 className="h-3 w-3" />}>
              파일
            </TabButton>
          </div>

          <div className="max-h-[220px] min-h-[100px] overflow-y-auto bg-bg px-3 py-2.5 custom-scrollbar">
            {tab === 'summary' && (
              <div className="space-y-2">
                {showDiff ? (
                  <>
                    {payload.name !== undefined && payload.name !== current.name && (
                      <DiffRow label="이름" before={current.name} after={payload.name} />
                    )}
                    {payload.description !== undefined && payload.description !== current.description && (
                      <DiffRow label="설명" before={current.description} after={payload.description} multi />
                    )}
                    {hasNoChange && (
                      <p className="text-[11px] text-fg-subtle">변경 사항 없음.</p>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">이름</div>
                      <div className="font-mono text-sm text-fg">{mergedName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">설명</div>
                      <p className="whitespace-pre-wrap break-words text-[11px] text-fg-muted">
                        {mergedDescription || '(없음)'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === 'instructions' && (
              showDiff ? (
                payload.instructions !== undefined && payload.instructions !== current.instructions ? (
                  <MultilineDiff before={current.instructions} after={payload.instructions} />
                ) : (
                  <p className="text-[11px] text-fg-subtle">Instructions 변경 없음.</p>
                )
              ) : (
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fg-subtle">
                  {mergedInstructions || '(없음)'}
                </pre>
              )
            )}

            {tab === 'tools' && (
              showDiff ? (
                addedTools.length === 0 && removedTools.length === 0 ? (
                  <p className="text-[11px] text-fg-subtle">도구 변경 없음.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {removedTools.map((t) => (
                      <span
                        key={`r-${t}`}
                        className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300 line-through decoration-red-400/60"
                      >
                        − {t}
                      </span>
                    ))}
                    {addedTools.map((t) => (
                      <span
                        key={`a-${t}`}
                        className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300"
                      >
                        + {t}
                      </span>
                    ))}
                  </div>
                )
              ) : (
                <div>
                  {mergedTools.length === 0 ? (
                    <p className="text-[11px] text-fg-subtle">(허용 도구 없음)</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {mergedTools.map((t) => (
                        <span
                          key={`m-${t}`}
                          className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {tab === 'files' && (
              showDiff ? (
                <div className="space-y-1.5">
                  {(payload.addFiles?.length ?? 0) === 0 &&
                  (payload.removeFilePaths?.length ?? 0) === 0 ? (
                    <p className="text-[11px] text-fg-subtle">파일 변경 없음.</p>
                  ) : (
                    <>
                      {payload.addFiles?.map((f) => (
                        <div
                          key={`add-${f.path}`}
                          className="rounded bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-300"
                        >
                          + {f.path}{' '}
                          <span className="text-[10px] text-fg-subtle">({f.content.length}자)</span>
                        </div>
                      ))}
                      {payload.removeFilePaths?.map((p) => (
                        <div
                          key={`rm-${p}`}
                          className="rounded bg-red-500/10 px-2 py-1 font-mono text-[11px] text-red-300 line-through decoration-red-400/60"
                        >
                          − {p}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  {mergedFiles.length === 0 ? (
                    <p className="text-[11px] text-fg-subtle">(파일 없음)</p>
                  ) : (
                    mergedFiles.map((f) => (
                      <div
                        key={`mf-${f.path}`}
                        className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 font-mono text-[11px] text-fg-muted"
                      >
                        {f.path}{' '}
                        <span className="text-[10px] text-fg-subtle">({f.content.length}자)</span>
                      </div>
                    ))
                  )}
                </div>
              )
            )}
          </div>
        </>
      )}

      {/* 하단 액션 — 항상 노출 (적용·취소 후에도 히스토리 보존) */}
      <div className="shrink-0 border-t border-border/60 bg-bg/30 px-3 py-2">
        {!isFinal ? (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-border bg-[var(--color-surface-2)] px-2.5 py-1">
              <input
                type="text"
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    void handleRefine()
                  }
                }}
                placeholder="개선할 점 (예: 도구 Y 도 추가)"
                disabled={isStreaming || submitting}
                className="flex-1 bg-transparent text-xs text-fg placeholder:text-fg-subtle outline-none"
              />
              <button
                onClick={() => void handleRefine()}
                disabled={isStreaming || submitting || !refineText.trim()}
                aria-label="개선 요청 보내기"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="shrink-0 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-amber-400/40 hover:text-fg disabled:opacity-60"
            >
              취소
            </button>
            <button
              onClick={() => void handleApply()}
              disabled={submitting || hasNoChange || isStreaming}
              className="shrink-0 rounded bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:opacity-60"
            >
              {submitting ? '적용…' : '적용'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-fg-subtle">
              {applied ? '이 수정은 적용되었습니다.' : '이 수정 제안은 취소되었습니다.'}
            </span>
            <div className="flex gap-2">
              <button
                disabled
                className="rounded border border-border bg-bg px-2 py-1 text-xs text-fg-subtle opacity-70 cursor-default"
              >
                {canceled ? '취소됨' : '취소'}
              </button>
              <button
                disabled
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium opacity-80 cursor-default',
                  applied
                    ? 'bg-emerald-600 text-white'
                    : 'bg-bg text-fg-subtle border border-border',
                )}
              >
                {applied ? '적용 완료' : '적용'}
              </button>
            </div>
          </div>
        )}
      </div>

      <SkillPayloadDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        payload={{ kind: 'edit', current, patch: payload }}
        applied={applied}
        canceled={canceled}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
        active
          ? 'bg-amber-500/20 text-amber-100'
          : 'text-fg-muted hover:bg-[var(--color-surface-2)] hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function DiffRow({
  label,
  before,
  after,
  multi,
}: {
  label: string
  before: string
  after: string
  multi?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-amber-200">{label}</div>
      <div className="mt-0.5 space-y-0.5">
        <div
          className={cn(
            'rounded bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-300 line-through decoration-red-400/60',
            multi && 'whitespace-pre-wrap break-words',
          )}
        >
          {before || '(없음)'}
        </div>
        <div
          className={cn(
            'rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-300',
            multi && 'whitespace-pre-wrap break-words',
          )}
        >
          {after}
        </div>
      </div>
    </div>
  )
}

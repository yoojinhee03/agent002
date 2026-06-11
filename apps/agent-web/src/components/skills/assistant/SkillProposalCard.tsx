'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileCode2,
  FileText,
  GitCompare,
  Loader2,
  Maximize2,
  Send,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeLineDiff } from '@/lib/diff-utils'
import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'
import type { SkillProposalPayload } from '@/stores/use-skill-assistant-store'
import { SkillPayloadDetailModal } from '@/components/skills/assistant/SkillPayloadDetailModal'

type DiffLine = { type: 'unchanged' | 'added' | 'removed'; content: string }

interface SkillProposalCardProps {
  payload: SkillProposalPayload
  /** 직전 제안 — 개선 요청 결과로 다듬어진 경우 diff 렌더 표시. */
  previousPayload?: SkillProposalPayload
  /** 메시지 내 카드의 적용 상태 — props 로 받아 store 의 pending 플래그와 독립 동작. */
  applied?: boolean
  canceled?: boolean
  onApply: (payload: SkillProposalPayload) => Promise<void> | void
  onCancel?: () => void
}

type Tab = 'summary' | 'instructions' | 'tools' | 'files'

export function SkillProposalCard({
  payload,
  previousPayload,
  applied: appliedProp,
  canceled: canceledProp,
  onApply,
  onCancel,
}: SkillProposalCardProps) {
  const [submitting, setSubmitting] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [refineText, setRefineText] = useState('')
  const [refining, setRefining] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({})
  const [showDiff, setShowDiff] = useState(true) // diff 가 있으면 기본 표시
  const isStreaming = useSkillAssistantStore((s) => s.isStreaming)
  const sendMessage = useSkillAssistantStore((s) => s.sendMessage)
  const applied = appliedProp ?? false
  const canceled = canceledProp ?? false
  const hasDiff = !!previousPayload

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

  const showLoading = refining || (isStreaming && !applied && !canceled)
  const isFinal = applied || canceled

  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-2xl border text-xs text-fg shadow-lg',
        applied
          ? 'border-emerald-500/50 bg-gradient-to-b from-emerald-500/15 to-emerald-500/5'
          : canceled
            ? 'border-red-500/40 bg-gradient-to-b from-red-500/10 to-bg/40 grayscale-[40%]'
            : 'border-blue-500/40 bg-gradient-to-b from-blue-500/10 to-blue-500/5',
      )}
    >
      {/* 좌측 상태 인디케이터 막대 */}
      {(applied || canceled) && (
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-1',
            applied ? 'bg-emerald-500' : 'bg-red-500/60',
          )}
        />
      )}
      {/* 취소된 상태는 대각선 패턴 오버레이로 비활성 느낌 표현 */}
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
            applied ? 'text-emerald-300' : canceled ? 'text-fg-subtle' : 'text-blue-300',
          )}
        >
          {applied ? (
            <Check className="h-4 w-4" />
          ) : canceled ? (
            <Sparkles className="h-4 w-4 opacity-50" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span
            className={cn(
              'text-sm font-semibold',
              canceled && 'line-through decoration-red-400/60',
            )}
          >
            {applied ? '적용 완료된 스킬' : canceled ? '취소된 스킬 제안' : '새 스킬 제안'}
          </span>
        </div>
        {showLoading && (
          <span className="flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-blue-100">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            개선 반영 중…
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* 적용/취소 상태 컴팩트 배지 — 헤더 우측 */}
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
          {/* diff 보기 토글 — 개선 요청으로 다듬어진 경우에만 노출 */}
          {hasDiff && (
            <button
              onClick={() => setShowDiff((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors',
                showDiff
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-border bg-bg text-fg-muted hover:border-emerald-400/40 hover:text-fg',
              )}
              title={showDiff ? '현재 내용 보기' : '직전 제안 대비 변경점 보기'}
            >
              <GitCompare className="h-3 w-3" />
              {showDiff ? '변경점' : '현재'}
            </button>
          )}
          {/* 전체 보기 — 모달 오픈 (아이콘 고정) */}
          <button
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" />
            전체 보기
          </button>
          {/* 인라인 펼치기/접기 */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-border bg-bg p-1 text-fg-muted hover:border-blue-400/40 hover:text-fg"
            aria-label={expanded ? '접기' : '펼치기'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* 상단 요약 영역 — 항상 노출 */}
      <div className="shrink-0 border-b border-border/60 bg-bg/40 px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-base font-bold text-fg">{payload.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-fg-subtle">
            도구 {payload.allowedTools.length} · 파일 {payload.files.length}
          </span>
        </div>
        {payload.description && (
          <p className="mt-1 line-clamp-2 text-[11px] text-fg-muted">{payload.description}</p>
        )}
      </div>

      {/* 탭 + 본문 — expanded 일 때만 */}
      {expanded && (
        <>
          <div className="flex shrink-0 gap-1 border-b border-border/60 bg-bg/30 px-2 py-1">
            <TabButton active={tab === 'summary'} onClick={() => setTab('summary')} icon={<Sparkles className="h-3 w-3" />}>
              요약
            </TabButton>
            <TabButton active={tab === 'instructions'} onClick={() => setTab('instructions')} icon={<FileText className="h-3 w-3" />}>
              Instructions
            </TabButton>
            <TabButton active={tab === 'tools'} onClick={() => setTab('tools')} icon={<Wrench className="h-3 w-3" />}>
              도구 ({payload.allowedTools.length})
            </TabButton>
            <TabButton active={tab === 'files'} onClick={() => setTab('files')} icon={<FileCode2 className="h-3 w-3" />}>
              파일 ({payload.files.length})
            </TabButton>
          </div>

          <div className="max-h-[220px] min-h-[120px] overflow-y-auto bg-bg px-3 py-2.5 custom-scrollbar">
            {tab === 'summary' && (
              <div className="space-y-2">
                {hasDiff && showDiff && previousPayload ? (
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[11px] text-emerald-200">
                    <div className="font-semibold">개선 요청 반영 — 변경 요약</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-fg-muted">
                      {previousPayload.name !== payload.name && (
                        <li>이름: <span className="line-through text-red-300">{previousPayload.name}</span> → <span className="text-emerald-300">{payload.name}</span></li>
                      )}
                      {previousPayload.description !== payload.description && (
                        <li>설명 수정됨</li>
                      )}
                      {previousPayload.instructions !== payload.instructions && (
                        <li>Instructions 변경됨 — 탭에서 확인</li>
                      )}
                      {(() => {
                        const prev = new Set(previousPayload.allowedTools)
                        const next = new Set(payload.allowedTools)
                        const added = payload.allowedTools.filter((t) => !prev.has(t))
                        const removed = previousPayload.allowedTools.filter((t) => !next.has(t))
                        if (added.length === 0 && removed.length === 0) return null
                        return (
                          <li>
                            도구: {removed.length > 0 && <span className="text-red-300">−{removed.length}</span>} {added.length > 0 && <span className="text-emerald-300">+{added.length}</span>}
                          </li>
                        )
                      })()}
                      {(() => {
                        const prevP = new Set(previousPayload.files.map((f) => f.path))
                        const nextP = new Set(payload.files.map((f) => f.path))
                        const added = payload.files.filter((f) => !prevP.has(f.path)).length
                        const removed = previousPayload.files.filter((f) => !nextP.has(f.path)).length
                        if (added === 0 && removed === 0) return null
                        return (
                          <li>
                            파일: {removed > 0 && <span className="text-red-300">−{removed}</span>} {added > 0 && <span className="text-emerald-300">+{added}</span>}
                          </li>
                        )
                      })()}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-subtle">이름</div>
                  <div className="font-mono text-sm text-fg">{payload.name}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-subtle">설명</div>
                  <p className="whitespace-pre-wrap break-words text-[11px] text-fg-muted">
                    {payload.description || '(없음)'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="허용 도구" value={`${payload.allowedTools.length}개`} />
                  <Stat label="포함 파일" value={`${payload.files.length}개`} />
                </div>
              </div>
            )}

            {tab === 'instructions' && (
              hasDiff && showDiff && previousPayload ? (
                <InstructionsDiff
                  before={previousPayload.instructions || ''}
                  after={payload.instructions || ''}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-fg-subtle">
                  {payload.instructions || '(없음)'}
                </pre>
              )
            )}

            {tab === 'tools' && (
              hasDiff && showDiff && previousPayload ? (
                <ToolsDiff before={previousPayload.allowedTools} after={payload.allowedTools} />
              ) : (
                <div>
                  {payload.allowedTools.length === 0 ? (
                    <p className="text-[11px] text-fg-subtle">(허용 도구 없음)</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {payload.allowedTools.map((tool) => (
                        <span
                          key={tool}
                          className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-200"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}

            {tab === 'files' && hasDiff && showDiff && previousPayload && (
              <FilesDiff before={previousPayload.files} after={payload.files} />
            )}

            {tab === 'files' && !(hasDiff && showDiff && previousPayload) && (
              <div className="space-y-1.5">
                {payload.files.length === 0 ? (
                  <p className="text-[11px] text-fg-subtle">(포함 파일 없음)</p>
                ) : (
                  payload.files.map((f) => {
                    const open = !!openFiles[f.path]
                    return (
                      <div key={f.path} className="rounded border border-border bg-[var(--color-surface-2)]">
                        <button
                          onClick={() => setOpenFiles((s) => ({ ...s, [f.path]: !open }))}
                          className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-fg-muted hover:text-fg"
                        >
                          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <FileCode2 className="h-3 w-3 text-blue-300" />
                          <span className="truncate font-mono">{f.path}</span>
                          <span className="ml-auto text-[10px] text-fg-subtle">{f.content.length}자</span>
                        </button>
                        {open && (
                          <pre className="max-h-44 overflow-y-auto border-t border-border bg-bg px-2 py-1.5 text-[11px] text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                            {f.content}
                          </pre>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
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
                placeholder="개선할 점 (예: 도구 X 추가, 검증 단계 보강)"
                disabled={isStreaming || submitting}
                className="flex-1 bg-transparent text-xs text-fg placeholder:text-fg-subtle outline-none"
              />
              <button
                onClick={() => void handleRefine()}
                disabled={isStreaming || submitting || !refineText.trim()}
                aria-label="개선 요청 보내기"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
              >
                <Send className="h-3 w-3" />
              </button>
            </div>
            <button
              onClick={handleCancel}
              disabled={submitting}
              className="shrink-0 rounded border border-border px-2 py-1 text-xs text-fg-muted hover:border-blue-400/40 hover:text-fg disabled:opacity-60"
            >
              취소
            </button>
            <button
              onClick={() => void handleApply()}
              disabled={submitting || isStreaming}
              className="shrink-0 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {submitting ? '생성…' : '생성'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-fg-subtle">
              {applied ? '이 제안은 적용되었습니다.' : '이 제안은 취소되었습니다.'}
            </span>
            <div className="flex gap-2">
              <button
                disabled
                className={cn(
                  'rounded px-2 py-1 text-xs text-fg-subtle',
                  'border border-border bg-bg opacity-70 cursor-default',
                )}
              >
                {canceled ? '취소됨' : '취소'}
              </button>
              <button
                disabled
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium opacity-80 cursor-default',
                  applied ? 'bg-emerald-600 text-white' : 'bg-bg text-fg-subtle border border-border',
                )}
              >
                {applied ? '적용 완료' : '생성'}
              </button>
            </div>
          </div>
        )}
      </div>

      <SkillPayloadDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        payload={{ kind: 'create', ...payload, previous: previousPayload }}
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
          ? 'bg-blue-500/20 text-blue-100'
          : 'text-fg-muted hover:bg-[var(--color-surface-2)] hover:text-fg',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="text-sm font-bold text-fg">{value}</div>
    </div>
  )
}

function InstructionsDiff({ before, after }: { before: string; after: string }) {
  const lines = computeLineDiff(before, after) as DiffLine[]
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

function ToolsDiff({ before, after }: { before: string[]; after: string[] }) {
  const prev = new Set(before)
  const next = new Set(after)
  const added = after.filter((t) => !prev.has(t))
  const removed = before.filter((t) => !next.has(t))
  const same = after.filter((t) => prev.has(t))
  const noChange = added.length === 0 && removed.length === 0
  return (
    <div className="space-y-2">
      {noChange && (
        <p className="text-[10px] text-fg-subtle">변경 없음 — 기존 도구 유지</p>
      )}
      {added.length + removed.length + same.length === 0 ? (
        <p className="text-[11px] text-fg-subtle">(허용 도구 없음)</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {removed.map((t) => (
            <span key={`r-${t}`} className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300 line-through decoration-red-400/60">
              − {t}
            </span>
          ))}
          {added.map((t) => (
            <span key={`a-${t}`} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
              + {t}
            </span>
          ))}
          {same.map((t) => (
            <span key={`s-${t}`} className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-fg-subtle">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FilesDiff({
  before,
  after,
}: {
  before: { path: string; content: string }[]
  after: { path: string; content: string }[]
}) {
  const prevMap = new Map(before.map((f) => [f.path, f]))
  const nextMap = new Map(after.map((f) => [f.path, f]))
  const added = after.filter((f) => !prevMap.has(f.path))
  const removed = before.filter((f) => !nextMap.has(f.path))
  const changed = after.filter(
    (f) => prevMap.has(f.path) && prevMap.get(f.path)!.content !== f.content,
  )
  const unchanged = after.filter(
    (f) => prevMap.has(f.path) && prevMap.get(f.path)!.content === f.content,
  )
  const noChange = added.length === 0 && removed.length === 0 && changed.length === 0
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="space-y-1">
      {noChange && <p className="text-[10px] text-fg-subtle">변경 없음 — 기존 파일 유지</p>}
      {added.length + removed.length + changed.length + unchanged.length === 0 ? (
        <p className="text-[11px] text-fg-subtle">(파일 없음)</p>
      ) : (
        <>
          {added.map((f) => {
            const isOpen = !!open[`a-${f.path}`]
            return (
              <div key={`a-${f.path}`} className="rounded border border-emerald-500/30 bg-emerald-500/5">
                <button
                  onClick={() => setOpen((s) => ({ ...s, [`a-${f.path}`]: !isOpen }))}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] text-emerald-300 hover:text-emerald-200"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>+ {f.path}</span>
                  <span className="ml-auto text-[10px] text-fg-subtle">{f.content.length}자</span>
                </button>
                {isOpen && (
                  <pre className="max-h-48 overflow-y-auto border-t border-emerald-500/20 bg-bg px-2 py-1 text-[11px] text-emerald-300 whitespace-pre-wrap break-words custom-scrollbar">
                    {f.content}
                  </pre>
                )}
              </div>
            )
          })}
          {removed.map((f) => {
            const isOpen = !!open[`r-${f.path}`]
            return (
              <div key={`r-${f.path}`} className="rounded border border-red-500/30 bg-red-500/5">
                <button
                  onClick={() => setOpen((s) => ({ ...s, [`r-${f.path}`]: !isOpen }))}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] text-red-300 line-through decoration-red-400/60 hover:text-red-200"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>− {f.path}</span>
                  <span className="ml-auto text-[10px] text-fg-subtle no-underline">{f.content.length}자</span>
                </button>
                {isOpen && (
                  <pre className="max-h-48 overflow-y-auto border-t border-red-500/20 bg-bg px-2 py-1 text-[11px] text-red-300 whitespace-pre-wrap break-words custom-scrollbar">
                    {f.content}
                  </pre>
                )}
              </div>
            )
          })}
          {changed.map((f) => {
            const prev = prevMap.get(f.path)!
            const isOpen = !!open[`c-${f.path}`]
            return (
              <div key={`c-${f.path}`} className="rounded border border-amber-500/30 bg-amber-500/5">
                <button
                  onClick={() => setOpen((s) => ({ ...s, [`c-${f.path}`]: !isOpen }))}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] text-amber-200 hover:text-amber-100"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span>~ {f.path}</span>
                  <span className="ml-auto text-[10px] text-fg-subtle">
                    {prev.content.length} → {f.content.length}자
                  </span>
                </button>
                {isOpen && (
                  <div className="max-h-64 overflow-y-auto border-t border-amber-500/20 custom-scrollbar">
                    <InstructionsDiff before={prev.content} after={f.content} />
                  </div>
                )}
              </div>
            )
          })}
          {unchanged.map((f) => {
            const isOpen = !!open[`u-${f.path}`]
            return (
              <div key={`u-${f.path}`} className="rounded border border-border bg-bg">
                <button
                  onClick={() => setOpen((s) => ({ ...s, [`u-${f.path}`]: !isOpen }))}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] text-fg-subtle hover:text-fg"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <FileCode2 className="h-3 w-3 text-fg-subtle" />
                  <span>{f.path}</span>
                  <span className="ml-auto text-[10px] opacity-70">{f.content.length}자</span>
                </button>
                {isOpen && (
                  <pre className="max-h-48 overflow-y-auto border-t border-border bg-bg px-2 py-1 text-[11px] text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                    {f.content}
                  </pre>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

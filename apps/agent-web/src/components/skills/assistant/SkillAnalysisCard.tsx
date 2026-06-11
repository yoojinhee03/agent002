'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  LayoutList,
  Maximize2,
  Rows,
  Search,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { renderMarkdown } from '@/lib/markdown'
import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'
import type {
  SkillAnalysisPayload,
  SkillEditTargetSnapshot,
} from '@/stores/use-skill-assistant-store'
import { SkillPayloadDetailModal } from '@/components/skills/assistant/SkillPayloadDetailModal'

interface SkillAnalysisCardProps {
  messageId: string
  payload: SkillAnalysisPayload
  canceled: boolean
  targetSkillId?: string
  targetSnapshot?: SkillEditTargetSnapshot
}

type Tab = 'summary' | 'strengths' | 'toolfit' | 'suggestions'

function scoreColor(score: number): string {
  if (score >= 70) return 'emerald'
  if (score >= 40) return 'amber'
  return 'red'
}

function scoreBorderClass(score: number, canceled: boolean): string {
  if (canceled) return 'border-border bg-gradient-to-b from-[var(--color-surface-2)] to-bg'
  const c = scoreColor(score)
  if (c === 'emerald') return 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-emerald-500/5'
  if (c === 'amber') return 'border-amber-500/40 bg-gradient-to-b from-amber-500/10 to-amber-500/5'
  return 'border-red-500/40 bg-gradient-to-b from-red-500/10 to-red-500/5'
}

function scoreBarClass(score: number): string {
  const c = scoreColor(score)
  if (c === 'emerald') return 'bg-emerald-500'
  if (c === 'amber') return 'bg-amber-500'
  return 'bg-red-500'
}

function scoreTextClass(score: number): string {
  const c = scoreColor(score)
  if (c === 'emerald') return 'text-emerald-300'
  if (c === 'amber') return 'text-amber-300'
  return 'text-red-300'
}

function leftBarClass(score: number, canceled: boolean): string {
  if (canceled) return 'bg-[var(--color-fg-subtle)]/40'
  const c = scoreColor(score)
  if (c === 'emerald') return 'bg-emerald-500'
  if (c === 'amber') return 'bg-amber-500'
  return 'bg-red-500'
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
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
      {children}
    </button>
  )
}

function FitBadge({ fit }: { fit: 'good' | 'unclear' | 'missing' }) {
  const cls =
    fit === 'good'
      ? 'bg-emerald-500/20 text-emerald-300'
      : fit === 'unclear'
        ? 'bg-amber-500/20 text-amber-300'
        : 'bg-red-500/20 text-red-300'
  const label = fit === 'good' ? '적합' : fit === 'unclear' ? '불확실' : '누락'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', cls)}>{label}</span>
  )
}

function SeverityBar({ severity }: { severity: 'low' | 'med' | 'high' }) {
  const cls =
    severity === 'high'
      ? 'bg-red-500/20 border-red-500/40 text-red-300'
      : severity === 'med'
        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
        : 'bg-blue-500/20 border-blue-500/40 text-blue-300'
  const label = severity === 'high' ? '높음' : severity === 'med' ? '보통' : '낮음'
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', cls)}>{label}</span>
  )
}

export function SkillAnalysisCard({
  messageId,
  payload,
  canceled,
  targetSkillId: _targetSkillId,
  targetSnapshot,
}: SkillAnalysisCardProps) {
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState<Tab>('summary')
  const [detailOpen, setDetailOpen] = useState(false)
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null)
  // 일부(탭별) ↔ 전체(섹션 스택) 보기 토글. 기본 탭.
  const [showAll, setShowAll] = useState(false)

  const sendMessage = useSkillAssistantStore((s) => s.sendMessage)
  const updateCardState = useSkillAssistantStore((s) => s.updateCardState)

  const score = payload.overallScore ?? 0

  const handleApplySuggestion = async (idx: number, title: string) => {
    setApplyingIdx(idx)
    try {
      await sendMessage(
        `방금 분석에서 제안한 [${title}]을 그대로 반영해서 스킬을 수정해줘.`,
        'builder',
      )
    } finally {
      setApplyingIdx(null)
    }
  }

  return (
    <div
      className={cn(
        'relative flex w-full flex-col overflow-hidden rounded-2xl border text-xs text-fg shadow-lg',
        scoreBorderClass(score, canceled),
        canceled && 'grayscale-[30%]',
      )}
    >
      {/* 좌측 상태 인디케이터 막대 */}
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-1',
          leftBarClass(score, canceled),
        )}
      />

      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-blue-300">
          <Search className={cn('h-4 w-4', canceled && 'opacity-50')} />
          <span className={cn('text-sm font-semibold', canceled && 'opacity-60')}>
            스킬 분석
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded border px-2 py-1 text-[10px] transition-colors',
              showAll
                ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                : 'border-border bg-bg text-fg-muted hover:border-blue-400/40 hover:text-fg',
            )}
            title={showAll ? '탭별 보기' : '모든 섹션 펼쳐 보기'}
          >
            {showAll ? <LayoutList className="h-3 w-3" /> : <Rows className="h-3 w-3" />}
            {showAll ? '탭' : '전체'}
          </button>
          <button
            onClick={() => setDetailOpen(true)}
            className="flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
          >
            <Maximize2 className="h-3 w-3" />
            전체 보기
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded border border-border bg-bg p-1 text-fg-muted hover:border-blue-400/40 hover:text-fg"
            aria-label={expanded ? '접기' : '펼치기'}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* 상단 요약 — 점수 게이지 + overview 1줄 */}
      <div className="shrink-0 border-b border-border/60 bg-bg/40 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-fg-subtle">종합 점수</span>
              <span className={cn('text-sm font-bold', scoreTextClass(score))}>{score}점</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className={cn('h-full rounded-full transition-all', scoreBarClass(score))}
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              />
            </div>
          </div>
        </div>
        {payload.overview && (
          <p className="mt-1.5 line-clamp-2 text-[11px] text-fg-muted">{payload.overview}</p>
        )}
      </div>

      {/* 탭 + 본문 — showAll 모드는 탭 바 숨기고 모든 섹션을 세로 스택. */}
      {expanded && (
        <>
          {!showAll && (
            <div className="flex shrink-0 gap-1 border-b border-border/60 bg-bg/30 px-2 py-1">
              <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
                요약
              </TabButton>
              <TabButton active={tab === 'strengths'} onClick={() => setTab('strengths')}>
                강점·약점
              </TabButton>
              <TabButton active={tab === 'toolfit'} onClick={() => setTab('toolfit')}>
                도구 적합성 ({payload.toolFit?.length ?? 0})
              </TabButton>
              <TabButton active={tab === 'suggestions'} onClick={() => setTab('suggestions')}>
                개선 제안 ({payload.suggestions?.length ?? 0})
              </TabButton>
            </div>
          )}

          <div className={cn(
            'overflow-y-auto bg-bg px-3 py-2.5 custom-scrollbar',
            showAll ? 'max-h-[420px] min-h-[160px] space-y-3' : 'max-h-[260px] min-h-[120px]',
          )}>
            {showAll && (
              <div className="text-[10px] uppercase tracking-wider text-blue-300">요약</div>
            )}
            {(showAll || tab === 'summary') && (
              <div className="space-y-2">
                {payload.overview && (
                  <div
                    className="prose-invert-custom text-[11px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(payload.overview) }}
                  />
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-fg-subtle">강점</div>
                    <div className="text-sm font-bold text-emerald-300">{payload.strengths?.length ?? 0}개</div>
                  </div>
                  <div className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-fg-subtle">약점</div>
                    <div className="text-sm font-bold text-amber-300">{payload.weaknesses?.length ?? 0}개</div>
                  </div>
                  <div className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1.5">
                    <div className="text-[10px] uppercase tracking-wider text-fg-subtle">개선</div>
                    <div className="text-sm font-bold text-blue-300">{payload.suggestions?.length ?? 0}개</div>
                  </div>
                </div>
              </div>
            )}

            {showAll && (
              <div className="text-[10px] uppercase tracking-wider text-emerald-300">강점·약점</div>
            )}
            {(showAll || tab === 'strengths') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-emerald-400">강점</div>
                  <div className="space-y-1">
                    {(payload.strengths ?? []).length === 0 ? (
                      <p className="text-[11px] text-fg-subtle">(없음)</p>
                    ) : (
                      payload.strengths.map((s, i) => (
                        <span
                          key={i}
                          className="flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200"
                        >
                          {s}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-amber-400">약점</div>
                  <div className="space-y-1">
                    {(payload.weaknesses ?? []).length === 0 ? (
                      <p className="text-[11px] text-fg-subtle">(없음)</p>
                    ) : (
                      payload.weaknesses.map((w, i) => (
                        <span
                          key={i}
                          className="flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200"
                        >
                          {w}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {showAll && (
              <div className="text-[10px] uppercase tracking-wider text-amber-300">도구 적합성</div>
            )}
            {(showAll || tab === 'toolfit') && (
              <div className="space-y-2">
                {(payload.toolFit ?? []).length === 0 ? (
                  <p className="text-[11px] text-fg-subtle">(분석된 도구 없음)</p>
                ) : (
                  payload.toolFit.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-border bg-[var(--color-surface-2)] px-2 py-1.5">
                      <span className="min-w-0 flex-1 font-mono text-[11px] text-fg">{item.name}</span>
                      <FitBadge fit={item.fit} />
                      {item.reason && (
                        <span className="text-[10px] text-fg-subtle">{item.reason}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {showAll && (
              <div className="text-[10px] uppercase tracking-wider text-blue-300">개선 제안</div>
            )}
            {(showAll || tab === 'suggestions') && (
              <div className="space-y-2">
                {(payload.suggestions ?? []).length === 0 ? (
                  <p className="text-[11px] text-fg-subtle">(개선 제안 없음)</p>
                ) : (
                  payload.suggestions.map((sug, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded border px-2.5 py-2',
                        sug.severity === 'high'
                          ? 'border-red-500/30 bg-red-500/5'
                          : sug.severity === 'med'
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : 'border-blue-500/30 bg-blue-500/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <SeverityBar severity={sug.severity} />
                          <span className="text-[11px] font-semibold text-fg">{sug.title}</span>
                        </div>
                        {sug.editHint && !canceled && (
                          <button
                            onClick={() => void handleApplySuggestion(i, sug.title)}
                            disabled={applyingIdx !== null}
                            className="shrink-0 flex items-center gap-1 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-200 hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            {applyingIdx === i ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : null}
                            이 항목으로 수정 적용
                          </button>
                        )}
                      </div>
                      {sug.detail && (
                        <div
                          className="prose-invert-custom mt-1 text-[10px] leading-relaxed text-fg-muted"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(sug.detail) }}
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* 하단 액션 */}
      <div className="shrink-0 border-t border-border/60 bg-bg/30 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-fg-subtle">
            {canceled ? '이 분석은 닫혔습니다.' : '분석 결과 — 읽기 전용'}
          </span>
          {!canceled && (
            <button
              onClick={() => updateCardState(messageId, { canceled: true })}
              className="rounded border border-border px-2 py-1 text-[10px] text-fg-subtle hover:border-border/80 hover:text-fg"
            >
              닫기
            </button>
          )}
        </div>
      </div>

      <SkillPayloadDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        payload={{
          kind: 'analysis',
          current: targetSnapshot ?? null,
          analysis: payload,
        }}
      />
    </div>
  )
}

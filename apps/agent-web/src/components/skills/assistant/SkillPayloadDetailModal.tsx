'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code,
  FileCode2,
  Maximize2,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeLineDiff } from '@/lib/diff-utils'
import { renderMarkdown } from '@/lib/markdown'
import type { SkillAnalysisPayload, SkillEditTargetSnapshot } from '@/stores/use-skill-assistant-store'

type DiffLine = { type: 'unchanged' | 'added' | 'removed'; content: string }

export interface DetailProposalPayload {
  kind: 'create'
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  files: { path: string; content: string }[]
  /** 직전 제안 — 개선 요청 결과로 다듬어진 경우 diff 보기. */
  previous?: {
    name: string
    description: string
    instructions: string
    allowedTools: string[]
    files: { path: string; content: string }[]
  }
}

export interface DetailEditPayload {
  kind: 'edit'
  current: {
    name: string
    description: string
    instructions: string
    allowedTools: string[]
    files: { path: string; content: string }[]
  }
  patch: {
    name?: string
    description?: string
    instructions?: string
    allowedTools?: string[]
    addFiles?: { path: string; content: string }[]
    removeFilePaths?: string[]
    changeSummary?: string
  }
}

export interface DetailAnalysisPayload {
  kind: 'analysis'
  current?: SkillEditTargetSnapshot | null
  analysis: SkillAnalysisPayload
}

interface Props {
  open: boolean
  onClose: () => void
  payload: DetailProposalPayload | DetailEditPayload | DetailAnalysisPayload | null
  /** 카드 상태 — 모달에서도 시각적으로 반영 */
  applied?: boolean
  canceled?: boolean
}

export function SkillPayloadDetailModal({ open, onClose, payload, applied, canceled }: Props) {
  const [openFiles, setOpenFiles] = useState<Record<string, boolean>>({})
  const [rawJson, setRawJson] = useState(false)
  const [showDiff, setShowDiff] = useState(true)
  const [mounted, setMounted] = useState(false)
  const hasCreateDiff = payload?.kind === 'create' && !!payload.previous
  const hasEditDiff = payload?.kind === 'edit'
  const hasDiffToggle = hasCreateDiff || hasEditDiff

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setOpenFiles({})
      setRawJson(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !payload || !mounted) return null

  const baseTitle =
    payload.kind === 'create'
      ? `새 스킬 제안 전체 보기 — ${payload.name}`
      : payload.kind === 'edit'
        ? `스킬 수정 제안 전체 보기 — ${payload.current.name}`
        : `스킬 분석 전체 보기${payload.current ? ` — ${payload.current.name}` : ''}`

  const node = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className={cn(
          'relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-bg shadow-2xl',
          applied
            ? 'border-emerald-500/50 ring-1 ring-emerald-500/30'
            : canceled
              ? 'border-red-500/40 ring-1 ring-red-500/20'
              : 'border-border',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상태 좌측 막대 */}
        {(applied || canceled) && (
          <div
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 w-1.5',
              applied ? 'bg-emerald-500' : 'bg-red-500/70',
            )}
          />
        )}
        {/* 취소 줄무늬 오버레이 */}
        {canceled && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(239, 68, 68, 0.05) 0 8px, transparent 8px 18px)',
            }}
          />
        )}
        {/* 상태 배너 */}
        {(applied || canceled) && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 border-b px-5 py-2 text-xs font-semibold',
              applied
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-200',
            )}
          >
            {applied ? <Check className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            <span>
              {applied
                ? '이 제안은 이미 적용되었습니다 — 읽기 전용 보기입니다.'
                : '이 제안은 취소되었습니다 — 읽기 전용 보기입니다.'}
            </span>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            {applied ? (
              <Check className="h-4 w-4 text-emerald-300" />
            ) : canceled ? (
              <XCircle className="h-4 w-4 text-red-300" />
            ) : payload.kind === 'create' ? (
              <Sparkles className="h-4 w-4 text-blue-300" />
            ) : payload.kind === 'analysis' ? (
              <Search className="h-4 w-4 text-blue-300" />
            ) : (
              <Maximize2 className="h-4 w-4 text-amber-300" />
            )}
            <span
              className={cn(
                'text-sm font-semibold text-fg',
                canceled && 'line-through decoration-red-400/60',
              )}
            >
              {baseTitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasDiffToggle && (
              <button
                onClick={() => setShowDiff((v) => !v)}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
                  showDiff
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-border text-fg-muted hover:border-emerald-400/40 hover:text-fg',
                )}
                title={
                  showDiff
                    ? hasEditDiff
                      ? '병합 후 현재 내용 보기'
                      : '현재 내용 보기'
                    : hasEditDiff
                      ? '변경점만 보기'
                      : '직전 제안 대비 변경점 보기'
                }
              >
                <Code className="h-3 w-3" />
                {showDiff ? '변경점' : '현재'}
              </button>
            )}
            <button
              onClick={() => setRawJson((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors',
                rawJson
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                  : 'border-border text-fg-muted hover:border-blue-400/40 hover:text-fg',
              )}
            >
              <Code className="h-3 w-3" />
              {rawJson ? 'Pretty 보기' : 'JSON 보기'}
            </button>
            <button
              onClick={onClose}
              className="rounded p-1 text-fg-subtle hover:bg-[var(--color-surface-2)] hover:text-fg"
              aria-label="닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto p-5 custom-scrollbar">
          {rawJson ? (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-[var(--color-surface-2)] p-3 text-xs text-fg-subtle">
              {JSON.stringify(payload, null, 2)}
            </pre>
          ) : payload.kind === 'create' ? (
            hasCreateDiff && showDiff && payload.previous ? (
              <CreateDiffPretty
                previous={payload.previous}
                current={payload}
                openFiles={openFiles}
                toggle={(p) => setOpenFiles((s) => ({ ...s, [p]: !s[p] }))}
              />
            ) : (
              <CreatePretty
                payload={payload}
                openFiles={openFiles}
                toggle={(p) => setOpenFiles((s) => ({ ...s, [p]: !s[p] }))}
              />
            )
          ) : payload.kind === 'analysis' ? (
            <AnalysisPretty payload={payload} />
          ) : showDiff ? (
            <EditPretty
              payload={payload}
              openFiles={openFiles}
              toggle={(p) => setOpenFiles((s) => ({ ...s, [p]: !s[p] }))}
            />
          ) : (
            <EditMergedPretty
              payload={payload}
              openFiles={openFiles}
              toggle={(p) => setOpenFiles((s) => ({ ...s, [p]: !s[p] }))}
            />
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(node, document.body)
}

function AnalysisPretty({ payload }: { payload: DetailAnalysisPayload }) {
  const { analysis } = payload
  const score = analysis.overallScore ?? 0
  const scoreColor =
    score >= 70 ? 'text-emerald-300' : score >= 40 ? 'text-amber-300' : 'text-red-300'
  const barColor =
    score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div>
      {/* 점수 게이지 */}
      <Section title="종합 점수">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-fg-subtle">0</span>
              <span className={cn('text-lg font-bold', scoreColor)}>{score}점</span>
              <span className="text-xs text-fg-subtle">100</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div
                className={cn('h-full rounded-full', barColor)}
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              />
            </div>
          </div>
        </div>
      </Section>

      {/* 개요 */}
      {analysis.overview && (
        <Section title="개요">
          <div
            className="prose-invert-custom text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis.overview) }}
          />
        </Section>
      )}

      {/* 강점 */}
      {(analysis.strengths?.length ?? 0) > 0 && (
        <Section title={`강점 (${analysis.strengths.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {analysis.strengths.map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200"
              >
                {s}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 약점 */}
      {(analysis.weaknesses?.length ?? 0) > 0 && (
        <Section title={`약점 (${analysis.weaknesses.length})`}>
          <div className="flex flex-wrap gap-1.5">
            {analysis.weaknesses.map((w, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-200"
              >
                {w}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* 도구 적합성 */}
      {(analysis.toolFit?.length ?? 0) > 0 && (
        <Section title={`도구 적합성 (${analysis.toolFit.length})`}>
          <div className="space-y-2">
            {analysis.toolFit.map((item, i) => {
              const fitCls =
                item.fit === 'good'
                  ? 'text-emerald-300 bg-emerald-500/15'
                  : item.fit === 'unclear'
                    ? 'text-amber-300 bg-amber-500/15'
                    : 'text-red-300 bg-red-500/15'
              const fitLabel =
                item.fit === 'good' ? '적합' : item.fit === 'unclear' ? '불확실' : '누락'
              return (
                <div key={i} className="flex items-start gap-2">
                  <span className="font-mono text-sm text-fg min-w-[120px]">{item.name}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', fitCls)}>
                    {fitLabel}
                  </span>
                  {item.reason && (
                    <span className="text-xs text-fg-muted">{item.reason}</span>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* 개선 제안 */}
      {(analysis.suggestions?.length ?? 0) > 0 && (
        <Section title={`개선 제안 (${analysis.suggestions.length})`}>
          <div className="space-y-3">
            {analysis.suggestions.map((sug, i) => {
              const sevCls =
                sug.severity === 'high'
                  ? 'border-red-500/30 bg-red-500/5'
                  : sug.severity === 'med'
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-blue-500/30 bg-blue-500/5'
              const sevLabel =
                sug.severity === 'high' ? '높음' : sug.severity === 'med' ? '보통' : '낮음'
              const sevTextCls =
                sug.severity === 'high'
                  ? 'text-red-300'
                  : sug.severity === 'med'
                    ? 'text-amber-300'
                    : 'text-blue-300'
              return (
                <div key={i} className={cn('rounded border px-3 py-2', sevCls)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-xs font-semibold', sevTextCls)}>
                      [{sevLabel}]
                    </span>
                    <span className="text-sm font-semibold text-fg">{sug.title}</span>
                  </div>
                  {sug.detail && (
                    <div
                      className="prose-invert-custom text-xs text-fg-muted"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(sug.detail) }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-300">{title}</h3>
      <div className="rounded-md border border-border bg-[var(--color-surface-2)] p-3 text-sm text-fg">
        {children}
      </div>
    </section>
  )
}

function CreatePretty({
  payload,
  openFiles,
  toggle,
}: {
  payload: DetailProposalPayload
  openFiles: Record<string, boolean>
  toggle: (path: string) => void
}) {
  return (
    <div>
      <Section title="이름">
        <div className="font-mono text-sm">{payload.name}</div>
      </Section>

      <Section title="설명">
        <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{payload.description || '(없음)'}</p>
      </Section>

      <Section title="Instructions">
        <pre className="whitespace-pre-wrap break-words text-sm text-fg-subtle">{payload.instructions || '(없음)'}</pre>
      </Section>

      <Section title={`허용 도구 (${payload.allowedTools.length})`}>
        {payload.allowedTools.length === 0 ? (
          <span className="text-xs text-fg-subtle">(없음)</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {payload.allowedTools.map((t) => (
              <span
                key={t}
                className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`파일 (${payload.files.length})`}>
        {payload.files.length === 0 ? (
          <span className="text-xs text-fg-subtle">(없음)</span>
        ) : (
          <div className="space-y-2">
            {payload.files.map((f) => {
              const open = !!openFiles[f.path]
              return (
                <div key={f.path} className="rounded border border-border bg-bg">
                  <button
                    onClick={() => toggle(f.path)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-muted hover:text-fg"
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <FileCode2 className="h-3.5 w-3.5 text-blue-300" />
                    <span className="truncate font-mono text-sm">{f.path}</span>
                    <span className="ml-auto text-[10px] text-fg-subtle">{f.content.length}자</span>
                  </button>
                  {open && (
                    <pre className="max-h-[400px] overflow-y-auto border-t border-border bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                      {f.content}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

function EditPretty({
  payload,
  openFiles,
  toggle,
}: {
  payload: DetailEditPayload
  openFiles: Record<string, boolean>
  toggle: (path: string) => void
}) {
  const { current, patch } = payload
  const lines =
    patch.instructions !== undefined
      ? (computeLineDiff(current.instructions || '', patch.instructions || '') as DiffLine[])
      : []
  const addedTools =
    patch.allowedTools !== undefined
      ? patch.allowedTools.filter((t) => !current.allowedTools.includes(t))
      : []
  const removedTools =
    patch.allowedTools !== undefined
      ? current.allowedTools.filter((t) => !patch.allowedTools!.includes(t))
      : []

  return (
    <div>
      {patch.changeSummary && (
        <Section title="변경 요약">
          <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">{patch.changeSummary}</p>
        </Section>
      )}

      {patch.name !== undefined && patch.name !== current.name && (
        <Section title="이름">
          <div className="space-y-1">
            <div className="rounded bg-red-500/10 px-2 py-1 text-sm text-red-300 line-through decoration-red-400/60">
              {current.name}
            </div>
            <div className="rounded bg-emerald-500/10 px-2 py-1 text-sm text-emerald-300">{patch.name}</div>
          </div>
        </Section>
      )}

      {patch.description !== undefined && patch.description !== current.description && (
        <Section title="설명">
          <div className="space-y-1">
            <div className="whitespace-pre-wrap break-words rounded bg-red-500/10 px-2 py-1 text-sm text-red-300 line-through decoration-red-400/60">
              {current.description}
            </div>
            <div className="whitespace-pre-wrap break-words rounded bg-emerald-500/10 px-2 py-1 text-sm text-emerald-300">
              {patch.description}
            </div>
          </div>
        </Section>
      )}

      {patch.instructions !== undefined && patch.instructions !== current.instructions && (
        <Section title="Instructions">
          <pre className="rounded border border-border bg-bg p-2 text-xs leading-relaxed">
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
        </Section>
      )}

      {(addedTools.length > 0 || removedTools.length > 0) && (
        <Section title="허용 도구">
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
        </Section>
      )}

      {(patch.addFiles?.length ?? 0) > 0 && (
        <Section title={`파일 추가 (${patch.addFiles!.length})`}>
          <div className="space-y-2">
            {patch.addFiles!.map((f) => {
              const open = !!openFiles[f.path]
              return (
                <div key={`add-${f.path}`} className="rounded border border-emerald-500/30 bg-emerald-500/5">
                  <button
                    onClick={() => toggle(f.path)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-emerald-300 hover:text-emerald-200"
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <FileCode2 className="h-3.5 w-3.5" />
                    <span className="truncate font-mono text-sm">+ {f.path}</span>
                    <span className="ml-auto text-[10px] text-fg-subtle">{f.content.length}자</span>
                  </button>
                  {open && (
                    <pre className="max-h-[320px] overflow-y-auto border-t border-emerald-500/30 bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                      {f.content}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {(patch.removeFilePaths?.length ?? 0) > 0 && (
        <Section title={`파일 삭제 (${patch.removeFilePaths!.length})`}>
          <div className="space-y-1">
            {patch.removeFilePaths!.map((p) => (
              <div
                key={`rm-${p}`}
                className="rounded bg-red-500/10 px-2 py-1 font-mono text-xs text-red-300 line-through decoration-red-400/60"
              >
                − {p}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function EditMergedPretty({
  payload,
  openFiles,
  toggle,
}: {
  payload: DetailEditPayload
  openFiles: Record<string, boolean>
  toggle: (path: string) => void
}) {
  const { current, patch } = payload
  const mergedName = patch.name ?? current.name
  const mergedDescription = patch.description ?? current.description
  const mergedInstructions = patch.instructions ?? current.instructions
  const mergedTools = patch.allowedTools ?? current.allowedTools
  const removeSet = new Set(patch.removeFilePaths ?? [])
  const addList = patch.addFiles ?? []
  const mergedFiles = [
    ...current.files.filter((f) => !removeSet.has(f.path)),
    ...addList,
  ]

  return (
    <div>
      <Section title="이름">
        <div className="font-mono text-sm">{mergedName}</div>
      </Section>

      <Section title="설명">
        <p className="whitespace-pre-wrap break-words text-sm text-fg-muted">
          {mergedDescription || '(없음)'}
        </p>
      </Section>

      <Section title="Instructions">
        <pre className="whitespace-pre-wrap break-words text-sm text-fg-subtle">
          {mergedInstructions || '(없음)'}
        </pre>
      </Section>

      <Section title={`허용 도구 (${mergedTools.length})`}>
        {mergedTools.length === 0 ? (
          <span className="text-xs text-fg-subtle">(없음)</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {mergedTools.map((t) => (
              <span
                key={t}
                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-200"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`파일 (${mergedFiles.length})`}>
        {mergedFiles.length === 0 ? (
          <span className="text-xs text-fg-subtle">(없음)</span>
        ) : (
          <div className="space-y-2">
            {mergedFiles.map((f) => {
              const open = !!openFiles[`merged-${f.path}`]
              return (
                <div key={`merged-${f.path}`} className="rounded border border-border bg-bg">
                  <button
                    onClick={() => toggle(`merged-${f.path}`)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg-muted hover:text-fg"
                  >
                    {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <FileCode2 className="h-3.5 w-3.5 text-amber-300" />
                    <span className="truncate font-mono text-sm">{f.path}</span>
                    <span className="ml-auto text-[10px] text-fg-subtle">{f.content.length}자</span>
                  </button>
                  {open && (
                    <pre className="max-h-[400px] overflow-y-auto border-t border-border bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                      {f.content}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

function CreateDiffPretty({
  previous,
  current,
  openFiles,
  toggle,
}: {
  previous: NonNullable<DetailProposalPayload['previous']>
  current: DetailProposalPayload
  openFiles: Record<string, boolean>
  toggle: (path: string) => void
}) {
  const prevToolSet = new Set(previous.allowedTools)
  const nextToolSet = new Set(current.allowedTools)
  const toolsAdded = current.allowedTools.filter((t) => !prevToolSet.has(t))
  const toolsRemoved = previous.allowedTools.filter((t) => !nextToolSet.has(t))
  const toolsSame = current.allowedTools.filter((t) => prevToolSet.has(t))

  const prevFileMap = new Map(previous.files.map((f) => [f.path, f]))
  const nextFileMap = new Map(current.files.map((f) => [f.path, f]))
  const filesAdded = current.files.filter((f) => !prevFileMap.has(f.path))
  const filesRemoved = previous.files.filter((f) => !nextFileMap.has(f.path))
  const filesChanged = current.files.filter(
    (f) => prevFileMap.has(f.path) && prevFileMap.get(f.path)!.content !== f.content,
  )
  const filesUnchanged = current.files.filter(
    (f) => prevFileMap.has(f.path) && prevFileMap.get(f.path)!.content === f.content,
  )

  const instructionsLines = computeLineDiff(previous.instructions, current.instructions) as DiffLine[]

  return (
    <div>
      <Section title="변경 요약">
        <ul className="list-disc space-y-0.5 pl-4 text-sm text-fg-muted">
          {previous.name !== current.name && (
            <li>
              이름: <span className="text-red-300 line-through">{previous.name}</span> →{' '}
              <span className="text-emerald-300">{current.name}</span>
            </li>
          )}
          {previous.description !== current.description && <li>설명 변경됨</li>}
          {previous.instructions !== current.instructions && <li>Instructions 변경됨</li>}
          {(toolsAdded.length > 0 || toolsRemoved.length > 0) && (
            <li>
              도구: {toolsRemoved.length > 0 && <span className="text-red-300">−{toolsRemoved.length}</span>}{' '}
              {toolsAdded.length > 0 && <span className="text-emerald-300">+{toolsAdded.length}</span>}
            </li>
          )}
          {(filesAdded.length > 0 || filesRemoved.length > 0 || filesChanged.length > 0) && (
            <li>
              파일: {filesRemoved.length > 0 && <span className="text-red-300">−{filesRemoved.length}</span>}{' '}
              {filesAdded.length > 0 && <span className="text-emerald-300">+{filesAdded.length}</span>}{' '}
              {filesChanged.length > 0 && <span className="text-amber-300">~{filesChanged.length}</span>}
            </li>
          )}
        </ul>
      </Section>

      {previous.name !== current.name && (
        <Section title="이름">
          <div className="space-y-1">
            <div className="rounded bg-red-500/10 px-2 py-1 text-sm text-red-300 line-through decoration-red-400/60">
              {previous.name}
            </div>
            <div className="rounded bg-emerald-500/10 px-2 py-1 text-sm text-emerald-300">{current.name}</div>
          </div>
        </Section>
      )}

      {previous.description !== current.description && (
        <Section title="설명">
          <div className="space-y-1">
            <div className="whitespace-pre-wrap break-words rounded bg-red-500/10 px-2 py-1 text-sm text-red-300 line-through decoration-red-400/60">
              {previous.description || '(없음)'}
            </div>
            <div className="whitespace-pre-wrap break-words rounded bg-emerald-500/10 px-2 py-1 text-sm text-emerald-300">
              {current.description || '(없음)'}
            </div>
          </div>
        </Section>
      )}

      <Section title="Instructions">
        {previous.instructions === current.instructions ? (
          <p className="text-xs text-fg-subtle">변경 없음</p>
        ) : (
          <pre className="rounded border border-border bg-bg p-2 text-xs leading-relaxed">
            {instructionsLines.map((line, idx) => (
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
        )}
      </Section>

      <Section title={`허용 도구 (${current.allowedTools.length})`}>
        {toolsAdded.length === 0 && toolsRemoved.length === 0 && toolsSame.length === 0 ? (
          <span className="text-xs text-fg-subtle">(없음)</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {toolsRemoved.map((t) => (
              <span
                key={`r-${t}`}
                className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300 line-through decoration-red-400/60"
              >
                − {t}
              </span>
            ))}
            {toolsAdded.map((t) => (
              <span
                key={`a-${t}`}
                className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300"
              >
                + {t}
              </span>
            ))}
            {toolsSame.map((t) => (
              <span
                key={`s-${t}`}
                className="rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-fg-subtle"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`파일 (${current.files.length})`}>
        <div className="space-y-2">
          {filesAdded.length === 0 &&
            filesRemoved.length === 0 &&
            filesChanged.length === 0 &&
            filesUnchanged.length === 0 && (
              <span className="text-xs text-fg-subtle">(없음)</span>
            )}
          {filesAdded.map((f) => (
            <DiffFileRow
              key={`a-${f.path}`}
              variant="added"
              path={f.path}
              meta={`${f.content.length}자`}
              isOpen={!!openFiles[`a-${f.path}`]}
              onToggle={() => toggle(`a-${f.path}`)}
            >
              <pre className="max-h-[320px] overflow-y-auto bg-[var(--color-surface-2)] px-3 py-2 text-xs text-emerald-300 whitespace-pre-wrap break-words custom-scrollbar">
                {f.content}
              </pre>
            </DiffFileRow>
          ))}
          {filesRemoved.map((f) => (
            <DiffFileRow
              key={`r-${f.path}`}
              variant="removed"
              path={f.path}
              meta={`${f.content.length}자`}
              isOpen={!!openFiles[`r-${f.path}`]}
              onToggle={() => toggle(`r-${f.path}`)}
            >
              <pre className="max-h-[320px] overflow-y-auto bg-[var(--color-surface-2)] px-3 py-2 text-xs text-red-300 whitespace-pre-wrap break-words custom-scrollbar">
                {f.content}
              </pre>
            </DiffFileRow>
          ))}
          {filesChanged.map((f) => {
            const prev = prevFileMap.get(f.path)!
            const fileLines = computeLineDiff(prev.content, f.content) as DiffLine[]
            return (
              <DiffFileRow
                key={`c-${f.path}`}
                variant="changed"
                path={f.path}
                meta={`${prev.content.length} → ${f.content.length}자`}
                isOpen={!!openFiles[`c-${f.path}`]}
                onToggle={() => toggle(`c-${f.path}`)}
              >
                <pre className="max-h-[320px] overflow-y-auto bg-[var(--color-surface-2)] p-2 text-xs leading-relaxed custom-scrollbar">
                  {fileLines.map((line, idx) => (
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
              </DiffFileRow>
            )
          })}
          {filesUnchanged.map((f) => (
            <DiffFileRow
              key={`u-${f.path}`}
              variant="unchanged"
              path={f.path}
              meta={`${f.content.length}자`}
              isOpen={!!openFiles[`u-${f.path}`]}
              onToggle={() => toggle(`u-${f.path}`)}
            >
              <pre className="max-h-[320px] overflow-y-auto bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg-subtle whitespace-pre-wrap break-words custom-scrollbar">
                {f.content}
              </pre>
            </DiffFileRow>
          ))}
        </div>
      </Section>
    </div>
  )
}

function DiffFileRow({
  variant,
  path,
  meta,
  isOpen,
  onToggle,
  children,
}: {
  variant: 'added' | 'removed' | 'changed' | 'unchanged'
  path: string
  meta?: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const cls =
    variant === 'added'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
      : variant === 'removed'
        ? 'border-red-500/30 bg-red-500/5 text-red-300'
        : variant === 'changed'
          ? 'border-amber-500/30 bg-amber-500/5 text-amber-200'
          : 'border-border bg-bg text-fg-muted'
  const prefix =
    variant === 'added' ? '+ ' : variant === 'removed' ? '− ' : variant === 'changed' ? '~ ' : '  '
  const titleCls = variant === 'removed' ? 'line-through decoration-red-400/60' : ''
  return (
    <div className={cn('rounded border', cls)}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileCode2 className="h-3.5 w-3.5 opacity-70" />
        <span className={cn('truncate font-mono text-sm', titleCls)}>
          {prefix}
          {path}
        </span>
        {meta && <span className="ml-auto text-[10px] text-fg-subtle">{meta}</span>}
      </button>
      {isOpen && children}
    </div>
  )
}

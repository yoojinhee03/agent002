'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { WorkflowRun, StepTrace } from '@agent-studio/shared'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn, safeJsonStringify } from '@/lib/utils'

// ============================================================
// 타입
// ============================================================

interface Props {
  projectId: string
  agentId?: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

// ============================================================
// 유틸리티
// ============================================================

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function formatLatency(startedAt: string, completedAt?: string) {
  if (!completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-500/15 text-green-400',
    failed:    'bg-red-500/15 text-red-400',
    running:   'bg-blue-500/15 text-blue-400',
    pending:   'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]',
    cancelled: 'bg-amber-500/15 text-amber-400',
    waiting_input: 'bg-purple-500/15 text-purple-400',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', map[status] ?? 'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]')}>
      {status}
    </span>
  )
}

// ============================================================
// JsonCollapsible
// ============================================================

function JsonCollapsible({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded border border-[var(--color-border-strong)] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs text-fg overflow-x-auto whitespace-pre-wrap border-t border-[var(--color-border-strong)]">
          {safeJsonStringify(data)}
        </pre>
      )}
    </div>
  )
}

// ============================================================
// StepRow (타임라인 항목)
// ============================================================

const NODE_TYPE_ICON: Record<string, string> = {
  llm:       '🤖',
  tool:      '🔧',
  condition: '🔀',
  loop:      '🔄',
  transform: '⚙️',
  human_input: '👤',
}

function StepRow({ trace }: { trace: StepTrace }) {
  const [expanded, setExpanded] = useState(false)
  const icon = NODE_TYPE_ICON[trace.nodeType] ?? '📦'
  const latencyLabel = trace.latency !== undefined
    ? `${trace.latency}ms`
    : formatLatency(trace.startedAt, trace.completedAt)

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--color-surface-2)]"
      >
        <span className="text-base">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--color-fg)] truncate">{trace.nodeName}</span>
            <StatusBadge status={trace.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--color-fg-subtle)]">
            <span>{trace.nodeType}</span>
            <span>·</span>
            <span>{latencyLabel}</span>
            {trace.tokens !== undefined && (
              <>
                <span>·</span>
                <span>{trace.tokens} tok</span>
              </>
            )}
          </div>
        </div>
        <div className="text-[var(--color-fg-subtle)]">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-[var(--color-border)] p-3 space-y-2 bg-bg">
          {trace.errorMessage && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              {trace.errorMessage}
            </div>
          )}
          <JsonCollapsible label="Input" data={trace.input} />
          {trace.output !== undefined && (
            <JsonCollapsible label="Output" data={trace.output} />
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// RunRow (실행 목록 행)
// ============================================================

function RunRow({
  run,
  selected,
  onClick,
}: {
  run: WorkflowRun
  selected: boolean
  onClick: () => void
}) {
  const isOk = run.status === 'completed'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-3 text-left text-xs transition-colors',
        selected ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'hover:bg-[var(--color-surface-2)] border-l-2 border-transparent',
      )}
    >
      {isOk
        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
        : run.status === 'failed'
        ? <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
        : <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
      }
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <code className="text-xs text-[var(--color-fg)]">{run.id.slice(0, 8)}</code>
          <StatusBadge status={run.status} />
        </div>
        <div className="text-xs text-[var(--color-fg-subtle)]">{formatDate(run.startedAt)}</div>
      </div>
      <div className="shrink-0 text-right space-y-0.5">
        <div className="text-xs text-[var(--color-fg-subtle)]">{formatLatency(run.startedAt, run.completedAt)}</div>
        {run.totalCost !== undefined && (
          <div className="text-xs text-[var(--color-fg-subtle)]">${run.totalCost.toFixed(6)}</div>
        )}
      </div>
    </button>
  )
}

// ============================================================
// RunTraceViewer
// ============================================================

export function RunTraceViewer({ projectId, agentId }: Props) {
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null)
  const [traces, setTraces] = useState<StepTrace[]>([])
  const [tracesLoading, setTracesLoading] = useState(false)

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    try {
      const token = apiClient.getAccessToken()
      const params = new URLSearchParams({ limit: '20' })
      if (agentId) params.set('agentId', agentId)
      else params.set('projectId', projectId)

      const res = await fetch(`${API_URL}/api/runs?${params}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      if (!res.ok) return
      const data = await res.json() as { runs?: WorkflowRun[] } | WorkflowRun[]
      if (Array.isArray(data)) {
        setRuns(data)
      } else if (data.runs) {
        setRuns(data.runs)
      }
    } catch {
      // 네트워크 오류 무시
    } finally {
      setLoading(false)
    }
  }, [projectId, agentId])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const handleSelectRun = async (run: WorkflowRun) => {
    setSelectedRun(run)
    setTraces([])
    setTracesLoading(true)
    try {
      const fetched = await apiClient.runs.getTraces(run.id)
      setTraces(fetched)
    } catch {
      setTraces([])
    } finally {
      setTracesLoading(false)
    }
  }

  return (
    <div className="flex h-full divide-x divide-[var(--color-surface-2)]">
      {/* 실행 목록 */}
      <div className="flex w-80 shrink-0 flex-col">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-xs font-semibold text-[var(--color-fg-muted)]">실행 기록</span>
          <button
            onClick={fetchRuns}
            disabled={loading}
            className="rounded-md p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-surface-2)]">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-xs text-[var(--color-fg-subtle)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              로딩 중...
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--color-fg-subtle)]">
              <p className="text-xs">실행 기록이 없습니다</p>
            </div>
          ) : (
            runs.map(run => (
              <RunRow
                key={run.id}
                run={run}
                selected={selectedRun?.id === run.id}
                onClick={() => handleSelectRun(run)}
              />
            ))
          )}
        </div>
      </div>

      {/* 상세 타임라인 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selectedRun === null ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[var(--color-fg-subtle)]">
            <p className="text-sm">실행 기록을 선택하면 상세 타임라인이 표시됩니다</p>
          </div>
        ) : (
          <>
            {/* 상세 헤더 */}
            <div className="border-b border-[var(--color-border)] px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <code className="text-xs font-semibold text-[var(--color-fg)]">{selectedRun.id.slice(0, 8)}...</code>
                <StatusBadge status={selectedRun.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--color-fg-subtle)]">
                <span>시작: {formatDate(selectedRun.startedAt)}</span>
                <span>·</span>
                <span>소요: {formatLatency(selectedRun.startedAt, selectedRun.completedAt)}</span>
                {selectedRun.totalTokens !== undefined && (
                  <>
                    <span>·</span>
                    <span>{selectedRun.totalTokens} 토큰</span>
                  </>
                )}
                {selectedRun.totalCost !== undefined && (
                  <>
                    <span>·</span>
                    <span>${selectedRun.totalCost.toFixed(6)}</span>
                  </>
                )}
              </div>
              {selectedRun.errorMessage && (
                <div className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-xs text-red-400">
                  {selectedRun.errorMessage}
                </div>
              )}
            </div>

            {/* 타임라인 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {tracesLoading ? (
                <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  트레이스 로딩 중...
                </div>
              ) : traces.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-[var(--color-fg-subtle)]">
                  <p className="text-xs">Step trace가 없습니다</p>
                </div>
              ) : (
                traces.map((trace, i) => (
                  <StepRow key={trace.id ?? i} trace={trace} />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

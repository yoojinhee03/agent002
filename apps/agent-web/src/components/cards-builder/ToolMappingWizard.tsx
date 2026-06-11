'use client'

/**
 * 도구로 입력 자동생성 모달 (HITL argSchema 전용).
 *
 * 좌측: 도구 검색·선택 (사용자/빌트인/MCP 통합).
 * 우측: 선택된 도구의 inputSchema 기반 payload/sampleData diff 미리보기.
 * 적용: `injectToolFieldsIntoPayload` 결과 + sampleData 재계산을 호출부에 전달.
 *       호출부는 받은 결과로 payloadText/sampleText 를 갱신하고 도구 키를 targetTools 에 머지.
 *
 * 더 이상 AC `Input.*` 엘리먼트를 body 에 직접 박지 않는다 (HITL 슬롯 흐름으로 일원화).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Wand2, Search, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { Tool, BuiltinToolGroup, McpTool } from '@agent-studio/shared'
import { useUserStore } from '@/stores/use-user-store'
import { cn } from '@/lib/utils'
import { injectToolFieldsIntoPayload } from '@/lib/cards/inject-tool-fields'
import { buildSampleArgs } from '@/lib/cards/input-schema-to-arg-schema'
import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-slots'

interface ToolOption {
  key: string
  label: string
  description?: string
  kind: 'user' | 'builtin' | 'mcp'
  inputSchema?: unknown
}

interface ApplyResult {
  payload: Record<string, unknown>
  argSchema: HitlArgFieldSchema[] | null
  sampleData: Record<string, unknown>
  toolKey: string
  toolLabel: string
}

interface Props {
  open: boolean
  onClose: () => void
  currentPayload: Record<string, unknown> | null
  currentSampleData: Record<string, unknown> | null
  onApply: (result: ApplyResult) => void
}

type DiffLine = { kind: 'equal' | 'removed' | 'added'; text: string }

function computeDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const aSet = new Set(aLines)
  const bSet = new Set(bLines)
  const out: DiffLine[] = []
  for (const line of aLines) {
    out.push({ kind: bSet.has(line) ? 'equal' : 'removed', text: line })
  }
  for (const line of bLines) {
    if (!aSet.has(line)) out.push({ kind: 'added', text: line })
  }
  return out
}

export function ToolMappingWizard({
  open,
  onClose,
  currentPayload,
  currentSampleData,
  onApply,
}: Props) {
  const projectId = useUserStore((s) => s.activeProjectId)
  const [query, setQuery] = useState('')
  const [userTools, setUserTools] = useState<Tool[] | null>(null)
  const [builtinGroups, setBuiltinGroups] = useState<BuiltinToolGroup[] | null>(null)
  const [mcpGroups, setMcpGroups] = useState<
    Array<{ serverId: string; serverName: string; tools: McpTool[] }> | null
  >(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || !projectId) return
    let cancelled = false
    Promise.all([
      apiClient.tools.list(projectId),
      apiClient.tools.getBuiltin(projectId),
      apiClient.mcp.listAllTools(projectId),
    ])
      .then(([rows, groups, mcp]) => {
        if (cancelled) return
        setUserTools(rows)
        setBuiltinGroups(groups)
        setMcpGroups(mcp)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : '도구 목록 조회 실패')
      })
    return () => {
      cancelled = true
    }
  }, [open, projectId])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedKey(null)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const options = useMemo<ToolOption[]>(() => {
    const arr: ToolOption[] = []
    for (const t of userTools ?? []) {
      arr.push({
        key: t.name,
        label: t.name,
        description: t.description,
        kind: 'user',
        inputSchema: t.inputSchema,
      })
    }
    for (const g of builtinGroups ?? []) {
      for (const t of g.tools) {
        arr.push({
          key: t.id,
          label: t.name,
          description: t.description,
          kind: 'builtin',
          inputSchema: t.inputSchema,
        })
      }
    }
    for (const g of mcpGroups ?? []) {
      for (const t of g.tools) {
        arr.push({
          key: t.name,
          label: t.name,
          description: t.description ? `${g.serverName} · ${t.description}` : g.serverName,
          kind: 'mcp',
          inputSchema: t.inputSchema,
        })
      }
    }
    return arr
  }, [userTools, builtinGroups, mcpGroups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.key.toLowerCase().includes(q) ||
        (o.description ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  const selected = useMemo(
    () => options.find((o) => o.key === selectedKey) ?? null,
    [options, selectedKey],
  )

  const nextResult = useMemo(() => {
    if (!selected) return null
    const injected = injectToolFieldsIntoPayload(
      currentPayload ?? {},
      selected.inputSchema ?? null,
    )
    if (!injected) return null
    const sampleArgs = buildSampleArgs(selected.inputSchema) ?? {}
    const baseSample = (currentSampleData ?? {}) as Record<string, unknown>
    const nextSample = { ...baseSample, toolName: selected.key, toolArgs: sampleArgs }
    return { ...injected, sampleData: nextSample }
  }, [selected, currentPayload, currentSampleData])

  const payloadDiff = useMemo<DiffLine[]>(() => {
    if (!nextResult) return []
    const before = JSON.stringify(currentPayload ?? {}, null, 2)
    const after = JSON.stringify(nextResult.payload, null, 2)
    if (before === after) return []
    return computeDiff(before, after)
  }, [nextResult, currentPayload])

  const sampleDiff = useMemo<DiffLine[]>(() => {
    if (!nextResult) return []
    const before = JSON.stringify(currentSampleData ?? {}, null, 2)
    const after = JSON.stringify(nextResult.sampleData, null, 2)
    if (before === after) return []
    return computeDiff(before, after)
  }, [nextResult, currentSampleData])

  const hasChanges = payloadDiff.length > 0 || sampleDiff.length > 0

  if (!open) return null

  const handleApply = () => {
    if (!selected || !nextResult) return
    onApply({
      payload: nextResult.payload,
      argSchema: nextResult.argSchema,
      sampleData: nextResult.sampleData,
      toolKey: selected.key,
      toolLabel: selected.label,
    })
    toast.success(`${selected.label} 스키마를 카드에 적용했습니다`)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-blue-300" />
            <h2 className="text-sm font-semibold text-fg">도구로 입력 자동생성</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-fg-muted hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
          {/* 좌측: 도구 검색·선택 */}
          <div className="flex min-h-0 flex-col border-r border-border">
            {!projectId && (
              <div className="m-2 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-200">
                <AlertCircle className="mr-1 inline h-3 w-3" />
                활성 프로젝트가 없습니다
              </div>
            )}
            <div className="flex items-center gap-1.5 border-b border-border bg-bg/40 px-2 py-1.5">
              <Search className="h-3 w-3 text-fg-subtle" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="도구 검색..."
                className="w-full bg-transparent text-[11px] text-fg placeholder:text-fg-subtle outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-center text-[11px] text-fg-subtle">
                  {options.length === 0 ? '도구 불러오는 중...' : '일치하는 도구 없음'}
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((o) => (
                    <li key={`${o.kind}:${o.key}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(o.key)}
                        className={cn(
                          'flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left transition-colors',
                          selectedKey === o.key ? 'bg-blue-500/15' : 'hover:bg-bg/40',
                        )}
                      >
                        <div className="flex w-full items-center gap-1.5">
                          <span className="truncate font-mono text-[11px] text-fg">
                            {o.label}
                          </span>
                          <KindBadge kind={o.kind} />
                        </div>
                        {o.description && (
                          <span className="line-clamp-2 text-[10px] text-fg-subtle">
                            {o.description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 우측: 도구 상세 + diff */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-[11px] text-fg-subtle">
                좌측에서 도구를 선택하세요
              </div>
            ) : (
              <>
                <div className="border-b border-border bg-bg/40 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-fg">{selected.label}</span>
                    <KindBadge kind={selected.kind} />
                    <span className="font-mono text-[10px] text-fg-subtle">{selected.key}</span>
                  </div>
                  {selected.description && (
                    <p className="mt-1 text-[11px] text-fg-muted">{selected.description}</p>
                  )}
                  {!selected.inputSchema && (
                    <p className="mt-1 text-[11px] text-amber-200">
                      <AlertCircle className="mr-1 inline h-3 w-3" />
                      이 도구는 inputSchema 가 없습니다 — argSchema 가 비워집니다
                    </p>
                  )}
                </div>
                <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
                  <DiffPanel
                    title="payload (JSON) 변경"
                    lines={payloadDiff}
                    emptyText="payload 변경 없음"
                  />
                  <div className="border-l border-border">
                    <DiffPanel
                      title="sampleData (JSON) 변경"
                      lines={sampleDiff}
                      emptyText="sampleData 변경 없음"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-[11px] text-fg-muted hover:text-fg"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!selected || !hasChanges}
            onClick={handleApply}
            className="rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            title={
              !selected
                ? '도구를 선택하세요'
                : !hasChanges
                  ? '변경 사항이 없습니다'
                  : '카드에 적용'
            }
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}

function DiffPanel({
  title,
  lines,
  emptyText,
}: {
  title: string
  lines: DiffLine[]
  emptyText: string
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="border-b border-border bg-bg/40 px-3 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? (
          <div className="px-3 py-4 text-center text-[11px] text-fg-subtle">{emptyText}</div>
        ) : (
          <table className="w-full border-collapse font-mono text-[10.5px]">
            <tbody>
              {lines.map((line, i) => (
                <tr
                  key={i}
                  className={cn(
                    line.kind === 'removed' && 'bg-red-500/10',
                    line.kind === 'added' && 'bg-green-500/10',
                  )}
                >
                  <td
                    className={cn(
                      'w-5 select-none border-r border-border px-1 py-0 text-center',
                      line.kind === 'removed' && 'text-red-400',
                      line.kind === 'added' && 'text-green-400',
                      line.kind === 'equal' && 'text-fg-subtle',
                    )}
                  >
                    {line.kind === 'removed' ? '−' : line.kind === 'added' ? '+' : ' '}
                  </td>
                  <td
                    className={cn(
                      'whitespace-pre px-2 py-0',
                      line.kind === 'removed' && 'text-red-300',
                      line.kind === 'added' && 'text-green-300',
                      line.kind === 'equal' && 'text-fg-muted',
                    )}
                  >
                    {line.text || ' '}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function KindBadge({ kind }: { kind: 'user' | 'builtin' | 'mcp' }) {
  const label = kind === 'builtin' ? '빌트인' : kind === 'mcp' ? 'MCP' : '도구'
  const cls =
    kind === 'builtin'
      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
      : kind === 'mcp'
        ? 'border-purple-500/40 bg-purple-500/10 text-purple-200'
        : 'border-border bg-bg/40 text-fg-subtle'
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1 py-px text-[9px] font-medium uppercase tracking-wider',
        cls,
      )}
    >
      {label}
    </span>
  )
}

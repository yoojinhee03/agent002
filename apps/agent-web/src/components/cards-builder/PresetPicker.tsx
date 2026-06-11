'use client'

/**
 * 새 카드 시작 마법사 — 2단계.
 *
 *  1. 템플릿 선택(필수) — CARD_PRESETS 3종.
 *  2. 도구 선택(옵션) — inputSchema 가 있는 도구를 골라 argSchema 자동 채움. 건너뛸 수 있음.
 *
 * 최종 "새 카드 생성" 시 호출부에 { preset, toolKey? } 전달.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sparkles, Search, ChevronLeft, Wrench, Check } from 'lucide-react'
import { toast } from 'sonner'
import { CARD_PRESETS, type CardPreset } from '@/lib/cards/payload-presets'
import { apiClient } from '@/lib/api-client'
import type { Tool, BuiltinToolGroup, McpTool } from '@agent-studio/shared'
import { cn } from '@/lib/utils'

interface ToolOption {
  key: string
  label: string
  description?: string
  kind: 'user' | 'builtin' | 'mcp'
}

export interface PresetPickerResult {
  preset: CardPreset
  toolKey?: string
  toolLabel?: string
}

interface Props {
  open: boolean
  projectId: string | null
  onSelect: (result: PresetPickerResult) => void
  onClose: () => void
}

type Step = 'preset' | 'tool'

export function PresetPicker({ open, projectId, onSelect, onClose }: Props) {
  const [step, setStep] = useState<Step>('preset')
  const [query, setQuery] = useState('')
  const [userTools, setUserTools] = useState<Tool[] | null>(null)
  const [builtinGroups, setBuiltinGroups] = useState<BuiltinToolGroup[] | null>(null)
  const [mcpGroups, setMcpGroups] = useState<
    Array<{ serverId: string; serverName: string; tools: McpTool[] }> | null
  >(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [selectedTool, setSelectedTool] = useState<ToolOption | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) {
      setStep('preset')
      setQuery('')
      setSelectedPresetId(null)
      setSelectedTool(null)
    }
  }, [open])

  useEffect(() => {
    if (step !== 'tool' || !projectId) return
    if (userTools || builtinGroups || mcpGroups) return
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
  }, [step, projectId, userTools, builtinGroups, mcpGroups])

  useEffect(() => {
    if (step === 'tool') setTimeout(() => inputRef.current?.focus(), 0)
  }, [step])

  const options = useMemo<ToolOption[]>(() => {
    const arr: ToolOption[] = []
    for (const t of userTools ?? []) {
      arr.push({ key: t.name, label: t.name, description: t.description, kind: 'user' })
    }
    for (const g of builtinGroups ?? []) {
      for (const t of g.tools) {
        arr.push({ key: t.id, label: t.name, description: t.description, kind: 'builtin' })
      }
    }
    for (const g of mcpGroups ?? []) {
      for (const t of g.tools) {
        arr.push({
          key: t.name,
          label: t.name,
          description: t.description ? `${g.serverName} · ${t.description}` : g.serverName,
          kind: 'mcp',
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

  const selectedPreset = useMemo(
    () => CARD_PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  )
  // hitl-choice 는 도구 inputSchema 와 무관(prompt/choices 만 사용) — 도구 단계 건너뜀.
  const supportsToolMapping = selectedPreset ? selectedPreset.id !== 'hitl-choice' : false

  if (!open) return null

  const submit = (withTool: boolean) => {
    if (!selectedPreset) return
    if (withTool && !selectedTool) return
    onSelect({
      preset: selectedPreset,
      toolKey: withTool && selectedTool ? selectedTool.key : undefined,
      toolLabel: withTool && selectedTool ? selectedTool.label : undefined,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {step === 'tool' && (
            <button
              type="button"
              onClick={() => setStep('preset')}
              className="rounded p-1 text-fg-muted hover:text-fg"
              title="템플릿 선택으로 돌아가기"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-fg">
              {step === 'preset' ? '1단계 — 템플릿 선택' : '2단계 — 도구 선택 (옵션)'}
            </h2>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {step === 'preset'
                ? '카드 본문 구조를 정합니다. 발행 전에 자유롭게 수정할 수 있습니다.'
                : '도구의 inputSchema 로 argSchema 가 자동 채워집니다. 건너뛰어도 됩니다.'}
            </p>
          </div>
          <StepIndicator step={step} />
        </div>

        {step === 'preset' ? (
          <div className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-2">
            {CARD_PRESETS.map((preset) => {
              const isSelected = selectedPresetId === preset.id
              const noTool = preset.id === 'hitl-choice'
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPresetId(preset.id)}
                  onDoubleClick={() => (noTool ? submit(false) : setStep('tool'))}
                  className={cn(
                    'flex flex-col gap-1 rounded border bg-bg/40 px-3 py-2 text-left transition',
                    isSelected
                      ? 'border-blue-400/80 bg-blue-500/10 ring-1 ring-blue-400/40'
                      : 'border-border hover:border-blue-400/60 hover:bg-blue-500/5',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-fg">
                      {isSelected && <Check className="h-3 w-3 text-blue-300" />}
                      {preset.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {noTool && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] uppercase bg-fg/10 text-fg-subtle">
                          도구 미지원
                        </span>
                      )}
                      <span className="rounded px-1.5 py-0.5 text-[9px] uppercase bg-sky-500/10 text-sky-300">
                        HITL
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] leading-snug text-fg-subtle">{preset.description}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="p-3">
            <div className="mb-2 flex items-center gap-1.5 rounded border border-border bg-bg/40 px-2 py-1.5">
              <Search className="h-3 w-3 text-fg-subtle" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="도구 검색..."
                className="w-full bg-transparent text-xs text-fg placeholder:text-fg-subtle outline-none"
              />
              {selectedTool && (
                <button
                  type="button"
                  onClick={() => setSelectedTool(null)}
                  className="text-[10px] text-fg-subtle hover:text-fg"
                >
                  선택 해제
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto rounded border border-border bg-[var(--color-surface-2)]">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-fg-subtle">
                  {options.length === 0 ? '도구 불러오는 중...' : '일치하는 도구 없음'}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {filtered.map((o) => {
                    const isSelected =
                      selectedTool?.key === o.key && selectedTool?.kind === o.kind
                    return (
                      <li key={`${o.kind}:${o.key}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedTool(o)}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left transition',
                            isSelected
                              ? 'bg-blue-500/15 ring-1 ring-inset ring-blue-400/40'
                              : 'hover:bg-bg/40',
                          )}
                        >
                          <Check
                            className={cn(
                              'h-3 w-3 shrink-0',
                              isSelected ? 'text-blue-300' : 'text-transparent',
                            )}
                          />
                          <Wrench className="h-3 w-3 shrink-0 text-fg-subtle" />
                          <span className="truncate font-mono text-xs text-fg">{o.label}</span>
                          <KindBadge kind={o.kind} />
                          {o.description && (
                            <span className="ml-auto truncate text-[10px] text-fg-subtle">
                              {o.description}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <p className="mt-2 flex items-center gap-1 text-[10px] text-fg-subtle">
              <Sparkles className="h-3 w-3 text-purple-300" />
              도구를 고르지 않아도 카드 생성은 가능합니다 (도구 없이 생성).
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border bg-bg/40 px-4 py-2">
          <div className="truncate text-[11px] text-fg-subtle">
            {step === 'preset' ? (
              selectedPreset ? (
                <span>
                  템플릿: <span className="text-fg">{selectedPreset.label}</span>
                </span>
              ) : (
                '템플릿을 선택하세요'
              )
            ) : (
              <span>
                템플릿: <span className="text-fg">{selectedPreset?.label}</span>
                {selectedTool && (
                  <>
                    {' · '}
                    도구: <span className="font-mono text-fg">{selectedTool.label}</span>
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1 text-[11px] text-fg-muted hover:text-fg"
            >
              취소
            </button>
            {step === 'preset' ? (
              supportsToolMapping ? (
                <button
                  type="button"
                  disabled={!selectedPreset}
                  onClick={() => setStep('tool')}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  다음
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!selectedPreset}
                  onClick={() => submit(false)}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  새 카드 생성
                </button>
              )
            ) : (
              <>
                <button
                  type="button"
                  disabled={!selectedPreset}
                  onClick={() => submit(false)}
                  className="rounded border border-border px-3 py-1 text-[11px] text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  도구 없이 생성
                </button>
                <button
                  type="button"
                  disabled={!selectedPreset || !selectedTool}
                  onClick={() => submit(true)}
                  className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  새 카드 생성
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-fg-subtle">
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5',
          step === 'preset' ? 'bg-blue-500/20 text-blue-200' : 'bg-bg/40',
        )}
      >
        1
      </span>
      <span>—</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5',
          step === 'tool' ? 'bg-blue-500/20 text-blue-200' : 'bg-bg/40',
        )}
      >
        2
      </span>
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

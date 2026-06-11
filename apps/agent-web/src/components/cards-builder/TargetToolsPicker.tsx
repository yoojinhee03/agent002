'use client'

/**
 * 카드 빌더 헤더용 multi-select 도구 picker.
 *
 * - 선택된 도구 키를 칩 목록으로 표시, 우측 `+ 추가` 버튼으로 검색 popover 오픈.
 * - 사용자/빌트인/MCP 도구 통합 (apiClient.tools.list + getBuiltin + mcp.listAllTools).
 * - **순수 선택 컴포넌트** — payload/sampleData 부작용 없음. 호출부는 키 배열만 받는다.
 * - 스키마 반영은 `ToolMappingWizard` 모달에서 별도 처리.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X, Wrench, Plus, Check } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { Tool, BuiltinToolGroup, McpTool } from '@agent-studio/shared'
import { cn } from '@/lib/utils'

interface ToolOption {
  key: string
  label: string
  description?: string
  kind: 'user' | 'builtin' | 'mcp'
}

interface Props {
  value: string[]
  projectId: string | null
  placeholder?: string
  onChange: (next: string[]) => void
}

export function TargetToolsPicker({ value, projectId, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [userTools, setUserTools] = useState<Tool[] | null>(null)
  const [builtinGroups, setBuiltinGroups] = useState<BuiltinToolGroup[] | null>(null)
  const [mcpGroups, setMcpGroups] = useState<
    Array<{ serverId: string; serverName: string; tools: McpTool[] }> | null
  >(null)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!projectId) return
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
  }, [projectId])

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

  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(0)
  }, [filtered.length, highlight])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setHighlight(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const selectedSet = useMemo(() => new Set(value), [value])

  const toggle = (key: string) => {
    if (selectedSet.has(key)) onChange(value.filter((k) => k !== key))
    else onChange([...value, key])
  }

  const remove = (key: string) => {
    onChange(value.filter((k) => k !== key))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = filtered[highlight]
      if (o) toggle(o.key)
    }
  }

  const chipFor = (key: string): ToolOption => {
    return options.find((o) => o.key === key) ?? { key, label: key, kind: 'user' }
  }

  return (
    <div ref={containerRef} className="relative flex min-w-64 flex-1 items-center gap-1">
      <div
        className={cn(
          'flex flex-1 flex-wrap items-center gap-1 rounded border border-border bg-[var(--color-surface-2)] px-1.5 py-1 text-[11px] transition-colors',
          open && 'border-blue-400/60',
        )}
      >
        <Wrench className="h-3 w-3 shrink-0 text-fg-subtle" />
        {value.length === 0 && (
          <span className="text-fg-subtle">{placeholder ?? '대상 도구 (검색 후 선택)'}</span>
        )}
        {value.map((key) => {
          const o = chipFor(key)
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded border border-border bg-bg/40 px-1.5 py-0.5"
            >
              <span className="font-mono text-fg">{o.label}</span>
              <KindBadge kind={o.kind} />
              <button
                type="button"
                onClick={() => remove(key)}
                className="rounded text-fg-subtle hover:text-fg"
                title="제거"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-fg-subtle hover:text-fg"
        >
          <Plus className="h-3 w-3" />
          추가
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-[var(--color-surface)] shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-border bg-bg/40 px-2 py-1.5">
            <Search className="h-3 w-3 text-fg-subtle" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="도구 검색..."
              className="w-full bg-transparent text-[11px] text-fg placeholder:text-fg-subtle outline-none"
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-fg-subtle">
                {options.length === 0 ? '도구 불러오는 중...' : '일치하는 도구 없음'}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((o, i) => {
                  const selected = selectedSet.has(o.key)
                  return (
                    <li key={`${o.kind}:${o.key}`}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => toggle(o.key)}
                        className={cn(
                          'flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors',
                          i === highlight ? 'bg-blue-500/15' : 'hover:bg-bg/40',
                        )}
                      >
                        <Check
                          className={cn(
                            'h-3 w-3 shrink-0',
                            selected ? 'text-green-300' : 'text-transparent',
                          )}
                        />
                        <span className="truncate font-mono text-[11px] text-fg">{o.label}</span>
                        <KindBadge kind={o.kind} />
                        {o.kind === 'user' && o.label !== o.key && (
                          <span className="truncate font-mono text-[10px] text-fg-subtle">
                            {o.key}
                          </span>
                        )}
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
        </div>
      )}
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

'use client'

/**
 * 카드 빌더용 단일 선택 도구 자동완성 picker.
 *
 * - 프로젝트 도구(`apiClient.tools.list`) + 빌트인 도구(`apiClient.tools.getBuiltin`) 통합.
 * - 검색 input 으로 라벨/키 부분일치 필터 (SnippetPalette 와 동일 패턴).
 * - 선택값: `targetTools` 에 저장될 단일 문자열.
 *   · 사용자 도구 → `Tool.name`
 *   · 빌트인 도구 → `BuiltinTool.id`
 * - `onChange(key, option)` 의 option 에 `inputSchema` 가 동봉되므로 호출부에서
 *   카드의 `argSchema` 자동 시드에 사용할 수 있다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { Tool, BuiltinToolGroup, McpTool } from '@agent-studio/shared'
import { cn } from '@/lib/utils'

export interface ToolOption {
  key: string
  label: string
  description?: string
  kind: 'user' | 'builtin' | 'mcp'
  inputSchema?: unknown
}

interface Props {
  value: string | null
  projectId: string | null
  placeholder?: string
  onChange: (key: string | null, option: ToolOption | null) => void
}

export function ToolPicker({ value, projectId, placeholder, onChange }: Props) {
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

  const selected = useMemo<ToolOption | null>(() => {
    if (!value) return null
    return options.find((o) => o.key === value) ?? { key: value, label: value, kind: 'user' }
  }, [value, options])

  const choose = (o: ToolOption) => {
    onChange(o.key, o)
    setOpen(false)
  }

  const clear = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    onChange(null, null)
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
      if (o) choose(o)
    }
  }

  return (
    <div ref={containerRef} className="relative w-64">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 text-left text-[11px] outline-none transition-colors hover:border-blue-400/40',
          open && 'border-blue-400/60',
        )}
      >
        <Wrench className="h-3 w-3 shrink-0 text-fg-subtle" />
        {selected ? (
          <>
            <span className="truncate font-mono text-fg">{selected.label}</span>
            <KindBadge kind={selected.kind} />
            <span
              role="button"
              tabIndex={0}
              onClick={clear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  clear(e)
                }
              }}
              className="ml-auto rounded p-0.5 text-fg-subtle hover:text-fg"
              title="선택 해제"
            >
              <X className="h-3 w-3" />
            </span>
          </>
        ) : (
          <span className="truncate text-fg-subtle">
            {placeholder ?? '대상 도구 선택 (비우면 generic)'}
          </span>
        )}
        {!selected && <ChevronDown className="ml-auto h-3 w-3 text-fg-subtle" />}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-[var(--color-surface)] shadow-xl">
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
                {filtered.map((o, i) => (
                  <li key={`${o.kind}:${o.key}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => choose(o)}
                      className={cn(
                        'flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors',
                        i === highlight ? 'bg-blue-500/15' : 'hover:bg-bg/40',
                      )}
                    >
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
                ))}
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

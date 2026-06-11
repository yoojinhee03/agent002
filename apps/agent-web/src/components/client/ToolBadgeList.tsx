'use client'

import { Wrench, ShieldCheck, ShieldAlert, Globe, KeyRound, Sparkles } from 'lucide-react'
import type { ToolRef } from '@agent-studio/shared'
import { cn } from '@/lib/utils'

interface Props {
  tools: ToolRef[]
  haveCredentials?: Set<string>
  emptyText?: string
  dense?: boolean
}

const KIND_LABEL: Record<ToolRef['kind'], string> = {
  builtin: '내장',
  custom: '커스텀',
  mcp: 'MCP',
}

const KIND_ICON = {
  builtin: Wrench,
  custom: Sparkles,
  mcp: Globe,
}

export function ToolBadgeList({ tools, haveCredentials, emptyText, dense }: Props) {
  if (tools.length === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
        {emptyText ?? '사용 도구 없음'}
      </p>
    )
  }

  return (
    <ul className={cn('space-y-1.5', dense && 'space-y-1')}>
      {tools.map((tool) => {
        const Icon = KIND_ICON[tool.kind]
        const credentialReady =
          tool.requiresCredential && tool.credentialTargetId
            ? (haveCredentials?.has(
                tool.kind === 'mcp' ? `mcp:${tool.credentialTargetId}` : `tool:${tool.credentialTargetId}`,
              ) ?? false)
            : false
        return (
          <li
            key={`${tool.kind}:${tool.id}`}
            className="flex items-start gap-2 rounded-lg border px-2.5 py-1.5"
            style={{
              borderColor: 'var(--client-border)',
              background: 'var(--client-bg)',
            }}
          >
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded"
              style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className="truncate text-xs font-semibold"
                  style={{ color: 'var(--client-text)' }}
                >
                  {tool.label}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9.5px] font-medium uppercase"
                  style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted-2)' }}
                >
                  {KIND_LABEL[tool.kind]}
                </span>
                {tool.kind === 'mcp' && tool.mcpServerName && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9.5px]"
                    style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
                  >
                    {tool.mcpServerName}
                  </span>
                )}
                {tool.kind === 'mcp' && tool.credentialMode === 'shared' && (
                  <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9.5px] text-slate-600">
                    공유
                  </span>
                )}
                {tool.requiresCredential ? (
                  credentialReady ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-medium text-emerald-600">
                      <ShieldCheck className="h-2.5 w-2.5" />
                      준비됨
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9.5px] font-medium text-amber-600">
                      <ShieldAlert className="h-2.5 w-2.5" />
                      자격증명 필요
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-1.5 py-0.5 text-[9.5px] text-slate-500">
                    <KeyRound className="h-2.5 w-2.5" />
                    자유 사용
                  </span>
                )}
              </div>
              {tool.description && !dense && (
                <p
                  className="mt-0.5 line-clamp-2 text-xs leading-snug"
                  style={{ color: 'var(--client-muted)' }}
                >
                  {tool.description}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

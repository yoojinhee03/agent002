'use client'

/**
 * MCP 추천 카탈로그 패널 — 사전 정의된 인기 MCP (Tavily, Context7 등) 를 토글 ON/OFF 로
 * 간편 활성화. envSchema 가 있으면 모달로 시크릿만 받고, 백엔드에서 `apiClient.mcp.create`
 * + `connect` 자동 호출.
 *
 * 기존 위치: BuiltinToolsPanel 안에 "MCP" 그룹으로 같이 그렸으나, 사용자가 MCP 탭에서
 * 동일 카탈로그를 또 보는 혼란이 있어 Built-in 탭에서 제거하고 MCP 탭의 "추천" 영역으로
 * 일원화 (2026-05-20).
 */

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MCP_CATALOG, type McpCatalogEntry } from '@/lib/mcp-catalog'
import type { McpServer } from '@agent-studio/shared'

interface Props {
  projectId: string
  servers: McpServer[]
  /** 서버 목록 갱신 콜백 — create/delete 후 부모 state 동기화. */
  onServersChange: (servers: McpServer[]) => void
}

export function McpCatalogPanel({ projectId, servers, onServersChange }: Props) {
  const [togglingMcpId, setTogglingMcpId] = useState<string | null>(null)
  const [mcpModalEntry, setMcpModalEntry] = useState<McpCatalogEntry | null>(null)
  const [mcpEnvValues, setMcpEnvValues] = useState<Record<string, string>>({})
  const [mcpModalSaving, setMcpModalSaving] = useState(false)
  const [mcpModalError, setMcpModalError] = useState<string | null>(null)

  const findMcpServerByCatalog = (catalogId: string): McpServer | undefined => {
    return servers.find((s) => s.config?.catalogId === catalogId)
  }

  const isCatalogActive = (catalogId: string): boolean => {
    const srv = findMcpServerByCatalog(catalogId)
    if (!srv) return false
    return srv.status === 'connected' || srv.status === 'connecting'
  }

  const buildCatalogConfig = (
    entry: McpCatalogEntry,
    env: Record<string, string>,
  ) => {
    // defaultEnv 를 base, 사용자가 입력한 env 가 override.
    const mergedEnv: Record<string, string> = { ...(entry.defaultEnv ?? {}), ...env }
    // envSchema 의 secret=true 키 목록 — runner 가 사용자별 자격증명 override 시
    // 이 목록만 교체하도록 메타로 저장 (defaultEnv 의 SLACK_MCP_ADD_MESSAGE_TOOL 같은
    // non-secret 값이 토큰값으로 덮이는 회귀 방지).
    const secretKeys = entry.envSchema.filter((f) => f.secret).map((f) => f.key)
    if (entry.transport === 'stdio') {
      return {
        command: entry.command,
        args: entry.args ?? [],
        env: mergedEnv,
        catalogId: entry.id,
        secretKeys,
      }
    }
    return {
      url: entry.url,
      headers: entry.headers ?? {},
      catalogId: entry.id,
      secretKeys,
    }
  }

  const handleActivateCatalog = async (
    entry: McpCatalogEntry,
    env: Record<string, string>,
  ): Promise<void> => {
    setTogglingMcpId(entry.id)
    try {
      const created = await apiClient.mcp.create(projectId, {
        name: entry.name,
        description: entry.description,
        transport: entry.transport,
        config: buildCatalogConfig(entry, env),
      })
      let next = [...servers.filter((s) => s.id !== created.id), created]
      onServersChange(next)
      try {
        const connected = await apiClient.mcp.connect(created.id)
        next = next.map((s) => (s.id === connected.id ? connected : s))
        onServersChange(next)
      } catch {
        // connect 실패 시에도 row 는 남겨둔다 — 사용자가 직접 등록 영역에서 재시도 가능.
      }
    } finally {
      setTogglingMcpId(null)
    }
  }

  const handleDeactivateCatalog = async (entry: McpCatalogEntry): Promise<void> => {
    const existing = findMcpServerByCatalog(entry.id)
    if (!existing) return
    setTogglingMcpId(entry.id)
    try {
      await apiClient.mcp.delete(existing.id)
      onServersChange(servers.filter((s) => s.id !== existing.id))
    } finally {
      setTogglingMcpId(null)
    }
  }

  const handleToggleMcpCatalog = async (entry: McpCatalogEntry): Promise<void> => {
    if (togglingMcpId) return
    const active = isCatalogActive(entry.id)
    if (active) {
      await handleDeactivateCatalog(entry)
      return
    }
    if (entry.envSchema.length === 0) {
      await handleActivateCatalog(entry, {})
      return
    }
    const initial: Record<string, string> = {}
    entry.envSchema.forEach((f) => { initial[f.key] = '' })
    setMcpEnvValues(initial)
    setMcpModalError(null)
    setMcpModalEntry(entry)
  }

  const handleSubmitMcpModal = async (): Promise<void> => {
    if (!mcpModalEntry) return
    const missing = mcpModalEntry.envSchema
      .filter((f) => f.required && !(mcpEnvValues[f.key] || '').trim())
      .map((f) => f.label)
    if (missing.length > 0) {
      setMcpModalError(`필수 값을 입력하세요: ${missing.join(', ')}`)
      return
    }
    setMcpModalSaving(true)
    setMcpModalError(null)
    try {
      const env: Record<string, string> = {}
      Object.entries(mcpEnvValues).forEach(([k, v]) => {
        const trimmed = (v || '').trim()
        if (trimmed) env[k] = trimmed
      })
      await handleActivateCatalog(mcpModalEntry, env)
      setMcpModalEntry(null)
      setMcpEnvValues({})
    } catch (e) {
      setMcpModalError(e instanceof Error ? e.message : 'MCP 서버 등록 실패')
    } finally {
      setMcpModalSaving(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)]">
          <span className="text-xl shrink-0">🎯</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--color-fg)]">추천 MCP</span>
              {(() => {
                const activeCount = MCP_CATALOG.filter((e) => isCatalogActive(e.id)).length
                return activeCount > 0 ? (
                  <span className="rounded-full px-2 py-0.5 text-xs bg-green-500/15 text-green-400">
                    {activeCount}개 활성
                  </span>
                ) : null
              })()}
            </div>
            <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
              사전 정의된 인기 MCP 서버 — 토글로 빠르게 활성화/비활성화 합니다.
            </p>
          </div>
        </div>

        <div className="divide-y divide-[var(--color-surface-2)]">
          {MCP_CATALOG.map((entry) => {
            const active = isCatalogActive(entry.id)
            const isToggling = togglingMcpId === entry.id
            const srv = findMcpServerByCatalog(entry.id)
            const errored = srv?.status === 'error'

            return (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] text-base">
                  {entry.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-[var(--color-fg)]">{entry.name}</p>
                    {errored && (
                      <span className="rounded-full px-1.5 py-0.5 text-xs bg-red-500/15 text-red-400">
                        오류
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-fg-subtle)] truncate">{entry.description}</p>
                  {entry.note && (
                    <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">{entry.note}</p>
                  )}
                </div>
                <button
                  onClick={() => { void handleToggleMcpCatalog(entry) }}
                  disabled={isToggling || togglingMcpId !== null}
                  className={cn(
                    'shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap min-w-[72px]',
                    active
                      ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)]',
                    (isToggling || (togglingMcpId !== null && togglingMcpId !== entry.id))
                      && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {isToggling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-green-400' : 'bg-[var(--color-fg-subtle)]')} />
                      활성화
                    </>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* env 입력 모달 — envSchema 가 있는 카탈로그 활성화 시 표시 */}
      {mcpModalEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-md rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{mcpModalEntry.icon}</span>
                  <p className="text-sm font-semibold text-[var(--color-fg)] truncate">{mcpModalEntry.name} 활성화</p>
                </div>
                <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5 truncate">{mcpModalEntry.description}</p>
              </div>
              <button
                onClick={() => {
                  if (mcpModalSaving) return
                  setMcpModalEntry(null)
                  setMcpEnvValues({})
                  setMcpModalError(null)
                }}
                className="rounded-lg p-2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)] disabled:opacity-50"
                disabled={mcpModalSaving}
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {mcpModalEntry.envSchema.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
                    <span>
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </span>
                    {field.helpUrl && (
                      <a
                        href={field.helpUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-300/80 hover:text-blue-300"
                      >
                        발급 페이지 <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </label>
                  <input
                    type={field.secret ? 'password' : 'text'}
                    value={mcpEnvValues[field.key] ?? ''}
                    onChange={(e) => setMcpEnvValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    placeholder={field.placeholder ?? ''}
                    autoComplete="off"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-xs text-[var(--color-fg-subtle)] font-mono">{field.key}</p>
                </div>
              ))}
              {mcpModalError && (
                <p className="text-xs text-red-400">{mcpModalError}</p>
              )}
              {mcpModalEntry.note && (
                <p className="text-xs text-[var(--color-fg-subtle)]">{mcpModalEntry.note}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
              <button
                onClick={() => {
                  if (mcpModalSaving) return
                  setMcpModalEntry(null)
                  setMcpEnvValues({})
                  setMcpModalError(null)
                }}
                disabled={mcpModalSaving}
                className="px-3 py-1.5 text-xs rounded text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] disabled:opacity-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => { void handleSubmitMcpModal() }}
                disabled={mcpModalSaving}
                className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
              >
                {mcpModalSaving ? '활성화 중...' : '활성화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type { McpServer, McpTool } from '@agent-studio/shared'
import { Plug, Unplug, Trash2, ChevronDown, ChevronRight, Loader2, Terminal, Globe, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useConfirmHelpers } from '@/components/shared/confirm-dialog'
import { McpServerDialog } from '@/components/tools/McpServerDialog'

interface Props {
  server: McpServer
  onUpdate: (server: McpServer) => void
  onDelete: (id: string) => void
}

const STATUS_CONFIG = {
  connected:    { color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/30', dot: 'bg-green-400',  label: '연결됨' },
  disconnected: { color: 'text-[var(--color-fg-subtle)]',  bg: 'bg-[var(--color-surface)] border-[var(--color-border-strong)]',      dot: 'bg-[var(--color-fg-subtle)]',  label: '미연결' },
  connecting:   { color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/30', dot: 'bg-amber-400',  label: '연결 중' },
  error:        { color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30',     dot: 'bg-red-400',    label: '오류' },
}

const TRANSPORT_ICON = {
  stdio:           Terminal,
  sse:             Globe,
  streamable_http: Globe,
}

function isToolExposed(tool: McpTool, exposedTools: string[]): boolean {
  if (exposedTools.length === 0) return true
  return exposedTools.includes(tool.name)
}

export function McpServerCard({ server, onUpdate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [togglingTool, setTogglingTool] = useState<string | null>(null)
  const { confirmDelete } = useConfirmHelpers()

  const toolToggleMutation = useApiMutation({
    mutationFn: async (args: { toolName: string; currentlyExposed: boolean }) => {
      await apiClient.mcp.toggleToolVisibility(server.id, args.toolName, !args.currentlyExposed)
      return args
    },
    successMessage: (_, args) =>
      args.currentlyExposed ? `"${args.toolName}" 도구를 숨겼습니다.` : `"${args.toolName}" 도구를 노출했습니다.`,
    onSuccess: (_, args) => {
      const allTools = (server.tools as McpTool[] | undefined) ?? []
      const allToolNames = allTools.map(t => t.name)

      let nextExposed: string[]
      if (server.exposedTools.length === 0) {
        nextExposed = allToolNames.filter(n => n !== args.toolName)
      } else if (args.currentlyExposed) {
        nextExposed = server.exposedTools.filter(n => n !== args.toolName)
      } else {
        nextExposed = [...server.exposedTools, args.toolName]
      }

      const isAll = allToolNames.every(n => nextExposed.includes(n))
      onUpdate({ ...server, exposedTools: isAll ? [] : nextExposed })
    },
  })

  const cfg = STATUS_CONFIG[server.status] ?? STATUS_CONFIG.disconnected
  const Icon = TRANSPORT_ICON[server.transport] ?? Terminal

  const connectMutation = useApiMutation({
    mutationFn: () => apiClient.mcp.connect(server.id),
    successMessage: MSG.mcpServer.connected,
    onSuccess: (updated) => onUpdate(updated),
    onError: () => onUpdate({ ...server, status: 'error' }),
  })

  const disconnectMutation = useApiMutation({
    mutationFn: () => apiClient.mcp.disconnect(server.id),
    successMessage: MSG.mcpServer.disconnected,
    onSuccess: (updated) => onUpdate(updated),
  })

  const deleteMutation = useApiMutation({
    mutationFn: () => apiClient.mcp.delete(server.id),
    successMessage: MSG.mcpServer.deleted,
    onSuccess: () => onDelete(server.id),
  })

  const bulkToggleMutation = useApiMutation({
    mutationFn: (enableAll: boolean) => {
      const nextExposed = enableAll ? [] : ['__none__']
      return apiClient.mcp.update(server.id, { exposedTools: nextExposed }).then((updated) => ({ updated, enableAll }))
    },
    successMessage: ({ enableAll }) =>
      enableAll ? '모든 도구를 노출했습니다.' : '모든 도구를 숨겼습니다.',
    onSuccess: ({ updated }) => onUpdate(updated),
  })

  const handleDelete = async () => {
    if (!(await confirmDelete(`"${server.name}" 서버를 삭제할까요?`))) return
    deleteMutation.mutate()
  }

  const handleToggleTool = async (toolName: string, currentlyExposed: boolean) => {
    setTogglingTool(toolName)
    try {
      await toolToggleMutation.mutateAsync({ toolName, currentlyExposed })
    } catch {
      // toast 처리됨
    } finally {
      setTogglingTool(null)
    }
  }

  const tools = server.tools as McpTool[] | undefined ?? []

  return (
    <>
      <div className={cn('rounded-xl border p-4 transition-colors', cfg.bg)}>
        <div className="flex items-start gap-3">
          {/* 아이콘 */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg)]">
            <Icon className="h-4 w-4 text-[var(--color-fg-subtle)]" />
          </div>

          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-[var(--color-fg)] truncate">{server.name}</span>
              <span className="rounded px-1.5 py-0.5 text-xs uppercase bg-[var(--color-bg)] text-[var(--color-fg-subtle)]">
                {server.transport}
              </span>
              {server.credentialMode === 'per_user' && (
                <span className="rounded px-1.5 py-0.5 text-xs bg-amber-500/15 text-amber-400">
                  개인별 인증
                </span>
              )}
              <div className="flex items-center gap-1">
                <div className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
                <span className={cn('text-xs', cfg.color)}>{cfg.label}</span>
              </div>
            </div>

            {server.description && (
              <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)] truncate">{server.description}</p>
            )}

            {server.toolCount != null && server.toolCount > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-1 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
              >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {server.exposedTools.length > 0
                  ? `${server.exposedTools.length}/${server.toolCount}개 도구 노출 중`
                  : `${server.toolCount}개 도구 모두 노출`}
              </button>
            )}

            {/* 도구 목록 + 노출 토글 */}
            {expanded && tools.length > 0 && (
              <div className="mt-2 rounded-lg bg-[var(--color-bg)] p-2">
                {/* 일괄 토글 헤더 */}
                <div className="mb-1.5 flex items-center justify-between border-b border-[var(--color-border)] pb-1.5">
                  <span className="text-xs text-[var(--color-fg-subtle)]">
                    {tools.filter(t => isToolExposed(t, server.exposedTools)).length}/{tools.length}개 노출
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={bulkToggleMutation.isPending}
                      onClick={() => bulkToggleMutation.mutate(true)}
                      className="rounded px-1.5 py-0.5 text-xs text-blue-400 hover:bg-blue-500/10 disabled:opacity-40"
                    >
                      전체 활성화
                    </button>
                    <button
                      type="button"
                      disabled={bulkToggleMutation.isPending}
                      onClick={() => bulkToggleMutation.mutate(false)}
                      className="rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] disabled:opacity-40"
                    >
                      전체 비활성화
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {tools.map(t => {
                    const exposed = isToolExposed(t, server.exposedTools)
                    const isToggling = togglingTool === t.name
                    return (
                      <div
                        key={t.name}
                        className={cn(
                          'flex items-start gap-2 rounded px-2 py-1.5 transition-opacity',
                          !exposed && 'opacity-50',
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono font-semibold text-[var(--color-fg-muted)] break-all">
                            {t.name}
                          </div>
                          {t.description && (
                            <div className="mt-0.5 text-xs leading-snug text-[var(--color-fg-subtle)] break-words whitespace-pre-wrap">
                              {t.description}
                            </div>
                          )}
                        </div>
                        {/* Exposed 스위치 */}
                        <button
                          type="button"
                          disabled={isToggling}
                          onClick={() => handleToggleTool(t.name, exposed)}
                          title={exposed ? '도구 숨기기' : '도구 노출'}
                          className={cn(
                            'relative mt-0.5 inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                            'transition-colors duration-200 focus:outline-none disabled:opacity-40',
                            exposed ? 'bg-blue-500' : 'bg-[var(--color-border-strong)]',
                          )}
                        >
                          <span
                            className={cn(
                              'pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow',
                              'transform transition-transform duration-200',
                              exposed ? 'translate-x-3' : 'translate-x-0',
                            )}
                          />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 액션 버튼 */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditOpen(true)}
              title="편집"
              className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {server.status === 'connected' ? (
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                title="연결 해제"
                className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] disabled:opacity-40"
              >
                {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                title="연결 테스트"
                className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-40"
              >
                {connectMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              title="삭제"
              className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
            >
              {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* 편집 다이얼로그 */}
      {editOpen && (
        <McpServerDialog
          projectId={server.projectId}
          initialValue={server}
          onSuccess={updated => {
            onUpdate(updated)
            setEditOpen(false)
          }}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  )
}

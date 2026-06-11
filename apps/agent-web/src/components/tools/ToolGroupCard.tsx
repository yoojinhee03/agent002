'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { ToolTestPanel } from './ToolTestPanel'
import { OpenApiSpecDialog } from './OpenApiSpecDialog'
import { cn } from '@/lib/utils'
import { useConfirmHelpers } from '@/components/shared/confirm-dialog'
import { ChevronDown, ChevronRight, Trash2, Pencil, Play, FileJson, Import, Loader2 } from 'lucide-react'
import type { ToolGroup, Tool, ToolGroupType } from '@agent-studio/shared'

interface Props {
  group: ToolGroup & { tools?: Tool[] }
  onUpdate: (group: ToolGroup & { tools?: Tool[] }) => void
  onDelete: (id: string) => void
  onAddTool: (groupId: string, groupType: ToolGroupType) => void
  onEditTool?: (groupId: string, groupType: ToolGroupType, tool: Tool) => void
}

export function ToolGroupCard({ group, onUpdate, onDelete, onAddTool, onEditTool }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [testTool, setTestTool] = useState<Tool | null>(null)
  const [openApiDialog, setOpenApiDialog] = useState<'import' | 'export' | null>(null)
  const { confirmDelete } = useConfirmHelpers()

  const tools = group.tools ?? []

  const toggleMutation = useApiMutation({
    mutationFn: () => apiClient.toolGroups.update(group.id, { enabled: !group.enabled }),
    successMessage: group.enabled ? MSG.toolGroup.disabled : MSG.toolGroup.enabled,
    onSuccess: (updated) => onUpdate(updated as ToolGroup & { tools?: Tool[] }),
  })

  const deleteMutation = useApiMutation({
    mutationFn: () => apiClient.toolGroups.delete(group.id),
    successMessage: MSG.toolGroup.deleted,
    onSuccess: () => onDelete(group.id),
  })

  const deleteToolMutation = useApiMutation({
    mutationFn: (tool: Tool) => apiClient.tools.delete(tool.id),
    successMessage: MSG.tool.deleted,
    onSuccess: (_result, tool) => {
      const updated = { ...group, tools: tools.filter((t) => t.id !== tool.id) }
      onUpdate(updated)
    },
  })

  const handleToggle = () => {
    toggleMutation.mutate()
  }

  const handleDelete = async () => {
    if (!(await confirmDelete(`"${group.name}" 그룹과 포함된 모든 도구를 삭제하시겠습니까?`))) return
    deleteMutation.mutate()
  }

  const handleDeleteTool = async (tool: Tool) => {
    if (!(await confirmDelete(`"${tool.name}" 도구를 삭제하시겠습니까?`))) return
    deleteToolMutation.mutate(tool)
  }

  const handleImported = (imported: Tool[], mode: 'update' | 'reset') => {
    let nextTools: Tool[]
    if (mode === 'reset') {
      nextTools = imported
    } else {
      const existingMap = new Map((group.tools ?? []).map(t => [t.slug, t]))
      imported.forEach(t => existingMap.set(t.slug, t))
      nextTools = Array.from(existingMap.values())
    }

    const updated = { ...group, tools: nextTools }
    onUpdate(updated)
    setExpanded(true)
    setOpenApiDialog(null)
  }

  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden', !group.enabled && 'opacity-60')}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-fg)] truncate">{group.name}</span>
            <span className={cn(
              'shrink-0 text-xs px-1.5 py-0.5 rounded-full font-semibold uppercase',
              group.type === 'rest' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400',
            )}>
              {group.type}
            </span>
            <span className="shrink-0 text-xs text-[var(--color-fg-subtle)]">{tools.length}개 도구</span>
          </div>
          {group.description && (
            <p className="text-xs text-[var(--color-fg-subtle)] truncate mt-0.5">{group.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* OpenAPI buttons (REST only) */}
          {group.type === 'rest' && (
            <>
              <button
                onClick={() => setOpenApiDialog('export')}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors whitespace-nowrap"
                title="OpenAPI 스펙 보기"
              >
                <FileJson className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">스펙</span>
              </button>
              <button
                onClick={() => setOpenApiDialog('import')}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors whitespace-nowrap"
                title="OpenAPI 스펙 가져오기"
              >
                <Import className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">가져오기</span>
              </button>
            </>
          )}

          <button
            onClick={() => onAddTool(group.id, group.type)}
            className="text-xs px-2.5 py-1 rounded-md bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 transition-colors whitespace-nowrap"
          >
            + 도구 추가
          </button>

          <button
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
            className={cn(
              'relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mx-1',
              group.enabled ? 'bg-blue-600' : 'bg-[var(--color-border-strong)]',
            )}
            title={group.enabled ? '비활성화' : '활성화'}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                group.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
              )}
            />
          </button>

          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="p-1.5 rounded-md text-[var(--color-fg-subtle)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded tool list */}
      {expanded && (
        <div className="border-t border-[var(--color-border)]">
          {tools.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-[var(--color-fg-subtle)]">
              도구가 없습니다. &quot;도구 추가&quot; 버튼으로 추가하거나{group.type === 'rest' ? ' OpenAPI 스펙을 가져오세요.' : ' 코드 도구를 추가하세요.'}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-surface-2)]">
              {tools.map((tool) => (
                <div key={tool.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--color-fg)] truncate">{tool.name}</p>
                    {tool.description && (
                      <p className="text-xs text-[var(--color-fg-subtle)] truncate">{tool.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setTestTool(tool)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors"
                    >
                      <Play className="h-3 w-3" />
                      테스트
                    </button>
                    {onEditTool && (
                      <button
                        onClick={() => onEditTool(group.id, group.type, tool)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        수정
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTool(tool)}
                      disabled={deleteToolMutation.isPending}
                      className="p-1 rounded-md text-[var(--color-fg-subtle)] hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      {deleteToolMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Test Panel */}
      {testTool && (
        <ToolTestPanel tool={testTool} onClose={() => setTestTool(null)} />
      )}

      {/* OpenAPI Dialog */}
      {openApiDialog && (
        <OpenApiSpecDialog
          projectId={group.projectId}
          groupId={group.id}
          mode={openApiDialog}
          onClose={() => setOpenApiDialog(null)}
          onImported={handleImported}
        />
      )}
    </div>
  )
}

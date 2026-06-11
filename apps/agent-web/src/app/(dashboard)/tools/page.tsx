'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { ToolBuilderWizard } from '@/components/tools/ToolBuilderWizard'
import { ToolGroupCard } from '@/components/tools/ToolGroupCard'
import { CreateToolGroupDialog } from '@/components/tools/CreateToolGroupDialog'
import { McpServerCard } from '@/components/mcp/McpServerCard'
import { McpCatalogPanel } from '@/components/mcp/McpCatalogPanel'
import { McpServerDialog } from '@/components/tools/McpServerDialog'
import { BuiltinToolsPanel } from '@/components/tools/BuiltinToolsPanel'
import { cn } from '@/lib/utils'
import type { Tool, ToolGroup, McpServer } from '@agent-studio/shared'
import { Plus, Plug, Loader2, FolderPlus } from 'lucide-react'

type TabValue = 'custom' | 'mcp' | 'builtin'

export default function ToolsPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { activeProjectId: projectId } = useUserStore()

  const initialTab = (searchParams.get('tab') as TabValue) ?? 'custom'
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab)

  // Custom groups state
  const [groups, setGroups] = useState<(ToolGroup & { tools?: Tool[] })[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [createGroupOpen, setCreateGroupOpen] = useState(false)
  const [wizardGroupId, setWizardGroupId] = useState<string | undefined>()
  const [wizardGroupType, setWizardGroupType] = useState<'rest' | 'code' | undefined>()
  const [wizardEditTool, setWizardEditTool] = useState<Tool | undefined>()
  const [wizardOpen, setWizardOpen] = useState(false)

  // MCP state
  const [servers, setServers] = useState<McpServer[]>([])
  const [mcpLoading, setMcpLoading] = useState(true)
  const [showMcpForm, setShowMcpForm] = useState(false)

  const switchTab = (tab: TabValue) => {
    setActiveTab(tab)
    router.replace(`/tools?tab=${tab}`, { scroll: false })
  }

  // Load groups
  useEffect(() => {
    if (!projectId) return
    setGroupsLoading(true)
    apiClient.toolGroups.list(projectId)
      .then((data) => setGroups(data as (ToolGroup & { tools?: Tool[] })[]))
      .finally(() => setGroupsLoading(false))
  }, [projectId])

  // Load MCP servers
  useEffect(() => {
    if (!projectId) return
    setMcpLoading(true)
    apiClient.mcp.list(projectId).then(setServers).finally(() => setMcpLoading(false))
  }, [projectId])

  const handleGroupCreated = (group: ToolGroup) => {
    setGroups((prev) => [group as ToolGroup & { tools?: Tool[] }, ...prev])
    setCreateGroupOpen(false)
  }

  const handleGroupUpdate = (updated: ToolGroup & { tools?: Tool[] }) => {
    setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)))
  }

  const handleGroupDelete = (id: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== id))
  }

  const handleAddTool = (groupId: string, groupType: 'rest' | 'code') => {
    setWizardGroupId(groupId)
    setWizardGroupType(groupType)
    setWizardEditTool(undefined)
    setWizardOpen(true)
  }

  const handleEditTool = (groupId: string, groupType: 'rest' | 'code', tool: Tool) => {
    setWizardGroupId(groupId)
    setWizardGroupType(groupType)
    setWizardEditTool(tool)
    setWizardOpen(true)
  }

  const handleToolSaved = (saved: Tool) => {
    if (wizardGroupId) {
      setGroups((prev) => prev.map((g) => {
        if (g.id !== wizardGroupId) return g
        const tools = g.tools ?? []
        const idx = tools.findIndex((t) => t.id === saved.id)
        return {
          ...g,
          tools: idx >= 0 ? tools.map((t) => (t.id === saved.id ? saved : t)) : [...tools, saved],
        }
      }))
    }
    setWizardOpen(false)
    setWizardGroupId(undefined)
    setWizardGroupType(undefined)
    setWizardEditTool(undefined)
  }

  const handleMcpUpdate = (updated: McpServer) => {
    setServers(prev => prev.map(s => s.id === updated.id ? updated : s))
  }
  const handleMcpDelete = (id: string) => {
    setServers(prev => prev.filter(s => s.id !== id))
  }
  const handleMcpAdded = () => {
    setShowMcpForm(false)
    if (projectId) void apiClient.mcp.list(projectId).then(setServers)
  }

  const tabs: { value: TabValue; label: string }[] = [
    { value: 'custom',  label: 'Custom' },
    { value: 'mcp',     label: 'MCP' },
    { value: 'builtin', label: 'Built-in' },
  ]

  if (!projectId && !groupsLoading) return <div className="p-6 text-muted-foreground text-sm">프로젝트 초기화 중...</div>

  return (
    <div className="p-6 space-y-5 bg-[var(--color-bg)] h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-fg)]">Tools</h1>
          <p className="text-xs text-[var(--color-fg-subtle)]">에이전트가 사용할 도구를 관리합니다</p>
        </div>
        {activeTab === 'custom' && (
          <button
            onClick={() => setCreateGroupOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Group
          </button>
        )}
        {activeTab === 'mcp' && (
          <button
            onClick={() => setShowMcpForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Server
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)]">
        <div className="flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => switchTab(tab.value)}
              className={cn(
                'px-4 py-2 text-xs font-bold border-b-2 transition-colors uppercase tracking-wider',
                activeTab === tab.value
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Custom (Groups) */}
      {activeTab === 'custom' && (
        <>
          {groupsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-fg-subtle)]" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] py-20 text-center">
              <FolderPlus className="mb-3 h-10 w-10 text-[var(--color-border-strong)]" />
              <p className="text-sm font-medium text-[var(--color-fg-muted)]">등록된 도구 그룹이 없습니다</p>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                REST API 또는 Code 그룹을 만들어 도구를 등록하세요.
              </p>
              <button
                onClick={() => setCreateGroupOpen(true)}
                className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
              >
                <Plus className="h-3.5 w-3.5" />
                첫 번째 그룹 만들기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <ToolGroupCard
                  key={group.id}
                  group={group}
                  onUpdate={handleGroupUpdate}
                  onDelete={handleGroupDelete}
                  onAddTool={handleAddTool}
                  onEditTool={handleEditTool}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Tab: MCP — 추천(카탈로그) + 직접 등록 두 영역 분리 */}
      {activeTab === 'mcp' && (
        <>
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
            <p className="text-xs text-blue-300 font-bold mb-1 uppercase tracking-tight">MCP Server란?</p>
            <p className="text-xs text-[var(--color-fg-subtle)] leading-relaxed">
              MCP(Model Context Protocol) 서버는 Agent가 사용할 수 있는 도구를 자동으로 노출합니다.<br />
              서버 하나로 여러 도구를 한 번에 제공할 수 있으며, Agent Builder에서 선택할 수 있습니다.
            </p>
          </div>

          {mcpLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-fg-subtle)]" />
            </div>
          ) : (
            <>
              {/* 1) 추천 MCP — 사전 정의 카탈로그 (Tavily, Context7 등) 토글 활성화 */}
              {projectId && (
                <McpCatalogPanel
                  projectId={projectId}
                  servers={servers}
                  onServersChange={setServers}
                />
              )}

              {/* 2) 직접 등록한 MCP — config.catalogId 가 없는 사용자 자유 등록 서버만 노출 */}
              <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
                <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border)]">
                  <span className="text-xl shrink-0">🔧</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-fg)]">직접 등록한 MCP</span>
                      {(() => {
                        const customCount = servers.filter((s) => !s.config?.catalogId).length
                        return customCount > 0 ? (
                          <span className="rounded-full px-2 py-0.5 text-xs bg-blue-500/15 text-blue-400">
                            {customCount}개
                          </span>
                        ) : null
                      })()}
                    </div>
                    <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
                      카탈로그에 없는 MCP 서버 — command·args·env 를 직접 입력해 등록합니다.
                    </p>
                  </div>
                </div>

                {(() => {
                  const customServers = servers.filter((s) => !s.config?.catalogId)
                  if (customServers.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Plug className="mb-3 h-8 w-8 text-[var(--color-border-strong)]" />
                        <p className="text-xs font-medium text-[var(--color-fg-muted)]">직접 등록한 MCP 가 없습니다</p>
                        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                          Filesystem, GitHub, Slack 등을 직접 등록할 수 있습니다.
                        </p>
                        <button
                          onClick={() => setShowMcpForm(true)}
                          className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          서버 직접 추가
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div className="space-y-3 p-3">
                      {customServers.map((server) => (
                        <McpServerCard key={server.id} server={server} onUpdate={handleMcpUpdate} onDelete={handleMcpDelete} />
                      ))}
                    </div>
                  )
                })()}
              </div>
            </>
          )}

          {showMcpForm && projectId && (
            <McpServerDialog
              projectId={projectId}
              onSuccess={() => handleMcpAdded()}
              onClose={() => setShowMcpForm(false)}
            />
          )}
        </>
      )}

      {/* Tab: Built-in */}
      {activeTab === 'builtin' && projectId && (
        <BuiltinToolsPanel projectId={projectId} />
      )}

      {/* Dialogs */}
      {createGroupOpen && projectId && (
        <CreateToolGroupDialog
          projectId={projectId}
          onCreated={handleGroupCreated}
          onClose={() => setCreateGroupOpen(false)}
        />
      )}

      {wizardOpen && wizardGroupId && projectId && (
        <ToolBuilderWizard
          projectId={projectId}
          groupId={wizardGroupId}
          groupType={wizardGroupType}
          tool={wizardEditTool}
          onClose={() => { setWizardOpen(false); setWizardGroupId(undefined); setWizardGroupType(undefined); setWizardEditTool(undefined) }}
          onSaved={handleToolSaved}
        />
      )}
    </div>
  )
}

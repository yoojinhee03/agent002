'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { apiClient, type CardDefinition } from '@/lib/api-client'
import type {
  Agent,
  UpdateAgentRequest,
  Tool,
  ToolGroup,
  McpTool,
  McpCredentialMode,
  BuiltinToolGroup,
  ToolPermission,
  ToolPolicy,
  ToolPermissionsMap,
  ToolPermissionEntry,
  PlanningConfig,
} from '@agent-studio/shared'
import { cn } from '@/lib/utils'
import {
  Wrench, Plug, ChevronDown, ChevronRight, Zap, FolderOpen,
  ShieldCheck, Users, Bot, FileCode, Terminal,
} from 'lucide-react'
import { ToolPermissionsPanel } from './ToolPermissionsPanel'

interface Props {
  agent: Agent
  projectId: string
  onChange: (changes: UpdateAgentRequest) => void
  hideTeammates?: boolean
}

interface McpServerGroup {
  serverId: string
  serverName: string
  tools: McpTool[]
  credentialMode?: McpCredentialMode
}

function toPermArray(permsDict: ToolPermissionsMap | undefined | null): ToolPermission[] {
  if (!permsDict) return []
  return Object.entries(permsDict).map(([toolId, raw]) => {
    if (typeof raw === 'string') return { toolId, policy: raw as ToolPolicy }
    const entry = raw as ToolPermissionEntry
    return {
      toolId,
      policy: entry.policy,
      ...(entry.cardId ? { cardId: entry.cardId } : {}),
      ...(entry.conditions ? { conditions: entry.conditions } : {}),
    }
  })
}

function toPermDict(permsArray: ToolPermission[]): Record<string, ToolPermissionEntry> {
  return Object.fromEntries(
    permsArray.map(({ toolId, policy, cardId, conditions }) => {
      const entry: ToolPermissionEntry = { policy }
      if (policy === 'requires_approval' && cardId) entry.cardId = cardId
      if (policy === 'restricted' && conditions) entry.conditions = conditions
      return [toolId, entry]
    }),
  )
}

const GROUP_ICON: Record<string, string> = {
  search: '🔍',
  google: '🌐',
  utilities: '⚙️',
}

const DEEP_AGENTS_TOOLS = [
  { id: 'execute', label: 'execute', desc: 'Run shell commands in a sandbox', isSandbox: true },
]

function LockedBanner({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <span className="text-[var(--color-fg-subtle)] text-xs">🔒</span>
      <p className="text-xs text-[var(--color-fg-subtle)]">
        플래닝 탭에서 <span className="font-semibold text-amber-400/70">{reason}</span>을 선택해야 사용할 수 있습니다.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MCP 도구 단위 선택 유틸
// ──────────────────────────────────────────────────────────────

type McpToolRef = { serverId: string; toolName: string }

function isToolRefSelected(refs: McpToolRef[], serverId: string, toolName: string): boolean {
  return refs.some(r => r.serverId === serverId && r.toolName === toolName)
}

function isServerFullySelected(refs: McpToolRef[], group: McpServerGroup): boolean {
  return group.tools.length > 0 && group.tools.every(t => isToolRefSelected(refs, group.serverId, t.name))
}

function isServerPartiallySelected(refs: McpToolRef[], group: McpServerGroup): boolean {
  const count = group.tools.filter(t => isToolRefSelected(refs, group.serverId, t.name)).length
  return count > 0 && count < group.tools.length
}

/** mcpToolRefs 에서 서버별 전체 선택 여부를 보고 mcpServerIds 자동 동기화 */
function syncServerIds(refs: McpToolRef[], groups: McpServerGroup[]): string[] {
  return groups
    .filter(g => isServerFullySelected(refs, g))
    .map(g => g.serverId)
}

export function ToolsTab({ agent, projectId, onChange, hideTeammates = false }: Props) {
  const [toolGroups, setToolGroups] = useState<(ToolGroup & { tools?: Tool[] })[]>([])
  const [mcpGroups, setMcpGroups] = useState<McpServerGroup[]>([])
  const [builtinGroups, setBuiltinGroups] = useState<BuiltinToolGroup[]>([])
  const [otherAgents, setOtherAgents] = useState<Agent[]>([])
  const [hitlCards, setHitlCards] = useState<CardDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set())
  const [expandedBuiltin, setExpandedBuiltin] = useState<Set<string>>(new Set())

  const selectedGroupIds = useMemo(() => new Set(agent.toolGroupIds ?? []), [agent.toolGroupIds])
  const selectedToolIds = useMemo(() => new Set(agent.toolIds ?? []), [agent.toolIds])

  // mcpToolRefs 우선, 없으면 mcpServerIds 에서 복원(하위 호환)
  const selectedMcpRefs = useMemo<McpToolRef[]>(() => {
    if (agent.mcpToolRefs && agent.mcpToolRefs.length > 0) return agent.mcpToolRefs
    // 레거시: mcpServerIds → 빈 refs (mcpGroups 로드 후 자동 확장은 아래 effect 에서)
    return []
  }, [agent.mcpToolRefs])

  const selectedBuiltinIds = useMemo(() => {
    const ids = agent.builtinToolIds ?? []
    return new Set(ids.filter((id) => id !== 'gmail_connect'))
  }, [agent.builtinToolIds])

  const selectedTeammateIds = useMemo(
    () => new Set(agent.planningConfig?.subAgents?.agentIds ?? []),
    [agent.planningConfig?.subAgents?.agentIds],
  )

  const enabledBuiltinIds = useMemo(() => {
    const ids = new Set<string>()
    builtinGroups.forEach((g) => g.tools.forEach((t) => { if (t.enabled) ids.add(t.id) }))
    return ids
  }, [builtinGroups])

  useEffect(() => {
    Promise.all([
      apiClient.toolGroups.list(projectId),
      apiClient.mcp.listAllTools(projectId, { onlyExposed: true }),
      apiClient.tools.getBuiltin(projectId),
      apiClient.agents.list(projectId),
      apiClient.cards.list().catch(() => [] as CardDefinition[]),
    ]).then(([g, m, b, a, cards]) => {
      setToolGroups(g as (ToolGroup & { tools?: Tool[] })[])
      setMcpGroups(m)
      setBuiltinGroups(
        b.map((bg) => ({
          ...bg,
          tools: bg.tools.filter((t) => t.id !== 'gmail_connect'),
        })),
      )
      setOtherAgents(a.filter(ag => ag.id !== agent.id))
      setHitlCards(cards as CardDefinition[])
      setExpandedGroups(new Set(g.filter(gr => selectedGroupIds.has(gr.id)).map(gr => gr.id)))
    }).finally(() => setLoading(false))
  }, [projectId, agent.id, selectedGroupIds])

  // 레거시 mcpServerIds → mcpToolRefs 1회 마이그레이션
  const legacyMigratedRef = useRef(false)
  useEffect(() => {
    if (loading) return
    if (legacyMigratedRef.current) return
    if ((agent.mcpToolRefs?.length ?? 0) > 0) { legacyMigratedRef.current = true; return }
    if ((agent.mcpServerIds?.length ?? 0) === 0) { legacyMigratedRef.current = true; return }
    legacyMigratedRef.current = true

    const expandSet = new Set<string>()
    const newRefs: McpToolRef[] = []
    for (const serverId of agent.mcpServerIds ?? []) {
      const group = mcpGroups.find(g => g.serverId === serverId)
      if (!group) continue
      expandSet.add(serverId)
      group.tools.forEach(t => newRefs.push({ serverId, toolName: t.name }))
    }
    if (newRefs.length > 0) {
      setExpandedServers(expandSet)
      onChange({ mcpToolRefs: newRefs, mcpServerIds: Array.from(expandSet) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mcpGroups])

  // 孤立 serverId 자동 정리
  const orphanCleanupDoneRef = useRef(false)
  useEffect(() => {
    if (loading) return
    if (orphanCleanupDoneRef.current) return
    orphanCleanupDoneRef.current = true

    const availableServerIds = new Set(mcpGroups.map(g => g.serverId))
    const currentRefs = agent.mcpToolRefs ?? []
    const cleanedRefs = currentRefs.filter(r => availableServerIds.has(r.serverId))

    const currentMcpIds = agent.mcpServerIds ?? []
    const cleanedMcpIds = currentMcpIds.filter(id => availableServerIds.has(id))

    const refsChanged = cleanedRefs.length !== currentRefs.length
    const idsChanged = cleanedMcpIds.length !== currentMcpIds.length

    if (!refsChanged && !idsChanged) return

    const cleanedPerms: ToolPermissionsMap = { ...(agent.toolPermissions ?? {}) }
    const orphanSet = new Set(currentMcpIds.filter(id => !availableServerIds.has(id)))
    for (const key of Object.keys(cleanedPerms)) {
      if (key.startsWith('mcp:') && orphanSet.has(key.slice(4))) {
        delete cleanedPerms[key]
      }
    }
    onChange({
      mcpToolRefs: cleanedRefs,
      mcpServerIds: cleanedMcpIds,
      toolPermissions: cleanedPerms,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, mcpGroups])

  // ────────────────────────────────────────────────────────────
  // 토글 핸들러
  // ────────────────────────────────────────────────────────────

  const toggleGroup = (groupId: string, groupTools: Tool[]) => {
    const nextGroups = new Set(selectedGroupIds)
    const nextTools = new Set(selectedToolIds)
    if (nextGroups.has(groupId)) {
      nextGroups.delete(groupId)
      groupTools.forEach(t => nextTools.delete(t.id))
    } else {
      nextGroups.add(groupId)
      groupTools.forEach(t => nextTools.add(t.id))
      setExpandedGroups(prev => new Set([...prev, groupId]))
    }
    onChange({ toolGroupIds: Array.from(nextGroups), toolIds: Array.from(nextTools) })
  }

  const toggleIndividualTool = (groupId: string, toolId: string, groupTools: Tool[]) => {
    const nextTools = new Set(selectedToolIds)
    const nextGroups = new Set(selectedGroupIds)
    if (nextTools.has(toolId)) {
      nextTools.delete(toolId)
      const remaining = groupTools.filter(t => t.id !== toolId && nextTools.has(t.id))
      if (remaining.length === 0) nextGroups.delete(groupId)
    } else {
      nextTools.add(toolId)
      nextGroups.add(groupId)
    }
    onChange({ toolGroupIds: Array.from(nextGroups), toolIds: Array.from(nextTools) })
  }

  const toggleMcpTool = (serverId: string, toolName: string) => {
    const wasSelected = isToolRefSelected(selectedMcpRefs, serverId, toolName)
    let nextRefs: McpToolRef[]
    if (wasSelected) {
      nextRefs = selectedMcpRefs.filter(r => !(r.serverId === serverId && r.toolName === toolName))
    } else {
      nextRefs = [...selectedMcpRefs, { serverId, toolName }]
      setExpandedServers(prev => new Set([...prev, serverId]))
    }
    const nextServerIds = syncServerIds(nextRefs, mcpGroups)
    onChange({ mcpToolRefs: nextRefs, mcpServerIds: nextServerIds })
  }

  const toggleMcpServer = (group: McpServerGroup) => {
    const isFull = isServerFullySelected(selectedMcpRefs, group)
    let nextRefs: McpToolRef[]
    if (isFull) {
      nextRefs = selectedMcpRefs.filter(r => r.serverId !== group.serverId)
    } else {
      const existing = selectedMcpRefs.filter(r => r.serverId !== group.serverId)
      const added = group.tools.map(t => ({ serverId: group.serverId, toolName: t.name }))
      nextRefs = [...existing, ...added]
      setExpandedServers(prev => new Set([...prev, group.serverId]))
    }
    const nextServerIds = syncServerIds(nextRefs, mcpGroups)
    onChange({ mcpToolRefs: nextRefs, mcpServerIds: nextServerIds })
  }

  const toggleBuiltinTool = (toolId: string) => {
    if (toolId === 'gmail_connect') return
    const next = new Set(selectedBuiltinIds)
    if (next.has(toolId)) next.delete(toolId)
    else next.add(toolId)
    onChange({ builtinToolIds: Array.from(next) })
  }

  const toggleTeammate = (teammateId: string) => {
    const next = new Set(selectedTeammateIds)
    if (next.has(teammateId)) next.delete(teammateId)
    else next.add(teammateId)

    const planningConfig: PlanningConfig = agent.planningConfig ?? {}
    const subAgents = planningConfig.subAgents ?? {
      enabled: true,
      agentIds: [],
      maxConcurrent: 2,
      delegationStrategy: 'capability_based',
    }

    onChange({
      planningConfig: {
        ...planningConfig,
        subAgents: { ...subAgents, agentIds: Array.from(next), enabled: next.size > 0 },
      },
    })
  }

  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleServerExpanded = (id: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleBuiltinExpanded = (id: string) => {
    setExpandedBuiltin(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ────────────────────────────────────────────────────────────
  // toolNamesMap — ToolPermissionsPanel용
  // ────────────────────────────────────────────────────────────
  const toolNamesMap = useMemo(() => {
    const map: Record<string, string> = {}

    DEEP_AGENTS_TOOLS.forEach(t => { map[t.id] = t.label })
    builtinGroups.forEach(g => g.tools.forEach(t => { map[t.id] = t.name }))
    toolGroups.forEach(g => g.tools?.forEach(t => { map[t.id] = t.name }))

    // 선택된 MCP 도구만 맵에 포함
    mcpGroups.forEach(g => {
      g.tools
        .filter(t => isToolRefSelected(selectedMcpRefs, g.serverId, t.name))
        .forEach(t => { map[t.name] = `${g.serverName}: ${t.name}` })
    })

    otherAgents.forEach(a => { map[`agent_${a.slug}`] = `Agent: ${a.name}` })

    return map
  }, [builtinGroups, toolGroups, mcpGroups, otherAgents, selectedMcpRefs])

  if (loading) return <div className="p-6 text-xs text-[var(--color-fg-subtle)]">Loading...</div>

  // 선택된 MCP 도구 이름 목록 (ToolPermissionsPanel 용)
  const selectedMcpToolNames = mcpGroups.flatMap(g =>
    g.tools
      .filter(t => isToolRefSelected(selectedMcpRefs, g.serverId, t.name))
      .map(t => t.name),
  )

  const totalToolsSelected = selectedToolIds.size + selectedMcpRefs.length + selectedBuiltinIds.size

  const activeArchitectures: string[] = agent.architectures?.length
    ? agent.architectures
    : [agent.architecture ?? 'react']
  const isVfsEnabled       = activeArchitectures.includes('react')
  const isTeammatesEnabled = activeArchitectures.includes('react') || activeArchitectures.includes('plan_execute')

  return (
    <div className="space-y-8 p-6">

      {/* DeepAgents Tools */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bot className={cn('h-4 w-4 shrink-0', isVfsEnabled ? 'text-blue-400' : 'text-[var(--color-fg-subtle)]')} />
          <h3 className={cn('text-sm font-bold', isVfsEnabled ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)]')}>
            DeepAgents Built-in Tools
          </h3>
          <span className={cn(
            'rounded-full border px-1.5 py-0.5 text-xs font-bold',
            isVfsEnabled
              ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              : 'border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)]',
          )}>Deep Autonomous</span>
        </div>

        {!isVfsEnabled ? (
          <LockedBanner reason="Deep Autonomous Agent" />
        ) : (
          <>
            <p className="text-xs text-[var(--color-fg-subtle)]">샌드박스 실행 도구를 활성화합니다. VFS 도구는 deepagents가 자동으로 제공합니다.</p>
            <div className="grid grid-cols-2 gap-3">
              {DEEP_AGENTS_TOOLS.map(t => {
                const isSelected = selectedBuiltinIds.has(t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleBuiltinTool(t.id)}
                    className={cn(
                      'flex flex-col rounded-xl border p-3 text-left transition-all',
                      isSelected
                        ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)]',
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg border',
                        isSelected
                          ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-subtle)]',
                      )}>
                        {t.isSandbox ? <Terminal className="h-3.5 w-3.5" /> : <FileCode className="h-3.5 w-3.5" />}
                      </div>
                      <div className={cn('h-3.5 w-3.5 rounded-full border-2 transition-colors', isSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]')}>
                        {isSelected && (
                          <div className="h-full w-full rounded-full flex items-center justify-center">
                            <div className="h-1 w-1 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={cn('text-xs font-bold', isSelected ? 'text-blue-400' : 'text-[var(--color-fg)]')}>{t.label}</div>
                    <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)] leading-relaxed">{t.desc}</div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Teammates */}
      {!hideTeammates && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className={cn('h-4 w-4 shrink-0', isTeammatesEnabled ? 'text-purple-400' : 'text-[var(--color-fg-subtle)]')} />
            <h3 className={cn('text-sm font-bold', isTeammatesEnabled ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)]')}>
              Teammates (Sub-agents)
            </h3>
            <div className="flex gap-1">
              {(['react', 'plan_execute'] as const).map(arch => {
                const active = activeArchitectures.includes(arch)
                const label = arch === 'react' ? 'Deep Autonomous' : 'Planning'
                return (
                  <span key={arch} className={cn(
                    'rounded-full border px-1.5 py-0.5 text-xs font-bold',
                    active
                      ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)]',
                  )}>{label}</span>
                )
              })}
            </div>
          </div>

          {!isTeammatesEnabled ? (
            <LockedBanner reason="Deep Autonomous 또는 계획 및 실행" />
          ) : (
            <>
              <p className="text-xs text-[var(--color-fg-subtle)]">복잡한 작업을 위임할 팀원 에이전트를 선택하세요.</p>
              {otherAgents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-center">
                  <p className="text-xs text-[var(--color-fg-subtle)]">선택 가능한 다른 에이전트가 없습니다</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {otherAgents.map(a => {
                    const isSelected = selectedTeammateIds.has(a.id)
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleTeammate(a.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          isSelected
                            ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)]',
                        )}
                      >
                        <div className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg border',
                          isSelected
                            ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-subtle)]',
                        )}>
                          <Bot className="h-4 w-4" />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <div className="text-xs font-bold text-[var(--color-fg)]">{a.name}</div>
                          <div className="text-xs text-[var(--color-fg-subtle)] truncate">{a.description ?? 'No description'}</div>
                        </div>
                        <div className={cn('h-4 w-4 rounded-full border-2 transition-colors', isSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]')}>
                          {isSelected && (
                            <div className="h-full w-full rounded-full flex items-center justify-center">
                              <div className="h-1 w-1 rounded-full bg-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Custom Groups */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-[var(--color-fg)]">Custom Tools</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">사용자가 정의한 API 및 코드 도구 그룹을 연결합니다.</p>
        </div>

        {toolGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center">
            <p className="text-xs text-[var(--color-fg-subtle)]">등록된 Tool 그룹이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {toolGroups.map(group => {
              const tools = group.tools ?? []
              const selectedCount = tools.filter(t => selectedToolIds.has(t.id)).length
              const isSelected = selectedGroupIds.has(group.id)
              const isPartial = isSelected && selectedCount < tools.length && tools.length > 0
              const isExpanded = expandedGroups.has(group.id)
              return (
                <div key={group.id} className={cn('rounded-xl border bg-[var(--color-bg)] transition-colors', isSelected ? 'border-blue-500/50' : 'border-[var(--color-border)]')}>
                  <div className="flex items-center gap-3 p-3">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      isSelected ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-subtle)]',
                    )}>
                      <Wrench className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleGroup(group.id, tools)}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--color-fg)]">{group.name}</span>
                        <span className={cn(
                          'rounded px-1.5 py-0.5 text-xs uppercase font-bold',
                          group.type === 'rest' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400',
                        )}>
                          {group.type}
                        </span>
                        {isSelected && tools.length > 0 && (
                          <span className="text-xs text-[var(--color-fg-subtle)]">{selectedCount}/{tools.length}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => toggleGroupExpanded(group.id)} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div
                      onClick={() => toggleGroup(group.id, tools)}
                      className={cn(
                        'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border-2 transition-colors',
                        isSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]',
                      )}
                    >
                      {isPartial ? (
                        <div className="h-0.5 w-2 rounded-full bg-white" />
                      ) : isSelected ? (
                        <div className="h-1.5 w-1.5 rounded-sm bg-white" />
                      ) : null}
                    </div>
                  </div>
                  {isExpanded && tools.length > 0 && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 pb-3 pt-2 space-y-1">
                      {tools.map(t => {
                        const isToolSelected = selectedToolIds.has(t.id)
                        return (
                          <div
                            key={t.id}
                            onClick={() => toggleIndividualTool(group.id, t.id, tools)}
                            className={cn(
                              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                              isToolSelected
                                ? 'border-blue-500/30 bg-blue-500/5'
                                : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg)]',
                            )}
                          >
                            <div className={cn(
                              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors',
                              isToolSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]',
                            )}>
                              {isToolSelected && <div className="h-1 w-1 rounded-sm bg-white" />}
                            </div>
                            <span className={cn('text-xs font-medium', isToolSelected ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)]')}>{t.name}</span>
                            {t.description && (
                              <span className="ml-1 text-xs text-[var(--color-fg-subtle)] truncate italic flex-1">{t.description}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {isExpanded && tools.length === 0 && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
                      <p className="text-xs text-[var(--color-fg-subtle)]">이 그룹에 도구가 없습니다</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* MCP Servers — 도구 단위 선택 */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-bold text-[var(--color-fg)]">MCP Servers</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">외부 Model Context Protocol 서버의 도구를 연결합니다. 도구 단위로 선택할 수 있습니다.</p>
        </div>

        {mcpGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center">
            <p className="text-xs text-[var(--color-fg-subtle)]">연결된 MCP Server가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mcpGroups.map(group => {
              const isFull = isServerFullySelected(selectedMcpRefs, group)
              const isPartial = isServerPartiallySelected(selectedMcpRefs, group)
              const isAnySelected = isFull || isPartial
              const isExpanded = expandedServers.has(group.serverId)
              const selectedCount = group.tools.filter(t =>
                isToolRefSelected(selectedMcpRefs, group.serverId, t.name),
              ).length

              return (
                <div
                  key={group.serverId}
                  className={cn(
                    'rounded-xl border bg-[var(--color-bg)] transition-colors',
                    isAnySelected ? 'border-blue-500/50' : 'border-[var(--color-border)]',
                  )}
                >
                  {/* 서버 헤더 */}
                  <div className="flex items-center gap-3 p-3">
                    <div className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                      isAnySelected
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-subtle)]',
                    )}>
                      <Plug className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[var(--color-fg)]">{group.serverName}</span>
                        {group.credentialMode && (
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-xs font-semibold',
                              group.credentialMode === 'per_user'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-emerald-500/15 text-emerald-400',
                            )}
                          >
                            {group.credentialMode === 'per_user' ? '개인별' : '공유'}
                          </span>
                        )}
                        {group.tools.length > 0 && (
                          <span className="text-xs text-[var(--color-fg-subtle)]">
                            {isAnySelected ? `${selectedCount}/${group.tools.length}` : `${group.tools.length}개 도구`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleServerExpanded(group.serverId)}
                      className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {/* 서버 전체 선택 체크박스 */}
                    <div
                      onClick={() => toggleMcpServer(group)}
                      className={cn(
                        'flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border-2 transition-colors',
                        isFull ? 'border-blue-500 bg-blue-500' : isPartial ? 'border-blue-500/60 bg-blue-500/20' : 'border-[var(--color-border-strong)]',
                      )}
                    >
                      {isPartial && <div className="h-0.5 w-2 rounded-full bg-blue-400" />}
                      {isFull && <div className="h-1.5 w-1.5 rounded-sm bg-white" />}
                    </div>
                  </div>

                  {/* 도구 목록 */}
                  {isExpanded && group.tools.length > 0 && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-3 pb-3 pt-2 space-y-1">
                      {group.tools.map(t => {
                        const isToolSel = isToolRefSelected(selectedMcpRefs, group.serverId, t.name)
                        return (
                          <div
                            key={t.name}
                            onClick={() => toggleMcpTool(group.serverId, t.name)}
                            className={cn(
                              'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors',
                              isToolSel
                                ? 'border-blue-500/30 bg-blue-500/5'
                                : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-bg)]',
                            )}
                          >
                            <div className={cn(
                              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors',
                              isToolSel ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]',
                            )}>
                              {isToolSel && <div className="h-1 w-1 rounded-sm bg-white" />}
                            </div>
                            <code className={cn('text-xs font-mono', isToolSel ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-subtle)]')}>{t.name}</code>
                            {t.description && (
                              <span className="ml-1 text-xs text-[var(--color-fg-subtle)] truncate italic flex-1">{t.description}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {isExpanded && group.tools.length === 0 && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3">
                      <p className="text-xs text-[var(--color-fg-subtle)]">이 서버에 노출된 도구가 없습니다</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Built-in 섹션 */}
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-[var(--color-fg)]">Generic Built-in Tools</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">플랫폼에서 제공하는 검색 및 번역 도구를 활성화합니다.</p>
        </div>

        {builtinGroups.length > 0 && (
          <div className="space-y-2">
            {builtinGroups.map(group => {
              const isExpanded = expandedBuiltin.has(group.id)
              const icon = GROUP_ICON[group.id] ?? '🔧'
              return (
                <div key={group.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer"
                    onClick={() => toggleBuiltinExpanded(group.id)}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-surface)] text-sm">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-[var(--color-fg)]">{group.name}</span>
                    </div>
                    <button className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
                      {group.tools.map(tool => {
                        const isEnabled = tool.enabled
                        const isSelected = selectedBuiltinIds.has(tool.id)
                        return (
                          <div
                            key={tool.id}
                            onClick={() => { if (!isEnabled) return; toggleBuiltinTool(tool.id) }}
                            className={cn(
                              'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors',
                              !isEnabled
                                ? 'border-[var(--color-border)] bg-[var(--color-bg)] opacity-50 cursor-not-allowed'
                                : isSelected
                                  ? 'border-blue-500 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.05)]'
                                  : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:border-[var(--color-border-strong)]',
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-[var(--color-fg)]">{tool.name}</p>
                              <p className="text-xs text-[var(--color-fg-subtle)] truncate">{tool.description}</p>
                              {!isEnabled && (
                                <p className="text-xs text-[var(--color-fg-subtle)] truncate">Built-in Tools에서 활성화가 필요합니다.</p>
                              )}
                            </div>
                            <div className={cn('h-4 w-4 shrink-0 rounded-full border-2 transition-colors', isSelected ? 'border-blue-500 bg-blue-500' : 'border-[var(--color-border-strong)]')}>
                              {isSelected && (
                                <div className="h-full w-full rounded-full flex items-center justify-center">
                                  <div className="h-1 w-1 rounded-full bg-white" />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Tool Access Permissions */}
      {totalToolsSelected > 0 && (
        <div className="space-y-4 border-t border-[var(--color-border)] pt-8">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-bold text-[var(--color-fg)]">Tool Access Permissions</h3>
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">각 도구별 실행 정책(Auto, Approval, Restricted)을 설정합니다.</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
            <ToolPermissionsPanel
              toolIds={[
                ...Array.from(selectedBuiltinIds)
                  .filter(id => enabledBuiltinIds.has(id))
                  .filter(id => isVfsEnabled || !DEEP_AGENTS_TOOLS.some(t => t.id === id)),
                ...Array.from(selectedToolIds),
                ...selectedMcpToolNames,
              ]}
              toolNames={toolNamesMap}
              hitlCards={hitlCards}
              permissions={toPermArray(agent.toolPermissions)}
              onChange={perms => {
                const dict = toPermDict(perms)
                for (const key of Object.keys(dict)) {
                  if (key.startsWith('mcp:')) delete dict[key]
                }
                onChange({ toolPermissions: dict })
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}


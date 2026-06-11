'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { useUserStore } from '@/stores/use-user-store'
import type { Agent, AgentTeam, CreateTeamRequest, EnabledModel } from '@agent-studio/shared'
import { Bot, UsersRound, Plus, LayoutTemplate, History, GitCompareArrows, Upload, Loader2, Wrench, Sparkles, Network, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TemplateGallery } from '@/components/agents/TemplateGallery'
import { RunTraceViewer } from '@/components/agents/RunTraceViewer'
import { AgentContextMenu } from '@/components/agents/AgentContextMenu'
import { AgentComparePanel } from '@/components/agents/AgentComparePanel'
import { TeamPlayground } from '@/components/agents/TeamPlayground'

type SubAgentNodeShape = {
  id?: string
  type?: string
  data?: {
    toolIds?: string[]
    builtinToolIds?: string[]
    mcpServerIds?: string[]
    skillIds?: string[]
  }
}

function getSubAgentNodes(agent: Agent): SubAgentNodeShape[] {
  const nodes = (agent.graphDefinition as { nodes?: SubAgentNodeShape[] } | undefined)?.nodes
  if (!Array.isArray(nodes)) return []
  return nodes.filter((n) => {
    if (n?.type === 'subAgent' || n?.type === 'sub_agent') return true
    if (n?.type === undefined && n?.id && n.id !== 'main') return true
    return false
  })
}

function countTools(agent: Agent): number {
  const main = (agent.toolIds?.length ?? 0) + (agent.builtinToolIds?.length ?? 0)
  const subs = getSubAgentNodes(agent).reduce(
    (acc, n) => acc + (n.data?.toolIds?.length ?? 0) + (n.data?.builtinToolIds?.length ?? 0),
    0,
  )
  return main + subs
}

function countSkills(agent: Agent): number {
  const main = agent.skillIds?.length ?? 0
  const subs = getSubAgentNodes(agent).reduce((acc, n) => acc + (n.data?.skillIds?.length ?? 0), 0)
  return main + subs
}

function countMcp(agent: Agent): number {
  const main = agent.mcpServerIds?.length ?? 0
  const subs = getSubAgentNodes(agent).reduce((acc, n) => acc + (n.data?.mcpServerIds?.length ?? 0), 0)
  return main + subs
}

function countSubAgents(agent: Agent): number {
  const fromGraph = getSubAgentNodes(agent).length
  const fromPlanning = agent.planningConfig?.subAgents?.enabled
    ? (agent.planningConfig.subAgents.agentIds?.length ?? 0)
    : 0
  return Math.max(fromGraph, fromPlanning)
}

const TOPOLOGY_BADGE: Record<string, string> = {
  supervisor: 'bg-purple-500/15 text-purple-400',
  swarm: 'bg-amber-500/15 text-amber-400',
  sequential: 'bg-blue-500/15 text-blue-400',
  parallel: 'bg-green-500/15 text-green-400',
}

type Tab = 'agents' | 'teams' | 'run_history' | 'compare'

const DISABLED_TABS: ReadonlySet<Tab> = new Set(['teams', 'run_history', 'compare'])

export default function AgentsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('agents')
  const [agents, setAgents] = useState<Agent[]>([])
  const [teams, setTeams] = useState<AgentTeam[]>([])
  const [modelsById, setModelsById] = useState<Record<string, { name: string; providerSlug: string }>>({})
  const [loading, setLoading] = useState(true)
  const [showCreateAgent, setShowCreateAgent] = useState(false)
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [showTemplateGallery, setShowTemplateGallery] = useState(false)
  const [playgroundTeam, setPlaygroundTeam] = useState<AgentTeam | null>(null)

  const importInputRef = useRef<HTMLInputElement>(null)

  const { activeProjectId: projectId } = useUserStore()

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      apiClient.agents.list(projectId),
      apiClient.teams.list(projectId),
    ]).then(([a, t]) => {
      setAgents(a)
      setTeams(t)
    }).finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    apiClient.providers.getEnabledModels().then((list: EnabledModel[]) => {
      const map: Record<string, { name: string; providerSlug: string }> = {}
      for (const m of list) map[m.id] = { name: m.name, providerSlug: m.providerSlug }
      setModelsById(map)
    }).catch(() => {})
  }, [])

  const handleCreateAgent = async (data: { name: string; description: string }) => {
    if (!projectId) return
    const agent = await apiClient.agents.create(projectId, {
      ...data,
      systemPrompt: 'You are a helpful assistant.',
      modelId: 'gpt-4o-mini',
    })
    setAgents(prev => [agent, ...prev])
    setShowCreateAgent(false)
    router.push(`/agents/${agent.id}`)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !projectId) return
    e.target.value = ''
    try {
      const data = JSON.parse(await file.text())
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        toast.error('유효한 에이전트 파일이 아닙니다')
        return
      }
      const created = await apiClient.agents.importAgent(projectId, data as Record<string, unknown>)
      setAgents(prev => [created, ...prev])
      toast.success(`"${created.name}" 에이전트를 가져왔습니다`)
    } catch (err) {
      toast.error(err instanceof SyntaxError ? 'JSON 파싱에 실패했습니다' : '가져오기에 실패했습니다')
    }
  }

  const handleCreateTeam = async (data: CreateTeamRequest) => {
    if (!projectId) return
    const team = await apiClient.teams.create(projectId, data)
    setTeams(prev => [team, ...prev])
    setShowCreateTeam(false)
  }


  const isInitialLoading = loading && agents.length === 0 && teams.length === 0

  if (!projectId && !loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--color-fg-subtle)]">
        활성화된 프로젝트가 없습니다. 초기화 중...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg)]">
      {playgroundTeam && (
        <TeamPlayground team={playgroundTeam} onClose={() => setPlaygroundTeam(null)} />
      )}
      <TemplateGallery
        isOpen={showTemplateGallery}
        onClose={() => setShowTemplateGallery(false)}
        projectId={projectId ?? ""}
        onCreated={() => {
          if (projectId) apiClient.agents.list(projectId).then(setAgents)
        }}
      />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--color-fg)]">Agents</h1>
          <p className="text-xs text-[var(--color-fg-subtle)]">LangGraph 기반 자율 에이전트 및 팀을 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'agents' && (
            <button
              disabled
              title="준비 중"
              className="flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-subtle)] opacity-60"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              템플릿으로 시작
              <span className="ml-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs font-semibold text-[var(--color-fg-subtle)]">
                준비 중
              </span>
            </button>
          )}
          {tab === 'agents' && (
            <button
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
          )}
          {tab !== 'run_history' && tab !== 'compare' && (
            <button
              onClick={() => tab === 'agents' ? setShowCreateAgent(true) : setShowCreateTeam(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              {tab === 'agents' ? 'New Agent' : 'New Team'}
            </button>
          )}
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportFile}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[var(--color-border)] px-6">
        {([['agents', Bot, 'Agents'], ['teams', UsersRound, 'Teams'], ['run_history', History, 'Run History'], ['compare', GitCompareArrows, 'A/B 비교']] as const).map(([id, Icon, label]) => {
          const disabled = DISABLED_TABS.has(id)
          return (
            <button
              key={id}
              disabled={disabled}
              title={disabled ? '준비 중' : undefined}
              onClick={() => !disabled && setTab(id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-medium transition-colors',
                disabled
                  ? 'cursor-not-allowed border-transparent text-[var(--color-fg-subtle)] opacity-60'
                  : tab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {id !== 'run_history' && id !== 'compare' && !disabled && (
                <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)]">
                  {id === 'agents' ? agents.length : teams.length}
                </span>
              )}
              {disabled && (
                <span className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-1.5 py-0.5 text-xs font-semibold text-[var(--color-fg-subtle)]">
                  준비 중
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className={cn('flex-1', tab === 'run_history' || tab === 'compare' ? 'overflow-hidden' : 'overflow-y-auto p-6')}>
        {tab === 'compare' ? (
          <AgentComparePanel projectId={projectId ?? ""} />
        ) : tab === 'run_history' ? (
          <RunTraceViewer projectId={projectId ?? ""} />
        ) : isInitialLoading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-fg-subtle)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading agents...
          </div>
        ) : tab === 'agents' ? (
          <>
            {showCreateAgent && (
              <AgentCreateForm
                onSubmit={handleCreateAgent}
                onCancel={() => setShowCreateAgent(false)}
              />
            )}
            {agents.length === 0 && !showCreateAgent ? (
              <EmptyState icon="🤖" title="등록된 에이전트가 없습니다" desc="단일 또는 멀티 에이전트를 만들어보세요" />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {agents.map(agent => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    modelsById={modelsById}
                    onOpen={() => router.push(`/agents/${agent.id}`)}
                    canChat={!!agent.slug && !!agent.hasActiveDeployment}
                    chatDisabledReason={
                      !agent.slug
                        ? '슬러그 미설정'
                        : !agent.hasActiveDeployment
                          ? '배포되지 않음'
                          : undefined
                    }
                    onChat={() => {
                      window.open(`/client/agents/${agent.slug}`, '_blank', 'noopener,noreferrer')
                    }}
                    onChanged={() => projectId && apiClient.agents.list(projectId).then(setAgents)}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {showCreateTeam && (
              <TeamCreateForm onSubmit={handleCreateTeam} onCancel={() => setShowCreateTeam(false)} />
            )}
            {teams.length === 0 && !showCreateTeam ? (
              <EmptyState icon="👥" title="등록된 팀이 없습니다" desc="Supervisor, Swarm, Sequential, Parallel 토폴로지의 멀티에이전트 팀을 만들어보세요" />
            ) : (
              <div className="space-y-2">
                {teams.map(team => (
                  <div
                    key={team.id}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => router.push(`/agents/teams/${team.id}`)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--color-fg)]">{team.name}</span>
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TOPOLOGY_BADGE[team.topology] ?? 'bg-gray-500/15 text-gray-400')}>
                            {team.topology}
                          </span>
                          {!team.enabled && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">disabled</span>}
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{team.description || 'No description'}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPlaygroundTeam(team) }}
                        className="ml-3 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20"
                      >
                        Test
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function AgentCard({
  agent,
  modelsById,
  onOpen,
  onChat,
  canChat,
  chatDisabledReason,
  onChanged,
}: {
  agent: Agent
  modelsById: Record<string, { name: string; providerSlug: string }>
  onOpen: () => void
  onChat: () => void
  canChat: boolean
  chatDisabledReason?: string
  onChanged: () => void
}) {
  const toolCount = countTools(agent)
  const skillCount = countSkills(agent)
  const mcpCount = countMcp(agent)
  const subAgentCount = countSubAgents(agent)
  const isOrchestrator = subAgentCount > 0
  const modelInfo = agent.modelId ? modelsById[agent.modelId] : undefined
  const modelDisplay = modelInfo?.name ?? agent.modelId ?? ''

  return (
    <div
      onClick={onOpen}
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-xl border bg-[var(--color-surface)] p-4 transition-all hover:bg-[var(--color-surface-2)]',
        isOrchestrator
          ? 'border-purple-500/30 hover:border-purple-500/60'
          : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]',
      )}
    >
      {isOrchestrator && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-semibold text-purple-300">
          <Network className="h-3 w-3" />
          Multi-agent
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isOrchestrator ? 'bg-purple-500/15 text-purple-300' : 'bg-blue-500/10 text-blue-400',
          )}
        >
          <Bot className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--color-fg)]">{agent.name}</span>
            {!agent.enabled && (
              <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-xs font-medium text-red-400">
                disabled
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="truncate text-xs text-[var(--color-fg-muted)]">{modelDisplay || '모델 미설정'}</span>
            {modelInfo?.providerSlug && (
              <span className="shrink-0 text-xs text-[var(--color-fg-subtle)]">{modelInfo.providerSlug}</span>
            )}
          </div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.25rem] text-xs text-[var(--color-fg-muted)]">
        {agent.description || '설명이 없습니다'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Stat icon={<Wrench className="h-3 w-3" />} label="도구" value={toolCount} accent={toolCount > 0 ? 'blue' : 'neutral'} />
        <Stat icon={<Sparkles className="h-3 w-3" />} label="스킬" value={skillCount} accent={skillCount > 0 ? 'amber' : 'neutral'} />
        <Stat icon={<Network className="h-3 w-3" />} label="MCP" value={mcpCount} accent={mcpCount > 0 ? 'emerald' : 'neutral'} />
        {isOrchestrator && (
          <Stat
            icon={<Bot className="h-3 w-3" />}
            label="서브"
            value={subAgentCount}
            accent="purple"
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <span className="text-xs text-[var(--color-fg-subtle)]">
          {new Date(agent.updatedAt).toLocaleDateString('ko-KR')}
        </span>
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <button
            onClick={canChat ? onChat : undefined}
            disabled={!canChat}
            title={canChat ? '클라이언트 채팅 열기' : chatDisabledReason}
            className={cn(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              canChat
                ? 'cursor-pointer bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                : 'cursor-not-allowed bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] opacity-60',
            )}
          >
            <MessageSquare className="h-3 w-3" />
            Chat
          </button>
          <AgentContextMenu agent={agent} onCloned={onChanged} />
        </div>
      </div>
    </div>
  )
}

type StatAccent = 'neutral' | 'purple' | 'blue' | 'amber' | 'emerald'

const STAT_ACCENT: Record<StatAccent, { box: string; label: string; value: string }> = {
  neutral: { box: 'bg-bg text-[var(--color-fg-muted)]', label: 'text-[var(--color-fg-subtle)]', value: 'text-[var(--color-fg)]' },
  purple: { box: 'bg-purple-500/15 text-purple-300', label: 'text-purple-300/70', value: 'text-purple-200' },
  blue: { box: 'bg-blue-500/15 text-blue-300', label: 'text-blue-300/70', value: 'text-blue-200' },
  amber: { box: 'bg-amber-500/15 text-amber-300', label: 'text-amber-300/70', value: 'text-amber-200' },
  emerald: { box: 'bg-emerald-500/15 text-emerald-300', label: 'text-emerald-300/70', value: 'text-emerald-200' },
}

function Stat({
  icon,
  label,
  value,
  accent = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent?: StatAccent
}) {
  const c = STAT_ACCENT[accent]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium', c.box)}>
      {icon}
      <span className={c.label}>{label}</span>
      <span className={c.value}>{value}</span>
    </span>
  )
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="mb-3 text-4xl">{icon}</p>
      <p className="text-sm font-medium text-[var(--color-fg-muted)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{desc}</p>
    </div>
  )
}

function AgentCreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: { name: string; description: string }) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState({ name: '', description: '' })
  const createMutation = useApiMutation({
    mutationFn: () => onSubmit(form),
    successMessage: MSG.agent.created,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[#11131c] p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-bold text-[var(--color-fg)]">New Agent</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">에이전트 이름</label>
            <input
              autoFocus
              placeholder="예: 마케팅 비서"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">설명</label>
            <textarea
              rows={3}
              placeholder="에이전트의 역할이나 목적을 설명해주세요"
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!form.name.trim() || createMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createMutation.isPending ? '생성 중...' : '에이전트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamCreateForm({ onSubmit, onCancel }: {
  onSubmit: (data: CreateTeamRequest) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [topology, setTopology] = useState<CreateTeamRequest['topology']>('supervisor')
  const teamMutation = useApiMutation({
    mutationFn: () => onSubmit({ name: name.trim(), topology }),
    successMessage: MSG.team.created,
  })
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3">
      <input autoFocus className="flex-1 bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
        placeholder="팀 이름" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && teamMutation.mutate()} />
      <select value={topology} onChange={e => setTopology(e.target.value as CreateTeamRequest['topology'])}
        className="rounded-md border border-[var(--color-border-strong)] bg-bg px-2 py-1 text-xs text-[var(--color-fg)]">
        <option value="supervisor">Supervisor</option>
        <option value="swarm">Swarm</option>
        <option value="sequential">Sequential</option>
        <option value="parallel">Parallel</option>
      </select>
      <button onClick={() => teamMutation.mutate()} disabled={!name.trim() || teamMutation.isPending}
        className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-40 hover:bg-blue-500">
        {teamMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        {teamMutation.isPending ? '생성 중...' : '생성'}
      </button>
      <button onClick={onCancel} className="rounded-md px-2 py-1 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">취소</button>
    </div>
  )
}

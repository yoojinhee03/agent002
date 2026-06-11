'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Trash2,
  X,
  Hash,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type { SlackChannelAgent, SlackRoutingMode, SlackInstallationView } from '@/lib/api-client'
import type { Agent } from '@agent-studio/shared'

interface Props {
  installation: SlackInstallationView | null
  projectId: string
}

const MODE_LABELS: Record<SlackRoutingMode, string> = {
  channel: '채널',
  dm: 'DM',
  both: '채널 + DM',
}

const MODE_COLORS: Record<SlackRoutingMode, string> = {
  channel: 'bg-blue-500/10 text-blue-400',
  dm: 'bg-violet-500/10 text-violet-400',
  both: 'bg-teal-500/10 text-teal-400',
}

function AddMappingModal({
  agents,
  onAdd,
  onClose,
}: {
  agents: Agent[]
  onAdd: (data: { channelId: string; channelName?: string; agentId: string; mode: SlackRoutingMode }) => Promise<void>
  onClose: () => void
}) {
  const [channelId, setChannelId] = useState('')
  const [channelName, setChannelName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [mode, setMode] = useState<SlackRoutingMode>('channel')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!channelId.trim() || !agentId) {
      toast.error('채널 ID 와 에이전트를 선택해주세요')
      return
    }
    setSaving(true)
    try {
      await onAdd({
        channelId: channelId.trim(),
        channelName: channelName.trim() || undefined,
        agentId,
        mode,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">채널-에이전트 매핑 추가</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              채널 ID <span className="text-red-400">*</span>
            </label>
            <input
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="C0123456789 또는 D... (DM)"
              autoFocus
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
            />
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              Slack 채널 우클릭 → 채널 세부 정보 → 채널 ID 복사
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              채널 이름 <span className="text-[var(--color-fg-subtle)]">(선택, 표시용)</span>
            </label>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="#general"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              에이전트 <span className="text-red-400">*</span>
            </label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground outline-none focus:border-[#3b82f6]"
            >
              <option value="">에이전트 선택...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">모드</label>
            <div className="flex gap-2">
              {(Object.keys(MODE_LABELS) as SlackRoutingMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                    mode === m
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-[var(--color-border-strong)] text-[var(--color-fg-subtle)] hover:border-[#3b4050] hover:text-[var(--color-fg-muted)]',
                  )}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              채널: 채널 내 멘션만 / DM: 봇 DM만 / 채널 + DM: 둘 다
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={!channelId.trim() || !agentId || saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563eb] disabled:opacity-40"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              추가
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-bg"
            >
              취소
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SlackChannelAgentList({ installation, projectId }: Props) {
  const [mappings, setMappings] = useState<SlackChannelAgent[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const loadMappings = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const data = await apiClient.slack.channelAgents.list(projectId)
      setMappings(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : '목록 로드에 실패했습니다'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!installation?.installed) return
    loadMappings()
  }, [installation?.installed, loadMappings])

  useEffect(() => {
    if (!projectId) return
    apiClient.agents.list(projectId).then(setAgents).catch(() => {
      toast.error('에이전트 목록 로드에 실패했습니다')
    })
  }, [projectId])

  const addMutation = useApiMutation({
    mutationFn: (data: { channelId: string; channelName?: string; agentId: string; mode: SlackRoutingMode }) =>
      apiClient.slack.channelAgents.create(projectId, data),
    successMessage: MSG.slack.added,
    onSuccess: (created) => {
      setMappings((prev) => [created, ...prev])
    },
  })

  const toggleMutation = useApiMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.slack.channelAgents.update(id, { enabled }),
    successMessage: (_, { enabled }) => (enabled ? MSG.slack.enabled : MSG.slack.disabled),
    onSuccess: (updated) => {
      setMappings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    },
  })

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) => apiClient.slack.channelAgents.delete(id),
    successMessage: MSG.slack.removed,
    onSuccess: (_, id) => {
      setMappings((prev) => prev.filter((m) => m.id !== id))
    },
  })

  const handleAdd = useCallback(
    async (data: { channelId: string; channelName?: string; agentId: string; mode: SlackRoutingMode }) => {
      await addMutation.mutateAsync(data)
    },
    [addMutation],
  )

  const handleToggleEnabled = useCallback((mapping: SlackChannelAgent) => {
    toggleMutation.mutate({ id: mapping.id, enabled: !mapping.enabled })
  }, [toggleMutation])

  const handleDelete = useCallback((id: string) => {
    if (!window.confirm('이 채널 매핑을 삭제하시겠습니까?')) return
    deleteMutation.mutate(id)
  }, [deleteMutation])

  if (!installation?.installed) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] p-8 text-center">
        <Hash className="mx-auto mb-3 h-8 w-8 text-[var(--color-border-strong)]" />
        <p className="text-sm font-medium text-[var(--color-fg-muted)]">채널 매핑을 설정하려면 먼저 Slack 워크스페이스를 연결하세요</p>
        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">위의 워크스페이스 카드에서 연결하기를 클릭해주세요</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">채널-에이전트 매핑</h2>
            <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
              채널 또는 DM 에서 수신한 메시지를 지정한 에이전트로 라우팅합니다
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            매핑 추가
          </button>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-fg-subtle)]" />
          </div>
        ) : mappings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="mb-3 h-8 w-8 text-[var(--color-border-strong)]" />
            <p className="text-xs font-medium text-[var(--color-fg-muted)]">등록된 채널 매핑이 없습니다</p>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              채널 ID 와 에이전트를 연결해 자동 응답을 설정하세요
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
            >
              <Plus className="h-3.5 w-3.5" />
              첫 번째 매핑 추가
            </button>
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border-strong)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                  <th className="px-5 py-3">채널</th>
                  <th className="px-5 py-3">에이전트</th>
                  <th className="px-5 py-3">모드</th>
                  <th className="px-5 py-3">활성</th>
                  <th className="px-5 py-3 text-right">작업</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-[var(--color-border-strong)]/50 transition-colors last:border-b-0 hover:bg-bg/50"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Hash className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
                        <div>
                          {m.channelName && (
                            <p className="text-sm font-medium text-foreground">{m.channelName}</p>
                          )}
                          <p className={cn('font-mono text-xs', m.channelName ? 'text-[var(--color-fg-subtle)]' : 'text-foreground')}>
                            {m.channelId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--color-fg-muted)]">{m.agent.name}</td>
                    <td className="px-5 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', MODE_COLORS[m.mode])}>
                        {MODE_LABELS[m.mode]}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => handleToggleEnabled(m)}
                        disabled={toggleMutation.isPending}
                        className={cn(
                          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                          m.enabled ? 'bg-blue-500' : 'bg-[var(--color-border-strong)]',
                          toggleMutation.isPending && 'opacity-50',
                        )}
                      >
                        <span
                          className={cn(
                            'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                            m.enabled ? 'translate-x-4' : 'translate-x-0',
                          )}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDelete(m.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                        title="삭제"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddMappingModal
          agents={agents}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}

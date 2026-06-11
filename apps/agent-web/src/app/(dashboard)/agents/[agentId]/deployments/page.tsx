'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  Loader2,
  Rocket,
  ShieldOff,
  KeyRound,
  Trash2,
  Plus,
} from 'lucide-react'
import type {
  Agent,
  AgentDeployment,
  AgentDeploymentApiKey,
  DeploymentEnvironment,
  IssuedAgentDeploymentApiKey,
} from '@agent-studio/shared'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { useUserStore } from '@/stores/use-user-store'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/shared/confirm-dialog'

function formatDateTime(iso?: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'inactive':
      return 'bg-[var(--color-border-strong)] text-[var(--color-fg-muted)] border-[var(--color-border-strong)]'
    case 'pending_approval':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'failed':
      return 'bg-red-500/10 text-red-400 border-red-500/30'
    case 'revoked':
      return 'bg-red-500/10 text-red-400 border-red-500/30'
    default:
      return 'bg-[var(--color-border-strong)] text-[var(--color-fg-muted)] border-[var(--color-border-strong)]'
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} 복사됨`)
  } catch {
    toast.error('클립보드 복사 실패')
  }
}

function buildCurlExample(publicPath: string, rawKey: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-host'
  const apiBase = origin.replace(/:\d+$/, ':4200')
  return `# 1) thread 생성
curl -X POST ${apiBase}/api/v1/chat/threads \\
  -H "X-API-Key: ${rawKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"first chat"}'

# 2) 메시지 전송 (응답에 받은 threadId 사용)
curl -X POST ${apiBase}/api/v1/chat/threads/{threadId}/messages \\
  -H "X-API-Key: ${rawKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"안녕하세요"}'

# publicPath: ${publicPath}`
}

export default function AgentDeploymentsPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const { activeProjectId: projectId } = useUserStore()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [environments, setEnvironments] = useState<DeploymentEnvironment[]>([])
  const [deployments, setDeployments] = useState<AgentDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEnvId, setSelectedEnvId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string>('')

  const [keys, setKeys] = useState<AgentDeploymentApiKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [issuedKey, setIssuedKey] = useState<IssuedAgentDeploymentApiKey | null>(null)
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const confirm = useConfirm()

  const deployMutation = useApiMutation({
    mutationFn: () => apiClient.agentDeployments.deploy(agentId, {
      environmentId: selectedEnvId,
      description: description.trim() || undefined,
    }),
    successMessage: (dp) => `v${dp.version} 배포 완료`,
    onSuccess: async (dp) => {
      setDescription('')
      setSelectedDeploymentId(dp.id)
      await loadAll()
    },
  })

  const undeployMutation = useApiMutation({
    mutationFn: (id: string) => apiClient.agentDeployments.undeploy(id),
    successMessage: MSG.agentDeployment.deactivated,
    onSuccess: () => loadAll(),
  })

  const issueKeyMutation = useApiMutation({
    mutationFn: () => apiClient.agentDeployments.issueApiKey(selectedDeploymentId, {
      name: newKeyName.trim(),
    }),
    successMessage: 'API 키 발급 완료 — 이번에만 표시됩니다',
    onSuccess: async (issued) => {
      setIssuedKey(issued)
      setNewKeyName('')
      setShowIssueForm(false)
      await loadKeys(selectedDeploymentId)
    },
  })

  const revokeKeyMutation = useApiMutation({
    mutationFn: (keyId: string) => apiClient.agentDeployments.revokeApiKey(keyId),
    successMessage: MSG.apiKey.revoked,
    onSuccess: () => {
      if (selectedDeploymentId) void loadKeys(selectedDeploymentId)
    },
  })

  const envById = useMemo(
    () => new Map(environments.map((e) => [e.id, e])),
    [environments],
  )

  const loadAll = useCallback(async () => {
    if (!projectId || !agentId) return
    setLoading(true)
    try {
      const [a, envs, dps] = await Promise.all([
        apiClient.agents.get(agentId),
        apiClient.environments.list(projectId),
        apiClient.agentDeployments.listByAgent(agentId),
      ])
      setAgent(a)
      setEnvironments(envs)
      setDeployments(dps)
      if (!selectedEnvId && envs.length > 0) setSelectedEnvId(envs[0].id)
      const activeDp = dps.find((d) => d.status === 'active')
      if (!selectedDeploymentId && activeDp) setSelectedDeploymentId(activeDp.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '데이터 로드 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [projectId, agentId, selectedEnvId, selectedDeploymentId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const loadKeys = useCallback(async (deploymentId: string) => {
    setLoadingKeys(true)
    try {
      const list = await apiClient.agentDeployments.listApiKeys(deploymentId)
      setKeys(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'API 키 목록 로드 실패'
      toast.error(msg)
    } finally {
      setLoadingKeys(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDeploymentId) loadKeys(selectedDeploymentId)
  }, [selectedDeploymentId, loadKeys])

  const handleDeploy = () => {
    if (!selectedEnvId) {
      toast.error('환경을 선택해주세요')
      return
    }
    deployMutation.mutate()
  }

  const handleUndeploy = async (id: string) => {
    const ok = await confirm({
      title: '배포 비활성화',
      message: '해당 배포를 비활성화하시겠습니까?',
      variant: 'danger',
      confirmText: '비활성화',
    })
    if (!ok) return
    undeployMutation.mutate(id)
  }

  const handleIssueKey = () => {
    if (!selectedDeploymentId) {
      toast.error('배포를 먼저 선택해주세요')
      return
    }
    if (!newKeyName.trim()) {
      toast.error('키 이름을 입력해주세요')
      return
    }
    issueKeyMutation.mutate()
  }

  const handleRevokeKey = async (keyId: string) => {
    const ok = await confirm({
      title: 'API 키 폐기',
      message: '해당 API 키를 폐기하시겠습니까? 되돌릴 수 없습니다.',
      variant: 'danger',
      confirmText: '폐기',
    })
    if (!ok) return
    revokeKeyMutation.mutate(keyId)
  }

  const selectedDeployment = deployments.find((d) => d.id === selectedDeploymentId) ?? null

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href={`/agents/${agentId}`}
          className="rounded-md p-2 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="rounded-lg bg-blue-500/10 p-2">
          <Rocket className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">배포 관리</h1>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            {agent ? `${agent.name} (${agent.slug})` : '에이전트 로드 중...'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-fg-subtle)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 새 배포 카드 */}
          <section className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">새 배포</h2>
            {environments.length === 0 ? (
              <p className="text-xs text-[var(--color-fg-muted)]">
                먼저 프로젝트 환경을 생성해주세요.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">환경</label>
                  <select
                    value={selectedEnvId}
                    onChange={(e) => setSelectedEnvId(e.target.value)}
                    className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-sm text-foreground"
                  >
                    {environments.map((env) => (
                      <option key={env.id} value={env.id}>
                        {env.name} ({env.slug})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">설명 (선택)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="릴리스 노트"
                    className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-sm text-foreground"
                  />
                </div>
                <button
                  onClick={handleDeploy}
                  disabled={deployMutation.isPending || !selectedEnvId}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
                >
                  {deployMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {deployMutation.isPending ? '배포 중...' : '배포 실행'}
                </button>
              </div>
            )}
          </section>

          {/* 발급된 키 1회 표시 */}
          {issuedKey && (
            <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-amber-400">새 API 키 — 이번에만 표시</h2>
                <button
                  onClick={() => setIssuedKey(null)}
                  className="text-xs text-[var(--color-fg-muted)] hover:text-foreground"
                >
                  닫기
                </button>
              </div>
              <p className="mb-2 text-xs text-amber-300">
                이 키는 다시 조회할 수 없습니다. 안전한 곳에 저장하세요.
              </p>
              <div className="mb-3 flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs text-emerald-300">
                  {issuedKey.rawKey}
                </code>
                <button
                  onClick={() => copy(issuedKey.rawKey, 'API 키')}
                  className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-fg-muted)] hover:text-foreground"
                >
                  <Copy className="h-3 w-3" />
                  복사
                </button>
              </div>
              {selectedDeployment && (
                <div className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-fg-muted)]">
                    <span>curl 예시</span>
                    <button
                      onClick={() => copy(buildCurlExample(selectedDeployment.publicPath, issuedKey.rawKey), 'curl 예시')}
                      className="flex items-center gap-1 text-[var(--color-fg-muted)] hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                      복사
                    </button>
                  </div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-[var(--color-fg-muted)]">
{buildCurlExample(selectedDeployment.publicPath, issuedKey.rawKey)}
                  </pre>
                </div>
              )}
            </section>
          )}

          {/* 배포 이력 */}
          <section className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-foreground">배포 이력</h2>
            {deployments.length === 0 ? (
              <p className="text-xs text-[var(--color-fg-muted)]">아직 배포된 버전이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border-strong)] text-left text-[var(--color-fg-subtle)]">
                      <th className="px-3 py-2 font-medium">선택</th>
                      <th className="px-3 py-2 font-medium">버전</th>
                      <th className="px-3 py-2 font-medium">환경</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                      <th className="px-3 py-2 font-medium">publicPath</th>
                      <th className="px-3 py-2 font-medium">설명</th>
                      <th className="px-3 py-2 font-medium">배포 시각</th>
                      <th className="px-3 py-2 font-medium text-right">동작</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deployments.map((d) => {
                      const env = envById.get(d.environmentId) ?? d.env
                      return (
                        <tr
                          key={d.id}
                          className={cn(
                            'border-b border-[var(--color-border-strong)] last:border-b-0',
                            d.id === selectedDeploymentId && 'bg-blue-500/5',
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name="selected-deployment"
                              checked={d.id === selectedDeploymentId}
                              onChange={() => setSelectedDeploymentId(d.id)}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-foreground">v{d.version}</td>
                          <td className="px-3 py-2 text-[var(--color-fg-muted)]">
                            {env ? `${env.name} (${env.slug})` : d.environmentId.slice(0, 8)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-xs',
                                statusColor(d.status),
                              )}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <code className="text-xs text-[var(--color-fg-muted)]">{d.publicPath}</code>
                              <button
                                onClick={() => copy(d.publicPath, 'publicPath')}
                                className="text-[var(--color-fg-subtle)] hover:text-foreground"
                              >
                                <Copy className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[var(--color-fg-muted)]">{d.description || '-'}</td>
                          <td className="px-3 py-2 text-[var(--color-fg-muted)]">{formatDateTime(d.deployedAt)}</td>
                          <td className="px-3 py-2 text-right">
                            {d.status === 'active' && (
                              <button
                                onClick={() => handleUndeploy(d.id)}
                                disabled={undeployMutation.isPending}
                                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-muted)] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                              >
                                {undeployMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                                비활성화
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* API 키 관리 */}
          <section className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">API 키</h2>
              <button
                onClick={() => setShowIssueForm((prev) => !prev)}
                disabled={!selectedDeploymentId}
                className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-fg-muted)] hover:border-blue-500/40 hover:text-blue-400 disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
                새 키 발급
              </button>
            </div>

            {!selectedDeploymentId ? (
              <p className="text-xs text-[var(--color-fg-muted)]">상단에서 배포를 선택해주세요.</p>
            ) : (
              <>
                {showIssueForm && (
                  <div className="mb-3 rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
                    <label className="mb-1 block text-xs text-[var(--color-fg-muted)]">키 이름</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="예: 위젯 production"
                        className="flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-sm text-foreground"
                      />
                      <button
                        onClick={handleIssueKey}
                        disabled={issueKeyMutation.isPending}
                        className="flex items-center gap-1 rounded-md bg-blue-500/20 px-3 py-2 text-sm text-blue-400 hover:bg-blue-500/30 disabled:opacity-50"
                      >
                        {issueKeyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        {issueKeyMutation.isPending ? '발급 중...' : '발급'}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                      기본 scope: chat:invoke, chat:resume, chat:read
                    </p>
                  </div>
                )}

                {loadingKeys ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-[var(--color-fg-subtle)]" />
                ) : keys.length === 0 ? (
                  <p className="text-xs text-[var(--color-fg-muted)]">발급된 API 키가 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--color-border-strong)] text-left text-[var(--color-fg-subtle)]">
                          <th className="px-3 py-2 font-medium">이름</th>
                          <th className="px-3 py-2 font-medium">키</th>
                          <th className="px-3 py-2 font-medium">상태</th>
                          <th className="px-3 py-2 font-medium">scopes</th>
                          <th className="px-3 py-2 font-medium">최근 사용</th>
                          <th className="px-3 py-2 font-medium">발급</th>
                          <th className="px-3 py-2 font-medium text-right">동작</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map((k) => (
                          <tr key={k.id} className="border-b border-[var(--color-border-strong)] last:border-b-0">
                            <td className="px-3 py-2 text-foreground">{k.name}</td>
                            <td className="px-3 py-2 font-mono text-[var(--color-fg-muted)]">{k.keyMasked}</td>
                            <td className="px-3 py-2">
                              <span
                                className={cn(
                                  'rounded-full border px-2 py-0.5 text-xs',
                                  statusColor(k.status),
                                )}
                              >
                                {k.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-[var(--color-fg-muted)]">
                              {k.scopes.join(', ')}
                            </td>
                            <td className="px-3 py-2 text-[var(--color-fg-muted)]">{formatDateTime(k.lastUsedAt)}</td>
                            <td className="px-3 py-2 text-[var(--color-fg-muted)]">{formatDateTime(k.createdAt)}</td>
                            <td className="px-3 py-2 text-right">
                              {k.status === 'active' && (
                                <button
                                  onClick={() => handleRevokeKey(k.id)}
                                  disabled={revokeKeyMutation.isPending}
                                  className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2 py-1 text-[var(--color-fg-muted)] hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                                >
                                  {revokeKeyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                  폐기
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { toast } from 'sonner'
import type { NaverWorksInstallationView, NaverWorksUpsertBody } from '@/lib/api-client'
import type { Agent } from '@agent-studio/shared'

interface Props {
  projectId: string
  agents: Agent[]
  callbackBaseUrl: string
}

interface FormState {
  agentId: string
  botId: string
  botName: string
  clientId: string
  clientSecret: string
  serviceAccount: string
  privateKey: string
  botSecret: string
  scope: string
}

const emptyForm: FormState = {
  agentId: '',
  botId: '',
  botName: '',
  clientId: '',
  clientSecret: '',
  serviceAccount: '',
  privateKey: '',
  botSecret: '',
  scope: 'bot bot.message',
}

function SecretInput({
  value,
  onChange,
  placeholder,
  label,
  required,
  multiline,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  required?: boolean
  multiline?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={6}
            className={cn(
              'w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 pr-9 text-xs font-mono text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]',
              show ? '' : '[-webkit-text-security:disc]',
            )}
          />
        ) : (
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 pr-9 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
          />
        )}
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-2.5 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

function PlainInput({
  value,
  onChange,
  placeholder,
  label,
  required,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  required?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
      />
    </div>
  )
}

export function NaverWorksInstallationList({ projectId, agents, callbackBaseUrl }: Props) {
  const [items, setItems] = useState<NaverWorksInstallationView[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const rows = await apiClient.naverWorks.installations.list(projectId)
      setItems(rows ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'NAVER WORKS 봇 목록 로드 실패'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>()
    for (const a of agents) m.set(a.id, a)
    return m
  }, [agents])

  const upsertMutation = useApiMutation({
    mutationFn: (body: NaverWorksUpsertBody) =>
      apiClient.naverWorks.installations.upsert(projectId, body),
    successMessage: MSG.naverWorks.created,
    onSuccess: (created) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === created.id)
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = created
          return next
        }
        return [created, ...prev]
      })
      setForm(emptyForm)
      setShowModal(false)
    },
  })

  const toggleMutation = useApiMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.naverWorks.installations.enable(id, enabled),
    successMessage: (_, { enabled }) => (enabled ? MSG.naverWorks.enabled : MSG.naverWorks.disabled),
    onSuccess: (_, { id, enabled }) => {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, enabled } : i)),
      )
      setBusyId(null)
    },
    onError: () => setBusyId(null),
  })

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) => apiClient.naverWorks.installations.delete(id),
    successMessage: MSG.naverWorks.deleted,
    onSuccess: (_, id) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setBusyId(null)
    },
    onError: () => setBusyId(null),
  })

  const changeAgentMutation = useApiMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string }) =>
      apiClient.naverWorks.installations.updateAgent(id, agentId),
    successMessage: '에이전트가 변경되었습니다.',
    onSuccess: (_, { id, agentId }) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, agentId } : i)))
      setBusyId(null)
    },
    onError: () => setBusyId(null),
  })

  const submitInstall = async () => {
    if (
      !form.agentId.trim() ||
      !form.botId.trim() ||
      !form.clientId.trim() ||
      !form.clientSecret.trim() ||
      !form.serviceAccount.trim() ||
      !form.privateKey.trim() ||
      !form.botSecret.trim()
    ) {
      toast.error('필수 항목을 모두 입력해주세요')
      return
    }
    await upsertMutation.mutate({
      agentId: form.agentId.trim(),
      botId: form.botId.trim(),
      botName: form.botName.trim() || undefined,
      clientId: form.clientId.trim(),
      clientSecret: form.clientSecret.trim(),
      serviceAccount: form.serviceAccount.trim(),
      privateKey: form.privateKey,
      botSecret: form.botSecret.trim(),
      scope: form.scope.trim() || undefined,
    })
  }

  const handleToggle = (item: NaverWorksInstallationView) => {
    setBusyId(item.id)
    toggleMutation.mutate({ id: item.id, enabled: !item.enabled })
  }

  const handleDelete = (item: NaverWorksInstallationView) => {
    if (!window.confirm(`봇 ${item.botName || item.botId} 등록을 삭제하시겠습니까?`)) return
    setBusyId(item.id)
    deleteMutation.mutate(item.id)
  }

  const handleChangeAgent = (item: NaverWorksInstallationView, agentId: string) => {
    if (agentId === item.agentId) return
    setBusyId(item.id)
    changeAgentMutation.mutate({ id: item.id, agentId })
  }

  const copyCallback = (botId: string) => {
    const url = `${callbackBaseUrl.replace(/\/$/, '')}/api/webhooks/naver-works/${botId}`
    navigator.clipboard.writeText(url).then(
      () => toast.success('Callback URL이 복사되었습니다'),
      () => toast.error('복사 실패 — 수동 복사해주세요'),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">등록된 봇</h2>
        <button
          onClick={() => {
            setForm(emptyForm)
            setShowModal(true)
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[#00c473] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#00b86a]"
        >
          <Plus className="h-4 w-4" />
          봇 등록
        </button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-[#3b82f6]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center">
          <p className="text-sm text-[var(--color-fg-subtle)]">등록된 NAVER WORKS 봇이 없습니다</p>
          <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
            상단의 &quot;봇 등록&quot; 버튼으로 새 봇을 추가하세요
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const callbackUrl = `${callbackBaseUrl.replace(/\/$/, '')}/api/webhooks/naver-works/${item.botId}`
            const isBusy = busyId === item.id
            return (
              <div
                key={item.id}
                className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {item.botName || item.botId}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                      Bot ID: <span className="font-mono">{item.botId}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(item)}
                      disabled={isBusy}
                      title={item.enabled ? '비활성화' : '활성화'}
                      className={cn(
                        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                        item.enabled ? 'bg-blue-500' : 'bg-[var(--color-border-strong)]',
                        isBusy && 'opacity-50',
                      )}
                    >
                      <span
                        className={cn(
                          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                          item.enabled ? 'translate-x-4' : 'translate-x-0',
                        )}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={isBusy}
                      className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      title="봇 삭제"
                    >
                      {isBusy && deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      Service Account
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {item.serviceAccount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      Scope
                    </p>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">
                      {item.scope}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                      상태
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {item.enabled ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          <span className="text-sm font-medium text-green-400">활성</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                          <span className="text-sm font-medium text-[var(--color-fg-subtle)]">비활성</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--color-fg-muted)]">
                      매핑된 에이전트
                    </label>
                    <select
                      value={item.agentId}
                      onChange={(e) => handleChangeAgent(item, e.target.value)}
                      disabled={isBusy}
                      className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground outline-none focus:border-[#3b82f6]"
                    >
                      {!agentMap.has(item.agentId) && (
                        <option value={item.agentId}>(현재) {item.agentId}</option>
                      )}
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--color-fg-muted)]">
                      Callback URL (NAVER WORKS Developer Console 에 등록)
                    </label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={callbackUrl}
                        className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 font-mono text-xs text-foreground outline-none"
                      />
                      <button
                        onClick={() => copyCallback(item.botId)}
                        className="rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                        title="복사"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">NAVER WORKS 봇 등록</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
                <p className="font-semibold text-[var(--color-fg-muted)]">발급 절차</p>
                <p className="mt-1">
                  NAVER WORKS Developer Console 에서 Bot 을 생성하고 Service Account JWT 인증을 활성화한 뒤,
                  Client ID/Secret, Service Account, Private Key(PEM), Bot Secret 을 발급받아 입력합니다.
                </p>
                <p className="mt-1">
                  등록 시 자동으로 토큰 발급 검증이 진행됩니다. 모든 시크릿은 서버에서 AES-256-GCM 으로 암호화 저장됩니다.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  사용할 에이전트 <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.agentId}
                  onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground outline-none focus:border-[#3b82f6]"
                >
                  <option value="">— 에이전트 선택 —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <PlainInput
                label="Bot ID"
                value={form.botId}
                onChange={(v) => setForm({ ...form, botId: v })}
                required
                placeholder="예: 1234567"
              />
              <PlainInput
                label="Bot Name (UI 표시용)"
                value={form.botName}
                onChange={(v) => setForm({ ...form, botName: v })}
                placeholder="예: 고객 지원 봇"
              />
              <PlainInput
                label="Client ID"
                value={form.clientId}
                onChange={(v) => setForm({ ...form, clientId: v })}
                required
              />
              <SecretInput
                label="Client Secret"
                value={form.clientSecret}
                onChange={(v) => setForm({ ...form, clientSecret: v })}
                required
              />
              <PlainInput
                label="Service Account"
                value={form.serviceAccount}
                onChange={(v) => setForm({ ...form, serviceAccount: v })}
                required
                placeholder="xxx@example.serviceaccount"
              />
              <SecretInput
                label="Private Key (PEM 본문)"
                value={form.privateKey}
                onChange={(v) => setForm({ ...form, privateKey: v })}
                required
                multiline
                placeholder={'-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              />
              <SecretInput
                label="Bot Secret (Callback HMAC 검증용)"
                value={form.botSecret}
                onChange={(v) => setForm({ ...form, botSecret: v })}
                required
              />
              <PlainInput
                label="Scope"
                value={form.scope}
                onChange={(v) => setForm({ ...form, scope: v })}
                placeholder="bot bot.message"
              />

              <div className="flex gap-3 pt-1">
                <button
                  onClick={submitInstall}
                  disabled={upsertMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#00c473] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#00b86a] disabled:opacity-40"
                >
                  {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  등록하기
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-bg"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

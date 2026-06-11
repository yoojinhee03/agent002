'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2, Plus, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { ClientHeader } from '../../_components/header'
import { useConfirm, useConfirmHelpers } from '@/components/shared/confirm-dialog'

interface ProviderRow {
  id: string
  slug: string
  name: string
  type: string
  iconUrl: string | null
  owned: boolean
  userCredentials: Array<{
    id: string
    label: string
    status: 'active' | 'invalid' | 'expired'
    lastVerifiedAt: string | null
  }>
}

export default function ClientToolsPage() {
  const params = useSearchParams()
  const focusTarget = params?.get('focus') ?? null

  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openProviderId, setOpenProviderId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { confirmDelete } = useConfirmHelpers()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.meProviders.catalog()
      setProviders(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provider 카탈로그 로드 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ?focus=<providerSlug> 쿼리로 진입 시 해당 카드 등록 폼 자동 오픈
  useEffect(() => {
    if (!focusTarget || providers.length === 0) return
    const match = providers.find((p) => p.slug === focusTarget)
    if (match) setOpenProviderId(match.id)
  }, [focusTarget, providers])

  const focusedSet = useMemo(
    () => new Set(focusTarget ? [focusTarget] : []),
    [focusTarget],
  )

  const handleSubmit = async (provider: ProviderRow) => {
    if (!draftValue.trim()) {
      toast.error('값을 입력해주세요')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.meProviders.add({
        providerId: provider.id,
        value: draftValue.trim(),
        label: draftLabel.trim() || undefined,
      })
      toast.success(`${provider.name} 등록 완료`)
      setDraftValue('')
      setDraftLabel('')
      setOpenProviderId(null)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '등록 실패'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleTest = async (credId: string) => {
    try {
      const res = await apiClient.meCredentials.test(credId)
      if (res.ok) toast.success(res.message ?? '검증 성공')
      else toast.error(res.message ?? '검증 실패')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '검증 실패'
      toast.error(msg)
    }
  }

  const handleDelete = async (credId: string) => {
    if (!(await confirmDelete('해당 자격증명을 삭제하시겠습니까?'))) return
    try {
      await apiClient.meCredentials.delete(credId)
      toast.success('삭제 완료')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(msg)
    }
  }

  return (
    <>
      <ClientHeader title="도구 관리" subtitle="사용자 본인의 자격증명을 등록·검증·관리합니다." />

      <div className="space-y-8 p-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
            Provider (모델 호출용)
          </h2>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--client-muted)' }} />
          </div>
        ) : providers.length === 0 ? (
          <div className="client-panel px-6 py-20 text-center">
            <KeyRound className="mx-auto mb-3 h-10 w-10" style={{ color: 'var(--client-muted-2)' }} />
            <p className="text-sm" style={{ color: 'var(--client-muted)' }}>
              등록 가능한 Provider 카탈로그가 비어 있습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map((p) => {
              const isOpen = openProviderId === p.id
              const isFocused = focusedSet.has(p.slug)
              return (
                <div
                  key={p.id}
                  className={cn(
                    'client-panel p-4 transition-colors',
                    isFocused && 'ring-1 ring-blue-400/60',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{
                          background: 'var(--client-panel-2)',
                          color: 'var(--client-text)',
                        }}
                      >
                        {p.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.iconUrl} alt={p.name} className="h-6 w-6" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3
                            className="text-[14px] font-semibold"
                            style={{ color: 'var(--client-text)' }}
                          >
                            {p.name}
                          </h3>
                          <span
                            className="rounded-full border px-2 py-0.5 text-xs"
                            style={{
                              borderColor: 'var(--client-border-2)',
                              color: 'var(--client-muted)',
                            }}
                          >
                            {p.type}
                          </span>
                          {p.owned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              연결됨
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                          slug: {p.slug}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setOpenProviderId(isOpen ? null : p.id)
                        setDraftLabel('')
                        setDraftValue('')
                      }}
                      className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:border-blue-400/50"
                      style={{
                        borderColor: 'var(--client-border-2)',
                        color: 'var(--client-text)',
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      자격증명 추가
                    </button>
                  </div>

                  {isOpen && (
                    <div
                      className="mt-3 rounded-lg border p-3"
                      style={{
                        borderColor: 'var(--client-border-2)',
                        background: 'var(--client-panel-2)',
                      }}
                    >
                      <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                          placeholder="라벨 (선택, 멀티 계정 구분용)"
                          className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                          style={{
                            borderColor: 'var(--client-border-2)',
                            color: 'var(--client-text)',
                          }}
                        />
                        <input
                          type="password"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          placeholder="API 키 평문 (저장 후 다시 조회 불가)"
                          className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                          style={{
                            borderColor: 'var(--client-border-2)',
                            color: 'var(--client-text)',
                          }}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setOpenProviderId(null)}
                          className="rounded-md px-3 py-1.5 text-xs"
                          style={{ color: 'var(--client-muted)' }}
                        >
                          취소
                        </button>
                        <button
                          onClick={() => handleSubmit(p)}
                          disabled={submitting || !draftValue.trim()}
                          className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                          저장
                        </button>
                      </div>
                    </div>
                  )}

                  {p.userCredentials.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {p.userCredentials.map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                          style={{
                            borderColor: 'var(--client-border-2)',
                            background: 'var(--client-bg-2)',
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <StatusBadge status={c.status} />
                            <span style={{ color: 'var(--client-text)' }}>
                              {c.label || '(라벨 없음)'}
                            </span>
                            {c.lastVerifiedAt && (
                              <span className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
                                최근 검증 {new Date(c.lastVerifiedAt).toLocaleString()}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleTest(c.id)}
                              className="rounded-md border px-2 py-1 text-xs hover:border-blue-400/50"
                              style={{
                                borderColor: 'var(--client-border-2)',
                                color: 'var(--client-muted)',
                              }}
                            >
                              테스트
                            </button>
                            <button
                              onClick={() => handleDelete(c.id)}
                              className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-red-400/50 hover:text-red-300"
                              style={{
                                borderColor: 'var(--client-border-2)',
                                color: 'var(--client-muted)',
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                              삭제
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )}
        </section>

        <ToolCredentialsSection focusTarget={focusTarget} />

        <McpCredentialsSection focusTarget={focusTarget} />
      </div>
    </>
  )
}

interface ToolCatalogRow {
  targetId: string
  label: string
  description: string
  authType: 'api_key' | 'oauth'
  triggers: string[]
  owned: boolean
  userCredentials: Array<{
    id: string
    label: string
    status: 'active' | 'invalid' | 'expired'
    lastVerifiedAt: string | null
  }>
}

function ToolCredentialsSection({ focusTarget }: { focusTarget: string | null }) {
  const [tools, setTools] = useState<ToolCatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { confirmDelete } = useConfirmHelpers()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.meTools.catalog()
      setTools(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '도구 카탈로그 로드 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!focusTarget || tools.length === 0) return
    const match = tools.find((t) => t.targetId === focusTarget)
    if (match) setOpenId(match.targetId)
  }, [focusTarget, tools])

  const handleSubmit = async (tool: ToolCatalogRow) => {
    if (!draftValue.trim()) {
      toast.error('값을 입력해주세요')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.meCredentials.create({
        kind: 'tool',
        targetId: tool.targetId,
        label: draftLabel.trim() || undefined,
        value: draftValue.trim(),
      })
      toast.success(`${tool.label} 자격증명 등록 완료`)
      setDraftValue('')
      setDraftLabel('')
      setOpenId(null)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '등록 실패'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleTest = async (credId: string) => {
    try {
      const res = await apiClient.meCredentials.test(credId)
      if (res.ok) toast.success(res.message ?? '검증 성공')
      else toast.error(res.message ?? '검증 실패')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '검증 실패'
      toast.error(msg)
    }
  }

  const handleDelete = async (credId: string) => {
    if (!(await confirmDelete('해당 자격증명을 삭제하시겠습니까?'))) return
    try {
      await apiClient.meCredentials.delete(credId)
      toast.success('삭제 완료')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(msg)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
        도구 (자격증명 필요한 빌트인 도구)
      </h2>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--client-muted)' }} />
        </div>
      ) : tools.length === 0 ? (
        <div className="client-panel px-6 py-12 text-center">
          <KeyRound className="mx-auto mb-3 h-10 w-10" style={{ color: 'var(--client-muted-2)' }} />
          <p className="text-sm" style={{ color: 'var(--client-muted)' }}>
            현재 자격증명이 필요한 빌트인 도구가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tools.map((t) => {
            if (t.targetId === 'gmail') {
              return (
                <GmailOAuthCard
                  key={t.targetId}
                  tool={t}
                  isFocused={focusTarget === t.targetId}
                  onChange={load}
                />
              )
            }
            const isOpen = openId === t.targetId
            const isFocused = focusTarget === t.targetId
            return (
              <div
                key={t.targetId}
                className={cn(
                  'client-panel p-4 transition-colors',
                  isFocused && 'ring-1 ring-blue-400/60',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ background: 'var(--client-panel-2)', color: 'var(--client-text)' }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
                          {t.label}
                        </h3>
                        {t.owned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            연결됨
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                        targetId: {t.targetId} · {t.description}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                        사용 도구: {t.triggers.join(', ')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setOpenId(isOpen ? null : t.targetId)
                      setDraftLabel('')
                      setDraftValue('')
                    }}
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:border-blue-400/50"
                    style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                  >
                    <Plus className="h-3 w-3" />
                    자격증명 추가
                  </button>
                </div>

                {isOpen && (
                  <div
                    className="mt-3 rounded-lg border p-3"
                    style={{ borderColor: 'var(--client-border-2)', background: 'var(--client-panel-2)' }}
                  >
                    <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        placeholder="라벨 (선택)"
                        className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                      />
                      <input
                        type="password"
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        placeholder="API 키 평문 (저장 후 다시 조회 불가)"
                        className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOpenId(null)}
                        className="rounded-md px-3 py-1.5 text-xs"
                        style={{ color: 'var(--client-muted)' }}
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleSubmit(t)}
                        disabled={submitting || !draftValue.trim()}
                        className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        저장
                      </button>
                    </div>
                  </div>
                )}

                {t.userCredentials.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {t.userCredentials.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', background: 'var(--client-bg-2)' }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          <span style={{ color: 'var(--client-text)' }}>{c.label || '(라벨 없음)'}</span>
                          {c.lastVerifiedAt && (
                            <span className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
                              최근 검증 {new Date(c.lastVerifiedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTest(c.id)}
                            className="rounded-md border px-2 py-1 text-xs hover:border-blue-400/50"
                            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
                          >
                            테스트
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-red-400/50 hover:text-red-300"
                            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
                          >
                            <Trash2 className="h-3 w-3" />
                            삭제
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

interface McpCatalogRow {
  targetId: string
  label: string
  description: string | null
  transport: string
  envKeys: string[]
  credentialMode?: 'shared' | 'per_user'
  requiredUserFields?: Array<{
    key: string
    label: string
    secret?: boolean
    placeholder?: string
    required?: boolean
  }>
  owned: boolean
  userCredentials: Array<{
    id: string
    label: string
    status: 'active' | 'invalid' | 'expired'
    lastVerifiedAt: string | null
  }>
}

function McpCredentialsSection({ focusTarget }: { focusTarget: string | null }) {
  const [servers, setServers] = useState<McpCatalogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState('')
  const [draftLabel, setDraftLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { confirmDelete } = useConfirmHelpers()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiClient.meMcp.catalog()
      setServers(list)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'MCP 카탈로그 로드 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!focusTarget || servers.length === 0) return
    const match = servers.find((s) => s.targetId === focusTarget)
    if (match) setOpenId(match.targetId)
  }, [focusTarget, servers])

  const handleSubmit = async (srv: McpCatalogRow) => {
    if (!draftValue.trim()) {
      toast.error('값을 입력해주세요')
      return
    }
    setSubmitting(true)
    try {
      await apiClient.meCredentials.create({
        kind: 'mcp',
        targetId: srv.targetId,
        label: draftLabel.trim() || undefined,
        value: draftValue.trim(),
      })
      toast.success(`${srv.label} 자격증명 등록 완료`)
      setDraftValue('')
      setDraftLabel('')
      setOpenId(null)
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '등록 실패'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleTest = async (credId: string) => {
    try {
      const res = await apiClient.meCredentials.test(credId)
      if (res.ok) toast.success(res.message ?? '검증 성공')
      else toast.error(res.message ?? '검증 실패')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '검증 실패'
      toast.error(msg)
    }
  }

  const handleDelete = async (credId: string) => {
    if (!(await confirmDelete('해당 자격증명을 삭제하시겠습니까?'))) return
    try {
      await apiClient.meCredentials.delete(credId)
      toast.success('삭제 완료')
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(msg)
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
        MCP 서버 (인증 필요한 외부 MCP)
      </h2>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--client-muted)' }} />
        </div>
      ) : servers.length === 0 ? (
        <div className="client-panel px-6 py-12 text-center">
          <KeyRound className="mx-auto mb-3 h-10 w-10" style={{ color: 'var(--client-muted-2)' }} />
          <p className="text-sm" style={{ color: 'var(--client-muted)' }}>
            현재 등록된 MCP 서버가 없습니다.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((s) => {
            const isOpen = openId === s.targetId
            const isFocused = focusTarget === s.targetId
            return (
              <div
                key={s.targetId}
                className={cn(
                  'client-panel p-4 transition-colors',
                  isFocused && 'ring-1 ring-blue-400/60',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ background: 'var(--client-panel-2)', color: 'var(--client-text)' }}
                    >
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
                          {s.label}
                        </h3>
                        {s.owned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            연결됨
                          </span>
                        )}
                      </div>
                      {s.description && (
                        <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                          {s.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                        {s.envKeys.length > 0
                          ? `주입 env: ${s.envKeys.join(', ')}`
                          : 'env 키 미지정 (API_KEY 로 주입)'} · {s.transport}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setOpenId(isOpen ? null : s.targetId)
                      setDraftLabel('')
                      setDraftValue('')
                    }}
                    className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:border-blue-400/50"
                    style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                  >
                    <Plus className="h-3 w-3" />
                    자격증명 추가
                  </button>
                </div>

                {isOpen && (
                  <div
                    className="mt-3 rounded-lg border p-3"
                    style={{ borderColor: 'var(--client-border-2)', background: 'var(--client-panel-2)' }}
                  >
                    <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={draftLabel}
                        onChange={(e) => setDraftLabel(e.target.value)}
                        placeholder="라벨 (선택)"
                        className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                      />
                      <input
                        type="password"
                        value={draftValue}
                        onChange={(e) => setDraftValue(e.target.value)}
                        placeholder="API 키 평문 (저장 후 다시 조회 불가)"
                        className="rounded-md border bg-transparent px-2 py-1.5 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOpenId(null)}
                        className="rounded-md px-3 py-1.5 text-xs"
                        style={{ color: 'var(--client-muted)' }}
                      >
                        취소
                      </button>
                      <button
                        onClick={() => handleSubmit(s)}
                        disabled={submitting || !draftValue.trim()}
                        className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                        저장
                      </button>
                    </div>
                  </div>
                )}

                {s.userCredentials.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {s.userCredentials.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
                        style={{ borderColor: 'var(--client-border-2)', background: 'var(--client-bg-2)' }}
                      >
                        <div className="flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          <span style={{ color: 'var(--client-text)' }}>{c.label || '(라벨 없음)'}</span>
                          {c.lastVerifiedAt && (
                            <span className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
                              최근 검증 {new Date(c.lastVerifiedAt).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleTest(c.id)}
                            className="rounded-md border px-2 py-1 text-xs hover:border-blue-400/50"
                            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
                          >
                            테스트
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:border-red-400/50 hover:text-red-300"
                            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
                          >
                            <Trash2 className="h-3 w-3" />
                            삭제
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function StatusBadge({ status }: { status: 'active' | 'invalid' | 'expired' }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 font-medium text-red-600">
      <XCircle className="h-3 w-3" />
      {status}
    </span>
  )
}

interface GmailAppState {
  configured: boolean
  connected: boolean
  clientId: string
  redirectUri: string
  scopes: string[]
  hasClientSecret: boolean
  connectedAt: string | null
  connectedEmail: string | null
}

function GmailOAuthCard({
  tool,
  isFocused,
  onChange,
}: {
  tool: ToolCatalogRow
  isFocused: boolean
  onChange: () => void
}) {
  const defaultRedirectUri =
    typeof window !== 'undefined'
      ? `${window.location.origin}/client/oauth/google/callback`
      : 'http://localhost:3001/client/oauth/google/callback'
  const defaultScopes = 'https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.send'

  const [app, setApp] = useState<GmailAppState | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [redirectUri, setRedirectUri] = useState(defaultRedirectUri)
  const [scopes, setScopes] = useState(defaultScopes)
  const [saving, setSaving] = useState(false)
  const confirm = useConfirm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiClient.meCredentials.gmail.getOAuthApp()
      setApp(data)
      if (data.clientId) setClientId(data.clientId)
      if (data.redirectUri) setRedirectUri(data.redirectUri)
      if (data.scopes && data.scopes.length > 0) setScopes(data.scopes.join(', '))
      if (data.hasClientSecret) setClientSecret('********')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gmail OAuth 설정 로드 실패'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (isFocused) setOpen(true)
  }, [isFocused])

  const handleSave = async () => {
    if (!clientId.trim()) {
      toast.error('Client ID 를 입력해주세요')
      return
    }
    if (!redirectUri.trim()) {
      toast.error('Redirect URI 를 입력해주세요')
      return
    }
    if (!app?.hasClientSecret && !clientSecret.trim()) {
      toast.error('Client Secret 을 입력해주세요')
      return
    }
    setSaving(true)
    try {
      const trimmedSecret = clientSecret.trim()
      await apiClient.meCredentials.gmail.saveOAuthApp({
        clientId: clientId.trim(),
        ...(trimmedSecret && trimmedSecret !== '********' ? { clientSecret: trimmedSecret } : {}),
        redirectUri: redirectUri.trim(),
        scopes: scopes.split(',').map((s) => s.trim()).filter(Boolean),
      })
      toast.success('OAuth 앱 설정 저장됨')
      await load()
      onChange()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '저장 실패'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    const ok = await confirm({
      title: 'OAuth 앱 삭제',
      message: 'OAuth 앱 설정과 연동된 토큰을 모두 삭제합니다. 계속하시겠습니까?',
      variant: 'danger',
      confirmText: '삭제',
    })
    if (!ok) return
    setSaving(true)
    try {
      await apiClient.meCredentials.gmail.clearOAuthApp()
      setApp(null)
      setClientId('')
      setClientSecret('')
      setRedirectUri(defaultRedirectUri)
      setScopes(defaultScopes)
      setOpen(false)
      toast.success('삭제됨')
      onChange()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleConnect = async () => {
    const ok = await confirm({
      title: 'Gmail 계정 선택 안내',
      message:
        '연결할 Google 계정은 다음 화면에서 직접 선택합니다.\n\n' +
        '브라우저에 여러 Google 계정이 로그인되어 있다면, 동의 화면에서 ' +
        '의도한 계정을 정확히 선택해 주세요. 다른 계정을 선택하면 그 계정의 ' +
        '메일이 조회됩니다.\n\n' +
        '연결할 계정으로 미리 Google 로그인을 해두면 가장 안전합니다.',
      confirmText: '계속',
    })
    if (!ok) return
    try {
      const { url } = await apiClient.meCredentials.gmail.getAuthUrl()
      window.location.href = url
    } catch (err) {
      const msg = err instanceof Error ? err.message : '연동 시작 실패'
      toast.error(msg)
    }
  }

  const handleDisconnect = async () => {
    const ok = await confirm({
      title: 'Gmail 연동 해제',
      message: 'Gmail 연동을 해제합니다. (OAuth 앱 설정은 유지) 계속하시겠습니까?',
      variant: 'danger',
      confirmText: '연동 해제',
    })
    if (!ok) return
    try {
      await apiClient.meCredentials.gmail.disconnect()
      toast.success('연동 해제됨')
      await load()
      onChange()
    } catch (err) {
      const msg = err instanceof Error ? err.message : '해제 실패'
      toast.error(msg)
    }
  }

  const connected = !!app?.connected
  const configured = !!app?.configured

  return (
    <div
      className={cn(
        'client-panel p-4 transition-colors',
        isFocused && 'ring-1 ring-blue-400/60',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ background: 'var(--client-panel-2)', color: 'var(--client-text)' }}
          >
            <KeyRound className="h-4 w-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
                {tool.label}
              </h3>
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  연동됨
                </span>
              )}
              {!connected && configured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  OAuth 동의 필요
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
              targetId: {tool.targetId} · {tool.description}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
              사용 도구: {tool.triggers.join(', ')}
            </p>
            {app?.connectedEmail && (
              <p
                className="mt-0.5 text-xs font-medium"
                style={{ color: 'var(--client-text)' }}
              >
                연결된 계정: <span className="font-mono">{app.connectedEmail}</span>
              </p>
            )}
            {app?.connectedAt && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted-2)' }}>
                연동 시각: {new Date(app.connectedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:border-blue-400/50"
            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
          >
            OAuth 설정
          </button>
          {!connected && configured && (
            <button
              onClick={handleConnect}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <KeyRound className="h-3 w-3" />
              연동
            </button>
          )}
          {connected && (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:border-red-400/50 hover:text-red-300"
              style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
            >
              연동 해제
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          className="mt-3 rounded-lg border p-3 space-y-2"
          style={{ borderColor: 'var(--client-border-2)', background: 'var(--client-panel-2)' }}
        >
          <p className="text-xs text-blue-300 font-medium">Gmail OAuth 앱 설정</p>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--client-muted)' }} />
          ) : (
            <>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Client ID (Google Cloud Console OAuth 2.0 Client ID)"
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
              />
              <input
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                type="password"
                placeholder={app?.hasClientSecret ? '저장된 Secret (변경 시 새로 입력)' : 'Client Secret'}
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
              />
              <input
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="Redirect URI"
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
              />
              <input
                value={scopes}
                onChange={(e) => setScopes(e.target.value)}
                placeholder="Scopes (쉼표 구분)"
                className="w-full rounded-md border bg-transparent px-2 py-1.5 text-xs"
                style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
              />
              <p className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
                Google Cloud Console 의 OAuth 2.0 Client 의 &quot;승인된 리디렉션 URI&quot; 에 위
                Redirect URI 를 등록해 두어야 합니다.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-1.5 text-xs"
                  style={{ color: 'var(--client-muted)' }}
                >
                  닫기
                </button>
                {(configured || connected) && (
                  <button
                    onClick={handleClear}
                    disabled={saving}
                    className="rounded-md border px-3 py-1.5 text-xs hover:border-red-400/50 hover:text-red-300 disabled:opacity-50"
                    style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-muted)' }}
                  >
                    설정 삭제
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
                  저장
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

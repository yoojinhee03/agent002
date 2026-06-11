'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bot, CheckCircle2, ChevronRight, KeyRound, Loader2, MessageSquare, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientAgentDetail, RequiredCredential } from '@agent-studio/shared'
import { apiClient } from '@/lib/api-client'
import { ClientHeader } from '../../../_components/header'
import { AgentCompositionPanel } from '@/components/client/AgentCompositionPanel'
import { cn } from '@/lib/utils'

export default function ClientAgentDetailPage() {
  const router = useRouter()
  const { slug } = useParams<{ slug: string }>()
  const [detail, setDetail] = useState<ClientAgentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    apiClient.clientAgents
      .getBySlug(slug)
      .then(setDetail)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '에이전트 상세 로드 실패'
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <>
      <ClientHeader
        title={detail?.name ?? '에이전트'}
        subtitle={
          detail
            ? `v${detail.version} · ${detail.env.name} · ${detail.publicPath}`
            : '로드 중…'
        }
      />

      <div className="mx-auto max-w-5xl p-6">
        <button
          onClick={() => router.push('/client/agents')}
          className="mb-4 inline-flex items-center gap-1 text-xs"
          style={{ color: 'var(--client-muted)' }}
        >
          <ArrowLeft className="h-3 w-3" />
          에이전트 목록
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--client-muted)' }} />
          </div>
        ) : !detail ? null : (
          <div className="space-y-4">
            <section className="client-panel p-5">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{
                    background: `${detail.env.color || '#3b82f6'}22`,
                    color: detail.env.color || '#3b82f6',
                  }}
                >
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold" style={{ color: 'var(--client-text)' }}>
                    {detail.name}
                  </h2>
                  {detail.description && (
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--client-muted)' }}>
                      {detail.description}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {detail.missingCredentials.length > 0 ? (
              <MissingCredentialsCard missing={detail.missingCredentials} />
            ) : (
              <ReadyCard slug={detail.slug} />
            )}

            <AgentCompositionPanel
              composition={detail.composition}
              requiredCredentials={detail.requiredCredentials}
              missingCredentials={detail.missingCredentials}
            />

            <CredentialsCard detail={detail} />

          </div>
        )}
      </div>
    </>
  )
}

function MissingCredentialsCard({ missing }: { missing: RequiredCredential[] }) {
  const focusQuery = missing.length === 1 ? `?focus=${missing[0].targetId}` : ''
  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: 'rgba(251,146,60,0.4)', background: 'rgba(251,146,60,0.05)' }}
    >
      <div className="mb-2 flex items-center gap-2 text-amber-700">
        <ShieldAlert className="h-4 w-4" />
        <span className="text-sm font-semibold">자격증명이 더 필요합니다</span>
      </div>
      <p className="mb-3 text-xs" style={{ color: 'var(--client-muted)' }}>
        이 에이전트를 사용하려면 다음 자격증명을 도구 관리에서 등록해 주세요:{' '}
        {missing.map((m) => m.label).join(', ')}
      </p>
      <Link
        href={`/client/tools${focusQuery}`}
        className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
      >
        <KeyRound className="h-3 w-3" />
        도구 관리로 이동
      </Link>
    </section>
  )
}

function CredentialsCard({ detail }: { detail: ClientAgentDetail }) {
  const total = detail.requiredCredentials.length
  const missing = detail.missingCredentials.length
  const ready = total - missing
  const allReady = total > 0 && missing === 0

  return (
    <section className="client-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" style={{ color: 'var(--client-muted)' }} />
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
            필요한 자격증명
          </h3>
          {total > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
            >
              {ready} / {total}
            </span>
          )}
        </div>
        {total > 0 && (
          <span className="text-[11.5px]" style={{ color: 'var(--client-muted-2)' }}>
            {allReady ? '모두 검증됨' : `${missing}개 누락`}
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-xs" style={{ color: 'var(--client-muted)' }}>
          추가 자격증명 없이 사용할 수 있습니다.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--client-border)' }}>
          {detail.requiredCredentials.map((r) => {
            const isMissing = detail.missingCredentials.some(
              (m) => m.kind === r.kind && m.targetId === r.targetId,
            )
            return (
              <li
                key={`${r.kind}:${r.targetId}`}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                  style={{ borderColor: 'var(--client-border)', background: 'var(--client-bg)' }}
                >
                  <KeyRound className="h-4 w-4" style={{ color: 'var(--client-muted)' }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--client-text)' }}
                    >
                      {r.label}
                    </span>
                    <span
                      className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px]"
                      style={{
                        background: 'var(--client-bg-2)',
                        color: 'var(--client-muted)',
                      }}
                    >
                      {r.kind}:{r.targetId}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 truncate text-[11.5px]"
                    style={{ color: 'var(--client-muted-2)' }}
                  >
                    {r.reason}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                      isMissing ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        isMissing ? 'bg-amber-500' : 'bg-emerald-500',
                      )}
                    />
                    {isMissing ? '누락' : '준비됨'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {total > 0 && (
        <div
          className="mt-4 flex items-center justify-between border-t pt-3 text-[11.5px]"
          style={{ borderColor: 'var(--client-border)' }}
        >
          <span style={{ color: 'var(--client-muted-2)' }}>
            자격증명은 Vault에 암호화 저장됩니다
          </span>
          <Link
            href="/client/tools"
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: 'var(--client-primary)' }}
          >
            자격증명 관리
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </section>
  )
}

function ReadyCard({ slug }: { slug: string }) {
  return (
    <section
      className="flex items-center gap-4 rounded-2xl border p-5"
      style={{ borderColor: 'rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.06)' }}
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border"
        style={{ background: '#ffffff', borderColor: 'rgba(34,197,94,0.25)' }}
      >
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
          사용 준비 완료
        </p>
        <p className="mt-0.5 text-[12.5px]" style={{ color: 'var(--client-muted)' }}>
          필요한 자격증명이 모두 등록되어 있어요. 바로 새 대화를 시작할 수 있습니다.
        </p>
      </div>
      <Link
        href={`/client/agents/${slug}/chat`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        새 대화 시작
      </Link>
    </section>
  )
}

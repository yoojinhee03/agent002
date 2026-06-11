'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bot, GitBranch, GraduationCap, Loader2, Sparkles, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientAgentCard } from '@agent-studio/shared'
import { apiClient } from '@/lib/api-client'
import { ClientHeader } from '../../_components/header'

export default function ClientAgentsPage() {
  const [agents, setAgents] = useState<ClientAgentCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.clientAgents
      .list()
      .then(setAgents)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '에이전트 목록 로드 실패'
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <ClientHeader title="에이전트" subtitle="배포된 활성 에이전트만 표시됩니다." />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--client-muted)' }} />
          </div>
        ) : agents.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <Link
                key={agent.deploymentId}
                href={`/client/agents/${agent.slug}`}
                className="client-panel block p-5 transition-colors hover:border-[var(--client-border-2)]"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{
                      background: `${agent.env.color || '#3b82f6'}22`,
                      color: agent.env.color || '#3b82f6',
                    }}
                  >
                    <Bot className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold leading-tight" style={{ color: 'var(--client-text)' }}>
                      {agent.name}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
                      v{agent.version} · {agent.env.name}
                    </p>
                  </div>
                </div>
                {agent.description && (
                  <p
                    className="mb-3 line-clamp-2 text-xs leading-relaxed"
                    style={{ color: 'var(--client-muted)' }}
                  >
                    {agent.description}
                  </p>
                )}
                {agent.starters.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {agent.starters.slice(0, 2).map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                        style={{
                          borderColor: 'var(--client-border-2)',
                          color: 'var(--client-muted)',
                        }}
                      >
                        <Sparkles className="h-3 w-3" />
                        {s.length > 24 ? s.slice(0, 24) + '…' : s}
                      </span>
                    ))}
                  </div>
                )}
                <CompositionChips agent={agent} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function CompositionChips({ agent }: { agent: ClientAgentCard }) {
  const { main, subAgents } = agent.composition
  const subSkillTotal = subAgents.reduce((sum, s) => sum + s.skills.length, 0)
  const subToolTotal = subAgents.reduce((sum, s) => sum + s.tools.length, 0)
  const skillTotal = main.skills.length + subSkillTotal
  const toolTotal = main.tools.length + subToolTotal

  if (subAgents.length === 0 && skillTotal === 0 && toolTotal === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {subAgents.length > 0 && (
        <Chip icon={<GitBranch className="h-3 w-3" />} label={`sub ${subAgents.length}`} />
      )}
      <Chip
        icon={<GraduationCap className="h-3 w-3" />}
        label={`skill ${skillTotal}`}
        title={`메인 ${main.skills.length}${subSkillTotal > 0 ? ` · 서브 ${subSkillTotal}` : ''}`}
      />
      <Chip
        icon={<Wrench className="h-3 w-3" />}
        label={`tool ${toolTotal}`}
        title={`메인 ${main.tools.length}${subToolTotal > 0 ? ` · 서브 ${subToolTotal}` : ''}`}
      />
    </div>
  )
}

function Chip({
  icon,
  label,
  title,
}: {
  icon: React.ReactNode
  label: string
  title?: string
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{ background: 'var(--client-bg-2)', color: 'var(--client-muted)' }}
    >
      {icon}
      {label}
    </span>
  )
}

function EmptyState() {
  return (
    <div
      className="client-panel flex flex-col items-center justify-center px-6 py-20 text-center"
    >
      <Bot className="mb-3 h-10 w-10" style={{ color: 'var(--client-muted-2)' }} />
      <p className="mb-1 text-[14px] font-semibold" style={{ color: 'var(--client-text)' }}>
        사용 가능한 에이전트가 없습니다
      </p>
      <p className="text-xs" style={{ color: 'var(--client-muted)' }}>
        관리자가 에이전트를 배포하면 여기에 표시됩니다.
      </p>
    </div>
  )
}

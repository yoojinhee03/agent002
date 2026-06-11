'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MessageSquare } from 'lucide-react'
import { useUserStore } from '@/stores/use-user-store'
import { apiClient } from '@/lib/api-client'
import type { Agent } from '@agent-studio/shared'
import { NaverWorksInstallationList } from '@/components/naver-works/NaverWorksInstallationList'

export default function NaverWorksIntegrationPage() {
  const router = useRouter()
  const { currentUser, activeProjectId } = useUserStore()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [currentUser, isAdmin, router])

  const loadAgents = useCallback(async () => {
    if (!activeProjectId) return
    setLoading(true)
    try {
      const rows = await apiClient.agents.list(activeProjectId)
      setAgents(rows ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : '에이전트 목록 로드 실패'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [activeProjectId])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  if (!isAdmin) return null

  const callbackBase =
    process.env.NEXT_PUBLIC_NAVER_WORKS_CALLBACK_BASE ||
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== 'undefined' ? window.location.origin.replace(':28002', ':28001') : '')

  return (
    <div className="p-8 space-y-6 bg-[var(--color-bg)] min-h-full">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#00c473]/15">
          <MessageSquare className="h-5 w-5 text-[#00c473]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">NAVER WORKS 연동</h1>
          <p className="mt-0.5 text-sm text-[var(--color-fg-subtle)]">
            NAVER WORKS Bot 을 등록하고 1:1 대화로 에이전트와 연결합니다
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-4 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
        <p className="font-semibold text-[var(--color-fg-muted)] mb-1">동작 방식</p>
        <p>
          1:1 대화(채널 아님)로 봇에게 메시지를 보내면 매핑된 에이전트가 응답합니다.
          사용자 정보(NAVER WORKS userId)는 자동으로 에이전트 system prompt 에 주입되어,
          &quot;회의실 예약해줘&quot; 처럼 요청자 컨텍스트가 필요한 작업이 정확히 동작합니다.
        </p>
        <p className="mt-1 text-[var(--color-fg-subtle)]">
          * 채널(여러 명) 메시지는 무시됩니다. * 시크릿(Client Secret/Private Key/Bot Secret)은 AES-256-GCM 으로 암호화 저장됩니다.
        </p>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
        </div>
      ) : activeProjectId ? (
        <NaverWorksInstallationList
          projectId={activeProjectId}
          agents={agents}
          callbackBaseUrl={callbackBase}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center text-sm text-[var(--color-fg-subtle)]">
          프로젝트를 선택해주세요
        </div>
      )}
    </div>
  )
}

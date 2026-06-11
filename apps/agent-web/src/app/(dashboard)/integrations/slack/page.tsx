'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Slack } from 'lucide-react'
import { useUserStore } from '@/stores/use-user-store'
import { apiClient } from '@/lib/api-client'
import type { SlackInstallationView } from '@/lib/api-client'
import { SlackInstallationCard } from '@/components/slack/SlackInstallationCard'
import { SlackChannelAgentList } from '@/components/slack/SlackChannelAgentList'

export default function SlackIntegrationPage() {
  const router = useRouter()
  const { currentUser, activeProjectId } = useUserStore()
  const [installation, setInstallation] = useState<SlackInstallationView | null>(null)
  const [loadingInstallation, setLoadingInstallation] = useState(true)

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (currentUser && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [currentUser, isAdmin, router])

  const loadInstallation = useCallback(async () => {
    if (!activeProjectId) return
    setLoadingInstallation(true)
    try {
      const data = await apiClient.slack.installations.get(activeProjectId)
      // backend 는 row 자체 또는 null 반환 — id 존재 여부로 installed 판정
      setInstallation(data && data.id ? { ...data, installed: true } : { installed: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Slack 설정 로드에 실패했습니다'
      toast.error(message)
      setInstallation({ installed: false })
    } finally {
      setLoadingInstallation(false)
    }
  }, [activeProjectId])

  useEffect(() => {
    loadInstallation()
  }, [loadInstallation])

  if (!isAdmin) return null

  return (
    <div className="p-8 space-y-6 bg-[var(--color-bg)] min-h-full">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4a154b]/20">
          <Slack className="h-5 w-5 text-[#e01e5a]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Slack 연동</h1>
          <p className="mt-0.5 text-sm text-[var(--color-fg-subtle)]">
            Slack 워크스페이스를 연결하고 채널-에이전트 매핑을 관리합니다
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-4 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
        <p className="font-semibold text-[var(--color-fg-muted)] mb-1">동작 방식</p>
        <p>
          Socket Mode 를 사용해 공개 URL 없이 Slack 이벤트를 수신합니다.
          채널 멘션 또는 DM 수신 시 매핑된 에이전트가 즉시 응답하고,
          결과를 같은 Slack 스레드에 게시합니다.
        </p>
        <p className="mt-1 text-[var(--color-fg-subtle)]">
          * 이 설정은 Admin 전용입니다. MCP 서버(Tools 탭)와는 별개의 독립적인 채널입니다.
        </p>
      </div>

      {loadingInstallation ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#3b82f6] border-t-transparent" />
        </div>
      ) : (
        <>
          {activeProjectId && (
            <SlackInstallationCard
              installation={installation}
              projectId={activeProjectId}
              onRefresh={loadInstallation}
            />
          )}

          {activeProjectId && (
            <SlackChannelAgentList
              installation={installation}
              projectId={activeProjectId}
            />
          )}
        </>
      )}
    </div>
  )
}

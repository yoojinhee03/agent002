'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import type { Thread } from '@agent-studio/shared'
import { apiClient } from '@/lib/api-client'
import { ClientChatView } from '@/components/client/ClientChatView'

interface ThreadRow extends Thread {
  agent?: { id: string; name: string; slug: string } | null
}

export default function ClientHistoryPage() {
  const search = useSearchParams()
  const selectedThreadId = search?.get('threadId') ?? null

  // history main 은 사이드바의 thread list 와 무관하게, URL 의 threadId 로 단독 fetch.
  // (이전엔 list.find() 매칭이 사이드바/메인 별도 fetch 의 staleness 로 실패하던 회귀)
  const [selectedThread, setSelectedThread] = useState<ThreadRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedThreadId) {
      setSelectedThread(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    apiClient.threads
      .get(selectedThreadId)
      .then((t) => {
        if (cancelled) return
        if (!t) {
          setSelectedThread(null)
          return
        }
        // admin-debug 스레드는 client UI 에서 노출하지 않음.
        if ((t.metadata as { source?: string } | null)?.source === 'admin-debug') {
          setSelectedThread(null)
          return
        }
        setSelectedThread(t as ThreadRow)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : '대화 로드 실패'
        toast.error(msg)
        setSelectedThread(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedThreadId])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--client-muted)' }} />
      </div>
    )
  }

  if (selectedThread && selectedThread.agent?.slug) {
    return (
      <div className="h-screen">
        <ClientChatView
          key={selectedThread.id}
          slug={selectedThread.agent.slug}
          threadId={selectedThread.id}
          showHeader
        />
      </div>
    )
  }

  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-2"
      style={{ background: 'var(--client-bg)' }}
    >
      <MessageSquare className="h-10 w-10" style={{ color: 'var(--client-muted-2)' }} />
      <p className="text-sm" style={{ color: 'var(--client-muted)' }}>
        좌측에서 대화를 선택하세요.
      </p>
    </div>
  )
}

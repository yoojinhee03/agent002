'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { AgentFlowDebugPanel } from '@/components/agents/flow/AgentFlowDebugPanel'
import type { Agent } from '@agent-studio/shared'

export default function AgentChatPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const router = useRouter()
  const { activeProjectId: projectId } = useUserStore()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    apiClient.agents
      .get(agentId)
      .then((a) => {
        if (!cancelled) setAgent(a)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, agentId])

  if (!projectId && !loading) return <Center>Initializing project...</Center>
  if (loading) return <Center>Loading chat...</Center>
  if (error) return <Center className="text-red-500">Error: {error}</Center>
  if (!agent) return <Center className="text-red-500">Agent not found</Center>

  return (
    <div className="flex h-full w-full bg-[var(--color-bg)]">
      <AgentFlowDebugPanel
        agent={agent}
        projectId={projectId!}
        isRunning={false}
        sessionToken={1}
        onClose={() => router.push('/agents')}
        fullWidth
      />
    </div>
  )
}

function Center({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full items-center justify-center text-sm text-muted-foreground ${className}`}>
      {children}
    </div>
  )
}

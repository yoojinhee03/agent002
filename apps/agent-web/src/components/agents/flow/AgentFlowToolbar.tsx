'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Settings2, Play, Save, Loader2, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentFlowToolbarProps {
  agentName: string
  agentId: string
  dirty: boolean
  saving: boolean
  onSave: () => void
  onOpenMainModal: () => void
  onRun: () => void
}

export function AgentFlowToolbar({
  agentName,
  agentId,
  dirty,
  saving,
  onSave,
  onOpenMainModal,
  onRun,
}: AgentFlowToolbarProps) {
  const router = useRouter()

  return (
    <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2.5">
      {/* 좌측: 뒤로가기 + 에이전트명 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-xs font-medium">Agents</span>
        </button>

        <div className="h-4 w-px bg-[var(--color-surface-2)]" />

        <span className="text-sm font-semibold text-fg">{agentName}</span>

        {dirty && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
            미저장
          </span>
        )}
      </div>

      {/* 우측: Main Agent 설정, 실행/중지, 저장 */}
      <div className="flex items-center gap-2">
        <Link
          href={`/agents/${agentId}/deployments`}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <Rocket className="h-3.5 w-3.5 text-fg-subtle" />
          배포
        </Link>

        <button
          onClick={onOpenMainModal}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-fg transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <Settings2 className="h-3.5 w-3.5 text-fg-subtle" />
          Main Agent
        </button>

        <button
          onClick={onRun}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-[#3B82F6] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5 fill-white" />
          실행
        </button>

        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-40',
            dirty && !saving
              ? 'bg-[#3B82F6] shadow-[0_0_12px_rgba(59,130,246,0.4)] hover:bg-blue-500'
              : 'bg-[var(--color-surface-2)]',
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          저장
        </button>
      </div>
    </div>
  )
}

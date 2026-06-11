'use client'

import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { AgentTeam } from '@agent-studio/shared'
import { TeamFlowVisualizer } from './TeamFlowVisualizer'
import { cn } from '@/lib/utils'

interface FlowMessage {
  from: string
  to: string
  content: string
  timestamp: number
}

interface TeamPlaygroundProps {
  team: AgentTeam
  onClose?: () => void
}

export function TeamPlayground({ team, onClose }: TeamPlaygroundProps) {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Array<{ role: string; content: string }> | null>(null)
  const [flowMessages, setFlowMessages] = useState<FlowMessage[]>([])
  const [error, setError] = useState<string | null>(null)

  const members = (team.teamAgents ?? []).map((ta) => ({
    id: ta.subTeamId ?? ta.agentId ?? ta.id,
    name: ta.subTeam?.name ?? ta.agent?.name ?? `Member ${ta.order + 1}`,
    type: (ta.subTeamId ? 'team' : 'agent') as 'agent' | 'team',
  }))

  const handleRun = useCallback(async () => {
    if (!input.trim()) return
    setRunning(true)
    setResult(null)
    setFlowMessages([])
    setError(null)

    try {
      const data = await apiClient.teams.invoke(team.id, input)
      setResult(data.messages)

      // 메시지 흐름 시각화용 변환
      const msgs = data.messages as Array<{ role: string; content: string }>
      const flows: FlowMessage[] = []
      const memberIds = members.map((m) => m.id)

      msgs.forEach((msg, i) => {
        const from = i === 0 ? 'user' : (memberIds[i - 1] ?? 'unknown')
        const to = memberIds[i] ?? memberIds[memberIds.length - 1] ?? 'result'
        flows.push({ from, to, content: msg.content, timestamp: Date.now() + i })
      })

      setFlowMessages(flows)
    } catch (err) {
      setError(err instanceof Error ? err.message : '실행 중 오류가 발생했습니다')
    } finally {
      setRunning(false)
    }
  }, [input, team.id, members])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="flex h-[80vh] w-[860px] max-w-[95vw] flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)]">{team.name} — Playground</h2>
            <p className="text-xs text-[var(--color-fg-subtle)]">{team.topology} topology · {team.teamAgents?.length ?? 0}명</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            >
              ✕
            </button>
          )}
        </div>

        {/* 바디 */}
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
          {/* 입력 */}
          <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <textarea
              className="flex-1 resize-none bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
              rows={3}
              placeholder="팀에 전달할 메시지를 입력하세요"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
              }}
            />
            <button
              onClick={handleRun}
              disabled={running || !input.trim()}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
                running || !input.trim()
                  ? 'cursor-not-allowed bg-blue-600/40'
                  : 'bg-blue-600 hover:bg-blue-500',
              )}
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                  실행 중
                </span>
              ) : (
                'Run ▶'
              )}
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-red-900/40 bg-red-950/30 px-4 py-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* 흐름 시각화 */}
          {members.length > 0 && flowMessages.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-[var(--color-fg-subtle)]">실행 흐름</p>
              <TeamFlowVisualizer messages={flowMessages} members={members} />
            </div>
          )}

          {/* 결과 */}
          {result && (
            <div className="flex-1 overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="mb-3 text-xs font-medium text-[var(--color-fg-subtle)]">실행 결과</p>
              <div className="flex flex-col gap-3">
                {result.map((msg, i) => (
                  <div key={i} className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-3">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-fg-subtle)]">
                      {msg.role}
                    </span>
                    <p className="whitespace-pre-wrap text-sm text-[var(--color-fg)]">{msg.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!result && !running && !error && (
            <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-fg-subtle)]">
              메시지를 입력하고 실행하세요 (⌘ + Enter)
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

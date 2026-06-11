'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Agent } from '@agent-studio/shared'
import { cn } from '@/lib/utils'

interface CompareResult {
  output: string
  latency: number
  tokens: number
}

interface AgentComparePanelProps {
  projectId: string
}

export function AgentComparePanel({ projectId }: AgentComparePanelProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentAId, setAgentAId] = useState<string>('')
  const [agentBId, setAgentBId] = useState<string>('')
  const [input, setInput] = useState<string>('')
  const [running, setRunning] = useState<boolean>(false)
  const [resultA, setResultA] = useState<CompareResult | null>(null)
  const [resultB, setResultB] = useState<CompareResult | null>(null)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)

  useEffect(() => {
    apiClient.agents.list(projectId).then(setAgents)
  }, [projectId])

  const handleRun = useCallback(async () => {
    setRunning(true)
    setResultA(null)
    setResultB(null)
    setErrorA(null)
    setErrorB(null)

    try {
      const data = await apiClient.agents.compare(agentAId, agentBId, input)
      setResultA(data.a)
      setResultB(data.b)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorA(msg)
      setErrorB(msg)
    } finally {
      setRunning(false)
    }
  }, [agentAId, agentBId, input])

  const canRun = !running && !!agentAId && !!agentBId && !!input.trim()

  return (
    <div className="flex h-full flex-col gap-4 bg-[var(--color-bg)] p-6">
      {/* 공통 입력 영역 */}
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <textarea
          className="flex-1 resize-none bg-transparent text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none"
          rows={3}
          placeholder="비교할 메시지를 입력하세요"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button
          onClick={handleRun}
          disabled={!canRun}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors',
            canRun ? 'bg-blue-600 hover:bg-blue-500' : 'cursor-not-allowed bg-blue-600/40'
          )}
        >
          {running ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
              실행 중
            </span>
          ) : (
            'Run ▶'
          )}
        </button>
      </div>

      {/* 두 컬럼 */}
      <div className="grid grid-cols-2 gap-4 flex-1">
        {/* Agent A */}
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <select
            value={agentAId}
            onChange={e => setAgentAId(e.target.value)}
            className="rounded-md border border-[var(--color-border-strong)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] focus:outline-none"
          >
            <option value="">Agent A 선택</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="flex-1 min-h-[120px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            {running ? (
              <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                응답 대기 중...
              </div>
            ) : errorA ? (
              <p className="text-xs text-red-400">{errorA}</p>
            ) : resultA ? (
              <p className="whitespace-pre-wrap text-sm text-[var(--color-fg)]">{resultA.output}</p>
            ) : (
              <p className="text-xs text-[var(--color-fg-subtle)]">에이전트를 선택하고 실행하세요</p>
            )}
          </div>

          {resultA && (
            <div className="flex items-center gap-4 text-xs text-[var(--color-fg-subtle)]">
              <span>latency: {(resultA.latency / 1000).toFixed(2)}s</span>
              <span>tokens: {resultA.tokens}</span>
            </div>
          )}
        </div>

        {/* Agent B */}
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <select
            value={agentBId}
            onChange={e => setAgentBId(e.target.value)}
            className="rounded-md border border-[var(--color-border-strong)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] focus:outline-none"
          >
            <option value="">Agent B 선택</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="flex-1 min-h-[120px] rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            {running ? (
              <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                응답 대기 중...
              </div>
            ) : errorB ? (
              <p className="text-xs text-red-400">{errorB}</p>
            ) : resultB ? (
              <p className="whitespace-pre-wrap text-sm text-[var(--color-fg)]">{resultB.output}</p>
            ) : (
              <p className="text-xs text-[var(--color-fg-subtle)]">에이전트를 선택하고 실행하세요</p>
            )}
          </div>

          {resultB && (
            <div className="flex items-center gap-4 text-xs text-[var(--color-fg-subtle)]">
              <span>latency: {(resultB.latency / 1000).toFixed(2)}s</span>
              <span>tokens: {resultB.tokens}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

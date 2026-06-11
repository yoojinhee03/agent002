'use client'

import { useState, useRef, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import type { Agent } from '@agent-studio/shared'
import { Play, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn, safeJsonStringify } from '@/lib/utils'

interface StepItem {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'response' | 'error'
  content: string
  metadata?: Record<string, unknown>
}

interface Props {
  agent: Agent
  projectId: string
}

function StepCard({ step }: { step: StepItem; index: number }) {
  const [collapsed, setCollapsed] = useState(step.type === 'thinking')

  const config = {
    thinking:    { icon: '🤔', label: 'Thinking',    color: 'border-purple-500/30 bg-purple-500/5', labelColor: 'text-purple-400' },
    tool_call:   { icon: '🔧', label: 'Tool Call',   color: 'border-amber-500/30 bg-amber-500/5',   labelColor: 'text-amber-400' },
    tool_result: { icon: '📊', label: 'Tool Result', color: 'border-blue-500/30 bg-blue-500/5',     labelColor: 'text-blue-400' },
    response:    { icon: '💬', label: 'Response',    color: 'border-green-500/30 bg-green-500/5',   labelColor: 'text-green-400' },
    error:       { icon: '❌', label: 'Error',       color: 'border-red-500/30 bg-red-500/5',       labelColor: 'text-red-400' },
  }[step.type]

  return (
    <div className={cn('rounded-lg border p-3 space-y-2', config.color)}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2"
      >
        <span className="text-sm">{config.icon}</span>
        <span className={cn('text-xs font-semibold', config.labelColor)}>{config.label}</span>
        {step.type === 'tool_call' && step.metadata && (
          <code className="text-xs text-[var(--color-fg-subtle)]">{String(step.metadata.name ?? '')}</code>
        )}
        <div className="ml-auto text-[var(--color-fg-subtle)]">
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </div>
      </button>
      {!collapsed && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-fg leading-relaxed">
          {step.content}
        </pre>
      )}
    </div>
  )
}

export function TestTab({ agent, projectId }: Props) {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [steps, setSteps] = useState<StepItem[]>([])
  const [metrics, setMetrics] = useState<{ latencyMs?: number; inputTokens?: number; outputTokens?: number } | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stepsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  const handleRun = async () => {
    if (!input.trim() || running) return
    setRunning(true)
    setSteps([])
    setMetrics(null)
    const startTime = Date.now()

    try {
      // Create a thread
      const thread = await apiClient.threads.create(projectId, { agentId: agent.id })
      setThreadId(thread.id)

      const data = await apiClient.threads.invoke(thread.id, input.trim(), undefined, 'studio')

      // Parse response into steps
      const newSteps: StepItem[] = []

      if ((data as { thinking?: unknown; thought?: unknown }).thinking || (data as { thought?: unknown }).thought) {
        const thinking = (data as { thinking?: string; thought?: string }).thinking ?? (data as { thought?: string }).thought
        if (thinking) newSteps.push({ type: 'thinking', content: thinking })
      }

      const toolCalls = (data as { toolCalls?: unknown }).toolCalls
      if (toolCalls && Array.isArray(toolCalls)) {
        for (const tc of toolCalls as Array<Record<string, unknown>>) {
          newSteps.push({ type: 'tool_call', content: String(tc.name ?? 'tool'), metadata: tc })
          if (tc.result !== undefined) {
            newSteps.push({ type: 'tool_result', content: safeJsonStringify(tc.result) })
          }
        }
      }

      const answer = (data as { output?: unknown; message?: unknown; content?: unknown }).output
        ?? (data as { message?: unknown }).message
        ?? (data as { content?: unknown }).content
        ?? data

      newSteps.push({
        type: 'response',
        content: typeof answer === 'string' ? answer : safeJsonStringify(answer),
      })
      setSteps(newSteps)
      setMetrics({
        latencyMs: Date.now() - startTime,
        inputTokens: (data as { inputTokens?: number }).inputTokens,
        outputTokens: (data as { outputTokens?: number }).outputTokens,
      })

    } catch (err) {
      setSteps([{ type: 'error', content: err instanceof Error ? err.message : 'Unknown error' }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Input */}
      <div className="border-b border-[var(--color-border)] p-4 space-y-2">
        <div className="text-xs font-semibold text-[var(--color-fg-muted)]">입력 메시지</div>
        <div className="flex gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500/50 focus:outline-none resize-none"
            rows={3}
            placeholder="테스트할 메시지를 입력하세요..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRun()
            }}
          />
          <button
            onClick={handleRun}
            disabled={!input.trim() || running}
            className="flex flex-col items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 text-white disabled:opacity-40 hover:bg-blue-500"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            <span className="text-xs">{running ? '실행 중' : '⌘↵'}</span>
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {steps.length === 0 && !running && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--color-fg-subtle)]">
            <Play className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-xs">메시지를 입력하고 실행하세요</p>
          </div>
        )}

        {running && steps.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            에이전트 실행 중...
          </div>
        )}

        {steps.map((step, i) => (
          <StepCard key={i} step={step} index={i} />
        ))}
        <div ref={stepsEndRef} />
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="border-t border-[var(--color-border)] px-4 py-2 flex items-center gap-4 text-xs text-[var(--color-fg-subtle)]">
          {metrics.latencyMs && <span>⏱ {(metrics.latencyMs / 1000).toFixed(2)}s</span>}
          {metrics.inputTokens && <span>↑ {metrics.inputTokens} tokens</span>}
          {metrics.outputTokens && <span>↓ {metrics.outputTokens} tokens</span>}
          {threadId && <span className="ml-auto">Thread: {threadId.slice(0, 8)}...</span>}
        </div>
      )}
    </div>
  )
}

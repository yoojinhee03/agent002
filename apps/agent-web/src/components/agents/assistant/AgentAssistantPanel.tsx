'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Send, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/ws-client'
import { useAgentAssistantStore } from '@/stores/use-agent-assistant-store'
import { cn } from '@/lib/utils'
import { ResizeHandle } from '@/components/agents/flow/ResizeHandle'
import { ProposalApplyCard } from '@/components/agents/assistant/ProposalApplyCard'
import { EditApplyCard } from '@/components/agents/assistant/EditApplyCard'
import type { AgentEditPatch } from '@/stores/use-agent-assistant-store'
import type { EnabledModel } from '@agent-studio/shared'

const DEFAULT_MODEL = 'openai:gpt-5.4'

interface AgentAssistantPanelProps {
  agentId: string
  expanded: boolean
  onToggleExpanded: () => void
  /** 펼침 상태에서의 세로 높이 (px). 미지정 시 280. */
  height?: number
  /** 상단 핸들 드래그 콜백 (펼침 상태에서만 활성) */
  onResize?: (deltaPx: number) => void
  /** 캔버스에 제안된 노드 개수 — 채팅 inline 확인 카드를 띄울 때 사용 */
  pendingMainCount?: number
  pendingSubCount?: number
  /** inline 확인 카드 "적용" 버튼 콜백 — 제공되지 않으면 카드 비표시 */
  onApplyProposal?: (mode: 'replace' | 'merge') => Promise<void> | void
  /** inline 확인 카드 "취소" 버튼 콜백 */
  onCancelProposal?: () => void
  /** edit_agent action 으로 받은 partial 수정 적용 콜백 */
  onApplyEdit?: (edit: AgentEditPatch) => Promise<void> | void
  /** edit_agent 취소 콜백 */
  onCancelEdit?: () => void
}

/** 백엔드의 EnabledModel 실제 응답은 nested provider + modelId 형태 (예:
 *  { id: UUID, modelId: 'gpt-4o', provider: { slug: 'openai', name: 'OpenAI' } }).
 *  shared 타입은 flat(providerSlug)이라 양쪽 모두 안전하게 읽도록 fallback. */
type EnabledModelLoose = EnabledModel & {
  modelId?: string
  provider?: { slug?: string; name?: string }
}

function modelSlug(m: EnabledModelLoose): string {
  return m.providerSlug || m.provider?.slug || ''
}

function modelLlmId(m: EnabledModelLoose): string {
  return m.modelId || m.id
}

function modelProviderName(m: EnabledModelLoose): string {
  return m.providerName || m.provider?.name || ''
}

function modelKey(m: EnabledModelLoose): string {
  return `${modelSlug(m)}:${modelLlmId(m)}`
}

export function AgentAssistantPanel({
  agentId,
  expanded,
  onToggleExpanded,
  height,
  onResize,
  pendingMainCount = 0,
  pendingSubCount = 0,
  onApplyProposal,
  onCancelProposal,
  onApplyEdit,
  onCancelEdit,
}: AgentAssistantPanelProps) {
  const [draft, setDraft] = useState('')
  const [models, setModels] = useState<EnabledModel[]>([])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const messages = useAgentAssistantStore((s) => s.messages)
  const isStreaming = useAgentAssistantStore((s) => s.isStreaming)
  const stepLabel = useAgentAssistantStore((s) => s.stepLabel)
  const pendingEdit = useAgentAssistantStore((s) => s.pendingEdit)
  const setPendingEdit = useAgentAssistantStore((s) => s.setPendingEdit)
  const selectedModel = useAgentAssistantStore((s) => s.selectedModel)
  const setSelectedModel = useAgentAssistantStore((s) => s.setSelectedModel)
  const startSession = useAgentAssistantStore((s) => s.startSession)
  const sendMessage = useAgentAssistantStore((s) => s.sendMessage)
  const appendStreamingToken = useAgentAssistantStore((s) => s.appendStreamingToken)
  const closeStreamingMessage = useAgentAssistantStore((s) => s.closeStreamingMessage)
  const setStepLabel = useAgentAssistantStore((s) => s.setStepLabel)
  const addProposedNode = useAgentAssistantStore((s) => s.addProposedNode)
  const setSessionComplete = useAgentAssistantStore((s) => s.setSessionComplete)
  const reset = useAgentAssistantStore((s) => s.reset)
  const error = useAgentAssistantStore((s) => s.error)

  useEffect(() => {
    apiClient.providers
      .getEnabledModels()
      .then((list) => {
        setModels(list)
        // 초기 selectedModel 은 '' 라 startSession 이 대기 상태. 활성 모델이 있으면
        // 기본값(DEFAULT_MODEL) 우선, 없으면 첫 활성 모델로 설정 → second useEffect 가
        // 트리거되어 단일 session 이 만들어진다. 사용자가 이미 모델을 선택한 상태(=non-empty
        // 이고 활성 목록에 존재)면 그대로 둠.
        if (list.length > 0) {
          const current = useAgentAssistantStore.getState().selectedModel
          const matches = list.some((m) => modelKey(m) === current)
          if (!current || !matches) {
            const preferred = list.find((m) => modelKey(m) === DEFAULT_MODEL) ?? list[0]
            useAgentAssistantStore.getState().setSelectedModel(modelKey(preferred))
          }
        }
      })
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    // selectedModel 이 결정되기 전엔 session 을 시작하지 않는다.
    // (anthropic 기본값으로 잘못된 session 이 먼저 만들어지고, 이후 openai 로 두 번째
    //  session 이 만들어지는 race condition 방지 — 사용자가 send 한 시점에 어느 session
    //  의 threadId 가 state 에 남았는지 결정되지 않음)
    if (!selectedModel) return

    let cancelled = false
    let activeThreadId: string | null = null

    async function init() {
      wsClient.connect()
      try {
        const tid = await startSession(agentId, selectedModel)
        if (cancelled) return
        activeThreadId = tid
        await wsClient.waitForConnection(3000)
        wsClient.subscribeThread(tid)
      } catch (e) {
        console.error('[AgentAssistant] startSession failed', e)
      }
    }
    init()

    return () => {
      cancelled = true
      if (activeThreadId) wsClient.unsubscribeThread(activeThreadId)
      reset()
    }
    // agentId 또는 selectedModel 이 바뀌면 새 세션을 만든다. session metadata 의 model 이
    // 한 번 결정되면 변경 안 되기 때문에, 사용자가 선택한 모델로 세션을 재구성해야 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, selectedModel])

  // WS 구독: agent.token / assistant.* 처리
  useEffect(() => {
    const offToken = wsClient.on('agent.token', (e) => {
      if (e.type !== 'agent.token') return
      const tid = useAgentAssistantStore.getState().threadId
      if (!tid || (e as { threadId?: string }).threadId !== tid) return
      const done = (e as { done?: boolean }).done
      const content = (e as { content?: string }).content || ''
      if (done) {
        closeStreamingMessage()
      } else if (content) {
        appendStreamingToken(content)
      }
    })

    const offEdit = wsClient.on('assistant.edit_proposed', (e) => {
      const payload = e as unknown as { threadId: string; edit: AgentEditPatch }
      const tid = useAgentAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      setPendingEdit(payload.edit)
    })

    const offStep = wsClient.on('assistant.step', (e) => {
      const payload = e as unknown as {
        threadId: string
        phase: string
        label: string
        toolName?: string | null
      }
      const tid = useAgentAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      setStepLabel(payload.label)
    })

    const offNode = wsClient.on('assistant.node_proposed', (e) => {
      const payload = e as unknown as {
        threadId: string
        kind: 'main' | 'sub'
        node: {
          id: string
          type: 'mainAgent' | 'subAgent'
          position: { x: number; y: number }
          data: Record<string, unknown>
        }
      }
      const tid = useAgentAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      addProposedNode(
        {
          id: payload.node.id,
          type: payload.node.type,
          position: payload.node.position,
          data: payload.node.data,
          draggable: false,
        },
        payload.kind,
      )
    })

    const offComplete = wsClient.on('assistant.session_complete', (e) => {
      const payload = e as unknown as {
        threadId: string
        summary: string
        finalNodes: Array<{
          id: string
          type: 'mainAgent' | 'subAgent'
          position: { x: number; y: number }
          data: Record<string, unknown>
        }>
        finalEdges: Array<{ id: string; source: string; target: string }>
      }
      const tid = useAgentAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      const nodes = payload.finalNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
        draggable: false,
      }))
      setSessionComplete(payload.summary, nodes, payload.finalEdges)
    })

    return () => {
      offToken()
      offEdit()
      offStep()
      offNode()
      offComplete()
    }
  }, [
    appendStreamingToken,
    closeStreamingMessage,
    setStepLabel,
    setPendingEdit,
    addProposedNode,
    setSessionComplete,
  ])

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // textarea 자동 높이 조절
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [draft])

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => a.name.localeCompare(b.name))
  }, [models])

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || isStreaming) return
    setDraft('')
    await sendMessage(text)
  }

  return (
    <div
      className="relative flex flex-col border-t border-border bg-bg text-fg"
      style={{ height: expanded ? (height ?? 280) : 44 }}
    >
      {expanded && onResize && (
        <ResizeHandle direction="vertical" edge="top" onResize={onResize} />
      )}
      {/* 헤더 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <button
          onClick={onToggleExpanded}
          className="flex items-center gap-2 text-xs uppercase tracking-wider text-fg-muted hover:text-fg"
        >
          <Sparkles className="h-3.5 w-3.5 text-blue-400" />
          AGENT ASSISTANT
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>

        {expanded && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming}
            className="rounded border border-border bg-bg px-2 py-1 text-xs text-fg focus:border-blue-500/40 focus:outline-none"
          >
            {sortedModels.length === 0 && <option value={DEFAULT_MODEL}>{DEFAULT_MODEL}</option>}
            {sortedModels.map((m) => (
              <option key={m.id} value={modelKey(m)}>
                {modelProviderName(m)} · {m.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {expanded && (
        <>
          {/* 메시지 리스트 */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="mx-auto max-w-md py-8 text-center text-xs text-fg-subtle">
                <p>어떤 agent를 만들어 드릴까요?</p>
                <p className="mt-1 text-xs">
                  시나리오를 자유롭게 적어주세요. 모호한 부분은 다시 여쭤볼게요.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m, idx) => {
                const isLast = idx === messages.length - 1
                const showProgress =
                  m.role === 'assistant' && isStreaming && !m.content && isLast
                // streaming 도 아니고 content 도 비어있으면 (LLM 이 평문 응답 생략) 박스
                // 자체를 렌더하지 않음 — 빈 박스가 시각적으로 남는 회귀 차단.
                if (m.role === 'assistant' && !m.content && !showProgress) {
                  return null
                }
                return (
                  <div
                    key={m.id}
                    className={cn(
                      'flex',
                      m.role === 'user' ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-xs',
                        m.role === 'user'
                          ? 'bg-blue-600/80 text-white'
                          : 'border border-border bg-bg text-fg',
                      )}
                    >
                      {showProgress ? (
                        <span className="flex items-center gap-2 text-fg-muted">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" />
                          </span>
                          <span>{stepLabel || '생성 중…'}</span>
                        </span>
                      ) : (
                        m.content
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div ref={messagesEndRef} />
          </div>

          {/* 적용 카드 — panel 하단 sticky 영역 (입력창 바로 위). 메시지 리스트 스크롤 / panel
              높이에 관계없이 항상 노출되도록 메시지 영역 밖에 둔다.
              create_agent (propose 노드) 와 edit_agent (partial patch) 두 가지를 분기. */}
          {(pendingMainCount > 0 || pendingSubCount > 0) && onApplyProposal && onCancelProposal && (
            <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <ProposalApplyCard
                pendingMainCount={pendingMainCount}
                pendingSubCount={pendingSubCount}
                onApply={onApplyProposal}
                onCancel={onCancelProposal}
              />
            </div>
          )}
          {pendingEdit && onApplyEdit && onCancelEdit && (
            <div className="shrink-0 border-t border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <EditApplyCard
                edit={pendingEdit}
                onApply={async () => {
                  await onApplyEdit(pendingEdit)
                }}
                onCancel={onCancelEdit}
              />
            </div>
          )}

          {/* 에러 라인 */}
          {error && (
            <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-1 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* 입력창 */}
          <div className="shrink-0 border-t border-border bg-bg px-4 py-3">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-[var(--color-surface-2)] px-3 py-2 shadow-sm transition-shadow focus-within:border-[#3B82F6]/50 focus-within:shadow-md">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    if (!isStreaming && draft.trim()) void handleSend()
                  }
                }}
                placeholder={
                  isStreaming
                    ? (stepLabel || '생성 중…')
                    : '만들고 싶은 agent를 적어주세요. (Shift+Enter 줄바꿈)'
                }
                disabled={isStreaming}
                className="flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed text-fg placeholder:text-fg-subtle outline-none custom-scrollbar"
                style={{ maxHeight: '160px' }}
              />
              <button
                onClick={() => void handleSend()}
                disabled={isStreaming || !draft.trim()}
                aria-label="전송"
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
                  draft.trim() && !isStreaming
                    ? 'bg-[#3B82F6] text-white hover:bg-blue-500'
                    : 'bg-[var(--color-surface-3)] text-fg-subtle',
                )}
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

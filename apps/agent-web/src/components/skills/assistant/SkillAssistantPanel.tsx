'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Hammer, Maximize2, Minimize2, RotateCw, Search, Send, Sparkles, Wand2 } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { renderMarkdown } from '@/lib/markdown'
import { wsClient } from '@/lib/ws-client'
import { useSkillAssistantStore } from '@/stores/use-skill-assistant-store'
import { cn } from '@/lib/utils'
import { ResizeHandle } from '@/components/agents/flow/ResizeHandle'
import { SkillProposalCard } from '@/components/skills/assistant/SkillProposalCard'
import { SkillEditCard } from '@/components/skills/assistant/SkillEditCard'
import { SkillAnalysisCard } from '@/components/skills/assistant/SkillAnalysisCard'
import { SkillChoicesPanel } from '@/components/skills/assistant/SkillChoicesPanel'
import type { SkillEditCurrent } from '@/components/skills/assistant/SkillEditCard'
import type { SkillProposalPayload, SkillEditPayload, SkillAnalysisPayload, AssistantChoice } from '@/stores/use-skill-assistant-store'
import type { EnabledModel } from '@agent-studio/shared'

const DEFAULT_MODEL = 'openai:gpt-5.4'

interface SkillAssistantPanelProps {
  expanded: boolean
  onToggleExpanded: () => void
  height?: number
  onResize?: (deltaPx: number) => void
  /** 편집 모드 대상 스킬. null이면 신규 생성 모드.
   *  편집 모드일 때 diff 렌더링용으로 전체 스냅샷이 필요. */
  targetSkill: ({ id: string } & SkillEditCurrent) | null
  /** 신규 스킬 적용 콜백 */
  onApplyProposal: (payload: SkillProposalPayload) => Promise<void> | void
  /** 편집 적용 콜백 */
  onApplyEdit: (targetSkillId: string, payload: SkillEditPayload) => Promise<void> | void
  /** 최대 높이 토글 콜백 — 누르면 화면 상단까지 확장 / 원래 크기로 복원 */
  onToggleMaximize?: () => void
  /** 현재 최대화 상태(아이콘 토글용) */
  isMaximized?: boolean
}

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

export function SkillAssistantPanel({
  expanded,
  onToggleExpanded,
  height,
  onResize,
  targetSkill,
  onApplyProposal,
  onApplyEdit,
  onToggleMaximize,
  isMaximized,
}: SkillAssistantPanelProps) {
  const [draft, setDraft] = useState('')
  const [models, setModels] = useState<EnabledModel[]>([])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // 스트리밍 종료 후 입력창으로 포커스 복귀 의도를 추적.
  // 사용자가 직접 다른 인터랙티브 요소(버튼·셀렉트·다른 input 등)에 포커싱했다면 가로채지 않는다.
  const wantsRefocusRef = useRef(false)
  const targetSkillRef = useRef(targetSkill)
  useEffect(() => {
    targetSkillRef.current = targetSkill
  }, [targetSkill])

  const messages = useSkillAssistantStore((s) => s.messages)
  const isStreaming = useSkillAssistantStore((s) => s.isStreaming)
  const stepLabel = useSkillAssistantStore((s) => s.stepLabel)
  const pendingSkill = useSkillAssistantStore((s) => s.pendingSkill)
  const pendingEdit = useSkillAssistantStore((s) => s.pendingEdit)
  const targetSkillId = useSkillAssistantStore((s) => s.targetSkillId)
  const selectedModel = useSkillAssistantStore((s) => s.selectedModel)
  const setSelectedModel = useSkillAssistantStore((s) => s.setSelectedModel)
  const mode = useSkillAssistantStore((s) => s.mode)
  const setMode = useSkillAssistantStore((s) => s.setMode)
  const startSession = useSkillAssistantStore((s) => s.startSession)
  const sendMessage = useSkillAssistantStore((s) => s.sendMessage)
  const appendStreamingToken = useSkillAssistantStore((s) => s.appendStreamingToken)
  const closeStreamingMessage = useSkillAssistantStore((s) => s.closeStreamingMessage)
  const setStepLabel = useSkillAssistantStore((s) => s.setStepLabel)
  const setPendingSkill = useSkillAssistantStore((s) => s.setPendingSkill)
  const setPendingEdit = useSkillAssistantStore((s) => s.setPendingEdit)
  const reset = useSkillAssistantStore((s) => s.reset)
  const error = useSkillAssistantStore((s) => s.error)

  // 모델 목록 로딩 (최초 1회)
  useEffect(() => {
    apiClient.providers
      .getEnabledModels()
      .then((list) => {
        setModels(list)
        if (list.length > 0) {
          const current = useSkillAssistantStore.getState().selectedModel
          const matches = list.some((m) => modelKey(m) === current)
          if (!current || !matches) {
            const preferred = list.find((m) => modelKey(m) === DEFAULT_MODEL) ?? list[0]
            useSkillAssistantStore.getState().setSelectedModel(modelKey(preferred))
          }
        }
      })
      .catch(() => setModels([]))
  }, [])

  // targetSkill 또는 selectedModel 변경 시 세션 시작
  useEffect(() => {
    if (!selectedModel) return

    let cancelled = false
    let activeThreadId: string | null = null

    async function init() {
      wsClient.connect()
      try {
        const tid = await startSession(targetSkill?.id ?? null, selectedModel)
        if (cancelled) return
        activeThreadId = tid
        await wsClient.waitForConnection(3000)
        wsClient.subscribeThread(tid)
      } catch (e) {
        console.error('[SkillAssistant] startSession failed', e)
      }
    }
    init()

    return () => {
      cancelled = true
      if (activeThreadId) wsClient.unsubscribeThread(activeThreadId)
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSkill?.id, selectedModel])

  // WS 이벤트 구독
  useEffect(() => {
    const offToken = wsClient.on('agent.token', (e) => {
      if (e.type !== 'agent.token') return
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || (e as { threadId?: string }).threadId !== tid) return
      const done = (e as { done?: boolean }).done
      const content = (e as { content?: string }).content || ''
      if (done) {
        closeStreamingMessage()
      } else if (content) {
        appendStreamingToken(content)
      }
    })

    const offStep = wsClient.on('assistant.step', (e) => {
      const payload = e as unknown as { threadId: string; label: string }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      setStepLabel(payload.label)
    })

    const offSkillProposed = wsClient.on('assistant.skill_proposed', (e) => {
      const payload = e as unknown as { threadId: string; skill: SkillProposalPayload }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      // pending 도 같이 셋팅(전체 보기 등 기존 의존성 호환), 메시지 히스토리에도 카드 추가.
      setPendingSkill(payload.skill)
      useSkillAssistantStore.getState().pushProposalCard(payload.skill)
    })

    const offSkillEditProposed = wsClient.on('assistant.skill_edit_proposed', (e) => {
      const payload = e as unknown as {
        threadId: string
        edit: SkillEditPayload
        targetSkillId: string
      }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      setPendingEdit(payload.edit)
      // diff base 는 백엔드가 사용한 DB 최신값과 일치해야 한다 — React state(targetSkillRef) 는
      // 직전 적용 직후 stale 일 수 있고, 편집 패널이 닫혀 있으면 null 이라 카드가 드롭된다.
      // 항상 API 로 즉시 재조회해서 snapshot 을 안정적으로 확보한다.
      void (async () => {
        const ts = targetSkillRef.current
        let snapshot: SkillEditCurrent | null = null
        try {
          const fresh = await apiClient.skills.get(payload.targetSkillId)
          snapshot = {
            name: fresh.name,
            description: fresh.description,
            instructions: fresh.instructions,
            allowedTools: fresh.allowedTools,
            files: fresh.files.map((f) => ({ path: f.path, content: f.content })),
          }
        } catch (err) {
          console.warn('[SkillAssistant] target skill fetch failed, fallback to ref snapshot', err)
          if (ts && ts.id === payload.targetSkillId) {
            snapshot = {
              name: ts.name,
              description: ts.description,
              instructions: ts.instructions,
              allowedTools: ts.allowedTools,
              files: ts.files,
            }
          }
        }
        if (!snapshot) {
          // 최후의 폴백 — 빈 snapshot 으로라도 카드를 보여줘서 사용자가 변경 내용을 확인할 수 있게.
          snapshot = { name: '', description: '', instructions: '', allowedTools: [], files: [] }
        }
        useSkillAssistantStore.getState().pushEditCard(
          payload.targetSkillId,
          snapshot,
          payload.edit,
        )
      })()
    })

    const offSkillAnalyzed = wsClient.on('assistant.skill_analyzed', (e) => {
      const payload = e as unknown as { threadId: string; analysis: SkillAnalysisPayload }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      const ts = targetSkillRef.current
      useSkillAssistantStore.getState().pushAnalysisCard(
        payload.analysis,
        ts?.id,
        ts
          ? {
              name: ts.name,
              description: ts.description,
              instructions: ts.instructions,
              allowedTools: ts.allowedTools,
              files: ts.files,
            }
          : undefined,
      )
    })

    const offChoices = wsClient.on('assistant.choices_offered', (e) => {
      const payload = e as unknown as { threadId: string; choices: AssistantChoice[] }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      useSkillAssistantStore.getState().attachChoicesToLastAssistant(payload.choices)
    })

    const offComplete = wsClient.on('assistant.session_complete', (e) => {
      const payload = e as unknown as { threadId: string }
      const tid = useSkillAssistantStore.getState().threadId
      if (!tid || payload.threadId !== tid) return
      closeStreamingMessage()
      setStepLabel(null)
    })

    return () => {
      offToken()
      offStep()
      offSkillProposed()
      offSkillEditProposed()
      offSkillAnalyzed()
      offChoices()
      offComplete()
    }
  }, [
    appendStreamingToken,
    closeStreamingMessage,
    setStepLabel,
    setPendingSkill,
    setPendingEdit,
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
    wantsRefocusRef.current = true
    await sendMessage(text)
  }

  // 패널 펼침 직후 입력창 초기 포커스
  useEffect(() => {
    if (!expanded) return
    const t = window.setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [expanded])

  // 스트리밍 종료 시 입력창 자동 포커스 복귀.
  // 단, 사용자가 다른 인터랙티브 요소에 포커싱한 상태라면 가로채지 않는다.
  useEffect(() => {
    if (isStreaming) return
    if (!wantsRefocusRef.current) return
    const ta = textareaRef.current
    if (!ta) return
    const active = document.activeElement as HTMLElement | null
    const isInteractiveElsewhere =
      !!active &&
      active !== document.body &&
      active !== ta &&
      !ta.contains(active) &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'SELECT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'BUTTON' ||
        active.isContentEditable)
    if (!isInteractiveElsewhere) {
      ta.focus()
    }
    wantsRefocusRef.current = false
  }, [isStreaming])

  const handleApplyProposal = async (payload: SkillProposalPayload) => {
    await onApplyProposal(payload)
  }

  const handleApplyEdit = async (payload: SkillEditPayload) => {
    if (!targetSkillId) return
    await onApplyEdit(targetSkillId, payload)
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
          SKILL ASSISTANT
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>

        <div className="flex items-center gap-2">
          {expanded && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                targetSkill
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-blue-500/15 text-blue-300',
              )}
            >
              {targetSkill ? `편집 중: ${targetSkill.name}` : '새 스킬 생성'}
            </span>
          )}
          {expanded && onToggleMaximize && (
            <button
              type="button"
              onClick={onToggleMaximize}
              title={isMaximized ? '원래 크기로' : '최대 높이로'}
              aria-label={isMaximized ? '원래 크기로' : '최대 높이로'}
              className="flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg"
            >
              {isMaximized ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </button>
          )}
          {expanded && (
            <button
              type="button"
              onClick={() => void useSkillAssistantStore.getState().restartSession()}
              disabled={isStreaming}
              title="새 대화 시작 — 채팅 히스토리 초기화"
              aria-label="새 대화 시작"
              className="flex items-center gap-1 rounded border border-border bg-bg px-2 py-1 text-[10px] text-fg-muted hover:border-blue-400/40 hover:text-fg disabled:opacity-50"
            >
              <RotateCw className="h-3 w-3" />
              새 대화
            </button>
          )}
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
      </div>

      {expanded && (
        <>
          {/* 메시지 리스트 */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="mx-auto max-w-md py-8 text-center text-xs text-fg-subtle">
                <p>
                  {targetSkill
                    ? `"${targetSkill.name}" 스킬을 어떻게 수정할까요?`
                    : '어떤 스킬을 만들어 드릴까요?'}
                </p>
                <p className="mt-1 text-xs">
                  {targetSkill
                    ? '원하는 변경 사항을 자유롭게 적어주세요.'
                    : '스킬 목적과 기능을 자유롭게 적어주세요. 모호한 부분은 다시 여쭤볼게요.'}
                </p>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m, idx) => {
                const isLast = idx === messages.length - 1
                const isStreamingMsg = m.role === 'assistant' && isStreaming && isLast
                // 카드가 첨부된 메시지는 카드 자체를 렌더 (본문 비어 있을 가능성 큼)
                if (m.card) {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="w-full max-w-[96%]">
                        {m.card.kind === 'proposal' ? (
                          <SkillProposalCard
                            payload={m.card.payload}
                            previousPayload={m.card.previousPayload}
                            applied={m.card.applied}
                            canceled={m.card.canceled}
                            onApply={async (p) => {
                              await onApplyProposal(p)
                              useSkillAssistantStore.getState().updateCardState(m.id, { applied: true })
                            }}
                            onCancel={() => {
                              useSkillAssistantStore.getState().updateCardState(m.id, { canceled: true })
                              useSkillAssistantStore.getState().clearPendingSkill()
                            }}
                          />
                        ) : m.card.kind === 'analysis' ? (
                          <SkillAnalysisCard
                            messageId={m.id}
                            payload={m.card.payload}
                            canceled={m.card.canceled}
                            targetSkillId={m.card.targetSkillId}
                            targetSnapshot={m.card.targetSnapshot}
                          />
                        ) : (
                          <SkillEditCard
                            current={m.card.targetSnapshot}
                            payload={m.card.payload}
                            applied={m.card.applied}
                            canceled={m.card.canceled}
                            onApply={async (p) => {
                              await onApplyEdit(m.card!.kind === 'edit' ? m.card!.targetSkillId : '', p)
                              useSkillAssistantStore.getState().updateCardState(m.id, { applied: true })
                            }}
                            onCancel={() => {
                              useSkillAssistantStore.getState().updateCardState(m.id, { canceled: true })
                              useSkillAssistantStore.getState().clearPendingEdit()
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )
                }
                if (m.role === 'assistant' && !m.content && !isStreamingMsg) {
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
                        'max-w-[88%] break-words rounded-2xl px-3 py-2 text-xs',
                        m.role === 'user'
                          ? 'whitespace-pre-wrap bg-blue-600/80 text-white'
                          : 'border border-border bg-bg text-fg',
                      )}
                    >
                      {/* 본문 — assistant 는 마크다운 렌더, user 는 평문 */}
                      {m.content ? (
                        <>
                          {m.role === 'assistant' ? (
                            <div
                              className="prose-invert-custom"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                            />
                          ) : (
                            m.content
                          )}
                          {isStreamingMsg && (
                            <span className="ml-0.5 inline-block h-3 w-1.5 align-[-2px] animate-pulse bg-blue-400" />
                          )}
                        </>
                      ) : isStreamingMsg ? (
                        <span className="flex items-center gap-2 text-fg-muted">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" />
                          </span>
                          <span>준비 중…</span>
                        </span>
                      ) : null}

                      {/* 진행 라벨 — 본문 아래 항상 노출(스트리밍 중) */}
                      {isStreamingMsg && stepLabel && (
                        <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/5 px-2 py-1 text-[10px] text-blue-200">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-300 [animation-delay:-0.3s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-300 [animation-delay:-0.15s]" />
                            <span className="h-1 w-1 animate-bounce rounded-full bg-blue-300" />
                          </span>
                          <span>{stepLabel}</span>
                        </div>
                      )}

                      {/* 후속 빠른 선택 패널 — 어시스턴트 메시지에만, choices 가 부착된 경우. */}
                      {m.role === 'assistant' && m.choices && (
                        <SkillChoicesPanel message={m} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div ref={messagesEndRef} />
          </div>

          {/* 제안 카드는 채팅 메시지 내부에 인라인 렌더 — 별도 하단 영역 없음. */}

          {/* 에러 라인 */}
          {error && (
            <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-1 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* 입력창 */}
          <div className="shrink-0 border-t border-border bg-bg px-4 py-3">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-[var(--color-surface-2)] px-3 py-2 shadow-sm transition-shadow focus-within:border-[#3B82F6]/50 focus-within:shadow-md">
              {/* 모드 셀렉터 — 세그먼트 토글 */}
              <ModeToggle mode={mode} onChange={setMode} disabled={isStreaming} />
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
                    : targetSkill
                      ? `"${targetSkill.name}" 스킬 수정 내용을 적어주세요. (Shift+Enter 줄바꿈)`
                      : '만들고 싶은 스킬을 적어주세요. (Shift+Enter 줄바꿈)'
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

type AssistantMode = 'auto' | 'builder' | 'analyze'

interface ModeToggleProps {
  mode: AssistantMode
  onChange: (mode: AssistantMode) => void
  disabled?: boolean
}

const MODE_OPTIONS: Array<{
  value: AssistantMode
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconCls: string
  hint: string
}> = [
  { value: 'auto', label: 'Auto', icon: Wand2, iconCls: 'text-blue-300', hint: '의도 자동 판단' },
  { value: 'builder', label: '빌더', icon: Hammer, iconCls: 'text-amber-300', hint: '생성·편집 제안' },
  { value: 'analyze', label: '분석', icon: Search, iconCls: 'text-emerald-300', hint: '질의응답·평가' },
]

function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = MODE_OPTIONS.find((o) => o.value === mode) ?? MODE_OPTIONS[0]
  const CurrentIcon = current.icon

  return (
    <div ref={wrapRef} className="relative shrink-0 self-end">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`모드: ${current.label}`}
        title={current.hint}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg text-[11px] font-medium text-fg transition-colors',
          'hover:border-blue-400/40 hover:bg-[var(--color-surface-2)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <CurrentIcon className={cn('h-3.5 w-3.5', current.iconCls)} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-30 mb-1 w-36 overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
        >
          {MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = opt.value === mode
            return (
              <li key={opt.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors',
                    active
                      ? 'bg-[var(--color-surface-2)] text-fg'
                      : 'text-fg-muted hover:bg-[var(--color-surface-2)] hover:text-fg',
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', opt.iconCls)} />
                  <div className="flex flex-col">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-[9px] text-fg-subtle">{opt.hint}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

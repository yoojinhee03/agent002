import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/ws-client'

export interface SkillEditTargetSnapshot {
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  files: { path: string; content: string }[]
}

export interface SkillAnalysisToolFit {
  name: string
  fit: 'good' | 'unclear' | 'missing'
  reason: string
}

export interface SkillAnalysisSuggestion {
  title: string
  detail: string
  severity: 'low' | 'med' | 'high'
  editHint?: SkillEditPayload
}

export interface SkillAnalysisPayload {
  targetSkillId?: string | null
  overview: string
  strengths: string[]
  weaknesses: string[]
  toolFit: SkillAnalysisToolFit[]
  missingSteps: string[]
  suggestions: SkillAnalysisSuggestion[]
  overallScore: number
}

export type AssistantMessageCard =
  | {
      kind: 'proposal'
      payload: SkillProposalPayload
      /** 이전 제안에서 다듬어진 경우, 직전 페이로드 — diff 표시에 사용. */
      previousPayload?: SkillProposalPayload
      applied: boolean
      canceled: boolean
    }
  | {
      kind: 'edit'
      targetSkillId: string
      targetSnapshot: SkillEditTargetSnapshot
      payload: SkillEditPayload
      applied: boolean
      canceled: boolean
    }
  | {
      kind: 'analysis'
      payload: SkillAnalysisPayload
      targetSkillId?: string
      targetSnapshot?: SkillEditTargetSnapshot
      canceled: boolean
    }


export interface AssistantChoice {
  label: string
  value: string
}

export interface AssistantChoicesAttachment {
  choices: AssistantChoice[]
  /** 닫기로 접힘 — 토글로 다시 펼칠 수 있음(영구 dismiss 아님). */
  collapsed: boolean
  /** 버튼/직접입력으로 한 번 보낸 적 있음. 비활성화 용도 아님(헤더 배지). */
  consumed: boolean
}

export interface AssistantMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  createdAt: string
  /** 메시지에 첨부된 인라인 카드 (스킬 제안/수정). 채팅 히스토리에 그대로 남는다. */
  card?: AssistantMessageCard
  /** 후속 빠른 선택 패널 (m.card 와 직교 — 텍스트 + 선택지 패널 동시 렌더). */
  choices?: AssistantChoicesAttachment
}

export interface SkillProposalPayload {
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  files: { path: string; content: string }[]
}

export interface SkillEditPayload {
  name?: string
  description?: string
  instructions?: string
  allowedTools?: string[]
  addFiles?: { path: string; content: string }[]
  removeFilePaths?: string[]
  changeSummary?: string
}

interface SkillAssistantState {
  threadId: string | null
  targetSkillId: string | null
  selectedModel: string
  mode: 'auto' | 'builder' | 'analyze'
  messages: AssistantMessage[]
  pendingSkill: SkillProposalPayload | null
  /** pendingSkill 이 적용 완료되어 재적용을 막아야 하는 상태. 카드는 그대로 표시되되 버튼 비활성. */
  pendingSkillApplied: boolean
  pendingEdit: SkillEditPayload | null
  pendingEditApplied: boolean
  isStreaming: boolean
  stepLabel: string | null
  error: string | null

  setMode: (mode: 'auto' | 'builder' | 'analyze') => void
  /** 현재 컨텍스트(targetSkillId/selectedModel/mode)를 유지한 채 새 thread 로 대화 리셋. */
  restartSession: () => Promise<string | null>
  startSession: (skillId: string | null, model?: string, mode?: 'auto' | 'builder' | 'analyze') => Promise<string>
  sendMessage: (text: string, modeOverride?: 'auto' | 'builder' | 'analyze') => Promise<void>
  appendStreamingToken: (delta: string) => void
  closeStreamingMessage: () => void
  appendUserMessage: (text: string) => void
  appendAssistantMessage: (text: string) => void
  setPendingSkill: (p: SkillProposalPayload | null) => void
  clearPendingSkill: () => void
  markPendingSkillApplied: () => void
  setPendingEdit: (p: SkillEditPayload | null) => void
  clearPendingEdit: () => void
  markPendingEditApplied: () => void
  /** 새 스킬 제안 카드를 채팅 히스토리에 추가. */
  pushProposalCard: (payload: SkillProposalPayload) => string
  /** 스킬 수정 제안 카드를 채팅 히스토리에 추가. */
  pushEditCard: (
    targetSkillId: string,
    targetSnapshot: SkillEditTargetSnapshot,
    payload: SkillEditPayload,
  ) => string
  /** 스킬 분석 결과 카드를 채팅 히스토리에 추가. */
  pushAnalysisCard: (
    payload: SkillAnalysisPayload,
    targetSkillId?: string,
    targetSnapshot?: SkillEditTargetSnapshot,
  ) => string
  /** 카드 상태 업데이트 (applied/canceled). */
  updateCardState: (
    messageId: string,
    patch: { applied?: boolean; canceled?: boolean },
  ) => void
  /** 가장 최근 어시스턴트 메시지에 빠른 선택 attachment 부착. */
  attachChoicesToLastAssistant: (choices: AssistantChoice[]) => void
  /** 선택지 패널 접기/펼치기 토글. */
  toggleChoicesCollapsed: (messageId: string) => void
  /** 선택지에서 한 번 보낸 적 있음 표기(disable 용도 아님). */
  setChoicesConsumed: (messageId: string) => void
  setStepLabel: (label: string | null) => void
  setSelectedModel: (model: string) => void
  reset: () => void
}

const DEFAULT_MODEL = ''

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export const useSkillAssistantStore = create<SkillAssistantState>()(
  immer((set, get) => ({
    threadId: null,
    targetSkillId: null,
    selectedModel: DEFAULT_MODEL,
    mode: 'auto',
    messages: [],
    pendingSkill: null,
    pendingSkillApplied: false,
    pendingEdit: null,
    pendingEditApplied: false,
    isStreaming: false,
    stepLabel: null,
    error: null,

    setMode: (mode) =>
      set((state) => {
        state.mode = mode
      }),

    restartSession: async () => {
      const { targetSkillId, selectedModel, mode } = get()
      try {
        // startSession 이 set 초기화 + 새 thread 생성 + threadId 셋팅까지 처리.
        const tid = await get().startSession(targetSkillId ?? null, selectedModel || undefined, mode)
        // 새 thread 즉시 구독.
        wsClient.subscribeThread(tid)
        return tid
      } catch (e) {
        set((state) => {
          state.error = e instanceof Error ? e.message : '대화 재시작 실패'
        })
        return null
      }
    },

    startSession: async (skillId, model, mode) => {
      set((state) => {
        state.targetSkillId = skillId ?? null
        state.error = null
        state.stepLabel = null
        state.messages = []
        state.pendingSkill = null
        state.pendingSkillApplied = false
        state.pendingEdit = null
        state.pendingEditApplied = false
        if (mode !== undefined) state.mode = mode
      })
      const chosenModel = model || get().selectedModel || DEFAULT_MODEL
      const chosenMode = mode ?? get().mode
      const res = await apiClient.skillAssistant.createSession({ skillId, model: chosenModel, mode: chosenMode })
      set((state) => {
        state.threadId = res.threadId
        state.targetSkillId = res.targetSkillId
      })
      return res.threadId
    },

    sendMessage: async (text, modeOverride) => {
      const { threadId } = get()
      if (!threadId) {
        throw new Error('Skill Assistant session is not initialized')
      }
      const effectiveMode = modeOverride ?? get().mode
      set((state) => {
        state.isStreaming = true
        state.stepLabel = '요청 전송 중…'
        state.error = null
        state.messages.push({
          id: newId('msg'),
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        })
        state.messages.push({
          id: newId('msg'),
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        })
      })
      wsClient.subscribeThread(threadId)
      try {
        await apiClient.skillAssistant.invoke(threadId, text, effectiveMode)
      } catch (e) {
        set((state) => {
          state.isStreaming = false
          state.error = e instanceof Error ? e.message : 'Skill Assistant 호출 실패'
        })
      }
    },

    appendStreamingToken: (delta) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1]
        if (last && last.role === 'assistant') {
          last.content += delta
        }
        // stepLabel 은 본문 옆에 별도 라벨로 항상 노출되므로 토큰 도착 시 클리어하지 않는다.
        // 다음 emit_step 으로 라벨이 갱신되거나 closeStreamingMessage 에서 정리.
      }),

    closeStreamingMessage: () =>
      set((state) => {
        state.isStreaming = false
        state.stepLabel = null
      }),

    setStepLabel: (label) =>
      set((state) => {
        state.stepLabel = label
      }),

    setPendingSkill: (p) =>
      set((state) => {
        state.pendingSkill = p
        state.pendingSkillApplied = false
      }),

    clearPendingSkill: () =>
      set((state) => {
        state.pendingSkill = null
        state.pendingSkillApplied = false
      }),

    markPendingSkillApplied: () =>
      set((state) => {
        state.pendingSkillApplied = true
      }),

    setPendingEdit: (p) =>
      set((state) => {
        state.pendingEdit = p
        state.pendingEditApplied = false
      }),

    clearPendingEdit: () =>
      set((state) => {
        state.pendingEdit = null
        state.pendingEditApplied = false
      }),

    markPendingEditApplied: () =>
      set((state) => {
        state.pendingEditApplied = true
      }),

    pushProposalCard: (payload) => {
      const id = newId('msg')
      // 직전 제안 카드(같은 thread 내 마지막 proposal)를 찾아 previousPayload 로 보존 → diff 표시.
      const prevState = get()
      let previousPayload: SkillProposalPayload | undefined
      for (let i = prevState.messages.length - 1; i >= 0; i--) {
        const c = prevState.messages[i].card
        if (c?.kind === 'proposal') {
          previousPayload = c.payload
          break
        }
      }
      set((state) => {
        state.messages.push({
          id,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          card: {
            kind: 'proposal',
            payload,
            previousPayload,
            applied: false,
            canceled: false,
          },
        })
      })
      return id
    },

    pushEditCard: (targetSkillId, targetSnapshot, payload) => {
      const id = newId('msg')
      set((state) => {
        state.messages.push({
          id,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          card: {
            kind: 'edit',
            targetSkillId,
            targetSnapshot,
            payload,
            applied: false,
            canceled: false,
          },
        })
      })
      return id
    },

    pushAnalysisCard: (payload, targetSkillId, targetSnapshot) => {
      const id = newId('msg')
      set((state) => {
        state.messages.push({
          id,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          card: {
            kind: 'analysis',
            payload,
            targetSkillId,
            targetSnapshot,
            canceled: false,
          },
        })
      })
      return id
    },

    updateCardState: (messageId, patch) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === messageId)
        if (msg && msg.card) {
          const card = msg.card
          if (patch.canceled !== undefined) card.canceled = patch.canceled
          if (patch.applied !== undefined && card.kind !== 'analysis') {
            card.applied = patch.applied
          }
        }
      }),

    attachChoicesToLastAssistant: (choices) =>
      set((state) => {
        if (!choices || choices.length === 0) return
        for (let i = state.messages.length - 1; i >= 0; i--) {
          const m = state.messages[i]
          if (m.role === 'assistant') {
            m.choices = { choices, collapsed: false, consumed: false }
            return
          }
        }
      }),

    toggleChoicesCollapsed: (messageId) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === messageId)
        if (msg?.choices) msg.choices.collapsed = !msg.choices.collapsed
      }),

    setChoicesConsumed: (messageId) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === messageId)
        if (msg?.choices) msg.choices.consumed = true
      }),

    appendUserMessage: (text) =>
      set((state) => {
        state.messages.push({
          id: newId('msg'),
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        })
      }),

    appendAssistantMessage: (text) =>
      set((state) => {
        state.messages.push({
          id: newId('msg'),
          role: 'assistant',
          content: text,
          createdAt: new Date().toISOString(),
        })
      }),

    setSelectedModel: (model) =>
      set((state) => {
        state.selectedModel = model
      }),

    reset: () =>
      set((state) => {
        state.threadId = null
        state.targetSkillId = null
        state.messages = []
        state.pendingSkill = null
        state.pendingSkillApplied = false
        state.pendingEdit = null
        state.pendingEditApplied = false
        state.isStreaming = false
        state.stepLabel = null
        state.error = null
        state.mode = 'auto'
      }),
  })),
)

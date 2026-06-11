import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Edge, Node } from '@xyflow/react'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/ws-client'

export type AssistantStep =
  | 'idle'
  | 'parsing'
  | 'clarifying'
  | 'structuring'
  | 'tool_mapping'
  | 'complete'

export interface AssistantMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  createdAt: string
}

export type AssistantToolPolicy = 'auto' | 'requires_approval' | 'restricted' | 'disabled'

/** 기존 sub-agent 의 도구 실행 정책 변경 제안. nodeId 우선, 없으면 agentName 으로 매칭. */
export interface SubAgentPermissionPatch {
  nodeId?: string | null
  agentName: string
  toolPermissions: Record<string, AssistantToolPolicy>
}

/** Agent Assistant 가 제안한 부분 수정 — handleApplyEdit 가 partial update API 호출에 사용. */
export interface AgentEditPatch {
  agentName?: string
  architecture?: string
  modelId?: string
  systemPrompt?: string
  builtinToolIds?: string[]
  toolIds?: string[]
  mcpServerIds?: string[]
  skillIds?: string[]
  /** 메인 agent 도구 실행 정책 부분 변경 (기존 값과 merge). */
  toolPermissions?: Record<string, AssistantToolPolicy>
  /** 기존 sub-agent 도구 실행 정책 변경 (그래프 노드에 merge 후 graphDefinition 저장). */
  subAgentPermissions?: SubAgentPermissionPatch[]
  changeSummary?: string
}

interface AgentAssistantState {
  agentId: string | null
  threadId: string | null
  selectedModel: string
  messages: AssistantMessage[]
  pendingNodes: Node[]
  pendingEdges: Edge[]
  /** edit_agent 액션에서 받은 부분 수정 제안. 적용 시 partial update API 호출. */
  pendingEdit: AgentEditPatch | null
  isStreaming: boolean
  currentStep: AssistantStep
  /** 진행 단계 동적 라벨 — UI 의 "…" 자리에 표시 (예: "사용 가능한 도구 카탈로그 조회 중…") */
  stepLabel: string | null
  error: string | null

  startSession: (agentId: string, model?: string) => Promise<string>
  sendMessage: (text: string) => Promise<void>
  appendStreamingToken: (delta: string) => void
  closeStreamingMessage: () => void
  appendUserMessage: (text: string) => void
  /** frontend 가 자체적으로 assistant 메시지를 채팅에 추가 (예: edit 적용 완료 알림). */
  appendAssistantMessage: (text: string) => void
  addProposedNode: (node: Node, kind: 'main' | 'sub') => void
  setSessionComplete: (summary: string, nodes: Node[], edges: Edge[]) => void
  setPendingEdit: (edit: AgentEditPatch | null) => void
  clearPendingEdit: () => void
  setStep: (step: AssistantStep) => void
  setStepLabel: (label: string | null) => void
  setSelectedModel: (model: string) => void
  /** 제안 노드/엣지만 비움. pendingEdit 은 보존 — ProposalApplyCard 와 EditApplyCard 가
   *  동시에 떴을 때 한쪽 적용/취소가 다른 쪽을 지우지 않도록 분리. */
  clearPendingNodes: () => void
  /** 전체(노드 + 엣지 + edit)를 비움. 페이지 reset/대화 종료 같은 일괄 정리에만 사용. */
  clearPending: () => void
  reset: () => void
}

// 빈 문자열을 초기값으로 사용 — getEnabledModels 가 resolve 되어 사용자에게 실제로
// 활성화된 첫 모델이 정해진 후에만 session 을 시작하도록 한다. (이전엔 anthropic 기본값
// 으로 즉시 startSession 호출되어 사용자 OpenAI credential 과 mismatch + race condition 발생)
const DEFAULT_MODEL = ''

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export const useAgentAssistantStore = create<AgentAssistantState>()(
  immer((set, get) => ({
    agentId: null,
    threadId: null,
    selectedModel: DEFAULT_MODEL,
    messages: [],
    pendingNodes: [],
    pendingEdges: [],
    isStreaming: false,
    currentStep: 'idle',
    stepLabel: null,
    pendingEdit: null,
    error: null,

    startSession: async (agentId, model) => {
      set((state) => {
        state.agentId = agentId
        state.error = null
        state.currentStep = 'idle'
        state.stepLabel = null
        state.messages = []
        state.pendingNodes = []
        state.pendingEdges = []
        state.pendingEdit = null
      })
      const chosenModel = model || get().selectedModel || DEFAULT_MODEL
      const res = await apiClient.agentAssistant.createSession(agentId, chosenModel)
      set((state) => {
        state.threadId = res.threadId
        // 주의: selectedModel 은 절대 backend echo 로 다시 set 하지 않는다.
        // useEffect deps 에 selectedModel 이 포함된 상태에서 매 startSession 마다
        // selectedModel reference 가 변경되어 무한 루프가 발생함. backend 가 어차피
        // 사용자가 보낸 model 그대로 echo 하므로 set 자체가 무의미.
      })
      return res.threadId
    },

    sendMessage: async (text) => {
      const { agentId, threadId } = get()
      if (!agentId || !threadId) {
        throw new Error('Assistant session is not initialized')
      }
      set((state) => {
        state.isStreaming = true
        state.currentStep = 'parsing'
        state.stepLabel = '요청 전송 중…'
        state.error = null
        state.messages.push({
          id: newId('msg'),
          role: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        })
        // 새 assistant 메시지 자리(streaming target)
        state.messages.push({
          id: newId('msg'),
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        })
      })
      // WS 구독 보장 — useEffect race condition 으로 첫 subscribeThread 가 누락돼도
      // invoke 직전에 한 번 더 보장. wsClient.subscribeThread 는 내부 Set + emit 이라 idempotent.
      // 백엔드 thread.subscribe 핸들러도 sio.enter_room 으로 중복 호출 안전.
      // (회귀 사례: room_subscribers=0 으로 백엔드 emit 이 모두 무시되어 isStreaming 이 안 풀림.)
      wsClient.subscribeThread(threadId)
      try {
        await apiClient.agentAssistant.invoke(agentId, threadId, text)
      } catch (e) {
        set((state) => {
          state.isStreaming = false
          state.error = e instanceof Error ? e.message : 'Assistant 호출 실패'
        })
      }
    },

    appendStreamingToken: (delta) =>
      set((state) => {
        const last = state.messages[state.messages.length - 1]
        if (last && last.role === 'assistant') {
          last.content += delta
        }
        // 토큰이 들어오기 시작했다면 step 라벨은 더 이상 필요 없음 — 본문이 자체 progress 역할.
        if (state.stepLabel) state.stepLabel = null
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

    setPendingEdit: (edit) =>
      set((state) => {
        state.pendingEdit = edit
      }),

    clearPendingEdit: () =>
      set((state) => {
        state.pendingEdit = null
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

    addProposedNode: (node, kind) =>
      set((state) => {
        // main 노드면 기존 main을 교체 (덮어쓰기), sub면 append
        if (kind === 'main') {
          const idx = state.pendingNodes.findIndex((n) => n.type === 'mainAgent')
          if (idx >= 0) {
            state.pendingNodes[idx] = node
          } else {
            state.pendingNodes.unshift(node)
          }
        } else {
          state.pendingNodes.push(node)
        }
        // 자동으로 main → sub 엣지 재구성
        const mainNode = state.pendingNodes.find((n) => n.type === 'mainAgent')
        if (mainNode) {
          const subNodes = state.pendingNodes.filter((n) => n.type === 'subAgent')
          state.pendingEdges = subNodes.map((s) => ({
            id: `e-${mainNode.id}-${s.id}`,
            source: mainNode.id,
            target: s.id,
          }))
        }
        if (state.currentStep === 'parsing' || state.currentStep === 'clarifying') {
          state.currentStep = 'structuring'
        }
      }),

    setSessionComplete: (_summary, nodes, edges) =>
      set((state) => {
        if (nodes.length > 0) {
          state.pendingNodes = nodes
        }
        if (edges.length > 0) {
          state.pendingEdges = edges
        }
        state.currentStep = 'complete'
        state.isStreaming = false
        state.stepLabel = null
      }),

    setStep: (step) =>
      set((state) => {
        state.currentStep = step
      }),

    setSelectedModel: (model) =>
      set((state) => {
        state.selectedModel = model
      }),

    clearPendingNodes: () =>
      set((state) => {
        state.pendingNodes = []
        state.pendingEdges = []
        state.currentStep = 'idle'
      }),

    clearPending: () =>
      set((state) => {
        state.pendingNodes = []
        state.pendingEdges = []
        state.pendingEdit = null
        state.currentStep = 'idle'
      }),

    reset: () =>
      set((state) => {
        state.agentId = null
        state.threadId = null
        state.messages = []
        state.pendingNodes = []
        state.pendingEdges = []
        state.pendingEdit = null
        state.isStreaming = false
        state.currentStep = 'idle'
        state.stepLabel = null
        state.error = null
      }),
  })),
)

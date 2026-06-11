import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Thread, ThreadMessage, WsStepStartedEvent } from '@agent-studio/shared'

interface ThreadState {
  threads: Thread[]
  isLoading: boolean
  current: Thread | null
  messages: ThreadMessage[]
  isStreaming: boolean

  setThreads: (threads: Thread[]) => void
  setCurrent: (thread: Thread | null) => void
  setLoading: (loading: boolean) => void
  setMessages: (messages: ThreadMessage[]) => void
  addMessage: (message: ThreadMessage) => void
  setStreaming: (streaming: boolean) => void
  appendStreamContent: (content: string) => void
  updateLastMessageContent: (content: string) => void
  addIntermediateStep: (step: WsStepStartedEvent) => void
  setPlan: (steps: string[]) => void
  addThread: (thread: Thread) => void
  removeThread: (threadId: string) => void
  reset: () => void
}

export const useThreadStore = create<ThreadState>()(
  immer((set) => ({
    threads: [],
    isLoading: false,
    current: null,
    messages: [],
    isStreaming: false,

    setThreads: (threads) =>
      set((state) => {
        state.threads = threads
      }),
    setCurrent: (thread) =>
      set((state) => {
        state.current = thread
      }),
    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading
      }),
    setMessages: (messages) =>
      set((state) => {
        state.messages = messages
      }),
    addMessage: (message) =>
      set((state) => {
        state.messages.push(message)
      }),
    setStreaming: (streaming) =>
      set((state) => {
        state.isStreaming = streaming
      }),
    appendStreamContent: (content) =>
      set((state) => {
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content += content
        } else {
          state.messages.push({
            role: 'assistant',
            content,
            intermediateSteps: [],
            timestamp: new Date().toISOString(),
          })
        }
      }),
    updateLastMessageContent: (content) =>
      set((state) => {
        const lastMsg = state.messages[state.messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content = content
        } else {
          state.messages.push({
            role: 'assistant',
            content,
            intermediateSteps: [],
            timestamp: new Date().toISOString(),
          })
        }
      }),
    addIntermediateStep: (step) =>
      set((state) => {
        let lastMsg = state.messages[state.messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'assistant') {
          // 어시스턴트 메시지가 없으면 새로 생성
          lastMsg = {
            role: 'assistant',
            content: '',
            intermediateSteps: [],
            timestamp: new Date().toISOString(),
          }
          state.messages.push(lastMsg)
        }

        if (!lastMsg.intermediateSteps) {
          lastMsg.intermediateSteps = []
        }

        // 동일한 stepId가 있으면 업데이트, 없으면 추가
        const existingIdx = lastMsg.intermediateSteps.findIndex((s) => s.stepId === step.stepId)
        if (existingIdx >= 0) {
          lastMsg.intermediateSteps[existingIdx] = {
            ...lastMsg.intermediateSteps[existingIdx],
            ...step,
          }
        } else {
          lastMsg.intermediateSteps.push(step)
        }
      }),
    setPlan: (_steps) => set((state) => { /* plan 데이터는 chat-interface 로컬 상태에서 관리 */ void state }),
    addThread: (thread) =>
      set((state) => {
        state.threads.unshift(thread)
      }),
    removeThread: (threadId) =>
      set((state) => {
        state.threads = state.threads.filter((t) => t.id !== threadId)
        if (state.current?.id === threadId) state.current = null
      }),
    reset: () =>
      set((state) => {
        state.threads = []
        state.isLoading = false
        state.current = null
        state.messages = []
        state.isStreaming = false
      }),
  })),
)

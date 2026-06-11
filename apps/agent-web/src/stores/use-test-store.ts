import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { v4 as uuidv4 } from "uuid"
import type { TestMessage } from "@/types/test"

const MOCK_RESPONSES = [
  "안녕하세요, 고객님. 배송 지연으로 불편을 드려 대단히 죄송합니다. 해당 주문건에 대해 즉시 확인해 드리겠습니다. 환불 금액은 영업일 기준 1~2일 내에 원래 결제 수단으로 입금될 예정입니다.",
  "네, 확인해 보니 이미 처리가 시작되었습니다. 현재 진행 상태를 실시간으로 확인하시려면 마이페이지 > 주문내역에서 확인 가능합니다. 추가 도움이 필요하시면 말씀해 주세요.",
  "추가 보상으로 다음 주문 시 사용 가능한 15% 할인 쿠폰을 발급해 드렸습니다. 쿠폰은 마이페이지에서 확인하실 수 있습니다. 다른 도움이 필요하신 부분이 있으신가요?",
]

function generateMockResponse(model: string): Omit<TestMessage, "id" | "timestamp"> {
  const content = MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)]
  const outputTokens = Math.floor(Math.random() * 200) + 80
  const inputTokens = Math.floor(Math.random() * 150) + 50
  const costPer1kTokens = 0.002
  const cost = ((inputTokens + outputTokens) / 1000) * costPer1kTokens

  return {
    role: "assistant",
    content,
    latency: Math.floor(Math.random() * 800) + 600,
    inputTokens,
    outputTokens,
    cost: Math.round(cost * 10000) / 10000,
    model,
  }
}

function simulateDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 800) + 600
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface TestState {
  testMode: "single" | "multi"
  messages: TestMessage[]
  isRunning: boolean
  singleInput: string
  multiInput: string
  singleResult: TestMessage | null

  setTestMode: (mode: "single" | "multi") => void
  setSingleInput: (input: string) => void
  setMultiInput: (input: string) => void
  runSingleTest: (renderedPrompt: string, model: string) => Promise<void>
  sendMultiMessage: (
    content: string,
    renderedPrompt: string,
    model: string
  ) => Promise<void>
  clearMessages: () => void
}

export const useTestStore = create<TestState>()(
  immer((set) => ({
    testMode: "single",
    messages: [],
    isRunning: false,
    singleInput: "",
    multiInput: "",
    singleResult: null,

    setTestMode: (mode) => {
      set((state) => {
        state.testMode = mode
      })
    },

    setSingleInput: (input) => {
      set((state) => {
        state.singleInput = input
      })
    },

    setMultiInput: (input) => {
      set((state) => {
        state.multiInput = input
      })
    },

    runSingleTest: async (_renderedPrompt, model) => {
      set((state) => {
        state.isRunning = true
        state.singleResult = null
      })

      await simulateDelay()

      const mockResponse = generateMockResponse(model)
      const message: TestMessage = {
        ...mockResponse,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
      }

      set((state) => {
        state.singleResult = message
        state.isRunning = false
      })
    },

    sendMultiMessage: async (content, _renderedPrompt, model) => {
      const userMessage: TestMessage = {
        id: uuidv4(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      }

      set((state) => {
        state.messages.push(userMessage)
        state.isRunning = true
        state.multiInput = ""
      })

      await simulateDelay()

      const mockResponse = generateMockResponse(model)
      const assistantMessage: TestMessage = {
        ...mockResponse,
        id: uuidv4(),
        timestamp: new Date().toISOString(),
      }

      set((state) => {
        state.messages.push(assistantMessage)
        state.isRunning = false
      })
    },

    clearMessages: () => {
      set((state) => {
        state.messages = []
        state.singleResult = null
      })
    },
  }))
)

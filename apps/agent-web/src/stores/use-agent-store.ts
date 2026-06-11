import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Agent } from '@agent-studio/shared'

interface AgentState {
  agents: Agent[]
  isLoading: boolean
  current: Agent | null

  setAgents: (agents: Agent[]) => void
  setCurrent: (agent: Agent | null) => void
  setLoading: (loading: boolean) => void
  addAgent: (agent: Agent) => void
  updateAgent: (agentId: string, data: Partial<Agent>) => void
  removeAgent: (agentId: string) => void
  reset: () => void
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    agents: [],
    isLoading: false,
    current: null,

    setAgents: (agents) =>
      set((state) => {
        state.agents = agents
      }),
    setCurrent: (agent) =>
      set((state) => {
        state.current = agent
      }),
    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading
      }),
    addAgent: (agent) =>
      set((state) => {
        state.agents.unshift(agent)
      }),
    updateAgent: (agentId, data) =>
      set((state) => {
        const idx = state.agents.findIndex((a) => a.id === agentId)
        if (idx >= 0) Object.assign(state.agents[idx], data)
        if (state.current?.id === agentId) Object.assign(state.current, data)
      }),
    removeAgent: (agentId) =>
      set((state) => {
        state.agents = state.agents.filter((a) => a.id !== agentId)
        if (state.current?.id === agentId) state.current = null
      }),
    reset: () =>
      set((state) => {
        state.agents = []
        state.isLoading = false
        state.current = null
      }),
  })),
)

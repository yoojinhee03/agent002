import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AgentTeam } from '@agent-studio/shared'

interface TeamState {
  teams: AgentTeam[]
  isLoading: boolean
  current: AgentTeam | null

  setTeams: (teams: AgentTeam[]) => void
  setCurrent: (team: AgentTeam | null) => void
  setLoading: (loading: boolean) => void
  addTeam: (team: AgentTeam) => void
  updateTeam: (teamId: string, data: Partial<AgentTeam>) => void
  removeTeam: (teamId: string) => void
  reset: () => void
}

export const useTeamStore = create<TeamState>()(
  immer((set) => ({
    teams: [],
    isLoading: false,
    current: null,

    setTeams: (teams) =>
      set((state) => {
        state.teams = teams
      }),
    setCurrent: (team) =>
      set((state) => {
        state.current = team
      }),
    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading
      }),
    addTeam: (team) =>
      set((state) => {
        state.teams.unshift(team)
      }),
    updateTeam: (teamId, data) =>
      set((state) => {
        const idx = state.teams.findIndex((t) => t.id === teamId)
        if (idx >= 0) Object.assign(state.teams[idx], data)
        if (state.current?.id === teamId) Object.assign(state.current, data)
      }),
    removeTeam: (teamId) =>
      set((state) => {
        state.teams = state.teams.filter((t) => t.id !== teamId)
        if (state.current?.id === teamId) state.current = null
      }),
    reset: () =>
      set((state) => {
        state.teams = []
        state.isLoading = false
        state.current = null
      }),
  })),
)

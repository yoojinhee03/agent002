import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { HumanInteraction } from '@agent-studio/shared'

interface HitlState {
  pendingInteractions: HumanInteraction[]
  isLoading: boolean
  currentInteraction: HumanInteraction | null

  setPendingInteractions: (interactions: HumanInteraction[]) => void
  setLoading: (loading: boolean) => void
  setCurrent: (interaction: HumanInteraction | null) => void
  addInteraction: (interaction: HumanInteraction) => void
  removeInteraction: (interactionId: string) => void
  reset: () => void
}

export const useHitlStore = create<HitlState>()(
  immer((set) => ({
    pendingInteractions: [],
    isLoading: false,
    currentInteraction: null,

    setPendingInteractions: (interactions) =>
      set((state) => {
        state.pendingInteractions = interactions
      }),
    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading
      }),
    setCurrent: (interaction) =>
      set((state) => {
        state.currentInteraction = interaction
      }),
    addInteraction: (interaction) =>
      set((state) => {
        state.pendingInteractions.unshift(interaction)
      }),
    removeInteraction: (interactionId) =>
      set((state) => {
        state.pendingInteractions = state.pendingInteractions.filter((i) => i.id !== interactionId)
        if (state.currentInteraction?.id === interactionId) state.currentInteraction = null
      }),
    reset: () =>
      set((state) => {
        state.pendingInteractions = []
        state.isLoading = false
        state.currentInteraction = null
      }),
  })),
)

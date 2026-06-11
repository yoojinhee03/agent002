import { create } from "zustand"
import { immer } from "zustand/middleware/immer"

interface UIState {
  sidebarCollapsed: boolean
  rightPanelTab: "playground" | "versions"
  toggleSidebar: () => void
  setRightPanelTab: (tab: "playground" | "versions") => void
}

export const useUIStore = create<UIState>()(
  immer((set) => ({
    sidebarCollapsed: false,
    rightPanelTab: "playground",

    toggleSidebar: () => {
      set((state) => {
        state.sidebarCollapsed = !state.sidebarCollapsed
      })
    },

    setRightPanelTab: (tab) => {
      set((state) => {
        state.rightPanelTab = tab
      })
    },
  }))
)

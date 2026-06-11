import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Tool } from '@agent-studio/shared'

interface ToolState {
  tools: Tool[]
  isLoading: boolean
  builtinDisplayNames: Record<string, string>
  builtinLabels: Record<string, Record<string, string>>
  setTools: (tools: Tool[]) => void
  addTool: (tool: Tool) => void
  updateTool: (toolId: string, data: Partial<Tool>) => void
  removeTool: (toolId: string) => void
  setBuiltinDisplayNames: (map: Record<string, string>) => void
  setBuiltinLabels: (map: Record<string, Record<string, string>>) => void
}

export const useToolStore = create<ToolState>()(
  immer((set) => ({
    tools: [],
    isLoading: false,
    builtinDisplayNames: {},
    builtinLabels: {},

    setTools: (tools) =>
      set((state) => {
        state.tools = tools
      }),
    addTool: (tool) =>
      set((state) => {
        state.tools.push(tool)
      }),
    updateTool: (toolId, data) =>
      set((state) => {
        const idx = state.tools.findIndex((t) => t.id === toolId)
        if (idx >= 0) Object.assign(state.tools[idx], data)
      }),
    removeTool: (toolId) =>
      set((state) => {
        state.tools = state.tools.filter((t) => t.id !== toolId)
      }),
    setBuiltinDisplayNames: (map) =>
      set((state) => {
        state.builtinDisplayNames = map
      }),
    setBuiltinLabels: (map) =>
      set((state) => {
        state.builtinLabels = map
      }),
  })),
)

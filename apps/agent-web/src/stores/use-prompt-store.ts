import { create } from "zustand"

interface Prompt {
  id: string
  name: string
}

interface PromptStore {
  prompt: Prompt | null
  isDirty: boolean
  setPrompt: (prompt: Prompt | null) => void
  setIsDirty: (isDirty: boolean) => void
}

export const usePromptStore = create<PromptStore>((set) => ({
  prompt: null,
  isDirty: false,
  setPrompt: (prompt) => set({ prompt }),
  setIsDirty: (isDirty) => set({ isDirty }),
}))

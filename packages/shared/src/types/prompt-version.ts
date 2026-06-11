// ============================================================
// Prompt Version
// ============================================================

export interface FewShotExample {
  role: 'user' | 'assistant'
  content: string
}

export interface PromptVersion {
  id: string
  agentId: string
  version: number
  systemPrompt: string
  fewShotExamples: FewShotExample[]
  variables: string[]
  snapshot: string
  diff: string | null
  createdBy: string | null
  createdAt: string
}

export interface CreatePromptVersionRequest {
  systemPrompt: string
  fewShotExamples?: FewShotExample[]
  variables?: string[]
}

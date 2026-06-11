import type { PromptBlock, Variable, Hyperparameters, StructuredOutputConfig } from "./prompt"

export type EnvironmentTag = "dev" | "staging" | "prod"

export type LLMTestRole = "system" | "user" | "assistant"

export interface LLMTestMessage {
  id: string
  role: LLMTestRole
  content: string
  usePrompt: boolean
}

export interface LLMTestConfig {
  modelId: string
  temperature: number
  topP: number
  maxTokens: number
  frequencyPenalty: number
  presencePenalty: number
  topMessages: LLMTestMessage[]
  structuredOutput?: StructuredOutputConfig
  savedAt: string
}

export interface PromptSnapshot {
  blocks: PromptBlock[]
  variables: Variable[]
  modelId: string
  hyperparameters: Hyperparameters
  structuredOutput?: StructuredOutputConfig
}

export interface VersionDiff {
  blocksAdded: number
  blocksRemoved: number
  blocksModified: number
  variablesAdded: string[]
  variablesRemoved: string[]
  modelChanged: boolean
  structuredOutputChanged?: boolean
}

/* ─── Detailed Diff Types ─── */
export type BlockDiffStatus = "added" | "removed" | "modified" | "unchanged"

export interface LineDiff {
  type: "added" | "removed" | "unchanged"
  content: string
}

export interface BlockDiffEntry {
  status: BlockDiffStatus
  blockId: string
  blockType: "text" | "condition" | "loop"
  textDiff?: LineDiff[]
  prevBlock?: PromptBlock
  currBlock?: PromptBlock
}

export interface VariableDiffEntry {
  status: "added" | "removed" | "modified"
  name: string
  prevVariable?: Variable
  currVariable?: Variable
  changes?: string[]
}

export interface ModelDiffResult {
  modelChanged: boolean
  prevModelId?: string
  currModelId?: string
  hyperparamChanges: { param: string; prev: number; curr: number }[]
}

export interface StructuredOutputDiffResult {
  changed: boolean
  enabledChanged: boolean
  prevEnabled?: boolean
  currEnabled?: boolean
  schemaNameChanged: boolean
  prevSchemaName?: string
  currSchemaName?: string
  schemaChanged: boolean
  formatChanged: boolean
  prevFormat?: string
  currFormat?: string
  strictChanged: boolean
  prevStrict?: boolean
  currStrict?: boolean
}

export interface DetailedSnapshotDiff {
  blocks: BlockDiffEntry[]
  variables: VariableDiffEntry[]
  model: ModelDiffResult
  structuredOutput: StructuredOutputDiffResult
  summary: { added: number; removed: number; modified: number; unchanged: number }
}

export interface Version {
  id: string
  promptId: string
  number: number               // 자동 증분 (1, 2, 3...)
  label?: string               // 사용자 라벨 (optional)
  message: string              // 변경 메시지
  snapshot: PromptSnapshot     // 불변 스냅샷
  tags: EnvironmentTag[]       // 환경 태그
  diff?: VersionDiff           // 이전 버전 대비 변경사항
  restoredFrom?: number        // 복원 출처 version number (e.g. "v5에서 복원됨")
  testConfig?: LLMTestConfig   // LLM 테스트 설정 (버전 변경 없이 저장)
  deployedEnvironments?: string[] // 실제 배포된 환경 (Deployment 테이블 기반)
  createdBy: string
  createdAt: string
}

export interface TextBlock {
  id: string
  type: "text"
  content: string
}

export interface ConditionBranch {
  type: "if" | "else_if" | "else"
  condition: {
    variable: string
    operator: string
    value: string
  }
  blocks: PromptBlock[]
}

export interface ElseBranch {
  type: "else"
  blocks: PromptBlock[]
}

export interface ConditionBlock {
  id: string
  type: "condition"
  branches: (ConditionBranch | ElseBranch)[]
}

export interface LoopBlock {
  id: string
  type: "loop"
  variable: string
  itemAlias: string
  blocks: PromptBlock[]
}

export type PromptBlock = TextBlock | ConditionBlock | LoopBlock

export type VariableMap = Record<string, any>

export type VariableType = "string" | "number" | "boolean" | "array" | "object"

export interface Variable {
  id: string
  name: string
  type: VariableType
  defaultValue: string
  description?: string
  color: string
  bgColor: string
  required: boolean
}

export interface Prompt {
  id: string
  projectId: string
  name: string
  slug: string
  description: string
  blocks: PromptBlock[]
  variables: Variable[]
  modelId: string
  hyperparameters: Hyperparameters
  structuredOutput?: StructuredOutputConfig
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

export interface Hyperparameters {
  temperature: number
  maxTokens: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stopSequences: string[]
}

/* ─── Structured Output ─── */

export type StructuredOutputFormat =
  | "json_schema"       // OpenAI: response_format.json_schema
  | "tool_use"          // Anthropic: tool definition
  | "response_schema"   // Google: response_schema + response_mime_type
  | "custom"            // Local models: user-defined parameter

export interface StructuredOutputConfig {
  enabled: boolean
  schemaName: string                    // Schema name (OpenAI name, Anthropic tool name)
  schema: string                        // JSON Schema string
  strict?: boolean                      // OpenAI strict mode (default true)
  format?: StructuredOutputFormat       // Auto-detected from provider, user-selectable for local
  customParameterName?: string          // Local model: parameter name (e.g. "format", "grammar")
  customParameterTemplate?: string      // Local model: value template (e.g. BNF grammar)
}

// Prompt 본체에 추가할 필드들
export interface PromptVersionInfo {
  currentVersionNumber?: number
  publishedVersions: {
    dev?: string    // version id
    staging?: string
    prod?: string
  }
  forkedFrom?: {
    promptId: string
    versionId: string
  }
}

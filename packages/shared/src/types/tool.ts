// ============================================================
// Tool (에이전트 도구)
// ============================================================

export type ToolType = 'http' | 'code' | 'search' | 'custom'

export type ToolGroupType = 'rest' | 'code'

export interface ToolGroupAuthConfig {
  type: 'none' | 'bearer' | 'api_key'
  value?: string
  headerName?: string
}

export interface ToolGroup {
  id: string
  projectId: string
  name: string
  description: string
  type: ToolGroupType
  enabled: boolean
  specUrl?: string | null
  authConfig?: ToolGroupAuthConfig | null
  tools?: Tool[]
  createdAt: string
  updatedAt: string
}

export interface HttpToolConfig {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  auth?: {
    type: 'none' | 'bearer' | 'api_key' | 'basic'
    value?: string
    headerName?: string   // api_key 타입일 때 헤더명
  }
  bodyTemplate?: string   // JSON 템플릿 ({{variable}} 지원)
}

export interface CodeToolConfig {
  code: string            // 코드 내용
  language?: 'javascript' | 'python' // 언어 선택 (기본: javascript)
  // (input: Record<string, unknown>) => Promise<unknown>
  timeout?: number        // ms, 기본 5000
}

export interface SearchToolConfig {
  provider: 'serper' | 'brave'
  apiKey?: string         // 저장된 키 참조 or 직접 입력
  maxResults?: number
}

export type ToolConfig = HttpToolConfig | CodeToolConfig | SearchToolConfig | Record<string, unknown>

export interface Tool {
  id: string
  projectId: string
  groupId?: string
  name: string
  slug: string
  description: string
  type: ToolType
  config: ToolConfig
  inputSchema: Record<string, unknown>   // JSON Schema
  outputSchema: Record<string, unknown>  // JSON Schema
  labels?: Record<string, string> | null // HITL 카드 라벨 사전 — dot-path → 한국어
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ============================================================
// Built-in Tools (플랫폼 내장 도구)
// ============================================================

export interface BuiltinTool {
  id: string
  name: string
  description: string
  groupId: string
  enabled: boolean
  requiresConfig: boolean
  configured?: boolean
  labels?: Record<string, string> // HITL 카드 라벨 사전 — dot-path → 한국어
  inputSchema?: Record<string, unknown> // JSON Schema — HITL 카드 빌더 자동 폼 생성용
}

export interface BuiltinToolGroup {
  id: string
  name: string
  description: string
  tools: BuiltinTool[]
}

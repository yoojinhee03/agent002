export type McpTransport = 'stdio' | 'sse' | 'streamable_http'
export type McpStatus = 'disconnected' | 'connecting' | 'connected' | 'error'
export type McpCredentialMode = 'shared' | 'per_user'

export interface RequiredUserField {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  required?: boolean
}

export interface McpServerConfig {
  // stdio transport
  command?: string
  args?: string[]
  env?: Record<string, string>
  // sse / streamable_http transport
  url?: string
  headers?: Record<string, string>
  // UI 카탈로그(McpCatalogEntry.id) 식별자 — Built-in Tools 패널에서
  // "Tavily / Context7" 같은 카탈로그 카드의 활성 상태 토글 시 mcp_servers row 와
  // 카드를 매칭하기 위해 저장. 백엔드는 단순 JSON 통과 필드로만 사용한다.
  catalogId?: string
  /**
   * env 의 키 중 사용자별 자격증명(mcp:<serverId>) 으로 교체 가능한 secret 키 목록.
   * 카탈로그 envSchema 의 secret=true 필드에서 자동 추출되어 등록 시 저장된다.
   * runner `_load_mcp_tools` 는 사용자 자격증명 override 시 이 목록만 교체하고,
   * SLACK_MCP_ADD_MESSAGE_TOOL 같은 non-secret defaultEnv 는 보존한다.
   * 빈 배열/누락이면 runner 가 secret 패턴 휴리스틱으로 fallback.
   */
  secretKeys?: string[]
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpServer {
  id: string
  projectId: string
  name: string
  description?: string
  transport: McpTransport
  config: McpServerConfig
  status: McpStatus
  toolCount?: number
  tools?: McpTool[]
  credentialMode: McpCredentialMode
  requiredUserFields?: RequiredUserField[]
  exposedTools: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateMcpServerRequest {
  name: string
  description?: string
  transport: McpTransport
  config: McpServerConfig
  credentialMode?: McpCredentialMode
  requiredUserFields?: RequiredUserField[]
  exposedTools?: string[]
}

export interface UpdateMcpServerRequest {
  name?: string
  description?: string
  transport?: McpTransport
  config?: McpServerConfig
  credentialMode?: McpCredentialMode
  requiredUserFields?: RequiredUserField[]
  exposedTools?: string[]
}

export interface MissingCredentialField {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  placeholder?: string
}

export interface MissingCredentialItem {
  serverId: string
  serverName: string
  fields: MissingCredentialField[]
}

export interface MissingMcpCredentialError {
  error: 'MissingMcpCredential'
  missingCredentials: MissingCredentialItem[]
}

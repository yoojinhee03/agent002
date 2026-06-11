import type { Project, Member, Role, ProjectActivityLog } from '@/types/project'
import type { ApiKey, Endpoint } from '@/types/endpoint'
import type { DeploymentEnvironment, Deployment, DeploymentLog } from '@/types/deployment'
import type { DailyMetric, LogEntry, MetricSummary } from '@/types/monitoring'
import type { Provider, Model, EnabledModel, DiscoveredModel } from '@/types/provider'
import type { User } from '@/types/user'
import type { DashboardOverview } from '@/types/dashboard'
import type { RunSource } from '@agent-studio/shared'
import type { GlobalUsageDataV2, ProjectUsageDataV2 } from '@/types/usage'
import type {
  Workflow, WorkflowVersion, Tool, WorkflowRun, StepTrace,
  Agent, CreateAgentRequest, UpdateAgentRequest,
  AgentTeam, CreateTeamRequest, UpdateTeamRequest, AddTeamAgentRequest, AddSubTeamRequest,
  Thread, CreateThreadRequest, ThreadStatus,
  HumanInteraction,
  PromptVersion,
  McpServer, CreateMcpServerRequest, UpdateMcpServerRequest, McpTool, McpCredentialMode,
  BuiltinToolGroup, ToolGroup,
  AgentSchedule,
  AgentDeployment, AgentDeploymentApiKey, IssuedAgentDeploymentApiKey,
  CreateAgentDeploymentRequest, IssueDeploymentApiKeyRequest,
  ClientAgentCard, ClientAgentDetail,
  UserCredential, CredentialKind, CreateUserCredentialRequest, UpdateUserCredentialRequest, VerifyUserCredentialResponse,
} from '@agent-studio/shared'

// ============================================================
// Slack Integration Types
// ============================================================
export type SlackRoutingMode = 'channel' | 'dm' | 'both'

export interface SlackInstallationView {
  id?: string
  installed: boolean
  workspaceTeamId?: string
  workspaceName?: string
  botUserId?: string
  enabled?: boolean
  installedAt?: string
}

export interface SlackChannelAgent {
  id: string
  projectId: string
  workspaceTeamId: string
  channelId: string
  channelName?: string
  agentId: string
  mode: SlackRoutingMode
  enabled: boolean
  createdAt: string
  agent: {
    id: string
    name: string
  }
}

// ============================================================
// NAVER WORKS Integration Types
// ============================================================
export interface NaverWorksInstallationView {
  id: string
  projectId: string
  installedByUserId: string | null
  agentId: string
  botId: string
  botName: string | null
  clientId: string
  serviceAccount: string
  scope: string
  enabled: boolean
  installedAt: string
  updatedAt: string
}

export interface NaverWorksUpsertBody {
  agentId: string
  botId: string
  botName?: string
  clientId: string
  clientSecret: string
  serviceAccount: string
  privateKey: string
  botSecret: string
  scope?: string
  enabled?: boolean
}

export interface SkillFile {
  id: string
  skillId: string
  path: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface CardDefinition {
  id: string
  cardId: string
  version: number
  tenantId: string | null
  name: string
  category: 'hitl'
  /** 디자인 레이아웃 id — hitl-layouts.tsx 의 HITL_LAYOUTS 항목. */
  layout: string
  /** 매칭할 도구 이름 배열. 빈 배열 = generic fallback. */
  targetTools: string[]
  /** 도구 인자별 라벨/위젯/도움말 메타. null = typeof introspection. */
  argSchema: unknown | null
  /** Adaptive Card payload (adaptivecards-templating 의 ${} 바인딩 사용 가능). */
  payload: Record<string, unknown>
  /** 빌더 미리보기 / 런타임 fallback 용 샘플 데이터. */
  sampleData: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

/**
 * 카드 액션 핸들러 — Adaptive Card 의 Action.Submit data.__handler 로 매핑된다.
 * (actionBridge 가 submit data 를 이 타입으로 재구성해 dispatchHandler 에 전달)
 */
export type CardHandler =
  | { type: 'dismiss' }
  | { type: 'send_message'; message: string }
  | { type: 'tool_call'; tool: string; args?: Record<string, unknown> }
  | { type: 'navigate'; href: string }
  | { type: 'external_link'; url: string }
  | {
      type: 'hitl_respond'
      interactionId: string
      /**
       * deepagents 공식 4종 + 'cancel' (UI 전용 취소 — recursion 중단 등).
       *   approve  : 도구 실행 그대로 승인
       *   reject   : 도구 실행 거부
       *   edit     : 도구 인자/이름 수정 후 실행 ({editedAction:{name,args}} 필수)
       *   respond  : ask_user 류 응답 (value 필수)
       *   cancel   : recursion 등 UI-only 중단 (백엔드는 reject 와 동등 처리)
       */
      decision: 'approve' | 'reject' | 'edit' | 'respond' | 'cancel'
      value?: unknown
      args?: Record<string, unknown>
      /** edit 시 사용자가 입력한 자연어 수정 의도 (선택). */
      editPrompt?: string
      /** edit 시 적용할 도구 호출 (직접 수정 또는 preview_edit 결과). */
      editedAction?: { name: string; args: Record<string, unknown> }
      /** edit 시 부모 SubAgent(task) description 재작성 (선택). */
      taskDescriptionUpdate?: string
    }
  | {
      /**
       * NL 수정 미리보기 — `apiClient.hitl.previewEdit` 호출 후 ClientChatView 가
       * pseudo HITL 카드를 push. 호출자는 `onPreviewEdit` 콜백을 dispatchHandler 옵션으로
       * 전달해야 한다.
       */
      type: 'preview_edit'
      interactionId: string
      /** 자연어 수정 의도 — `{{input}}` 토큰으로 textarea 값을 매핑한다. */
      editPrompt: string
    }
  | {
      /**
       * 카드 formState 의 특정 필드를 갱신한다 (외부 API 호출 없음, 클라이언트 전용).
       * editMode 토글, 임시 UI 상태 전환 등에 사용.
       */
      type: 'set_field'
      field: string
      value: unknown
    }

export interface Skill {
  id: string
  userId: string
  name: string
  description: string
  instructions: string
  allowedTools: string[]
  enabled: boolean
  files: SkillFile[]
  createdAt: string
  updatedAt: string
}

export interface ToolTestResult {
  success: boolean
  statusCode?: number
  output: unknown
  latency: number
  error?: string
  curlCommand?: string
  logs?: string
}

export interface ThreadRunStep {
  stepId: string | null
  parentStepId: string | null
  depth: number
  name: string
  stepType: string
  status: string
  latencyMs: number | null
  startedAt: string | null
  completedAt: string | null
}

export interface ThreadRun {
  runId: string
  status: string
  startedAt: string | null
  completedAt: string | null
  latencyMs: number | null
  steps: ThreadRunStep[]
}

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface ThreadAttachment {
  id: string
  threadId: string
  originalName: string
  mimeType: string
  size: number
  uploaderId?: string | null
  createdAt: string
}

export type AuthScope = 'admin' | 'client'

// admin 과 client 는 같은 백엔드 JWT 를 쓰지만 같은 브라우저에서 다른 사용자로 로그인할 수
// 있도록 토큰 쌍을 분리한다. 현재 활성 scope 는 path 기반(`/client/...` ⇒ 'client').
const LS_KEYS: Record<AuthScope, { access: string; refresh: string }> = {
  admin: { access: 'admin_access_token', refresh: 'admin_refresh_token' },
  client: { access: 'client_access_token', refresh: 'client_refresh_token' },
}

function getActiveScope(): AuthScope {
  if (typeof window === 'undefined') return 'admin'
  return window.location.pathname.startsWith('/client') ? 'client' : 'admin'
}

function loginPathFor(scope: AuthScope): string {
  return scope === 'client' ? '/client/login' : '/login'
}

class ApiClient {
  private baseUrl: string
  // scope 별 in-flight refresh promise. 백엔드의 refresh token 은 single-use 라
  // 동시에 여러 요청이 401 받아 각자 refresh 를 호출하면 첫 호출만 성공하고
  // 나머지는 stale token 으로 실패 → 의도치 않은 로그아웃이 발생한다.
  // 같은 scope 에서 진행 중인 refresh 가 있으면 그 Promise 를 재사용한다.
  private refreshInFlight: Partial<Record<AuthScope, Promise<boolean>>> = {}

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL ?? ''
  }

  private readToken(scope: AuthScope, kind: 'access' | 'refresh'): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(LS_KEYS[scope][kind])
  }

  setTokens(access: string, refresh: string, scope: AuthScope = getActiveScope()) {
    if (typeof window === 'undefined') return
    localStorage.setItem(LS_KEYS[scope].access, access)
    localStorage.setItem(LS_KEYS[scope].refresh, refresh)
  }

  clearTokens(scope: AuthScope = getActiveScope()) {
    if (typeof window === 'undefined') return
    localStorage.removeItem(LS_KEYS[scope].access)
    localStorage.removeItem(LS_KEYS[scope].refresh)
  }

  getAccessToken(scope: AuthScope = getActiveScope()) {
    return this.readToken(scope, 'access')
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const scope = getActiveScope()
    const accessToken = this.readToken(scope, 'access')
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...(options?.headers || {}),
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    })

    const isAuthPath = path.includes('/api/auth/login') || path.includes('/api/auth/refresh')
    const refreshToken = this.readToken(scope, 'refresh')

    if (res.status === 401 && refreshToken && !isAuthPath) {
      const refreshed = await this.tryRefresh(scope)
      if (refreshed) {
        const retryHeaders: HeadersInit = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.readToken(scope, 'access')}`,
          ...(options?.headers || {}),
        }
        const retry = await fetch(`${this.baseUrl}${path}`, { ...options, headers: retryHeaders })
        if (retry.ok) return retry.json()
      }
      this.clearTokens(scope)
      if (typeof window !== 'undefined') {
        window.location.href = loginPathFor(scope)
      }
      throw new ApiError(401, 'Session expired')
    }

    if (!res.ok) {
      let message = 'Request failed'
      let body: unknown
      try {
        body = await res.json()
        const b = body as Record<string, unknown>
        message = (typeof b.message === 'string' ? b.message : undefined) || message
      } catch {}
      throw new ApiError(res.status, message, body)
    }

    const text = await res.text()
    return text ? JSON.parse(text) : ({} as T)
  }

  private async tryRefresh(scope: AuthScope = getActiveScope()): Promise<boolean> {
    const existing = this.refreshInFlight[scope]
    if (existing) return existing

    const promise = (async (): Promise<boolean> => {
      const refreshToken = this.readToken(scope, 'refresh')
      if (!refreshToken) return false
      try {
        const res = await fetch(`${this.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (!res.ok) return false
        const data = await res.json()
        this.setTokens(data.accessToken, data.refreshToken, scope)
        return true
      } catch {
        return false
      }
    })()

    this.refreshInFlight[scope] = promise
    try {
      return await promise
    } finally {
      delete this.refreshInFlight[scope]
    }
  }

  private get = <T>(path: string) => this.request<T>(path)
  private post = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
  private patch = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined })
  private put = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined })
  private del = <T>(path: string) => this.request<T>(path, { method: 'DELETE' })

  // ============================================================
  // Auth
  // ============================================================
  auth = {
    login: (email: string, password: string) =>
      this.post<{ user: User; accessToken: string; refreshToken: string }>('/api/auth/login', { email, password }).then(
        (res) => {
          this.setTokens(res.accessToken, res.refreshToken)
          return res.user
        },
      ),
    logout: () => this.post<void>('/api/auth/logout').then(() => this.clearTokens()),
    forgotPassword: (email: string) => this.post<{ message: string }>('/api/auth/forgot-password', { email }).then(() => true),
    resetPassword: (email: string, newPassword: string) =>
      this.post<{ message: string }>('/api/auth/reset-password', { email, token: 'stub', newPassword }).then(() => true),
  }

  // ============================================================
  // Users
  // ============================================================
  users = {
    list: () => this.get<User[]>('/api/users'),
    getCurrentUser: () => this.get<User>('/api/users/me').catch(() => null),
    getById: (id: string) => this.get<User>('/api/users/' + id),
    search: (query: string) => this.get<User[]>('/api/users/search?q=' + encodeURIComponent(query)),
    invite: (data: { name: string; email: string }) => this.post<User>('/api/users/invite', data),
    registerDirect: (data: { name: string; email: string; password: string }) => this.post<User>('/api/users/register', data),
    activate: (id: string) => this.patch<{ success: boolean }>('/api/users/' + id + '/activate').then((r) => r.success),
    update: (id: string, data: { name?: string; avatarUrl?: string }) =>
      this.patch<{ success: boolean }>('/api/users/' + id, data).then((r) => r.success),
    changePassword: (id: string, newPassword: string) =>
      this.patch<{ success: boolean }>('/api/users/' + id + '/password', { newPassword }).then((r) => r.success),
    changeMyPassword: (currentPassword: string, newPassword: string) =>
      this.patch<{ success: boolean }>('/api/users/me/password', { currentPassword, newPassword }).then((r) => r.success),
    resendInvite: (id: string) => this.post<{ success: boolean }>('/api/users/' + id + '/resend-invite').then((r) => r.success),
    updateRole: (id: string, role: 'admin' | 'user') =>
      this.patch<{ success: boolean }>('/api/users/' + id + '/role', { role }).then((r) => r.success),
  }

  // ============================================================
  // Projects
  // ============================================================
  projects = {
    list: (membersOnly?: boolean) => {
      const params = new URLSearchParams()
      if (membersOnly) params.set('membersOnly', 'true')
      const qs = params.toString()
      return this.get<Project[]>('/api/projects' + (qs ? '?' + qs : ''))
    },
    getById: (id: string) => this.get<Project | undefined>('/api/projects/' + id).catch(() => undefined),
    create: (data: Partial<Project>) => this.post<Project>('/api/projects', data),
    update: (id: string, data: Partial<Project>) => this.patch<Project>('/api/projects/' + id, data),
    delete: (id: string) => this.del<{ success: boolean }>('/api/projects/' + id).then((r) => r.success),
    checkSlug: (slug: string, excludeId?: string) => {
      const params = new URLSearchParams({ slug })
      if (excludeId) params.set('excludeId', excludeId)
      return this.get<{ available: boolean }>('/api/projects/check-slug?' + params.toString())
    },
    inviteMember: (projectId: string, data: { name: string; email: string; avatarUrl?: string; role: string; message?: string; invitedBy: string }) =>
      this.post<Member>('/api/projects/' + projectId + '/members/invite', data),
    inviteMultiple: (projectId: string, usersData: { name: string; email: string }[], role: string, invitedBy: string, message?: string) =>
      this.post<Member[]>('/api/projects/' + projectId + '/members/invite-multiple', { users: usersData, role, invitedBy, message }),
    acceptInvite: (projectId: string, memberId: string) =>
      this.patch<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + '/accept').then((r) => r.success),
    declineInvite: (projectId: string, memberId: string) =>
      this.patch<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + '/decline').then((r) => r.success),
    cancelInvite: (projectId: string, memberId: string, cancelledBy: string) =>
      this.patch<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + '/cancel', { cancelledBy }).then((r) => r.success),
    resendInvite: (projectId: string, memberId: string, resentBy: string) =>
      this.post<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + '/resend', { resentBy }).then((r) => r.success),
    removeMember: (projectId: string, memberId: string, removedBy?: string) =>
      this.del<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + (removedBy ? '?removedBy=' + encodeURIComponent(removedBy) : '')).then((r) => r.success),
    updateMemberRole: (projectId: string, memberId: string, role: Role, changedBy?: string) =>
      this.patch<{ success: boolean }>('/api/projects/' + projectId + '/members/' + memberId + '/role', { role, changedBy }).then((r) => r.success),
    getActivityLogs: (projectId: string) =>
      this.get<ProjectActivityLog[]>('/api/projects/' + projectId + '/activity-logs'),
    getMyInvitations: (email: string) =>
      this.get<Array<{ project: Project; member: Member }>>('/api/projects/invitations/me'),
    toggleFavorite: (projectId: string) =>
      this.post<{ isFavorite: boolean }>('/api/projects/' + projectId + '/favorite'),
    checkExpiredInvites: (projectId: string) =>
      this.post<{ success: boolean }>('/api/projects/' + projectId + '/members/check-expired'),
    getBySlug: (slug: string) => this.get<Project | undefined>('/api/projects/by-slug/' + slug).catch(() => undefined),
    duplicate: (id: string, data: Partial<Project>) => this.post<Project>('/api/projects/' + id + '/duplicate', data),
  }

  // ============================================================
  // Providers
  // ============================================================
  providers = {
    list: () => this.get<Provider[]>('/api/providers'),
    configure: (id: string, apiKey: string) => this.post<Provider>('/api/providers/' + id + '/configure', { apiKey }),
    removeApiKey: (id: string) => this.del<{ success: boolean }>('/api/providers/' + id + '/api-key').then((r) => r.success),
    testConnection: (id: string) => this.post<{ success: boolean; message: string }>('/api/providers/' + id + '/test'),
    toggleModel: (providerId: string, modelId: string, enabled: boolean) =>
      this.patch<{ success: boolean }>('/api/providers/' + providerId + '/models/' + modelId + '/toggle', { enabled }).then((r) => r.success),
    getEnabledModels: () => this.get<EnabledModel[]>('/api/providers/models/enabled'),
    addCustomModel: (providerId: string, model: Omit<Model, 'providerId'>) =>
      this.post<Model>('/api/providers/' + providerId + '/models', model),
    deleteCustomModel: (providerId: string, modelId: string) =>
      this.del<{ success: boolean }>('/api/providers/' + providerId + '/models/' + modelId).then((r) => r.success),
    addLocalProvider: (name: string, endpoint: string) =>
      this.post<Provider>('/api/providers/local', { name, endpoint }),
    deleteLocalProvider: (id: string) =>
      this.del<{ success: boolean }>('/api/providers/' + id + '/local').then((r) => r.success),
    configureEndpoint: (id: string, endpoint: string) =>
      this.patch<{ success: boolean }>('/api/providers/' + id + '/endpoint', { endpoint }).then((r) => r.success),
    discoverLocalModels: (id: string) => this.post<DiscoveredModel[]>('/api/providers/' + id + '/discover-models'),
  }

  // ============================================================
  // Environments
  // ============================================================
  environments = {
    list: (projectId: string) => this.get<DeploymentEnvironment[]>('/api/projects/' + projectId + '/environments'),
    create: (data: Omit<DeploymentEnvironment, 'id' | 'createdAt'>) => {
      const { projectId, ...body } = data
      return this.post<DeploymentEnvironment>('/api/projects/' + projectId + '/environments', body)
    },
    update: (id: string, data: Partial<Pick<DeploymentEnvironment, 'name' | 'slug' | 'color' | 'order' | 'approvalRequired'>>) =>
      this.patch<DeploymentEnvironment>('/api/environments/' + id, data),
    reorder: (projectId: string, environmentIds: string[]) =>
      this.patch<{ success: boolean }>('/api/projects/' + projectId + '/environments/reorder', { environmentIds }).then((r) => r.success),
    delete: (id: string) => this.del<{ success: boolean }>('/api/environments/' + id).then((r) => r.success),
  }

  // ============================================================
  // Deployments
  // ============================================================
  deployments = {
    list: (projectId: string) => this.get<Deployment[]>('/api/projects/' + projectId + '/deployments'),
    deploy: (data: Record<string, unknown>) => this.post<{ deployment: Deployment; endpoint: Endpoint }>('/api/deployments', data),
    undeploy: (deploymentId: string) => this.del<{ success: boolean }>('/api/deployments/' + deploymentId).then((r) => r.success),
    getLogs: (projectId: string) => this.get<DeploymentLog[]>('/api/projects/' + projectId + '/deployments/logs'),
  }

  // ============================================================
  // Agent Deployments (Phase 9 — 외부 채팅용)
  // ============================================================
  agentDeployments = {
    listByAgent: (agentId: string) =>
      this.get<AgentDeployment[]>('/api/agents/' + agentId + '/deployments'),
    deploy: (agentId: string, data: CreateAgentDeploymentRequest) =>
      this.post<AgentDeployment>('/api/agents/' + agentId + '/deployments', data as unknown as Record<string, unknown>),
    get: (deploymentId: string) =>
      this.get<AgentDeployment>('/api/agent-deployments/' + deploymentId),
    undeploy: (deploymentId: string) =>
      this.post<AgentDeployment>('/api/agent-deployments/' + deploymentId + '/undeploy'),
    listApiKeys: (deploymentId: string) =>
      this.get<AgentDeploymentApiKey[]>('/api/agent-deployments/' + deploymentId + '/api-keys'),
    issueApiKey: (deploymentId: string, data: IssueDeploymentApiKeyRequest) =>
      this.post<IssuedAgentDeploymentApiKey>(
        '/api/agent-deployments/' + deploymentId + '/api-keys',
        data as unknown as Record<string, unknown>,
      ),
    revokeApiKey: (keyId: string) =>
      this.del<AgentDeploymentApiKey>('/api/api-keys/' + keyId),
  }

  // ============================================================
  // Client Agents (Phase 10 — 사용자용 디스커버리)
  // ============================================================
  clientAgents = {
    list: () => this.get<ClientAgentCard[]>('/api/client/agents'),
    getBySlug: (slug: string) =>
      this.get<ClientAgentDetail>('/api/client/agents/' + encodeURIComponent(slug)),
  }

  // ============================================================
  // Me — 사용자 자격증명 (Phase 10)
  // ============================================================
  meCredentials = {
    list: (kind?: CredentialKind) => {
      const qs = kind ? '?kind=' + kind : ''
      return this.get<UserCredential[]>('/api/me/credentials' + qs)
    },
    create: (data: CreateUserCredentialRequest) =>
      this.post<UserCredential>('/api/me/credentials', data as unknown as Record<string, unknown>),
    update: (id: string, data: UpdateUserCredentialRequest) =>
      this.patch<UserCredential>('/api/me/credentials/' + id, data as unknown as Record<string, unknown>),
    delete: (id: string) => this.del<{ id: string }>('/api/me/credentials/' + id),
    test: (id: string) => this.post<VerifyUserCredentialResponse>('/api/me/credentials/' + id + '/test'),

    gmail: {
      getOAuthApp: () =>
        this.get<{
          configured: boolean
          connected: boolean
          clientId: string
          redirectUri: string
          scopes: string[]
          hasClientSecret: boolean
          connectedAt: string | null
          connectedEmail: string | null
          status: 'active' | 'invalid' | 'expired' | null
        }>('/api/me/credentials/gmail/oauth-app'),
      saveOAuthApp: (data: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] }) =>
        this.put<{ success: boolean; requiresReconnect?: boolean }>('/api/me/credentials/gmail/oauth-app', data),
      clearOAuthApp: () =>
        this.del<{ success: boolean }>('/api/me/credentials/gmail/oauth-app'),
      getAuthUrl: () => this.get<{ url: string }>('/api/me/credentials/gmail/auth-url'),
      exchangeCode: (data: { code: string; state: string }) =>
        this.post<{ connected: boolean; connectedEmail?: string | null }>('/api/me/credentials/gmail/callback', data),
      disconnect: () => this.post<{ success: boolean }>('/api/me/credentials/gmail/disconnect'),
    },
  }

  meProviders = {
    catalog: () =>
      this.get<Array<{
        id: string
        slug: string
        name: string
        type: string
        iconUrl: string | null
        owned: boolean
        userCredentials: Array<{
          id: string
          label: string
          status: 'active' | 'invalid' | 'expired'
          lastVerifiedAt: string | null
        }>
      }>>('/api/me/providers'),
    add: (data: { providerId: string; value: string; label?: string; metadata?: Record<string, unknown> }) =>
      this.post<{
        id: string
        provider: { id: string; slug: string; name: string }
        kind: 'provider'
        targetId: string
        label: string
        status: 'active' | 'invalid' | 'expired'
        createdAt: string
      }>('/api/me/providers', data),
  }

  meTools = {
    catalog: () =>
      this.get<Array<{
        targetId: string
        label: string
        description: string
        authType: 'api_key' | 'oauth'
        triggers: string[]
        owned: boolean
        userCredentials: Array<{
          id: string
          label: string
          status: 'active' | 'invalid' | 'expired'
          lastVerifiedAt: string | null
        }>
      }>>('/api/me/tools'),
  }

  meMcp = {
    catalog: () =>
      this.get<Array<{
        targetId: string
        label: string
        description: string | null
        transport: string
        envKeys: string[]
        credentialMode: 'shared' | 'per_user'
        requiredUserFields?: Array<{
          key: string
          label: string
          secret?: boolean
          placeholder?: string
          required?: boolean
        }>
        owned: boolean
        userCredentials: Array<{
          id: string
          label: string
          status: 'active' | 'invalid' | 'expired'
          lastVerifiedAt: string | null
        }>
      }>>('/api/me/mcp'),
    saveCredential: (serverId: string, fields: Record<string, string>) =>
      this.post<{ success: boolean }>('/api/me/mcp/credentials', { serverId, fields }),
  }

  // ============================================================
  // Endpoints & API Keys
  // ============================================================
  endpoints = {
    list: (projectId: string) => this.get<Endpoint[]>('/api/projects/' + projectId + '/endpoints'),
    getApiKeys: (projectId: string) => this.get<ApiKey[]>('/api/projects/' + projectId + '/api-keys'),
    createApiKey: (data: Omit<ApiKey, 'id' | 'key' | 'createdAt' | 'lastUsedAt' | 'status'>) => {
      const { projectId, enabled, validFrom, expiresAt, ...rest } = data
      const body: Record<string, unknown> = { ...rest }
      if (validFrom != null) body.validFrom = validFrom
      if (expiresAt != null) body.expiresAt = expiresAt
      return this.post<ApiKey>('/api/projects/' + projectId + '/api-keys', body)
    },
    revokeApiKey: (id: string) => this.patch<{ success: boolean }>('/api/api-keys/' + id + '/revoke').then((r) => r.success),
    toggleApiKey: (id: string) => this.patch<ApiKey>('/api/api-keys/' + id + '/toggle'),
    test: (id: string, variables: Record<string, unknown>) =>
      this.post<unknown>('/api/endpoints/' + id + '/test', { variables }),
  }

  // ============================================================
  // Dashboard
  // ============================================================
  dashboard = {
    getOverview: (projectId: string, source: RunSource = 'all') =>
      this.get<DashboardOverview>(
        '/api/projects/' + projectId + '/dashboard?source=' + source,
      ),
  }

  // ============================================================
  // Usage
  // ============================================================
  usage = {
    getGlobalUsage: (from: string, to: string, source: RunSource = 'all') =>
      this.get<GlobalUsageDataV2>('/api/usage/global?from=' + from + '&to=' + to + '&source=' + source),
    getProjectUsage: (projectId: string, from: string, to: string, source: RunSource = 'all') =>
      this.get<ProjectUsageDataV2>('/api/usage/projects/' + projectId + '?from=' + from + '&to=' + to + '&source=' + source),
    getExecutionLogs: (
      filters: { workflowId?: string; endpointId?: string; apiKeyId?: string; source?: RunSource },
      from: string, to: string, page: number, pageSize: number,
    ) => {
      const params = new URLSearchParams({ from, to, page: String(page), pageSize: String(pageSize) })
      if (filters.workflowId) params.set('workflowId', filters.workflowId)
      if (filters.endpointId) params.set('endpointId', filters.endpointId)
      if (filters.apiKeyId) params.set('apiKeyId', filters.apiKeyId)
      if (filters.source) params.set('source', filters.source)
      return this.get<{ logs: LogEntry[]; total: number }>('/api/usage/logs?' + params)
    },
  }

  // ============================================================
  // Monitoring
  // ============================================================
  monitoring = {
    getSummary: (source: RunSource = 'all') =>
      this.get<MetricSummary>('/api/monitoring/summary?source=' + source),
    getDailyMetrics: (source: RunSource = 'all') =>
      this.get<DailyMetric[]>('/api/monitoring/daily?source=' + source),
    getLogs: (options?: { workflowId?: string; status?: string; limit?: number; source?: RunSource }) => {
      const params = new URLSearchParams()
      if (options?.workflowId) params.set('workflowId', options.workflowId)
      if (options?.status) params.set('status', options.status)
      if (options?.limit) params.set('limit', String(options.limit))
      if (options?.source) params.set('source', options.source)
      const qs = params.toString()
      return this.get<LogEntry[]>('/api/monitoring/logs' + (qs ? '?' + qs : ''))
    },
  }

  // ============================================================
  // Workflows
  // ============================================================
  workflows = {
    list: (projectId: string) => this.get<Workflow[]>('/api/projects/' + projectId + '/workflows'),
    getById: (id: string) => this.get<Workflow>('/api/workflows/' + id),
    create: (projectId: string, data: Partial<Workflow>) =>
      this.post<Workflow>('/api/projects/' + projectId + '/workflows', data),
    update: (id: string, data: Partial<Workflow>) =>
      this.patch<Workflow>('/api/workflows/' + id, data),
    delete: (id: string) =>
      this.del<{ success: boolean }>('/api/workflows/' + id).then((r) => r.success),
    checkSlug: (projectId: string, slug: string, excludeId?: string) => {
      const params = new URLSearchParams({ slug })
      if (excludeId) params.set('excludeId', excludeId)
      return this.get<{ available: boolean }>('/api/projects/' + projectId + '/workflows/check-slug?' + params).then((r) => r.available)
    },
    listVersions: (workflowId: string) =>
      this.get<WorkflowVersion[]>('/api/workflows/' + workflowId + '/versions'),
    createVersion: (workflowId: string, data: { message: string; label?: string; snapshot: unknown; createdBy: string }) =>
      this.post<WorkflowVersion>('/api/workflows/' + workflowId + '/versions', data),
    rollback: (workflowId: string, versionId: string) =>
      this.post<WorkflowVersion>('/api/workflows/' + workflowId + '/versions/' + versionId + '/rollback'),
  }

  versionSnapshots = {
    getByVersionId: (versionId: string) =>
      this.get<WorkflowVersion>('/api/workflow-versions/' + versionId),
  }

  // ============================================================
  // Tools
  // ============================================================
  tools = {
    list: (projectId: string) => this.get<Tool[]>('/api/projects/' + projectId + '/tools'),
    getById: (id: string) => this.get<Tool>('/api/tools/' + id),
    create: (projectId: string, data: Partial<Tool>) =>
      this.post<Tool>('/api/projects/' + projectId + '/tools', data),
    update: (id: string, data: Partial<Tool>) => this.patch<Tool>('/api/tools/' + id, data),
    toggle: (id: string) => this.patch<Tool>('/api/tools/' + id + '/toggle'),
    delete: (id: string) => this.del<{ success: boolean }>('/api/tools/' + id).then((r) => r.success),
    testById: (id: string, input: Record<string, unknown>) =>
      this.post<ToolTestResult>('/api/tools/' + id + '/test', { input }),
    testInline: (
      projectId: string,
      type: string,
      config: Record<string, unknown>,
      input: Record<string, unknown>,
    ) =>
      this.post<ToolTestResult>('/api/projects/' + projectId + '/tools/test', {
        type,
        config,
        input,
      }),
    getBuiltin: (projectId: string) =>
      this.get<BuiltinToolGroup[]>('/api/projects/' + projectId + '/tools/builtin'),
    toggleBuiltin: (projectId: string, toolId: string, enabled: boolean) =>
      this.patch<{ toolId: string; enabled: boolean }>(
        '/api/projects/' + projectId + '/tools/builtin/' + toolId,
        { enabled },
      ),
    getGmailAuthUrl: (projectId: string) =>
      this.get<{ url: string }>('/api/projects/' + projectId + '/tools/builtin/gmail/auth-url'),
    saveGmailAppConfig: (
      projectId: string,
      config: { clientId: string; clientSecret?: string; redirectUri: string; scopes?: string[] },
    ) => this.patch<{ success: boolean }>(
      '/api/projects/' + projectId + '/tools/builtin/gmail/app-config',
      config,
    ),
    getGmailAppConfig: (projectId: string) =>
      this.get<{ clientId: string; redirectUri: string; scopes: string[]; hasClientSecret: boolean }>(
        '/api/projects/' + projectId + '/tools/builtin/gmail/app-config',
      ),
    clearGmailAppConfig: (projectId: string) =>
      this.del<{ success: boolean }>(
        '/api/projects/' + projectId + '/tools/builtin/gmail/app-config',
      ),
    gmailCallback: (projectId: string, code: string, state: string) =>
      this.post<{ success: boolean }>('/api/projects/' + projectId + '/tools/builtin/gmail/callback', { code, state }),

    getPdfParseRules: (agentId: string) =>
      this.get<unknown[]>('/api/internal/agents/' + agentId + '/pdf-parse-rules'),
    savePdfParseRules: (agentId: string, rules: unknown[]) =>
      this.put<{ success: boolean }>('/api/internal/agents/' + agentId + '/pdf-parse-rules', rules),
    clearPdfParseRules: (agentId: string) =>
      this.del<{ success: boolean }>('/api/internal/agents/' + agentId + '/pdf-parse-rules'),

    aiGenerate: (data: {
      target: 'description' | 'inputSchema' | 'outputSchema' | 'bodyTemplate' | 'schemaFromTemplate'
      name?: string
      type?: string
      description?: string
      inputSchema?: unknown
      bodyTemplate?: string
      prompt?: string
    }) => this.post<{ result: string | Record<string, unknown> }>('/api/tools/ai-generate', data),
  }

  // ============================================================
  // Tool Groups
  // ============================================================
  toolGroups = {
    list: (projectId: string) =>
      this.get<ToolGroup[]>('/api/projects/' + projectId + '/tool-groups'),
    create: (projectId: string, data: { name: string; description?: string; type: 'rest' | 'code' }) =>
      this.post<ToolGroup>('/api/projects/' + projectId + '/tool-groups', data),
    update: (id: string, data: { name?: string; description?: string; enabled?: boolean }) =>
      this.patch<ToolGroup>('/api/tool-groups/' + id, data),
    delete: (id: string) =>
      this.del<{ success: boolean }>('/api/tool-groups/' + id).then((r) => r.success),
    listTools: (groupId: string) =>
      this.get<Tool[]>('/api/tool-groups/' + groupId + '/tools'),
    addTool: (groupId: string, data: Partial<Tool>) =>
      this.post<Tool>('/api/tool-groups/' + groupId + '/tools', data),
    analyzeOpenApi: (groupId: string, spec: string, format: 'json' | 'yaml', baseUrlOverride?: string) =>
      this.post<any[]>('/api/tool-groups/' + groupId + '/analyze-openapi', { spec, format, baseUrlOverride }),
    analyzeOpenApiByUrl: (groupId: string, url: string, baseUrlOverride?: string) =>
      this.post<any[]>('/api/tool-groups/' + groupId + '/analyze-openapi-url', { url, baseUrlOverride }),
    batchImportTools: (projectId: string, groupId: string, tools: any[], mode: 'update' | 'reset') =>
      this.post<Tool[]>(`/api/projects/${projectId}/tool-groups/${groupId}/batch-import`, { tools, mode }),
    exportOpenApi: (groupId: string, format: 'json' | 'yaml') =>
      this.get<string>('/api/tool-groups/' + groupId + '/export-openapi?format=' + format),
    sync: (groupId: string) =>
      this.post<ToolGroup>('/api/tool-groups/' + groupId + '/sync', {}),
  }

  integrations = {
    register: (
      projectId: string,
      data: {
        name: string
        specUrl: string
        baseUrlOverride?: string
        auth?: { type: 'none' | 'bearer' | 'api_key'; value?: string; headerName?: string }
      },
    ) => this.post<ToolGroup>('/api/projects/' + projectId + '/integrations', data),
  }

  // ============================================================
  // Runs
  // ============================================================
  runs = {
    listByWorkflow: (workflowId: string, page = 1, pageSize = 20) =>
      this.get<{ runs: WorkflowRun[]; total: number; page: number; pageSize: number }>(
        '/api/workflows/' + workflowId + '/runs?page=' + page + '&pageSize=' + pageSize,
      ),
    getById: (runId: string) => this.get<WorkflowRun>('/api/runs/' + runId),
    getTraces: (runId: string) => this.get<StepTrace[]>('/api/runs/' + runId + '/traces'),
  }

  // ============================================================
  // Agents (AgentStudio v2)
  // ============================================================
  agents = {
    list: (projectId: string) =>
      this.get<Agent[]>('/api/projects/' + projectId + '/agents'),
    get: (agentId: string) =>
      this.get<Agent>('/api/agents/' + agentId),
    create: (projectId: string, data: CreateAgentRequest) =>
      this.post<Agent>('/api/projects/' + projectId + '/agents', data),
    update: (agentId: string, data: UpdateAgentRequest) =>
      this.patch<Agent>('/api/agents/' + agentId, data),
    delete: (agentId: string) =>
      this.del<{ success: boolean }>('/api/agents/' + agentId).then((r) => r.success),
    listPromptVersions: (agentId: string) =>
      this.get<PromptVersion[]>('/api/agents/' + agentId + '/prompt-versions'),
    createPromptVersion: (agentId: string, data: { systemPrompt: string; label?: string }) =>
      this.post<PromptVersion>('/api/agents/' + agentId + '/prompt-versions', data),
    restorePromptVersion: (agentId: string, versionId: string) =>
      this.post<PromptVersion>('/api/agents/' + agentId + '/prompt-versions/' + versionId + '/restore'),
    clone: (agentId: string) =>
      this.post<Agent>('/api/agents/' + agentId + '/clone'),
    exportAgent: (agentId: string) =>
      this.get<Record<string, unknown>>('/api/agents/' + agentId + '/export'),
    importAgent: (projectId: string, data: Record<string, unknown>) =>
      this.post<Agent>('/api/agents/import', { projectId, data }),
    listSchedules: (agentId: string) =>
      this.get<AgentSchedule[]>('/api/agents/' + agentId + '/schedules'),
    createSchedule: (agentId: string, data: { name: string; cron: string; input: Record<string, unknown>; enabled?: boolean }) =>
      this.post<AgentSchedule>('/api/agents/' + agentId + '/schedules', data),
    deleteSchedule: (agentId: string, scheduleId: string) =>
      this.del<void>('/api/agents/' + agentId + '/schedules/' + scheduleId),
    runSchedule: (agentId: string, scheduleId: string) =>
      this.post<{ triggered: boolean }>('/api/agents/' + agentId + '/schedules/' + scheduleId + '/run'),
    compare: (agentAId: string, agentBId: string, message: string) =>
      this.post<{ a: { output: string; latency: number; tokens: number }; b: { output: string; latency: number; tokens: number } }>('/api/agents/compare', { agentAId, agentBId, message }),
  }

  // ============================================================
  // Teams (AgentStudio v2)
  // ============================================================
  teams = {
    list: (projectId: string) =>
      this.get<AgentTeam[]>('/api/projects/' + projectId + '/teams'),
    get: (teamId: string) =>
      this.get<AgentTeam>('/api/teams/' + teamId),
    create: (projectId: string, data: CreateTeamRequest) =>
      this.post<AgentTeam>('/api/projects/' + projectId + '/teams', data),
    update: (teamId: string, data: UpdateTeamRequest) =>
      this.patch<AgentTeam>('/api/teams/' + teamId, data),
    delete: (teamId: string) =>
      this.del<{ success: boolean }>('/api/teams/' + teamId).then((r) => r.success),
    addAgent: (teamId: string, data: AddTeamAgentRequest) =>
      this.post<unknown>('/api/teams/' + teamId + '/agents', data),
    removeAgent: (teamId: string, agentId: string) =>
      this.del<{ success: boolean }>('/api/teams/' + teamId + '/agents/' + agentId),
    addSubTeam: (teamId: string, data: AddSubTeamRequest) =>
      this.post<unknown>('/api/teams/' + teamId + '/subteams', data),
    removeSubTeam: (teamId: string, subTeamId: string) =>
      this.del<{ success: boolean }>('/api/teams/' + teamId + '/subteams/' + subTeamId),
    invoke: (teamId: string, message: string) =>
      this.post<{ messages: Array<{ role: string; content: string }> }>('/api/teams/' + teamId + '/invoke', { message }),
  }

  // ============================================================
  // Threads (AgentStudio v2)
  // ============================================================
  threads = {
    list: (projectId: string, status?: ThreadStatus) =>
      this.get<Thread[]>('/api/projects/' + projectId + '/threads' + (status ? '?status=' + status : '')),
    get: (threadId: string) =>
      this.get<Thread>('/api/threads/' + threadId),
    create: (projectId: string, data: CreateThreadRequest) =>
      this.post<Thread>('/api/projects/' + projectId + '/threads', data),
    update: (threadId: string, data: { title?: string }) =>
      this.patch<Thread>('/api/threads/' + threadId, data),
    archive: (threadId: string) =>
      this.del<Thread>('/api/threads/' + threadId),
    invoke: (
      threadId: string,
      content: string,
      architectureOverride?: string,
      source?: 'studio' | 'client',
    ) =>
      this.post<unknown>('/api/threads/' + threadId + '/invoke', {
        content,
        architectureOverride,
        source,
      }),
    resume: (threadId: string, approved: boolean, source?: 'studio' | 'client') =>
      this.post<unknown>('/api/threads/' + threadId + '/resume', { approved, source }),
    messages: (threadId: string) =>
      this.get<unknown[]>('/api/threads/' + threadId + '/messages'),
    runs: (threadId: string) =>
      this.get<ThreadRun[]>('/api/threads/' + threadId + '/runs'),
    cancel: (threadId: string) =>
      this.post<{ threadId: string; cancelled: boolean }>('/api/threads/' + threadId + '/cancel', {}),
  }

  attachments = {
    list: (threadId: string) =>
      this.get<ThreadAttachment[]>('/api/threads/' + threadId + '/attachments'),
    upload: async (threadId: string, file: File): Promise<ThreadAttachment> => {
      const form = new FormData()
      form.append('file', file, file.name)
      const token = this.getAccessToken()
      const headers: HeadersInit = token ? { Authorization: 'Bearer ' + token } : {}
      const res = await fetch(this.baseUrl + '/api/threads/' + threadId + '/attachments', {
        method: 'POST',
        headers,
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }))
        throw new Error(err.message || 'Upload failed')
      }
      return res.json() as Promise<ThreadAttachment>
    },
    delete: (attachmentId: string) =>
      this.del<void>('/api/thread-attachments/' + attachmentId),
    downloadUrl: (attachmentId: string) =>
      this.baseUrl + '/api/thread-attachments/' + attachmentId + '/content',
    fetchBlob: async (attachmentId: string): Promise<Blob> => {
      const token = this.getAccessToken()
      const headers: HeadersInit = token ? { Authorization: 'Bearer ' + token } : {}
      const res = await fetch(
        this.baseUrl + '/api/thread-attachments/' + attachmentId + '/content',
        { headers },
      )
      if (!res.ok) throw new Error('첨부를 불러오지 못했습니다')
      return res.blob()
    },
  }

  // ============================================================
  // HITL (AgentStudio v2)
  // ============================================================
  hitl = {
    listPending: (projectId: string) =>
      this.get<HumanInteraction[]>('/api/projects/' + projectId + '/interactions'),
    listByThread: (threadId: string) =>
      this.get<HumanInteraction[]>('/api/threads/' + threadId + '/interactions'),
    get: (interactionId: string) =>
      this.get<HumanInteraction>('/api/interactions/' + interactionId),
    respond: (interactionId: string, response: unknown, source?: 'studio' | 'client') =>
      this.post<HumanInteraction>('/api/interactions/' + interactionId + '/respond', {
        response,
        source,
      }),
    escalate: (interactionId: string, escalateTo: string) =>
      this.post<HumanInteraction>('/api/interactions/' + interactionId + '/escalate', { escalateTo }),
    previewEdit: (interactionId: string, editPrompt: string) =>
      this.post<{
        name: string
        args: Record<string, unknown>
        originalArgs: Record<string, unknown>
        taskDescriptionUpdate?: string | null
        originalTaskDescription?: string | null
      }>('/api/interactions/' + interactionId + '/preview-edit', { editPrompt }),
  }

  // ============================================================
  // MCP Servers (Track J)
  // ============================================================
  mcp = {
    list: (projectId: string) =>
      this.get<McpServer[]>('/api/projects/' + projectId + '/mcp'),
    getById: (id: string) =>
      this.get<McpServer>('/api/mcp/' + id),
    create: (projectId: string, data: CreateMcpServerRequest) =>
      this.post<McpServer>('/api/projects/' + projectId + '/mcp', data),
    update: (id: string, data: UpdateMcpServerRequest) =>
      this.put<McpServer>('/api/mcp/' + id, data),
    delete: (id: string) =>
      this.del<{ success: boolean }>('/api/mcp/' + id).then((r) => r.success),
    connect: (id: string) =>
      this.post<McpServer>('/api/mcp/' + id + '/connect', {}),
    refreshTools: (id: string) =>
      this.post<McpServer>('/api/mcp/' + id + '/refresh-tools', {}),
    disconnect: (id: string) =>
      this.post<McpServer>('/api/mcp/' + id + '/disconnect', {}),
    getTools: (id: string) =>
      this.get<McpTool[]>('/api/mcp/' + id + '/tools'),
    listAllTools: (projectId: string, opts?: { onlyExposed?: boolean }) => {
      const qs = opts?.onlyExposed ? '?onlyExposed=true' : ''
      return this.get<
        {
          serverId: string
          serverName: string
          tools: McpTool[]
          credentialMode?: McpCredentialMode
        }[]
      >('/api/projects/' + projectId + '/mcp/tools' + qs)
    },
    toggleToolVisibility: (serverId: string, toolName: string, exposed: boolean) =>
      this.patch<{ success: boolean }>(
        '/api/mcp/' + serverId + '/tools/' + encodeURIComponent(toolName) + '/visibility',
        { exposed },
      ),
  }

  // ============================================================
  // Skills
  // ============================================================
  skills = {
    list: () => this.get<Skill[]>('/api/skills'),
    get: (id: string) => this.get<Skill>(`/api/skills/${id}`),
    create: (data: Omit<Skill, 'id' | 'userId' | 'files' | 'createdAt' | 'updatedAt'>) =>
      this.post<Skill>('/api/skills', data),
    import: (data: {
      name: string
      description?: string
      instructions?: string
      allowedTools?: string[]
      enabled?: boolean
      files?: { path: string; content: string }[]
    }) => this.post<Skill>('/api/skills/import', data),
    update: (id: string, data: Partial<Omit<Skill, 'id' | 'userId' | 'files' | 'createdAt' | 'updatedAt'>>) =>
      this.patch<Skill>(`/api/skills/${id}`, data),
    delete: (id: string) => this.del(`/api/skills/${id}`),
    addFile: (skillId: string, data: { path: string; content: string }) =>
      this.post<SkillFile>(`/api/skills/${skillId}/files`, data),
    updateFile: (skillId: string, fileId: string, data: { path?: string; content?: string }) =>
      this.patch<SkillFile>(`/api/skills/${skillId}/files/${fileId}`, data),
    deleteFile: (skillId: string, fileId: string) =>
      this.del(`/api/skills/${skillId}/files/${fileId}`),
  }

  // ============================================================
  // Card Definitions — UI 정의 동적 카드 (Phase 3)
  // ============================================================
  cards = {
    list: (params?: { cardId?: string; tenantId?: string }) => {
      const qs = new URLSearchParams()
      if (params?.cardId) qs.set('cardId', params.cardId)
      if (params?.tenantId) qs.set('tenantId', params.tenantId)
      const tail = qs.toString() ? `?${qs.toString()}` : ''
      return this.get<CardDefinition[]>(`/api/cards${tail}`)
    },
    getLatest: (cardId: string) =>
      this.get<CardDefinition>(`/api/cards/${encodeURIComponent(cardId)}`),
    get: (cardId: string, version: number) =>
      this.get<CardDefinition>(
        `/api/cards/${encodeURIComponent(cardId)}/versions/${version}`,
      ),
    create: (data: {
      cardId: string
      version?: number
      tenantId?: string | null
      name: string
      category?: 'hitl'
      layout?: string
      targetTools?: string[]
      argSchema?: unknown | null
      payload: Record<string, unknown>
      sampleData?: Record<string, unknown>
    }) => this.post<CardDefinition>('/api/cards', data),
    findUsages: (cardId: string) =>
      this.get<{
        cardId: string
        hitlRefs: Array<{ agentId: string; agentName: string; projectId: string; toolId: string }>
      }>(`/api/cards/${encodeURIComponent(cardId)}/usages`),
  }

  // ============================================================
  // Slack Integration
  // ============================================================
  slack = {
    installations: {
      get: (projectId: string) =>
        this.request<SlackInstallationView>(
          `/api/slack/installations?projectId=${encodeURIComponent(projectId)}`,
        ),
      create: (projectId: string, body: { botToken: string; appToken: string }) =>
        this.request<SlackInstallationView>(
          `/api/slack/installations?projectId=${encodeURIComponent(projectId)}`,
          { method: 'POST', body: JSON.stringify(body) },
        ),
      enable: (id: string, enabled: boolean) =>
        this.request<SlackInstallationView>(`/api/slack/installations/${id}/enable`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled }),
        }),
      delete: (id: string) =>
        this.request<void>(`/api/slack/installations/${id}`, { method: 'DELETE' }),
    },
    channelAgents: {
      list: (projectId: string) =>
        this.request<SlackChannelAgent[]>(
          `/api/slack/channel-agents?projectId=${encodeURIComponent(projectId)}`,
        ),
      create: (
        projectId: string,
        body: { channelId: string; channelName?: string; agentId: string; mode: SlackRoutingMode },
      ) =>
        this.request<SlackChannelAgent>(
          `/api/slack/channel-agents?projectId=${encodeURIComponent(projectId)}`,
          { method: 'POST', body: JSON.stringify(body) },
        ),
      update: (id: string, body: { mode?: SlackRoutingMode; enabled?: boolean }) =>
        this.request<SlackChannelAgent>(`/api/slack/channel-agents/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        }),
      delete: (id: string) =>
        this.request<void>(`/api/slack/channel-agents/${id}`, { method: 'DELETE' }),
    },
  }

  // ============================================================
  // NAVER WORKS Integration
  // ============================================================
  naverWorks = {
    installations: {
      list: (projectId: string) =>
        this.request<NaverWorksInstallationView[]>(
          `/api/naver-works/installations?projectId=${encodeURIComponent(projectId)}`,
        ),
      get: (id: string) =>
        this.request<NaverWorksInstallationView>(`/api/naver-works/installations/${id}`),
      upsert: (projectId: string, body: NaverWorksUpsertBody) =>
        this.request<NaverWorksInstallationView>(
          `/api/naver-works/installations?projectId=${encodeURIComponent(projectId)}`,
          { method: 'POST', body: JSON.stringify(body) },
        ),
      updateAgent: (id: string, agentId: string) =>
        this.request<NaverWorksInstallationView>(
          `/api/naver-works/installations/${id}/agent`,
          { method: 'PATCH', body: JSON.stringify({ agentId }) },
        ),
      enable: (id: string, enabled: boolean) =>
        this.request<NaverWorksInstallationView>(
          `/api/naver-works/installations/${id}/enable`,
          { method: 'PATCH', body: JSON.stringify({ enabled }) },
        ),
      delete: (id: string) =>
        this.request<void>(`/api/naver-works/installations/${id}`, { method: 'DELETE' }),
    },
  }

  // ============================================================
  // Agent Assistant — 시나리오 → main+sub 자동 설계 메타 에이전트
  // ============================================================
  agentAssistant = {
    createSession: (agentId: string, model?: string) =>
      this.post<{ threadId: string; targetAgentId: string; model: string }>(
        `/api/agents/${agentId}/assistant/sessions`,
        { model },
      ),
    invoke: (agentId: string, threadId: string, message: string) =>
      this.post<{ threadId: string; accepted: boolean }>(
        `/api/agents/${agentId}/assistant/sessions/${threadId}/invoke`,
        { message },
      ),
  }

  // ============================================================
  // Skill Assistant — 자연어로 스킬 생성/편집 메타 에이전트
  // ============================================================
  skillAssistant = {
    createSession: (params: { skillId?: string | null; model?: string; mode?: string }) =>
      this.request<{ threadId: string; targetSkillId: string | null; model: string; mode?: string }>(
        '/api/skills/assistant/sessions',
        { method: 'POST', body: JSON.stringify(params) },
      ),
    invoke: (threadId: string, message: string, mode?: string) =>
      this.request<{ threadId: string; accepted: boolean; mode?: string }>(
        `/api/skills/assistant/sessions/${threadId}/invoke`,
        { method: 'POST', body: JSON.stringify({ message, mode }) },
      ),
  }

}

export const apiClient = new ApiClient()
export const mockApi = apiClient

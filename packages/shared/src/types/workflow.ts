// ============================================================
// Workflow (에이전트 워크플로우 정의)
// ============================================================

export type NodeType = 'llm' | 'tool' | 'condition' | 'loop' | 'transform' | 'human_input' | 'start' | 'end' | 'agent'

export interface WorkflowNodePosition {
  x: number
  y: number
}

export interface WorkflowNodeData {
  label: string
  nodeType: NodeType
  config: Record<string, unknown>  // 노드 유형별 설정
}

export interface WorkflowNode {
  id: string
  type: string           // React Flow node type
  position: WorkflowNodePosition
  data: WorkflowNodeData
}

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  condition?: string     // 조건 표현식 (e.g. "{{nodes.step1.output.category}} === 'A'")
}

export interface WorkflowVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  required: boolean
  defaultValue?: unknown
  description?: string
}

export type WorkflowStatus = 'draft' | 'published'

export interface Workflow {
  id: string
  projectId: string
  name: string
  slug: string
  description: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: WorkflowVariable[]
  status: WorkflowStatus
  createdAt: string
  updatedAt: string
}

// ============================================================
// Node Config Types (노드별 설정)
// ============================================================

export interface LLMNodeConfig {
  modelId: string
  systemPrompt?: string
  userPrompt: string       // {{variable}} 템플릿 지원
  temperature?: number
  maxTokens?: number
}

export interface ToolNodeConfig {
  toolId: string           // Tool 레코드 ID
  inputMapping: Record<string, string>  // 도구 입력 → 이전 노드 출력 매핑
}

export interface ConditionNodeConfig {
  expression: string       // "{{nodes.llm1.output.category}} === 'support'"
  trueLabel?: string
  falseLabel?: string
}

export interface LoopNodeConfig {
  arrayExpression: string  // "{{variables.items}}"
  itemVariable: string     // "item"
  maxIterations?: number
}

export interface TransformNodeConfig {
  code: string             // JavaScript 변환 코드
  // (input) => output 형태
}

export interface HumanInputNodeConfig {
  prompt: string           // 사용자에게 보여줄 메시지
  timeoutSeconds?: number  // 타임아웃 (null = 무제한 대기)
  timeoutAction: 'cancel' | 'continue'
}

export interface AgentNodeConfig {
  agentId?: string                        // 단일 Agent ID
  teamId?: string                         // 또는 Team ID (Phase 2)
  inputMapping: Record<string, string>    // { agentVar: workflowVar }
  outputMapping: Record<string, string>   // { agentOutput: workflowVar }
  timeout?: number                        // ms, default 60000
  onFailure: 'stop' | 'continue' | 'fallback'
  fallbackValue?: unknown
}

// ============================================================
// Workflow Version
// ============================================================

export interface WorkflowVersion {
  id: string
  workflowId: string
  number: number
  label?: string
  message: string
  snapshot: {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    variables: WorkflowVariable[]
  }
  diff?: {
    nodesAdded: number
    nodesRemoved: number
    nodesModified: number
    edgesChanged: number
  }
  createdBy: string
  createdAt: string
}

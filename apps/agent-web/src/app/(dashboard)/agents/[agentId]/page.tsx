'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { toast } from 'sonner'
import type { Agent, UpdateAgentRequest } from '@agent-studio/shared'
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react'
import type { EnabledModel } from '@/types/provider'
import type { Tool } from '@agent-studio/shared'
import type { McpServer } from '@agent-studio/shared'
import type { Skill } from '@/lib/api-client'
import { useToolStore } from '@/stores/use-tool-store'
import { Loader2 } from 'lucide-react'
import { AgentFlowToolbar } from '@/components/agents/flow/AgentFlowToolbar'
import { FlowCanvas } from '@/components/agents/flow/FlowCanvas'
import {
  AgentGraphResourcesProvider,
  type AgentGraphResources,
} from '@/components/agents/flow/agent-graph-resources'
import { AgentFlowSettingsPanel } from '@/components/agents/flow/AgentFlowSettingsPanel'
import { AgentFlowDebugPanel, type StepFlowEvent } from '@/components/agents/flow/AgentFlowDebugPanel'
import { MainAgentModal } from '@/components/agents/flow/MainAgentModal'
import type { MainAgentNodeData } from '@/components/agents/flow/MainAgentNode'
import { normalizeSubAgentData } from '@/components/agents/flow/SubAgentNode'
import type { SubAgentNodeData, SubAgentStatus } from '@/components/agents/flow/SubAgentNode'
import { AgentAssistantPanel } from '@/components/agents/assistant/AgentAssistantPanel'
import { AssistantGenerationLog } from '@/components/agents/assistant/AssistantGenerationLog'
import { useAgentAssistantStore } from '@/stores/use-agent-assistant-store'
import { ListTree } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 중립 엣지 색상은 globals.css 의 .react-flow__edge-path (var(--color-fg-muted)) 가 처리한다.
 *  inline style 에서 stroke 를 지정하지 않으면 CSS 가 적용되어 다크/라이트 양쪽에서 가시성 확보. */
const NEUTRAL_STROKE: string | undefined = undefined
const ACTIVE_STROKE = '#60A5FA'
const ERROR_STROKE = '#EF4444'

const RIGHT_PANEL_WIDTH_KEY = 'agent-builder.right-panel-width'
const ASSISTANT_HEIGHT_KEY = 'agent-builder.assistant-height'
const LEGACY_SETTINGS_KEY = 'agent-builder.settings-width'
const LEGACY_DEBUG_KEY = 'agent-builder.debug-width'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readStoredWidth(): number {
  if (typeof window === 'undefined') return 460
  try {
    const unified = window.localStorage.getItem(RIGHT_PANEL_WIDTH_KEY)
    if (unified) {
      const n = Number(unified)
      if (Number.isFinite(n) && n > 0) return clamp(n, 320, 800)
    }
    // 기존 분리 키 마이그레이션: 큰 값 채택 후 새 키로 저장, 기존 키 제거.
    const sw = Number(window.localStorage.getItem(LEGACY_SETTINGS_KEY) ?? '0')
    const dw = Number(window.localStorage.getItem(LEGACY_DEBUG_KEY) ?? '0')
    const seed = Math.max(sw, dw)
    if (seed > 0) {
      const next = clamp(seed, 320, 800)
      window.localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(next))
      window.localStorage.removeItem(LEGACY_SETTINGS_KEY)
      window.localStorage.removeItem(LEGACY_DEBUG_KEY)
      return next
    }
  } catch {
    /* localStorage 접근 불가 환경 */
  }
  return 460
}

function readStoredHeight(): number {
  if (typeof window === 'undefined') return 280
  try {
    const v = window.localStorage.getItem(ASSISTANT_HEIGHT_KEY)
    if (v) {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) return clamp(n, 120, 600)
    }
  } catch {
    /* noop */
  }
  return 280
}

export default function AgentBuilderPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const { activeProjectId: projectId } = useUserStore()

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<UpdateAgentRequest>({})
  const [models, setModels] = useState<EnabledModel[]>([])
  const [toolList, setToolList] = useState<Tool[]>([])
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [skillList, setSkillList] = useState<Skill[]>([])
  const builtinDisplayNames = useToolStore((s) => s.builtinDisplayNames)
  const setBuiltinDisplayNames = useToolStore((s) => s.setBuiltinDisplayNames)
  const setBuiltinLabels = useToolStore((s) => s.setBuiltinLabels)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('main')
  const [rightPanel, setRightPanel] = useState<'settings' | 'debug' | 'assistant-log' | null>('settings')
  const [isRunning, setIsRunning] = useState(false)
  const [sessionToken, setSessionToken] = useState(0)
  const [mainModalOpen, setMainModalOpen] = useState(false)
  const [assistantPanelOpen, setAssistantPanelOpen] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => readStoredWidth())
  const [assistantHeight, setAssistantHeight] = useState<number>(() => readStoredHeight())
  // hydration 직후 저장 effect가 기본값으로 localStorage 를 덮어쓰지 않도록 가드.
  const hydratedRef = useRef(false)

  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])

  const pendingNodes = useAgentAssistantStore((s) => s.pendingNodes)
  const pendingEdges = useAgentAssistantStore((s) => s.pendingEdges)
  // 노드 카드(ProposalApplyCard)와 edit 카드(EditApplyCard)가 동시에 떠 있을 때
  // 서로의 상태를 침범하지 않도록 cleaner 를 분리해 둔다.
  const clearAssistantPendingNodes = useAgentAssistantStore((s) => s.clearPendingNodes)
  const clearAssistantPendingEdit = useAgentAssistantStore((s) => s.clearPendingEdit)
  const appendAssistantMessage = useAgentAssistantStore((s) => s.appendAssistantMessage)

  // localStorage 영속화 — 페이지 mount 시 한 번 읽어와 초기값으로 적용, 변경 시 저장.
  // SSR hydration: 클라이언트 마운트 후 한 번만 storage 읽어 보정 (lazy init 으로 이미 읽었지만
  // SSR 환경에서는 window 가 없어 기본값으로 그려졌을 수 있으므로 보정), 이후부터 저장 허용.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) {
      const w = readStoredWidth()
      const h = readStoredHeight()
      setRightPanelWidth(w)
      setAssistantHeight(h)
      hydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) return
    window.localStorage.setItem('agent-builder.right-panel-width', String(rightPanelWidth))
  }, [rightPanelWidth])
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!hydratedRef.current) return
    window.localStorage.setItem('agent-builder.assistant-height', String(assistantHeight))
  }, [assistantHeight])

  const handleRightPanelResize = useCallback((delta: number) => {
    // 패널이 우측에 있고 좌측 핸들을 드래그 → 마우스가 왼쪽으로(음수 delta) 가면 패널이 커진다.
    setRightPanelWidth((w) => Math.max(320, Math.min(800, w - delta)))
  }, [])
  const handleAssistantResize = useCallback((delta: number) => {
    // 패널이 하단에 있고 상단 핸들을 드래그 → 마우스가 위로(음수 delta) 가면 패널이 커진다.
    setAssistantHeight((h) => Math.max(120, Math.min(600, h - delta)))
  }, [])

  useEffect(() => {
    apiClient.agents.get(agentId).then((a) => {
      setAgent(a)
      const isSup = a.type === 'supervisor' || a.architecture === 'custom_graph'
      const mainNode: Node = {
        id: 'main',
        type: 'mainAgent',
        position: { x: 300, y: 150 },
        data: {
          agentName: a.name,
          architecture: a.architecture,
          modelName: a.modelId ?? '',
          isSelected: true,
          isSupervisor: isSup,
          toolIds: a.toolIds ?? [],
          builtinToolIds: a.builtinToolIds ?? [],
          mcpServerIds: a.mcpServerIds ?? [],
          skillIds: a.skillIds ?? [],
          toolPermissions: a.toolPermissions ?? {},
        } as MainAgentNodeData,
        draggable: true,
        selected: true,
      }

      const graphDef = a.graphDefinition as { nodes?: { id: string; position: { x: number; y: number }; data: SubAgentNodeData }[]; edges?: Edge[] } | undefined
      const restoredSubNodes: Node[] = (graphDef?.nodes ?? []).map((n) => ({
        id: n.id,
        type: 'subAgent',
        position: n.position,
        data: {
          ...normalizeSubAgentData(n.data),
          onDelete: (id: string) => {
            setNodes((prev) => prev.filter((node) => node.id !== id))
            setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
            setDirty(true)
          },
        },
        draggable: true,
      }))
      const restoredEdges: Edge[] = graphDef?.edges ?? []

      setNodes([mainNode, ...restoredSubNodes])
      setEdges(restoredEdges)
    }).finally(() => setLoading(false))
  }, [agentId])

  useEffect(() => {
    apiClient.providers.getEnabledModels().then(setModels).catch(() => {})
  }, [])

  useEffect(() => {
    if (!projectId) return
    apiClient.tools.list(projectId).then(setToolList).catch(() => {})
    apiClient.mcp.list(projectId).then(setMcpServers).catch(() => {})
    apiClient.tools
      .getBuiltin(projectId)
      .then((groups) => {
        const map: Record<string, string> = {}
        const labelMap: Record<string, Record<string, string>> = {}
        for (const group of groups) for (const t of group.tools) {
          map[t.id] = t.name
          if (t.labels) labelMap[t.id] = t.labels
        }
        setBuiltinDisplayNames(map)
        setBuiltinLabels(labelMap)
      })
      .catch(() => {})
  }, [projectId, setBuiltinDisplayNames, setBuiltinLabels])

  useEffect(() => {
    apiClient.skills.list().then(setSkillList).catch(() => {})
  }, [])

  const graphResources = useMemo<AgentGraphResources>(() => {
    const modelsById: AgentGraphResources['modelsById'] = {}
    for (const m of models) modelsById[m.id] = { name: m.name, providerSlug: m.providerSlug }
    const toolsById: AgentGraphResources['toolsById'] = {}
    for (const t of toolList) toolsById[t.id] = { name: t.name }
    const mcpServersById: AgentGraphResources['mcpServersById'] = {}
    for (const s of mcpServers) mcpServersById[s.id] = { name: s.name }
    const skillsById: AgentGraphResources['skillsById'] = {}
    for (const s of skillList) skillsById[s.id] = { name: s.name }
    return { modelsById, toolsById, mcpServersById, skillsById, builtinDisplayNames }
  }, [models, toolList, mcpServers, skillList, builtinDisplayNames])

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const next = selectedNodeId === n.id
        if (n.selected === next) return n
        if (n.type === 'mainAgent') {
          const data = n.data as MainAgentNodeData
          return { ...n, selected: next, data: { ...data, isSelected: next } }
        }
        return { ...n, selected: next }
      }),
    )
  }, [selectedNodeId])

  // 메인 노드의 시안 글로우는 사용자가 ▶ 누른 후 isRunning 인 동안만 적용.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== 'mainAgent') return n
        const data = n.data as MainAgentNodeData
        if (data.isRunning === isRunning) return n
        return { ...n, data: { ...data, isRunning } }
      }),
    )
  }, [isRunning])

  const handleChange = useCallback((changes: UpdateAgentRequest) => {
    setPendingChanges((prev) => ({ ...prev, ...changes }))
    setDirty(true)

    // 메인 노드 데이터 동기화
    const touchesMain =
      changes.name !== undefined ||
      changes.architecture !== undefined ||
      changes.modelId !== undefined ||
      changes.toolIds !== undefined ||
      changes.builtinToolIds !== undefined ||
      changes.mcpServerIds !== undefined ||
      changes.skillIds !== undefined ||
      changes.toolPermissions !== undefined
    if (touchesMain) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== 'main') return n
          const prevData = n.data as MainAgentNodeData
          return {
            ...n,
            data: {
              ...prevData,
              agentName: changes.name ?? prevData.agentName,
              architecture: changes.architecture ?? prevData.architecture,
              modelName: changes.modelId ?? prevData.modelName,
              toolIds: changes.toolIds ?? prevData.toolIds,
              builtinToolIds: changes.builtinToolIds ?? prevData.builtinToolIds,
              mcpServerIds: changes.mcpServerIds ?? prevData.mcpServerIds,
              skillIds: changes.skillIds ?? prevData.skillIds,
              toolPermissions: changes.toolPermissions ?? prevData.toolPermissions,
            },
          }
        }),
      )
    }
  }, [])

  const persistAgent = useCallback(async () => {
    const subAgentNodes = nodes
      .filter((n) => n.id !== 'main')
      .map((n) => {
        const { onDelete: _, ...data } = n.data as SubAgentNodeData & { onDelete?: unknown }
        return { id: n.id, position: n.position, data }
      })

    const planningConfig = pendingChanges.planningConfig !== undefined ? pendingChanges.planningConfig : undefined

    const saveData: UpdateAgentRequest = {
      ...pendingChanges,
      ...(planningConfig !== undefined && { planningConfig }),
      graphDefinition: { nodes: subAgentNodes, edges },
    }
    const updated = await apiClient.agents.update(agentId, saveData)
    setAgent(updated)
    setPendingChanges({})
    setDirty(false)
  }, [agentId, edges, nodes, pendingChanges])

  const handleSave = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await persistAgent()
    } finally {
      setSaving(false)
    }
  }

  const handleNodeSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId)
      if (nodeId) setRightPanel('settings')
      else setRightPanel(null)
    },
    [],
  )

  const handleRun = async () => {
    if (isRunning && !dirty) {
      setRightPanel('debug')
      return
    }
    if (dirty) {
      setSaving(true)
      try {
        await persistAgent()
      } catch (err) {
        toast.error(err instanceof Error ? `저장 실패: ${err.message}` : '저장 실패')
        setSaving(false)
        return
      }
      setSaving(false)
    }
    setSessionToken((t) => t + 1)
    setIsRunning(true)
    setRightPanel('debug')
  }

  const handleSubAgentChange = useCallback((nodeId: string, changes: Partial<SubAgentNodeData>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== nodeId) return n
        return { ...n, data: { ...n.data, ...changes } }
      }),
    )
    setDirty(true)
  }, [])

  // 도구 호출 step 이 어느 sub-agent(또는 main) 노드에 귀속되는지 추적하기 위한 매핑.
  // agent step.started 시 stepId → nodeId, 완료/실패 시 제거. parentStepId 가 없는 루트 도구는 'main'.
  const stepIdToNodeIdRef = useRef<Map<string, string>>(new Map())

  const handleStepEvent = useCallback((event: StepFlowEvent) => {
    if (event.type === 'reset') {
      stepIdToNodeIdRef.current.clear()
      setNodes((prev) =>
        prev.map((n) => {
          if (n.type === 'subAgent') {
            return {
              ...n,
              data: {
                ...n.data,
                status: 'idle' satisfies SubAgentStatus,
                currentTool: undefined,
              },
            }
          }
          if (n.type === 'mainAgent') {
            return { ...n, data: { ...n.data, currentTool: undefined, isRunning: false } }
          }
          return n
        }),
      )
      return
    }
    if (!event.name) return

    // 백엔드 sanitize_tool_name 과 동일한 정규화: 공백·특수문자를 _ 로 변환, 소문자화
    const normalize = (s: string) =>
      s.replace(/^agent_/i, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_')

    // Tool step → 부모 step 이 가리키는 nodeId(또는 main) 의 currentTool 갱신.
    if (event.stepType === 'tool') {
      const parentNodeId = event.parentStepId
        ? stepIdToNodeIdRef.current.get(event.parentStepId)
        : undefined
      const targetNodeId = parentNodeId ?? 'main'
      const nextTool = event.type === 'started' ? event.name : undefined
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== targetNodeId) return n
          // completed/failed 일 때, 이미 다른 도구가 시작되어 currentTool 이 바뀐 경우는 지우지 않는다.
          if (event.type !== 'started') {
            const cur = (n.data as { currentTool?: string }).currentTool
            if (cur && cur !== event.name) return n
          }
          return { ...n, data: { ...n.data, currentTool: nextTool } }
        }),
      )
      return
    }

    // Agent step (또는 stepType 미지정 — 기존 경로 호환) → sub-agent 노드 status 갱신.
    const needle = normalize(event.name)
    const nextStatus: SubAgentStatus =
      event.type === 'started' ? 'running' : event.type === 'completed' ? 'done' : 'error'
    setNodes((prev) => {
      let matched = false
      const next = prev.map((n) => {
        if (n.type !== 'subAgent') return n
        const data = n.data as unknown as SubAgentNodeData
        if (normalize(data.agentName) !== needle) return n
        matched = true
        // stepId → nodeId 매핑 갱신
        if (event.stepId) {
          if (event.type === 'started') stepIdToNodeIdRef.current.set(event.stepId, n.id)
          else stepIdToNodeIdRef.current.delete(event.stepId)
        }
        return {
          ...n,
          data: {
            ...data,
            status: nextStatus,
            // running 종료 시 currentTool 도 함께 비움
            currentTool: nextStatus === 'running' ? data.currentTool : undefined,
          },
        }
      })
      return matched ? next : prev
    })
  }, [])

  const handleAddSubAgent = useCallback(() => {
    const newId = `sub-${Date.now()}`
    // 현재 선택된 노드를 source로 사용. main 또는 미선택이면 'main'
    const sourceId = selectedNodeId && selectedNodeId !== 'main' ? selectedNodeId : 'main'

    setNodes((prev) => {
      // 기존 sub-agent 이름 목록에서 중복 없는 순번 계산
      const existingNames = new Set(
        prev
          .filter((n) => n.type === 'subAgent')
          .map((n) => (n.data as SubAgentNodeData).agentName),
      )
      let index = 1
      while (existingNames.has(`Sub Agent ${index}`)) index++
      const agentName = `Sub Agent ${index}`

      // 빈 그리드 슬롯 탐색 — 기존 main / sub-agent 박스와 AABB 충돌 안 하는 첫 자리.
      // backend `_sub_position` 과 같은 4-column × N-row 격자(stride 280×180) 패턴 사용.
      const NODE_W = 260
      const NODE_H = 120
      const GAP = 16
      const STRIDE_X = 300
      const STRIDE_Y = 200
      const BASE_X = 200
      const BASE_Y = 420
      const isOccupied = (x: number, y: number) =>
        prev.some((n) => {
          if (n.type !== 'subAgent' && n.type !== 'mainAgent') return false
          const dx = Math.abs((n.position.x + NODE_W / 2) - (x + NODE_W / 2))
          const dy = Math.abs((n.position.y + NODE_H / 2) - (y + NODE_H / 2))
          return dx < NODE_W + GAP && dy < NODE_H + GAP
        })
      let slot: { x: number; y: number } | null = null
      outer: for (let row = 0; row < 20; row++) {
        for (let col = 0; col < 4; col++) {
          const x = BASE_X + col * STRIDE_X
          const y = BASE_Y + row * STRIDE_Y
          if (!isOccupied(x, y)) {
            slot = { x, y }
            break outer
          }
        }
      }
      // 그리드 20행이 모두 차면(=80슬롯) fallback — 가장 우측 끝 + STRIDE 만큼 더.
      const position = slot ?? { x: BASE_X + 4 * STRIDE_X, y: BASE_Y }

      return [
        ...prev,
        {
          id: newId,
          type: 'subAgent',
          position,
          data: {
            agentName,
            role: 'analyze' as const,
            modelName: '',
            toolNames: [],
            status: 'idle' as const,
            architecture: 'react',
            description: '',
            systemPrompt: '',
            config: {},
            toolIds: [],
            toolGroupIds: [],
            mcpServerIds: [],
            builtinToolIds: [],
            onDelete: (id: string) => {
              setNodes((n) => n.filter((node) => node.id !== id))
              setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
              setDirty(true)
            },
          } as SubAgentNodeData,
        },
      ]
    })
    setEdges((prev) => [
      ...prev,
      {
        id: `edge-${sourceId}-${newId}`,
        source: sourceId,
        target: newId,
        style: { stroke: '#3B82F6', strokeWidth: 1.5 },
        animated: false,
      },
    ])
    setDirty(true)
  }, [selectedNodeId])

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds))
      if (changes.some((c) => c.type === 'remove')) setDirty(true)
    },
    [],
  )

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => applyEdgeChanges(changes, eds))
      if (changes.some((c) => c.type === 'remove')) setDirty(true)
    },
    [],
  )

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [],
  )

  // 드래그 중인 노드와 겹치는 다른 노드를 옆으로 밀어내는 충돌 회피.
  // - MainAgent / SubAgent 모두 240×112 (SubAgentNode.tsx / MainAgentNode.tsx 의 w/h 클래스와 동일).
  //   크기가 달라지면 이 상수도 함께 갱신해야 한다.
  // - iterative resolution: 모든 쌍을 AABB 로 검사해, overlap 이 더 작은 축으로 분리.
  //   드래그 중인 노드는 fixed (마우스 위치 유지). 다른 노드끼리 충돌하면 둘 다 절반씩 이동.
  //   더 이상 충돌이 없거나 MAX_ITERS 도달 시 종료 — 연쇄 충돌(밀린 노드가 또 다른 노드와 겹침)도 해소.
  const onNodeDrag = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    // 노드 카드 폭/높이: SubAgent=260×120, Main=280×120. 충돌 회피용 단순 AABB 에는 최대값 사용.
    const NODE_W = 280
    const NODE_H = 120
    const GAP = 16
    const sepX = NODE_W + GAP
    const sepY = NODE_H + GAP
    const MAX_ITERS = 20

    setNodes((prev) => {
      // 작업용 가변 position 맵 — 원본 nodes 는 immutable 유지.
      const positions = new Map<string, { x: number; y: number }>(
        prev.map((n) => [n.id, { x: n.position.x, y: n.position.y }]),
      )
      // 드래그 중인 노드는 사용자가 잡고 있는 좌표를 그대로 사용 (xyflow 가 store 에 반영하기 전에도
      // 콜백 인자의 draggedNode.position 은 최신값).
      positions.set(draggedNode.id, {
        x: draggedNode.position.x,
        y: draggedNode.position.y,
      })

      const ids = Array.from(positions.keys())

      for (let iter = 0; iter < MAX_ITERS; iter++) {
        let moved = false
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const idA = ids[i]
            const idB = ids[j]
            const posA = positions.get(idA)!
            const posB = positions.get(idB)!
            const dx = (posB.x + NODE_W / 2) - (posA.x + NODE_W / 2)
            const dy = (posB.y + NODE_H / 2) - (posA.y + NODE_H / 2)
            const overlapX = sepX - Math.abs(dx)
            const overlapY = sepY - Math.abs(dy)
            if (overlapX <= 0 || overlapY <= 0) continue

            const aFixed = idA === draggedNode.id
            const bFixed = idB === draggedNode.id
            // 양쪽 다 fixed 는 불가(드래그 노드는 1개), 보호용 가드.
            if (aFixed && bFixed) continue

            if (overlapX < overlapY) {
              const dir = dx === 0 ? 1 : Math.sign(dx)
              if (bFixed) {
                posA.x -= dir * overlapX
              } else if (aFixed) {
                posB.x += dir * overlapX
              } else {
                posA.x -= (dir * overlapX) / 2
                posB.x += (dir * overlapX) / 2
              }
            } else {
              const dir = dy === 0 ? 1 : Math.sign(dy)
              if (bFixed) {
                posA.y -= dir * overlapY
              } else if (aFixed) {
                posB.y += dir * overlapY
              } else {
                posA.y -= (dir * overlapY) / 2
                posB.y += (dir * overlapY) / 2
              }
            }
            moved = true
          }
        }
        if (!moved) break
      }

      let changed = false
      const next = prev.map((n) => {
        const p = positions.get(n.id)
        if (!p) return n
        if (p.x === n.position.x && p.y === n.position.y) return n
        changed = true
        return { ...n, position: p }
      })
      return changed ? next : prev
    })
  }, [])

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
      setDirty(true)
    },
    [],
  )

  const styledEdges = useMemo<Edge[]>(() => {
    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const resolveStatus = (node: Node | undefined): SubAgentStatus | 'main' => {
      if (!node) return 'idle'
      if (node.type === 'mainAgent') return 'main'
      return (node.data as unknown as SubAgentNodeData).status ?? 'idle'
    }
    const isTouched = (s: SubAgentStatus | 'main') =>
      s === 'running' || s === 'done' || s === 'error' || (isRunning && s === 'main')

    return edges.map((edge) => {
      const sourceStatus = resolveStatus(nodeById.get(edge.source))
      const targetStatus = resolveStatus(nodeById.get(edge.target))
      const hasError = sourceStatus === 'error' || targetStatus === 'error'
      const active = isRunning && isTouched(sourceStatus) && isTouched(targetStatus)
      const dim = isRunning && !active && !hasError

      return {
        ...edge,
        type: 'deletable',
        animated: active,
        data: { ...(edge.data ?? {}), onDelete: handleDeleteEdge },
        style: {
          ...(edge.style ?? {}),
          stroke: hasError ? ERROR_STROKE : active ? ACTIVE_STROKE : NEUTRAL_STROKE,
          strokeWidth: active || hasError ? 2 : 1.4,
          opacity: dim ? 0.25 : 1,
          transition: 'opacity 200ms ease, stroke 200ms ease',
        },
      }
    })
  }, [edges, nodes, isRunning, handleDeleteEdge])

  // Assistant 가 제안한 proposed 노드/엣지는 저장된 그래프 위에 미리보기로 덧씌운다.
  // 저장된 노드와 id 충돌이 있으면 저장된 쪽이 우선 (proposed 가 덮어쓰지 않음).
  const unionNodes = useMemo<Node[]>(() => {
    if (pendingNodes.length === 0) return nodes
    const existingIds = new Set(nodes.map((n) => n.id))
    const previewNodes = pendingNodes
      .filter((n) => !existingIds.has(n.id))
      .map((n) => ({
        ...n,
        draggable: false,
        data: { ...(n.data as Record<string, unknown>), proposed: true },
      })) as Node[]
    return [...nodes, ...previewNodes]
  }, [nodes, pendingNodes])

  const unionEdges = useMemo<Edge[]>(() => {
    if (pendingEdges.length === 0) return styledEdges
    const existingIds = new Set(styledEdges.map((e) => e.id))
    const previewEdges = pendingEdges
      .filter((e) => !existingIds.has(e.id))
      .map((e) => ({
        ...e,
        type: 'deletable',
        data: { ...(e.data ?? {}), onDelete: handleDeleteEdge },
        style: { stroke: '#F59E0B', strokeWidth: 1.4, strokeDasharray: '6 4', opacity: 0.8 },
        animated: false,
      })) as Edge[]
    return [...styledEdges, ...previewEdges]
  }, [styledEdges, pendingEdges, handleDeleteEdge])

  const handleApplyProposed = useCallback(
    async (mode: 'replace' | 'merge') => {
      const mainProposed = pendingNodes.find((n) => n.type === 'mainAgent')
      const subProposed = pendingNodes.filter((n) => n.type === 'subAgent')

      // proposed 노드의 data 에서 proposed 플래그와 status='proposed' 를 제거.
      const cleanData = (data: unknown): Record<string, unknown> => {
        const d = { ...(data as Record<string, unknown>) }
        delete d.proposed
        if (d.status === 'proposed') d.status = 'idle'
        return d
      }

      const buildSubNode = (n: Node): Node => ({
        id: n.id,
        type: 'subAgent',
        position: n.position,
        data: {
          ...normalizeSubAgentData(cleanData(n.data)),
          onDelete: (id: string) => {
            setNodes((prev) => prev.filter((node) => node.id !== id))
            setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
            setDirty(true)
          },
        } as SubAgentNodeData,
        draggable: true,
      })

      // ★ stale closure 회피: setState 큐와 동시에 직접 saveData 를 구성해 API 호출.
      // persistAgent useCallback 은 pendingChanges/nodes/edges 의 이전 값을 capture 하므로,
      // setPendingChanges/setNodes/setEdges 직후 await persistAgent() 를 호출하면 새 필드가
      // saveData 에 반영되지 않는다. 여기서는 next* 변수로 새 값을 직접 모아 호출한다.
      let nextMainOverrides: Partial<UpdateAgentRequest> = {}
      let nextNodes: Node[] = nodes
      let nextEdges: Edge[] = edges

      if (mode === 'replace') {
        // main: proposed main 이 있으면 그 데이터를 main 노드에 반영, 없으면 기존 main 유지
        const mainData = mainProposed
          ? (cleanData(mainProposed.data) as unknown as MainAgentNodeData)
          : null
        const existingMain = nodes.find((n) => n.id === 'main')
        const newMain: Node = existingMain
          ? { ...existingMain, data: { ...(existingMain.data as Record<string, unknown>), ...(mainData || {}) } }
          : {
              id: 'main',
              type: 'mainAgent',
              position: { x: 300, y: 150 },
              data: (mainData || {
                agentName: agent?.name ?? 'Main Agent',
                architecture: agent?.architecture ?? 'react',
                modelName: agent?.modelId ?? '',
                isSelected: true,
                isSupervisor: false,
                toolIds: agent?.toolIds ?? [],
                builtinToolIds: agent?.builtinToolIds ?? [],
                mcpServerIds: agent?.mcpServerIds ?? [],
                skillIds: agent?.skillIds ?? [],
                toolPermissions: agent?.toolPermissions ?? {},
              }) as MainAgentNodeData,
              draggable: true,
              selected: true,
            }
        const subs = subProposed.map(buildSubNode)
        nextNodes = [newMain, ...subs]
        nextEdges = subProposed.map((s) => ({
          id: `edge-main-${s.id}`,
          source: 'main',
          target: s.id,
          style: { stroke: '#3B82F6', strokeWidth: 1.5 },
          animated: false,
        }))
        setNodes(nextNodes)
        setEdges(nextEdges)
        if (mainData) {
          const md = mainData as unknown as {
            agentName?: string
            architecture?: Agent['architecture']
            modelName?: string
            systemPrompt?: string
            builtinToolIds?: string[]
            toolIds?: string[]
            mcpServerIds?: string[]
            skillIds?: string[]
          }
          nextMainOverrides = {
            name: md.agentName ?? agent?.name,
            architecture: md.architecture ?? agent?.architecture,
            modelId: md.modelName ?? agent?.modelId,
            systemPrompt: md.systemPrompt ?? agent?.systemPrompt ?? undefined,
            builtinToolIds: md.builtinToolIds ?? agent?.builtinToolIds ?? [],
            toolIds: md.toolIds ?? agent?.toolIds ?? [],
            mcpServerIds: md.mcpServerIds ?? agent?.mcpServerIds ?? [],
            skillIds: md.skillIds ?? agent?.skillIds ?? [],
          }
          setPendingChanges((p) => ({ ...p, ...nextMainOverrides }))
        }
      } else {
        // merge: main 은 손대지 않고 sub 만 추가
        const existingIds = new Set(nodes.map((n) => n.id))
        const newSubs = subProposed.filter((s) => !existingIds.has(s.id)).map(buildSubNode)
        nextNodes = [...nodes, ...newSubs]
        const edgeIds = new Set(edges.map((e) => e.id))
        const newEdges: Edge[] = subProposed
          .filter((s) => !edgeIds.has(`edge-main-${s.id}`))
          .map((s) => ({
            id: `edge-main-${s.id}`,
            source: 'main',
            target: s.id,
            style: { stroke: '#3B82F6', strokeWidth: 1.5 },
            animated: false,
          }))
        nextEdges = [...edges, ...newEdges]
        setNodes(nextNodes)
        setEdges(nextEdges)
      }

      setDirty(true)
      // 노드 제안만 처리하고, 같은 턴에 함께 떠 있을 수 있는 EditApplyCard(pendingEdit)는 보존.
      // 사용자가 두 카드를 각각 [적용]/[취소]로 결정할 수 있어야 한다.
      clearAssistantPendingNodes()

      // 직접 saveData 구성 + API 호출 — useCallback 클로저 race 회피.
      try {
        const subAgentNodes = nextNodes
          .filter((n) => n.id !== 'main')
          .map((n) => {
            const { onDelete: _, ...data } = n.data as SubAgentNodeData & { onDelete?: unknown }
            return { id: n.id, position: n.position, data }
          })
        const saveData: UpdateAgentRequest = {
          ...pendingChanges,
          ...nextMainOverrides,
          graphDefinition: { nodes: subAgentNodes, edges: nextEdges },
        }
        const updated = await apiClient.agents.update(agentId, saveData)
        setAgent(updated)
        setPendingChanges({})
        setDirty(false)
        toast.success('Agent Assistant 제안을 적용했습니다.')
      } catch (err) {
        toast.error(err instanceof Error ? `저장 실패: ${err.message}` : '저장 실패')
      }
    },
    [agent, pendingNodes, nodes, edges, pendingChanges, agentId, clearAssistantPendingNodes],
  )

  const handleApplyEdit = useCallback(
    async (edit: import('@/stores/use-agent-assistant-store').AgentEditPatch) => {
      // edit_agent 액션의 partial patch 적용 — stale closure 회피를 위해 직접 saveData 구성.
      const saveData: UpdateAgentRequest = {
        ...(edit.agentName !== undefined && { name: edit.agentName }),
        ...(edit.architecture !== undefined && {
          architecture: edit.architecture as Agent['architecture'],
        }),
        ...(edit.modelId !== undefined && { modelId: edit.modelId }),
        ...(edit.systemPrompt !== undefined && { systemPrompt: edit.systemPrompt }),
        ...(edit.builtinToolIds !== undefined && { builtinToolIds: edit.builtinToolIds }),
        ...(edit.toolIds !== undefined && { toolIds: edit.toolIds }),
        ...(edit.mcpServerIds !== undefined && { mcpServerIds: edit.mcpServerIds }),
        ...(edit.skillIds !== undefined && { skillIds: edit.skillIds }),
      }

      // 메인 agent 도구 실행 정책 — 기존 값과 merge (보낸 도구만 덮어씀).
      if (edit.toolPermissions && Object.keys(edit.toolPermissions).length > 0) {
        saveData.toolPermissions = {
          ...(agent?.toolPermissions ?? {}),
          ...edit.toolPermissions,
        }
      }

      // 기존 sub-agent 도구 실행 정책 — 그래프 노드 data.toolPermissions 에 merge 후 저장.
      let nextNodes: Node[] | null = null
      if (edit.subAgentPermissions && edit.subAgentPermissions.length > 0) {
        nextNodes = nodes.map((n) => {
          if (n.id === 'main') return n
          const data = n.data as SubAgentNodeData
          const patch = edit.subAgentPermissions!.find(
            (p) => (p.nodeId && p.nodeId === n.id) || p.agentName === data.agentName,
          )
          if (!patch) return n
          return {
            ...n,
            data: {
              ...data,
              toolPermissions: { ...(data.toolPermissions ?? {}), ...patch.toolPermissions },
            },
          }
        })
        const subAgentNodes = nextNodes
          .filter((n) => n.id !== 'main')
          .map((n) => {
            const { onDelete: _onDelete, ...data } = n.data as SubAgentNodeData & {
              onDelete?: unknown
            }
            return { id: n.id, position: n.position, data }
          })
        saveData.graphDefinition = { nodes: subAgentNodes, edges }
      }

      try {
        const updated = await apiClient.agents.update(agentId, saveData)
        if (nextNodes) setNodes(nextNodes)
        setAgent(updated)
        clearAssistantPendingEdit()
        // 채팅 흐름 안에서 사용자가 결과를 확인할 수 있도록 assistant 메시지로 추가.
        const changedLabels: string[] = []
        if (edit.systemPrompt !== undefined) changedLabels.push('시스템 프롬프트')
        if (edit.builtinToolIds !== undefined) changedLabels.push('Builtin 도구')
        if (edit.toolIds !== undefined) changedLabels.push('DB 도구')
        if (edit.mcpServerIds !== undefined) changedLabels.push('MCP 서버')
        if (edit.skillIds !== undefined) changedLabels.push('Skill')
        if (edit.modelId !== undefined) changedLabels.push('모델')
        if (edit.agentName !== undefined) changedLabels.push('이름')
        if (edit.architecture !== undefined) changedLabels.push('아키텍처')
        if (saveData.toolPermissions) changedLabels.push('도구 실행 정책')
        if (edit.subAgentPermissions?.length) changedLabels.push('서브에이전트 권한')
        const detail = changedLabels.length > 0 ? ` (${changedLabels.join(', ')})` : ''
        appendAssistantMessage(`✅ 변경 사항을 agent 에 적용했어요${detail}.`)
        toast.success('변경 사항을 적용했습니다.')
      } catch (err) {
        const msg = err instanceof Error ? `적용 실패: ${err.message}` : '적용 실패'
        appendAssistantMessage(`❌ ${msg}`)
        toast.error(msg)
      }
    },
    [agentId, agent, nodes, edges, clearAssistantPendingEdit, appendAssistantMessage],
  )

  const pendingMainCount = pendingNodes.filter((n) => n.type === 'mainAgent').length
  const pendingSubCount = pendingNodes.filter((n) => n.type === 'subAgent').length

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
      </div>
    )
  }

  if (!agent || !projectId) {
    return <div className="p-6 text-sm text-red-400">Agent or active Project not found</div>
  }

  const merged = { ...agent, ...pendingChanges } as Agent
  const isSupervisor = merged.type === 'supervisor' || merged.architecture === 'custom_graph'

  return (
    <div className="flex h-full flex-col bg-bg">
      <AgentFlowToolbar
        agentName={merged.name}
        agentId={agentId}
        dirty={dirty}
        saving={saving}
        onSave={handleSave}
        onOpenMainModal={() => setMainModalOpen(true)}
        onRun={handleRun}
      />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1">
            <AgentGraphResourcesProvider value={graphResources}>
              <FlowCanvas
                agent={merged}
                nodes={unionNodes}
                edges={unionEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeDrag={onNodeDrag}
                onNodeSelect={handleNodeSelect}
                onAddSubAgent={handleAddSubAgent}
                isSupervisor={isSupervisor}
                isRunning={isRunning}
              />
            </AgentGraphResourcesProvider>
          </div>

          <AgentAssistantPanel
            agentId={agentId}
            expanded={assistantPanelOpen}
            onToggleExpanded={() => setAssistantPanelOpen((v) => !v)}
            height={assistantHeight}
            onResize={handleAssistantResize}
            pendingMainCount={pendingMainCount}
            pendingSubCount={pendingSubCount}
            onApplyProposal={handleApplyProposed}
            onCancelProposal={() => clearAssistantPendingNodes()}
            onApplyEdit={handleApplyEdit}
            onCancelEdit={() => clearAssistantPendingEdit()}
          />
        </div>

        {rightPanel === 'settings' && selectedNodeId && (
          <AgentFlowSettingsPanel
            agent={merged}
            agentId={agentId}
            projectId={projectId}
            nodeId={selectedNodeId}
            nodes={nodes}
            onChange={handleChange}
            onSubAgentChange={handleSubAgentChange}
            onClose={() => setRightPanel(null)}
            models={models}
            width={rightPanelWidth}
            onResize={handleRightPanelResize}
          />
        )}

        {rightPanel === 'assistant-log' && <AssistantGenerationLog />}

        {sessionToken > 0 && (
          <div className={rightPanel === 'debug' ? 'contents' : 'hidden'}>
            <AgentFlowDebugPanel
              agent={merged}
              projectId={projectId}
              isRunning={isRunning}
              sessionToken={sessionToken}
              onStepEvent={handleStepEvent}
              onClose={() => {
                setRightPanel(selectedNodeId ? 'settings' : null)
                setIsRunning(false)
              }}
              width={rightPanelWidth}
              onResize={handleRightPanelResize}
            />
          </div>
        )}

        {/* 우측 패널 토글 — 항상 표시되는 좁은 세로 바 */}
        <div className="flex w-9 flex-col items-center gap-2 border-l border-border bg-bg py-2">
          <button
            onClick={() =>
              setRightPanel(rightPanel === 'assistant-log' ? null : 'assistant-log')
            }
            title="생성 로그"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-white/5 hover:text-fg',
              rightPanel === 'assistant-log' && 'bg-blue-500/15 text-blue-300',
            )}
          >
            <ListTree className="h-4 w-4" />
          </button>
        </div>
      </div>

      <MainAgentModal
        open={mainModalOpen}
        agent={merged}
        models={models}
        onChange={handleChange}
        onClose={() => setMainModalOpen(false)}
      />
    </div>
  )
}

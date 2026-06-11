import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Workflow, WorkflowVersion } from '@agent-studio/shared'
import type { Node, Edge } from '@xyflow/react'

interface WorkflowState {
  // 목록
  workflows: Workflow[]
  isLoadingList: boolean

  // 현재 편집 중인 워크플로우
  current: Workflow | null
  nodes: Node[]
  edges: Edge[]
  isDirty: boolean

  // 버전
  versions: WorkflowVersion[]

  // Actions
  setWorkflows: (workflows: Workflow[]) => void
  setCurrent: (workflow: Workflow | null) => void
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void
  markDirty: () => void
  markSaved: () => void
  setVersions: (versions: WorkflowVersion[]) => void
  reset: () => void
}

export const useWorkflowStore = create<WorkflowState>()(
  immer((set) => ({
    workflows: [],
    isLoadingList: false,
    current: null,
    nodes: [],
    edges: [],
    isDirty: false,
    versions: [],

    setWorkflows: (workflows) =>
      set((s) => { s.workflows = workflows }),

    setCurrent: (workflow) =>
      set((s) => {
        s.current = workflow
        s.nodes = (workflow?.nodes as unknown as Node[]) ?? []
        s.edges = (workflow?.edges as unknown as Edge[]) ?? []
        s.isDirty = false
      }),

    setNodes: (nodes) =>
      set((s) => { s.nodes = nodes; s.isDirty = true }),

    setEdges: (edges) =>
      set((s) => { s.edges = edges; s.isDirty = true }),

    markDirty: () => set((s) => { s.isDirty = true }),
    markSaved: () => set((s) => { s.isDirty = false }),

    setVersions: (versions) =>
      set((s) => { s.versions = versions }),

    reset: () =>
      set((s) => {
        s.current = null
        s.nodes = []
        s.edges = []
        s.isDirty = false
        s.versions = []
      }),
  })),
)

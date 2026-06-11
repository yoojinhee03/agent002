import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WorkflowRun, StepTrace, RunStatus } from '@agent-studio/shared'

interface RunState {
  // 실행 기록 목록
  runs: WorkflowRun[]
  total: number

  // 현재 실행 (스트리밍 중)
  activeRunId: string | null
  activeStatus: RunStatus | null
  activeTraces: StepTrace[]

  // Actions
  setRuns: (runs: WorkflowRun[], total: number) => void
  setActiveRun: (runId: string, status: RunStatus) => void
  updateActiveStatus: (status: RunStatus) => void
  addTrace: (trace: StepTrace) => void
  updateTrace: (trace: StepTrace) => void
  clearActive: () => void
}

export const useRunStore = create<RunState>()(
  immer((set) => ({
    runs: [],
    total: 0,
    activeRunId: null,
    activeStatus: null,
    activeTraces: [],

    setRuns: (runs, total) =>
      set((s) => { s.runs = runs; s.total = total }),

    setActiveRun: (runId, status) =>
      set((s) => {
        s.activeRunId = runId
        s.activeStatus = status
        s.activeTraces = []
      }),

    updateActiveStatus: (status) =>
      set((s) => { s.activeStatus = status }),

    addTrace: (trace) =>
      set((s) => { s.activeTraces.push(trace) }),

    updateTrace: (trace) =>
      set((s) => {
        const idx = s.activeTraces.findIndex((t) => t.nodeId === trace.nodeId)
        if (idx >= 0) s.activeTraces[idx] = trace
        else s.activeTraces.push(trace)
      }),

    clearActive: () =>
      set((s) => {
        s.activeRunId = null
        s.activeStatus = null
        s.activeTraces = []
      }),
  })),
)

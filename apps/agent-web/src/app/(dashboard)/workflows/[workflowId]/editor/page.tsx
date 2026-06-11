'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { WorkflowEditor } from '@/components/workflow-canvas/workflow-editor'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { useWorkflowStore } from '@/stores/use-workflow-store'
import type { Workflow, WorkflowNode, WorkflowEdge } from '@agent-studio/shared'
import type { Node, Edge } from '@xyflow/react'

export default function WorkflowEditorPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>()
  const router = useRouter()
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const { markSaved } = useWorkflowStore()

  useEffect(() => {
    apiClient.workflows.getById(workflowId).then(setWorkflow).finally(() => setLoading(false))
  }, [workflowId])

  const saveMutation = useApiMutation<{ nodes: Node[]; edges: Edge[] }, Workflow>({
    mutationFn: ({ nodes, edges }) =>
      apiClient.workflows.update(workflowId, {
        nodes: nodes as unknown as WorkflowNode[],
        edges: edges as unknown as WorkflowEdge[],
      }),
    successMessage: MSG.workflow.saved,
    onSuccess: () => markSaved(),
  })

  const handleSave = (nodes: Node[], edges: Edge[]) => {
    saveMutation.mutate({ nodes, edges })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">로딩 중...</div>
  if (!workflow) return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">워크플로우를 찾을 수 없습니다.</div>

  return (
    <div className="flex flex-col h-full">
      {/* 상단 헤더 */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-background">
        <button onClick={() => router.push(`/projects/${projectId}/workflows`)} className="text-xs text-muted-foreground hover:text-foreground">
          ← 목록
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{workflow.name}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${workflow.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
          {workflow.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => router.push(`/projects/${projectId}/workflows/${workflowId}/versions`)}
            className="text-xs px-2 py-1 rounded border hover:bg-muted"
          >
            버전 기록
          </button>
          <button
            onClick={() => router.push(`/projects/${projectId}/workflows/${workflowId}/runs`)}
            className="text-xs px-2 py-1 rounded border hover:bg-muted"
          >
            실행 기록
          </button>
        </div>
      </div>

      {/* 에디터 */}
      <div className="flex-1 overflow-hidden">
        <WorkflowEditor
          initialNodes={(workflow.nodes as unknown as Node[]) ?? []}
          initialEdges={(workflow.edges as unknown as Edge[]) ?? []}
          onSave={handleSave}
          isSaving={saveMutation.isPending}
        />
      </div>
    </div>
  )
}

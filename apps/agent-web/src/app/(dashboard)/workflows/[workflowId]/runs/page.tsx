'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import type { WorkflowRun } from '@agent-studio/shared'

const STATUS_COLOR: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  running: 'bg-blue-100 text-blue-700',
  pending: 'bg-muted text-muted-foreground',
  cancelled: 'bg-orange-100 text-orange-700',
  waiting_input: 'bg-yellow-100 text-yellow-700',
}

export default function WorkflowRunsPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>()
  const router = useRouter()
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.runs.listByWorkflow(workflowId).then((res) => {
      setRuns(res.runs)
      setTotal(res.total)
    }).finally(() => setLoading(false))
  }, [workflowId])

  if (loading) return <div className="p-6 text-muted-foreground text-sm">로딩 중...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${projectId}/workflows/${workflowId}/editor`)} className="text-xs text-muted-foreground hover:text-foreground">
          ← 에디터
        </button>
        <h1 className="text-xl font-semibold">실행 기록</h1>
        <span className="text-xs text-muted-foreground">총 {total}건</span>
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground">실행 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:shadow-sm cursor-pointer"
              onClick={() => router.push(`/projects/${projectId}/workflows/${workflowId}/runs/${run.id}`)}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${STATUS_COLOR[run.status] ?? 'bg-muted'}`}>
                    {run.status}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">{run.id.split('-')[0]}</span>
                </div>
                <p className="text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString('ko-KR')}</p>
              </div>
              <div className="text-right space-y-0.5">
                {run.totalSteps != null && <p className="text-xs">{run.totalSteps} 스텝</p>}
                {run.totalCost != null && <p className="text-xs text-muted-foreground">${run.totalCost.toFixed(4)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

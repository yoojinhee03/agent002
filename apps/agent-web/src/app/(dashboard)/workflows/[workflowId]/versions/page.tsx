'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { Loader2 } from 'lucide-react'
import type { WorkflowVersion } from '@agent-studio/shared'
import { useConfirm } from '@/components/shared/confirm-dialog'

export default function WorkflowVersionsPage() {
  const { projectId, workflowId } = useParams<{ projectId: string; workflowId: string }>()
  const router = useRouter()
  const [versions, setVersions] = useState<WorkflowVersion[]>([])
  const [loading, setLoading] = useState(true)
  const confirm = useConfirm()

  useEffect(() => {
    apiClient.workflows.listVersions(workflowId).then(setVersions).finally(() => setLoading(false))
  }, [workflowId])

  const rollbackMutation = useApiMutation({
    mutationFn: (versionId: string) => apiClient.workflows.rollback(workflowId, versionId),
    successMessage: MSG.workflowVersion.rolledBack,
    onSuccess: () => router.push(`/projects/${projectId}/workflows/${workflowId}/editor`),
  })

  const handleRollback = async (versionId: string) => {
    const ok = await confirm({
      title: '버전 롤백',
      message: '이 버전으로 롤백하시겠습니까?',
      confirmText: '롤백',
    })
    if (!ok) return
    rollbackMutation.mutate(versionId)
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">로딩 중...</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push(`/projects/${projectId}/workflows/${workflowId}/editor`)} className="text-xs text-muted-foreground hover:text-foreground">
          ← 에디터
        </button>
        <h1 className="text-xl font-semibold">버전 기록</h1>
      </div>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">저장된 버전이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-semibold">v{v.number}</span>
                  {v.label && <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{v.label}</span>}
                </div>
                <p className="text-xs text-muted-foreground">{v.message}</p>
                <p className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleString('ko-KR')}</p>
              </div>
              <button
                onClick={() => handleRollback(v.id)}
                disabled={rollbackMutation.isPending}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {rollbackMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                {rollbackMutation.isPending ? '롤백 중...' : '롤백'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

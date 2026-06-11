'use client'

import { useRef, useState, useEffect } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Copy, Download, Trash2, Loader2 } from 'lucide-react'
import type { Agent } from '@agent-studio/shared'

interface Props {
  agent: Agent
  onCloned: () => void
}

export function AgentContextMenu({ agent, onCloned }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const cloneMutation = useApiMutation({
    mutationFn: () => apiClient.agents.clone(agent.id),
    successMessage: MSG.agent.cloned,
    onSuccess: () => onCloned(),
  })

  const exportMutation = useApiMutation({
    mutationFn: () => apiClient.agents.exportAgent(agent.id),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `agent-${agent.slug}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  const deleteMutation = useApiMutation({
    mutationFn: () => apiClient.agents.delete(agent.id),
    successMessage: MSG.agent.deleted,
    onSuccess: () => {
      setConfirmDelete(false)
      onCloned()
    },
  })

  const busy = cloneMutation.isPending || exportMutation.isPending || deleteMutation.isPending

  const handleClone = () => {
    setOpen(false)
    cloneMutation.mutate()
  }

  const handleExport = () => {
    setOpen(false)
    exportMutation.mutate()
  }

  return (
    <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(prev => !prev)}
        disabled={busy}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)]',
          busy && 'opacity-40 cursor-not-allowed',
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-20 min-w-[160px] overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl">
          <button
            onClick={handleClone}
            disabled={cloneMutation.isPending}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-50"
          >
            {cloneMutation.isPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
            Clone
          </button>
          <button
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-50"
          >
            {exportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Download className="h-3.5 w-3.5 shrink-0" />}
            Export JSON
          </button>
          <div className="border-t border-[var(--color-border-strong)]" />
          <button
            onClick={() => { setOpen(false); setConfirmDelete(true) }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            Delete
          </button>
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !deleteMutation.isPending && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15">
                <Trash2 className="h-4 w-4 text-red-400" />
              </div>
              <h2 className="text-sm font-semibold text-[var(--color-fg)]">에이전트 삭제</h2>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-sm text-[var(--color-fg)]">
                <span className="font-semibold text-red-300">&quot;{agent.name}&quot;</span> 에이전트를 삭제할까요?
              </p>
              <p className="text-xs text-[var(--color-fg-subtle)]">이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleteMutation.isPending}
                className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {deleteMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                {deleteMutation.isPending ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

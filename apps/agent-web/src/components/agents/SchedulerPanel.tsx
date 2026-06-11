'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Play, Calendar, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import type { AgentSchedule } from '@agent-studio/shared'

interface Props {
  agentId: string
}

interface ScheduleForm {
  name: string
  cron: string
  input: string
}

const EMPTY_FORM: ScheduleForm = { name: '', cron: '', input: '{}' }

export function SchedulerPanel({ agentId }: Props) {
  const [schedules, setSchedules] = useState<AgentSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ScheduleForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    apiClient.agents.listSchedules(agentId)
      .then(setSchedules)
      .finally(() => setLoading(false))
  }, [agentId])

  const saveMutation = useApiMutation({
    mutationFn: (parsedInput: Record<string, unknown>) =>
      apiClient.agents.createSchedule(agentId, {
        name: form.name.trim(),
        cron: form.cron.trim(),
        input: parsedInput,
        enabled: true,
      }),
    successMessage: MSG.schedule.created,
    onSuccess: (created) => {
      setSchedules(prev => [...prev, created])
      setForm(EMPTY_FORM)
      setShowForm(false)
    },
  })

  const deleteMutation = useApiMutation({
    mutationFn: (scheduleId: string) => apiClient.agents.deleteSchedule(agentId, scheduleId),
    successMessage: MSG.schedule.deleted,
    onSuccess: (_result, scheduleId) => {
      setSchedules(prev => prev.filter(s => s.id !== scheduleId))
    },
  })

  const runMutation = useApiMutation({
    mutationFn: (scheduleId: string) => apiClient.agents.runSchedule(agentId, scheduleId),
    successMessage: MSG.schedule.ran,
    onSuccess: (_result, scheduleId) => {
      setSchedules(prev =>
        prev.map(s =>
          s.id === scheduleId ? { ...s, lastRunAt: new Date().toISOString() } : s,
        ),
      )
    },
  })

  const handleSave = () => {
    if (!form.name.trim()) { setFormError('이름을 입력하세요'); return }
    if (!form.cron.trim()) { setFormError('Cron 표현식을 입력하세요'); return }
    let parsedInput: Record<string, unknown>
    try {
      parsedInput = JSON.parse(form.input) as Record<string, unknown>
    } catch {
      setFormError('입력 JSON이 올바르지 않습니다')
      return
    }
    setFormError(null)
    saveMutation.mutate(parsedInput)
  }

  if (loading) {
    return <div className="p-6 text-xs text-[var(--color-fg-subtle)]">Loading...</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <span className="text-sm font-semibold text-[var(--color-fg)]">스케줄 실행</span>
          <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]">
            {schedules.length}
          </span>
        </div>
        <button
          onClick={() => { setShowForm(prev => !prev); setFormError(null) }}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          <Plus className="h-3.5 w-3.5" />
          스케줄 추가
          {showForm ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* 추가 폼 */}
      {showForm && (
        <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 space-y-3">
          <p className="text-xs font-medium text-[var(--color-fg-muted)]">새 스케줄</p>
          <div className="space-y-2">
            <input
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
              placeholder="스케줄 이름"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
              placeholder="Cron 표현식 (예: 0 9 * * 1-5)"
              value={form.cron}
              onChange={e => setForm(prev => ({ ...prev, cron: e.target.value }))}
            />
            <textarea
              className="w-full resize-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-3 py-2 text-xs font-mono text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
              rows={3}
              placeholder='입력 JSON (예: {"query": "daily report"})'
              value={form.input}
              onChange={e => setForm(prev => ({ ...prev, input: e.target.value }))}
            />
          </div>
          {formError && <p className="text-xs text-red-400">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
              className="rounded-md px-3 py-1.5 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 hover:bg-blue-500"
            >
              {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              {saveMutation.isPending ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* 스케줄 목록 */}
      {schedules.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-10 text-center">
          <Calendar className="mx-auto mb-2 h-6 w-6 text-[var(--color-border-strong)]" />
          <p className="text-xs text-[var(--color-fg-subtle)]">등록된 스케줄이 없습니다</p>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">위의 &quot;+ 스케줄 추가&quot; 버튼으로 주기적 실행을 예약하세요</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-strong)] bg-[var(--color-surface)]">
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-fg-subtle)]">이름</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-fg-subtle)]">Cron</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-fg-subtle)]">활성화</th>
                <th className="px-4 py-2.5 text-left font-medium text-[var(--color-fg-subtle)]">마지막 실행</th>
                <th className="px-4 py-2.5 text-right font-medium text-[var(--color-fg-subtle)]">작업</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((schedule, idx) => (
                <tr
                  key={schedule.id}
                  className={cn(
                    'border-b border-[var(--color-border)] last:border-0',
                    idx % 2 === 0 ? 'bg-[var(--color-bg)]' : 'bg-[var(--color-surface)]',
                  )}
                >
                  <td className="px-4 py-3 font-medium text-[var(--color-fg)]">{schedule.name}</td>
                  <td className="px-4 py-3 font-mono text-[var(--color-fg-muted)]">{schedule.cron}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-semibold',
                      schedule.enabled ? 'bg-green-500/15 text-green-400' : 'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]',
                    )}>
                      {schedule.enabled ? 'ON' : 'OFF'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-fg-subtle)]">
                    {schedule.lastRunAt
                      ? new Date(schedule.lastRunAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => runMutation.mutate(schedule.id)}
                        disabled={runMutation.isPending}
                        title="즉시 실행"
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-green-400',
                          runMutation.isPending && 'animate-pulse text-green-400',
                        )}
                      >
                        {runMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(schedule.id)}
                        disabled={deleteMutation.isPending}
                        title="삭제"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-red-400 disabled:opacity-40"
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

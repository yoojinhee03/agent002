'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { MissingCredentialItem } from '@agent-studio/shared'
import { X, KeyRound, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  missingCredentials: MissingCredentialItem[]
  onSuccess: () => void
  onClose: () => void
}

export function McpCredentialModal({ missingCredentials, onSuccess, onClose }: Props) {
  // 서버별 필드 값 저장: serverId → { fieldKey → value }
  const [values, setValues] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {}
    for (const item of missingCredentials) {
      init[item.serverId] = {}
      for (const f of item.fields) {
        init[item.serverId][f.key] = ''
      }
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  const setFieldValue = (serverId: string, key: string, value: string) => {
    setValues(prev => ({
      ...prev,
      [serverId]: { ...prev[serverId], [key]: value },
    }))
  }

  const handleSave = async () => {
    // 필수 필드 검증
    for (const item of missingCredentials) {
      for (const f of item.fields) {
        if (f.required !== false && !values[item.serverId]?.[f.key]?.trim()) {
          toast.error(`"${item.serverName}" 서버의 "${f.label}" 필드를 입력하세요`)
          return
        }
      }
    }

    setSaving(true)
    try {
      await Promise.all(
        missingCredentials.map(item =>
          apiClient.meMcp.saveCredential(item.serverId, values[item.serverId] ?? {}),
        ),
      )
      toast.success('자격증명이 저장되었습니다')
      onSuccess()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-[var(--color-fg)]">MCP 자격증명 필요</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-[var(--color-fg-subtle)]">
            이 에이전트를 실행하려면 아래 MCP 서버에 대한 개인 자격증명이 필요합니다.
            값을 입력하고 저장하면 자동으로 메시지가 재전송됩니다.
          </p>

          {missingCredentials.map(item => (
            <div key={item.serverId} className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-amber-400/80" />
                <span className="text-xs font-bold text-[var(--color-fg)]">{item.serverName}</span>
              </div>

              {item.fields.map(f => (
                <div key={f.key} className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--color-fg-muted)]">
                    {f.label}
                    {f.required !== false && <span className="ml-1 text-red-400">*</span>}
                  </label>
                  <input
                    type={f.secret ? 'password' : 'text'}
                    className={cn(
                      'input-dark w-full text-xs',
                      f.secret ? 'font-mono tracking-wider' : '',
                    )}
                    placeholder={f.placeholder ?? f.key}
                    value={values[item.serverId]?.[f.key] ?? ''}
                    onChange={e => setFieldValue(item.serverId, f.key, e.target.value)}
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40 hover:bg-amber-500"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            저장 후 재전송
          </button>
        </div>
      </div>
    </div>
  )
}

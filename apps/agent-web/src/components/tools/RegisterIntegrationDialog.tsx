'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { X, Link2, Lock, KeyRound, ShieldOff, Loader2 } from 'lucide-react'
import type { ToolGroup } from '@agent-studio/shared'

type AuthType = 'none' | 'bearer' | 'api_key'

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onCreated: (group: ToolGroup) => void
}

export function RegisterIntegrationDialog({ projectId, open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [specUrl, setSpecUrl] = useState('')
  const [baseUrlOverride, setBaseUrlOverride] = useState('')
  const [authType, setAuthType] = useState<AuthType>('none')
  const [authValue, setAuthValue] = useState('')
  const [authHeaderName, setAuthHeaderName] = useState('X-API-Key')

  const handleClose = () => {
    setName('')
    setSpecUrl('')
    setBaseUrlOverride('')
    setAuthType('none')
    setAuthValue('')
    setAuthHeaderName('X-API-Key')
    onClose()
  }

  const registerMutation = useApiMutation({
    mutationFn: () => {
      const auth =
        authType === 'none'
          ? { type: 'none' as const }
          : authType === 'bearer'
            ? { type: 'bearer' as const, value: authValue }
            : { type: 'api_key' as const, value: authValue, headerName: authHeaderName }

      return apiClient.integrations.register(projectId, {
        name: name.trim(),
        specUrl: specUrl.trim(),
        ...(baseUrlOverride.trim() ? { baseUrlOverride: baseUrlOverride.trim() } : {}),
        auth,
      })
    },
    successMessage: (group) => `'${group.name}' 연동 완료 — ${group.tools?.length ?? 0}개 도구가 등록됐습니다`,
    onSuccess: (group) => {
      onCreated(group)
      handleClose()
    },
  })

  if (!open) return null

  const handleSubmit = () => {
    if (!name.trim()) {
      return
    }
    if (!specUrl.trim()) {
      return
    }
    registerMutation.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[#13151f] p-6 shadow-2xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Link2 className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-fg">연동 서비스 추가</h2>
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            OpenAPI spec URL을 등록하면 API 엔드포인트가 에이전트 도구로 자동 등록됩니다
          </p>
        </div>

        <div className="space-y-4">
          {/* 서비스 이름 */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              서비스 이름 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 내부 파이프라인 서비스"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* OpenAPI spec URL */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              OpenAPI spec URL <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
              placeholder="예: http://192.168.0.54:7188/openapi.json"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Base URL 오버라이드 */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
              Base URL 오버라이드 <span className="text-[var(--color-fg-subtle)]">(선택)</span>
            </label>
            <input
              type="url"
              value={baseUrlOverride}
              onChange={(e) => setBaseUrlOverride(e.target.value)}
              placeholder="spec의 서버 URL 대신 사용할 URL"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 인증 설정 */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-2">인증 방식</label>
            <div className="flex gap-2 mb-3">
              {(
                [
                  { value: 'none', label: '없음', Icon: ShieldOff },
                  { value: 'bearer', label: 'Bearer Token', Icon: Lock },
                  { value: 'api_key', label: 'API Key', Icon: KeyRound },
                ] as const
              ).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setAuthType(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    authType === value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {label}
                </button>
              ))}
            </div>

            {authType === 'bearer' && (
              <input
                type="password"
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                placeholder="Bearer 토큰 값"
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
              />
            )}

            {authType === 'api_key' && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={authHeaderName}
                  onChange={(e) => setAuthHeaderName(e.target.value)}
                  placeholder="헤더명"
                  className="w-32 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                />
                <input
                  type="password"
                  value={authValue}
                  onChange={(e) => setAuthValue(e.target.value)}
                  placeholder="API Key 값"
                  className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-fg placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={registerMutation.isPending || !name.trim() || !specUrl.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {registerMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            {registerMutation.isPending ? '연동 중...' : '연동하기'}
          </button>
        </div>
      </div>
    </div>
  )
}

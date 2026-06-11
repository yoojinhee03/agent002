'use client'

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Loader2,
  Trash2,
  X,
  Slack,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type { SlackInstallationView } from '@/lib/api-client'

interface Props {
  installation: SlackInstallationView | null
  projectId: string
  onRefresh: () => void
}

function SecretInput({
  value,
  onChange,
  placeholder,
  label,
  required,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  label: string
  required?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 pr-9 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]"
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}

export function SlackInstallationCard({ installation, projectId, onRefresh }: Props) {
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [botToken, setBotToken] = useState('')
  const [appToken, setAppToken] = useState('')

  const installMutation = useApiMutation({
    mutationFn: ({ botToken: bt, appToken: at }: { botToken: string; appToken: string }) =>
      apiClient.slack.installations.create(projectId, { botToken: bt, appToken: at }),
    successMessage: MSG.slack.connected,
    onSuccess: () => {
      setShowInstallModal(false)
      setBotToken('')
      setAppToken('')
      onRefresh()
    },
  })

  const toggleMutation = useApiMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiClient.slack.installations.enable(id, enabled),
    successMessage: (_, { enabled }) => (enabled ? MSG.slack.enabled : MSG.slack.disabled),
    onSuccess: () => onRefresh(),
  })

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) => apiClient.slack.installations.delete(id),
    successMessage: MSG.slack.disconnected,
    onSuccess: () => onRefresh(),
  })

  const handleInstall = async () => {
    if (!botToken.trim() || !appToken.trim()) return
    await installMutation.mutate({ botToken: botToken.trim(), appToken: appToken.trim() })
  }

  const handleToggleEnable = () => {
    if (!installation?.id) return
    toggleMutation.mutate({ id: installation.id, enabled: !installation.enabled })
  }

  const handleDelete = () => {
    if (!installation?.id) return
    if (!window.confirm('Slack 워크스페이스 연결을 삭제하시겠습니까? 채널 매핑도 모두 삭제됩니다.')) return
    deleteMutation.mutate(installation.id)
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4a154b]/20">
              <Slack className="h-5 w-5 text-[#e01e5a]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Slack 워크스페이스</h2>
              <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                Socket Mode 를 사용해 봇 멘션 / DM 을 에이전트로 라우팅합니다
              </p>
            </div>
          </div>

          {installation?.installed ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleEnable}
                disabled={toggleMutation.isPending}
                title={installation.enabled ? '비활성화' : '활성화'}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                  installation.enabled ? 'bg-blue-500' : 'bg-[var(--color-border-strong)]',
                  toggleMutation.isPending && 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                    installation.enabled ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="rounded-lg p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                title="연결 삭제"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowInstallModal(true)}
              className="flex items-center gap-2 rounded-lg bg-[#4a154b] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#611f69]"
            >
              연결하기
            </button>
          )}
        </div>

        {installation?.installed ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">워크스페이스</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {installation.workspaceName ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Team ID</p>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {installation.workspaceTeamId ?? '-'}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">상태</p>
              <div className="mt-1 flex items-center gap-1.5">
                {installation.enabled ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-sm font-medium text-green-400">활성</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
                    <span className="text-sm font-medium text-[var(--color-fg-subtle)]">비활성</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-[var(--color-border-strong)] p-4 text-center">
            <p className="text-sm text-[var(--color-fg-subtle)]">Slack 워크스페이스가 연결되지 않았습니다</p>
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
              Bot Token 과 App-Level Token 을 입력해 워크스페이스를 연결하세요
            </p>
          </div>
        )}
      </div>

      {showInstallModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowInstallModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Slack className="h-4 w-4 text-[#e01e5a]" />
                <h2 className="text-base font-semibold text-foreground">Slack 워크스페이스 연결</h2>
              </div>
              <button
                onClick={() => setShowInstallModal(false)}
                className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-[var(--color-border-strong)] bg-bg p-3 text-xs leading-relaxed text-[var(--color-fg-subtle)]">
                <p className="font-semibold text-[var(--color-fg-muted)]">토큰 발급 방법</p>
                <p className="mt-1">
                  1. Slack App → <span className="text-[var(--color-fg)]">OAuth &amp; Permissions</span> 페이지에서 Bot Token(<code>xoxb-...</code>) 복사.
                </p>
                <p className="mt-1">
                  2. Slack App → <span className="text-[var(--color-fg)]">Socket Mode</span> 페이지에서 App-Level Token(<code>xapp-...</code>) 발급.
                </p>
                <p className="mt-1">두 토큰 입력 시 자동으로 워크스페이스 정보를 조회합니다.</p>
              </div>

              <SecretInput
                label="Bot User OAuth Token"
                value={botToken}
                onChange={setBotToken}
                placeholder="xoxb-..."
                required
              />

              <SecretInput
                label="App-Level Token"
                value={appToken}
                onChange={setAppToken}
                placeholder="xapp-..."
                required
              />

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleInstall}
                  disabled={!botToken.trim() || !appToken.trim() || installMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#4a154b] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#611f69] disabled:opacity-40"
                >
                  {installMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  연결하기
                </button>
                <button
                  onClick={() => setShowInstallModal(false)}
                  className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-bg"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { BuiltinToolGroup, BuiltinTool } from '@agent-studio/shared'
import { cn } from '@/lib/utils'
import type { Agent } from '@agent-studio/shared'
import { ChevronDown, ChevronRight, Loader2, Zap, X } from 'lucide-react'
import { PdfParseRulesPanel } from './PdfParseRulesPanel'

interface Props {
  projectId: string
}

const GROUP_ICON: Record<string, string> = {
  search: '🔍',
  google: '🌐',
  utilities: '⚙️',
  hr: '💼',
}

export function BuiltinToolsPanel({ projectId }: Props) {
  const defaultGmailRedirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/oauth/google/callback`
    : 'http://localhost:3001/oauth/google/callback'

  const [groups, setGroups] = useState<BuiltinToolGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [gmailConfigOpen, setGmailConfigOpen] = useState(false)
  const [gmailClientId, setGmailClientId] = useState('')
  const [gmailClientSecret, setGmailClientSecret] = useState('')
  const [gmailRedirectUri, setGmailRedirectUri] = useState(defaultGmailRedirectUri)
  const [gmailScopes, setGmailScopes] = useState('https://www.googleapis.com/auth/gmail.readonly')
  const [savingGmailConfig, setSavingGmailConfig] = useState(false)
  const [gmailHasClientSecret, setGmailHasClientSecret] = useState(false)

  const [gmailToolsExpanded, setGmailToolsExpanded] = useState(true)

  const [pdfRulesOpen, setPdfRulesOpen] = useState(false)
  const [pdfRulesAgentId, setPdfRulesAgentId] = useState<string | null>(null)
  const [agentsLoading, setAgentsLoading] = useState(false)

  const hasSavedGmailAppConfig = Boolean(
    gmailClientId.trim()
    && gmailRedirectUri.trim()
    && (gmailHasClientSecret || gmailClientSecret.trim()),
  )

  const findTool = (toolId: string): BuiltinTool | undefined => {
    for (const g of groups) {
      const t = g.tools.find((x) => x.id === toolId)
      if (t) return t
    }
    return undefined
  }

  useEffect(() => {
    apiClient.tools.getBuiltin(projectId)
      .then((data) => {
        setGroups(data)
        setExpandedGroups(new Set(data.map((g) => g.id)))
      })
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    setAgentsLoading(true)
    apiClient.agents.list(projectId)
      .then((list) => {
        const agents = list as Agent[]
        setPdfRulesAgentId(agents.length > 0 ? agents[0].id : null)
      })
      .catch(() => setPdfRulesAgentId(null))
      .finally(() => setAgentsLoading(false))
  }, [projectId])

  useEffect(() => {
    apiClient.tools.getGmailAppConfig(projectId)
      .then((cfg) => {
        if (cfg.clientId) setGmailClientId(cfg.clientId)
        if (cfg.redirectUri) setGmailRedirectUri(cfg.redirectUri)
        if (cfg.scopes && cfg.scopes.length > 0) setGmailScopes(cfg.scopes.join(', '))
        setGmailHasClientSecret(cfg.hasClientSecret)
        if (cfg.hasClientSecret && !gmailClientSecret) setGmailClientSecret('********')
      })
      .catch(() => {})
  }, [gmailClientSecret, projectId])

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const handleSaveGmailConfig = async () => {
    setSavingGmailConfig(true)
    try {
      const secret = gmailClientSecret.trim()
      await apiClient.tools.saveGmailAppConfig(projectId, {
        clientId: gmailClientId.trim(),
        ...(secret && secret !== '********' ? { clientSecret: secret } : {}),
        redirectUri: gmailRedirectUri.trim(),
        scopes: gmailScopes.split(',').map((s) => s.trim()).filter(Boolean),
      })
      setGmailConfigOpen(false)
    } finally {
      setSavingGmailConfig(false)
    }
  }

  const handleClearGmailConfig = async () => {
    setSavingGmailConfig(true)
    try {
      await apiClient.tools.clearGmailAppConfig(projectId)
      setGmailClientId('')
      setGmailClientSecret('')
      setGmailHasClientSecret(false)
      setGmailRedirectUri(defaultGmailRedirectUri)
      setGmailScopes('https://www.googleapis.com/auth/gmail.readonly')
      updateTool('gmail_connect', { configured: false })
      updateTool('gmail_search', { configured: false })
      updateTool('gmail_fetch', { configured: false })
      updateTool('gmail_fetch_attachment', { configured: false })
      updateTool('gmail_parse_pdf_attachment', { configured: false })
      updateTool('gmail_send', { configured: false })
      setGmailConfigOpen(false)
    } finally {
      setSavingGmailConfig(false)
    }
  }

  const updateTool = (toolId: string, patch: Partial<BuiltinTool>) => {
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        tools: g.tools.map((t) => (t.id === toolId ? { ...t, ...patch } : t)),
      })),
    )
  }

  const handleToggleTool = async (toolId: string, currentEnabled: boolean, requiresConfig: boolean, configured: boolean) => {
    const isGmailTool = toolId === 'gmail_connect' || toolId === 'gmail_search' || toolId === 'gmail_fetch'

    if (toolId === 'gmail_connect' && !configured) {
      if (!gmailConfigOpen && (!gmailClientId.trim() || (!gmailHasClientSecret && !gmailClientSecret.trim()))) {
        setGmailConfigOpen(true)
        return
      }
      const { url } = await apiClient.tools.getGmailAuthUrl(projectId)
      window.location.href = url
      return
    }
    setTogglingId(toolId)
    try {
      await apiClient.tools.toggleBuiltin(projectId, toolId, !currentEnabled)
      updateTool(toolId, { enabled: !currentEnabled })
      if (toolId === 'gmail_connect' && currentEnabled) {
        setGmailClientId('')
        setGmailClientSecret('')
        setGmailHasClientSecret(false)
        setGmailRedirectUri(defaultGmailRedirectUri)
        setGmailScopes('https://www.googleapis.com/auth/gmail.readonly')
        updateTool('gmail_connect', { configured: false })
        updateTool('gmail_search', { enabled: false, configured: false })
        updateTool('gmail_fetch', { enabled: false, configured: false })
        updateTool('gmail_fetch_attachment', { enabled: false, configured: false })
        updateTool('gmail_parse_pdf_attachment', { enabled: false, configured: false })
        updateTool('gmail_send', { enabled: false, configured: false })
      }
    } finally {
      setTogglingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--color-fg-subtle)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 안내 배너 */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
        <p className="text-xs text-yellow-300 font-medium mb-1">Built-in 도구란?</p>
        <p className="text-xs text-[var(--color-fg-subtle)]">
          플랫폼이 기본 제공하는 도구입니다. 활성화하면 Agent Builder의 Tools 탭에서 선택할 수 있습니다.
        </p>
      </div>

      {/* 그룹 목록 */}
      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.id)
          const enabledCount = group.tools.filter((t) => t.enabled).length
          const icon = GROUP_ICON[group.id] ?? '🔧'

          return (
            <div key={group.id} className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
              {/* 그룹 헤더 */}
              <div className="flex items-center gap-3 p-4">
                <span className="text-xl shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-fg)]">{group.name}</span>
                    {enabledCount > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-xs bg-green-500/15 text-green-400">
                        {enabledCount}개 활성
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">{group.description}</p>
                </div>
                <button
                  onClick={() => toggleExpand(group.id)}
                  className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />
                  }
                </button>
              </div>

              {/* 도구 목록 */}
              {isExpanded && (
                <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-surface-2)]">
                  {group.tools.map((tool) => {
                    const isToggling = togglingId === tool.id
                    const isGmailConnect = tool.id === 'gmail_connect'
                    const isGmailTool = tool.id === 'gmail_connect' || tool.id === 'gmail_search' || tool.id === 'gmail_fetch' || tool.id === 'gmail_fetch_attachment' || tool.id === 'gmail_parse_pdf_attachment' || tool.id === 'gmail_send'
                    const isGmailRunnable = tool.id === 'gmail_search' || tool.id === 'gmail_fetch' || tool.id === 'gmail_fetch_attachment' || tool.id === 'gmail_parse_pdf_attachment' || tool.id === 'gmail_send'
                    const canToggle = !(isGmailRunnable && !tool.configured)

                    if (isGmailRunnable && !gmailToolsExpanded) return null

                    // gmail_connect 의 "연동됨" 표시는 실제 refresh_token 보유(configured)
                    // 까지 충족해야 한다. enabled 만으로 그리면 토큰 없이도 연동된 것처럼 보인다.
                    const connectActive = isGmailConnect ? (tool.enabled && !!tool.configured) : tool.enabled
                    const buttonLabel = (() => {
                      if (isGmailConnect) return connectActive ? '연동 해제' : '연동'
                      if (tool.enabled) return '활성화'
                      return '활성화'
                    })()

                    return (
                      <div key={tool.id}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                            <Zap className="h-4 w-4 text-[var(--color-fg-subtle)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isGmailConnect && (
                                <button
                                  onClick={() => setGmailToolsExpanded((v) => !v)}
                                  className="shrink-0 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
                                  aria-label={gmailToolsExpanded ? '접기' : '펼치기'}
                                >
                                  {gmailToolsExpanded
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />
                                  }
                                </button>
                              )}
                              <p
                                className={cn(
                                  'text-xs font-medium text-[var(--color-fg)]',
                                )}
                              >
                                {tool.name}
                              </p>
                            </div>
                            <p className="text-xs text-[var(--color-fg-subtle)] truncate">{tool.description}</p>
                            {isGmailTool && tool.id !== 'gmail_connect' && !tool.configured && (
                              <p className="text-xs text-[var(--color-fg-subtle)]">Gmail 계정 연동이 필요합니다.</p>
                            )}
                            {isGmailConnect && !tool.configured && (
                              <p className="text-xs text-[var(--color-fg-subtle)]">Gmail 계정 연동이 필요합니다.</p>
                            )}
                            {isGmailConnect && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setGmailConfigOpen(true)}
                                  className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] underline"
                                >
                                  OAuth 설정
                                </button>
                                {hasSavedGmailAppConfig && (
                                  <button
                                    onClick={handleClearGmailConfig}
                                    disabled={savingGmailConfig}
                                    className="text-xs text-red-300/80 hover:text-red-300 underline disabled:opacity-50"
                                  >
                                    설정 삭제
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {isGmailRunnable && !tool.configured ? (
                            <div
                              className={cn(
                                'shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap min-w-[72px]',
                                'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] opacity-50 cursor-not-allowed',
                              )}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)]" />
                              비활성
                            </div>
                          ) : (
                            <button
                              onClick={() => handleToggleTool(tool.id, tool.enabled, tool.requiresConfig ?? false, tool.configured ?? false)}
                              disabled={isToggling || !canToggle}
                              className={cn(
                                'shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap min-w-[72px]',
                                connectActive
                                  ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                                  : 'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)]',
                                !canToggle && 'opacity-50 cursor-not-allowed hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-subtle)]',
                              )}
                            >
                              {isToggling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <span className={cn('h-1.5 w-1.5 rounded-full', connectActive ? 'bg-green-400' : 'bg-[var(--color-fg-subtle)]')} />
                                  {buttonLabel}
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {isGmailConnect && gmailConfigOpen && (
                          <div className="mx-4 mb-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                            <p className="text-xs text-blue-300 font-medium">Gmail OAuth 앱 설정</p>
                            <input
                              value={gmailClientId}
                              onChange={(e) => setGmailClientId(e.target.value)}
                              placeholder="Client ID"
                              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                            />
                            <input
                              value={gmailClientSecret}
                              onChange={(e) => setGmailClientSecret(e.target.value)}
                              placeholder="Client Secret"
                              type="password"
                              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                            />
                            <input
                              value={gmailRedirectUri}
                              onChange={(e) => setGmailRedirectUri(e.target.value)}
                              placeholder="Redirect URI"
                              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                            />
                            <input
                              value={gmailScopes}
                              onChange={(e) => setGmailScopes(e.target.value)}
                              placeholder="Scopes (comma separated)"
                              className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSaveGmailConfig}
                                disabled={
                                  savingGmailConfig
                                  || !gmailClientId.trim()
                                  || !gmailRedirectUri.trim()
                                  || (!gmailHasClientSecret && !gmailClientSecret.trim())
                                }
                                className="px-3 py-1 text-xs font-medium rounded bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                              >
                                {savingGmailConfig ? '저장 중...' : '저장'}
                              </button>
                              <button
                                onClick={handleClearGmailConfig}
                                disabled={savingGmailConfig}
                                className="px-3 py-1 text-xs font-medium rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                              >
                                삭제
                              </button>
                              <button
                                onClick={() => setGmailConfigOpen(false)}
                                className="px-3 py-1 text-xs rounded text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)] transition-colors"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

      </div>

      {/* Document Tools (document_preprocess, pdf_parse) 섹션은 제거됨.
        - runner registry.py 정책상 두 도구는 LLM 직접 호출 대상이 아니라
          `gmail_parse_pdf_attachment` 내부 파이프라인에서만 호출됨.
        - 사용자에게 "활성화 가능한 도구" 처럼 보이는 UX 혼란을 막기 위해 UI 노출 제거.
        - PdfParseRulesPanel 모달 컴포넌트 자체는 향후 별도 진입점(예: agent settings)
          에서 재사용 가능하도록 보존. 현재 진입점이 없어 모달은 열리지 않음.
       */}

      {pdfRulesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-4xl rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--color-fg)]">PDF Parse 규칙</p>
                <p className="text-xs text-[var(--color-fg-subtle)]">서류 유형 식별/검증 규칙을 설정합니다.</p>
              </div>
              <button
                onClick={() => setPdfRulesOpen(false)}
                className="rounded-lg p-2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-y-auto p-4">
              {!pdfRulesAgentId ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center">
                  <p className="text-xs text-[var(--color-fg-subtle)]">규칙을 설정할 Agent가 없습니다. 먼저 Agent를 생성하세요.</p>
                </div>
              ) : (
                <PdfParseRulesPanel agentId={pdfRulesAgentId} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

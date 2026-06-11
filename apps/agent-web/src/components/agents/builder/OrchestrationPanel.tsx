'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type * as MonacoType from 'monaco-editor'
import { apiClient } from '@/lib/api-client'
import type { Agent, UpdateAgentRequest, PromptVersion } from '@agent-studio/shared'
import type { AgentArchitecture } from '@agent-studio/shared'
import { defineMonacoTheme, resolveMonacoThemeBase, resolveThemeColors } from '@/lib/monaco-theme'
import { Clock, Sparkles, HelpCircle, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getActiveVariableGroups } from '@/lib/prompt-variables'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface CustomVar {
  name: string
  type: 'string' | 'number' | 'select'
  required: boolean
}

interface Props {
  agent: Agent
  agentId: string
  projectId: string
  onChange: (changes: UpdateAgentRequest) => void
  onOpenSettings?: (tab?: string) => void
}

function SectionHeader({
  title,
  showHelp = false,
  action,
}: {
  title: string
  showHelp?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-[var(--color-fg)]">{title}</span>
        {showHelp && <HelpCircle className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />}
      </div>
      {action}
    </div>
  )
}

export function OrchestrationPanel({ agent, agentId, onChange, onOpenSettings }: Props) {
  const [prompt, setPrompt] = useState(agent.systemPrompt ?? '')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [editorFocused, setEditorFocused] = useState(false)
  const [customVars, setCustomVars] = useState<CustomVar[]>([])
  const [showAddVar, setShowAddVar] = useState(false)
  const [newVarName, setNewVarName] = useState('')
  const [newVarType, setNewVarType] = useState<CustomVar['type']>('string')
  const [showReservedVars, setShowReservedVars] = useState(true)
  const [enabledBuiltinIds, setEnabledBuiltinIds] = useState<Set<string> | null>(null)
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null)

  const activeArchitectures: AgentArchitecture[] = agent.architectures?.length
    ? agent.architectures
    : [agent.architecture ?? 'react']

  const reservedVarGroups = getActiveVariableGroups(activeArchitectures)

  useEffect(() => {
    apiClient.agents.listPromptVersions(agentId)
      .then(setVersions)
      .catch(() => {})
  }, [agentId])

  // 외부 (Agent Assistant edit_agent 적용 등) 로 agent.systemPrompt 가 갱신되면 sync.
  useEffect(() => {
    setPrompt(agent.systemPrompt ?? '')
  }, [agent.systemPrompt])

  useEffect(() => {
    apiClient.tools.getBuiltin(agent.projectId)
      .then((groups) => {
        const ids = new Set<string>()
        groups.forEach((g) => g.tools.forEach((t) => { if (t.enabled) ids.add(t.id) }))
        ids.delete('gmail_connect')
        setEnabledBuiltinIds(ids)
      })
      .catch(() => {
        setEnabledBuiltinIds(null)
      })
  }, [agent.projectId])

  const handlePromptChange = (val: string | undefined) => {
    const v = val ?? ''
    setPrompt(v)
    onChange({ systemPrompt: v })
  }

  const handleRestoreVersion = (version: PromptVersion) => {
    setPrompt(version.systemPrompt)
    onChange({ systemPrompt: version.systemPrompt })
    setShowVersions(false)
  }

  const handleAddVar = () => {
    if (!newVarName.trim()) return
    setCustomVars(prev => [...prev, { name: newVarName.trim(), type: newVarType, required: false }])
    setNewVarName('')
    setNewVarType('string')
    setShowAddVar(false)
  }

  const handleRemoveVar = (i: number) => {
    setCustomVars(prev => prev.filter((_, idx) => idx !== i))
  }

  const insertVariable = (key: string) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    if (!selection) return
    editor.executeEdits('insert-variable', [{
      range: selection,
      text: key,
      forceMoveMarkers: true,
    }])
    editor.focus()
  }

  const tokenCount = Math.ceil(prompt.length / 4)

  const visibleBuiltinIds = useMemo(() => {
    const ids = (agent.builtinToolIds ?? []).filter((id) => id !== 'gmail_connect')
    if (!enabledBuiltinIds) return ids
    return ids.filter((id) => enabledBuiltinIds.has(id))
  }, [agent.builtinToolIds, enabledBuiltinIds])

  const builtinCount = visibleBuiltinIds.length

  const activeToolCount =
    (agent.toolGroupIds?.length ?? 0) +
    (agent.mcpServerIds?.length ?? 0) +
    builtinCount

  return (
    <div className="flex flex-col overflow-y-auto custom-scrollbar h-full bg-[var(--color-bg)]">

      {/* ── Section 1: 단계 (System Prompt) ── */}
      <div className="border-b border-[var(--color-border)] px-6 py-4">
        <SectionHeader
          title="단계"
          showHelp
          action={
            <button className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)]">
              <Sparkles className="h-3 w-3" />
              자동
            </button>
          }
        />

        {/* Monaco Editor 영역 */}
        <div
          className={cn(
            'flex flex-col rounded-xl border bg-[var(--color-bg)] overflow-hidden transition-colors duration-200',
            editorFocused ? 'border-blue-500/60' : 'border-[var(--color-border)]',
          )}
        >
          {/* 포커스 시 파란 상단 테두리 */}
          <div
            className={cn(
              'h-0.5 w-full transition-opacity duration-200',
              editorFocused
                ? 'bg-gradient-to-r from-blue-500 to-blue-400/40 opacity-100'
                : 'opacity-0',
            )}
          />

          <div className="min-h-[260px]">
            <Editor
              height="260px"
              language="markdown"
              value={prompt}
              onChange={handlePromptChange}
              beforeMount={(monaco) => {
                defineMonacoTheme(monaco)
                const c = resolveThemeColors()
                monaco.editor.defineTheme('agent-studio-orch', {
                  base: resolveMonacoThemeBase(),
                  inherit: true,
                  rules: [],
                  colors: {
                    'editor.background': c.bg,
                  },
                })
              }}
              onMount={(editor) => {
                editorRef.current = editor
                editor.onDidFocusEditorWidget(() => setEditorFocused(true))
                editor.onDidBlurEditorWidget(() => setEditorFocused(false))
              }}
              theme="agent-studio-orch"
              options={{
                fontSize: 12,
                lineHeight: 20,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 12, bottom: 12 },
                renderLineHighlight: 'none',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: { verticalScrollbarSize: 4 },
                placeholder: '여기에 프롬프트 단어를 입력하세요. 변수를 삽입하려면 \'{{\'를 입력하고, 프롬프트 컨텐츠 블록을 삽입하려면...',
              }}
            />
          </div>

          {/* 하단: 토큰 카운트 + 히스토리 */}
          <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 bg-[var(--color-surface)]/40">
            <span className="text-xs text-[var(--color-fg-subtle)]">{tokenCount}</span>
            <button
              onClick={() => setShowVersions(!showVersions)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
            >
              <Clock className="h-3 w-3" />
              히스토리
            </button>
          </div>

          {/* 버전 히스토리 */}
          {showVersions && (
            <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-2 max-h-[180px] overflow-y-auto">
              {versions.length === 0 ? (
                <p className="p-4 text-center text-xs text-[var(--color-fg-subtle)]">저장된 버전 없음</p>
              ) : (
                <div className="space-y-1">
                  {versions.map(v => (
                    <div key={v.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
                      <div>
                        <span className="text-xs font-semibold text-[var(--color-fg)]">v{v.version}</span>
                        <p className="text-[8px] text-[var(--color-fg-subtle)]">{new Date(v.createdAt).toLocaleString('ko-KR')}</p>
                      </div>
                      <button
                        onClick={() => handleRestoreVersion(v)}
                        className="rounded bg-blue-600/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-600/20"
                      >
                        복원
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: 변수 ── */}
      <div className="border-b border-[var(--color-border)] px-6 py-4">
        <SectionHeader
          title="변수"
          showHelp
          action={
            <button
              onClick={() => setShowAddVar(!showAddVar)}
              className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <Plus className="h-3 w-3" />
              추가
            </button>
          }
        />

        <p className="text-xs text-[var(--color-fg-subtle)] leading-relaxed">
          변수를 사용하면 사용자는 양식에 입력할 때 프롬프트의 단어나 시작 단어를 소개할 수 있습니다.{' '}
          <code className="rounded bg-[var(--color-surface)] px-1 py-0.5 text-xs text-blue-400">{'{{input}}'}</code>을 프롬프트 단어에 입력해 보세요.
        </p>

        {/* ── 예약 변수 (시스템 제공) ── */}
        <div className="mt-4 rounded-xl border border-[var(--color-border)] overflow-hidden">
          <button
            onClick={() => setShowReservedVars(!showReservedVars)}
            className="flex w-full items-center justify-between bg-[var(--color-surface)] px-3 py-2 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">예약 변수</span>
              <span className="text-xs text-[var(--color-fg-subtle)]">클릭하면 커서 위치에 삽입</span>
            </div>
            {showReservedVars
              ? <ChevronUp className="h-3 w-3 text-[var(--color-fg-subtle)]" />
              : <ChevronDown className="h-3 w-3 text-[var(--color-fg-subtle)]" />}
          </button>

          {showReservedVars && (
            <div className="divide-y divide-[var(--color-surface-2)]">
              {reservedVarGroups.map(group => (
                <div key={group.id} className="p-2.5 space-y-1.5">
                  <span className={cn(
                    'inline-flex rounded-full border px-2 py-0.5 text-xs font-bold',
                    group.color, group.bgColor, group.borderColor,
                  )}>
                    {group.label}
                  </span>
                  <div className="grid grid-cols-1 gap-1">
                    {group.variables.map(v => (
                      <button
                        key={v.key}
                        onClick={() => insertVariable(v.key)}
                        title={v.example ? `예시: ${v.example}` : undefined}
                        className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface)] active:scale-[0.98]"
                      >
                        <code className={cn('shrink-0 text-xs font-bold font-mono', group.color)}>
                          {v.key}
                        </code>
                        <span className="text-xs text-[var(--color-fg-subtle)] truncate">{v.desc}</span>
                        {v.example && (
                          <span className="ml-auto shrink-0 text-xs text-[var(--color-border-strong)] font-mono">
                            → {v.example}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 변수 추가 폼 */}
        {showAddVar && (
          <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500/50 focus:outline-none"
                placeholder="변수 이름 (예: input)"
                value={newVarName}
                onChange={e => setNewVarName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddVar() }}
              />
              <select
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-fg)] focus:outline-none"
                value={newVarType}
                onChange={e => setNewVarType(e.target.value as CustomVar['type'])}
              >
                <option value="string">텍스트</option>
                <option value="number">숫자</option>
                <option value="select">선택</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAddVar(false); setNewVarName('') }}
                className="text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
              >
                취소
              </button>
              <button
                onClick={handleAddVar}
                className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
              >
                추가
              </button>
            </div>
          </div>
        )}

        {/* 변수 목록 */}
        {customVars.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {customVars.map((v, i) => (
              <div
                key={i}
                className="group flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <code className="text-xs font-bold text-blue-400">{`{{${v.name}}}`}</code>
                  <span className="rounded bg-[var(--color-border-strong)] px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)]">{v.type}</span>
                </div>
                <button
                  onClick={() => handleRemoveVar(i)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5 text-[var(--color-fg-subtle)] hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: 컨텍스트 ── */}
      <div className="border-b border-[var(--color-border)] px-6 py-4">
        <SectionHeader
          title="컨텍스트"
          showHelp
          action={
            <button className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface-2)]">
              <Plus className="h-3 w-3" />
              추가
            </button>
          }
        />
        <p className="text-xs text-[var(--color-fg-subtle)]">지식을 컨텍스트로 가져올 수 있습니다</p>
      </div>

      {/* ── Section 4: 메타데이터 필터링 ── */}
      <div className="border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--color-fg)]">메타데이터 필터링</span>
            <HelpCircle className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          </div>
          <select
            className="appearance-none rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] focus:outline-none cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors"
            defaultValue="none"
          >
            <option value="none">사용안함</option>
            <option value="enabled">활성화</option>
          </select>
        </div>
      </div>

      {/* ── Section 5: 도구 ── */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-[var(--color-fg)]">도구</span>
            <HelpCircle className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-fg-subtle)]">{activeToolCount}/{activeToolCount} 활성됨</span>
            <div className="h-3 w-px bg-[var(--color-border-strong)]" />
            <button
              onClick={() => onOpenSettings?.('tools')}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              추가
            </button>
          </div>
        </div>

        {/* 활성 도구 칩 */}
        {activeToolCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visibleBuiltinIds.map(id => (
              <span
                key={id}
                className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)]"
              >
                {id}
              </span>
            ))}
            {(agent.toolGroupIds ?? []).map(id => (
              <span
                key={id}
                className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)]"
              >
                group:{id.slice(0, 8)}
              </span>
            ))}
            {(agent.mcpServerIds ?? []).map(id => (
              <span
                key={id}
                className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)]"
              >
                mcp:{id.slice(0, 8)}
              </span>
            ))}
          </div>
        )}

        {activeToolCount === 0 && (
          <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">
            도구를 추가하면 에이전트가 외부 작업을 수행할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}

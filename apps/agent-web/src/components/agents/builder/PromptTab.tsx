'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type * as MonacoType from 'monaco-editor'
import { apiClient } from '@/lib/api-client'
import type { Agent, UpdateAgentRequest, PromptVersion } from '@agent-studio/shared'
import { defineMonacoTheme, resolveMonacoThemeBase, resolveThemeColors } from '@/lib/monaco-theme'
import { Clock, RotateCcw, Plus, X, ChevronDown, ChevronUp, Eye, Pencil, Columns2, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getActiveVariableGroups } from '@/lib/prompt-variables'
import { renderMarkdown } from '@/lib/markdown'
import type { AgentArchitecture } from '@agent-studio/shared'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface FewShot { role: 'user' | 'assistant'; content: string }

interface Props {
  agent: Agent
  agentId: string
  onChange: (changes: UpdateAgentRequest) => void
}

export function PromptTab({ agent, agentId, onChange }: Props) {
  const [prompt, setPrompt] = useState(agent.systemPrompt)
  const [fewShots, setFewShots] = useState<FewShot[]>([])
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [showAddShot, setShowAddShot] = useState(false)
  const [newShot, setNewShot] = useState<FewShot>({ role: 'user', content: '' })
  const [showVariables, setShowVariables] = useState(true)
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [sizeMode, setSizeMode] = useState<'fixed' | 'full'>('fixed')
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef<'editor' | 'preview' | null>(null)

  useEffect(() => {
    if (viewMode !== 'split') return
    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return

    const ratio = (top: number, max: number) => (max > 0 ? top / max : 0)

    const onEditorScroll = editor.onDidScrollChange(e => {
      if (syncingRef.current === 'preview') return
      const maxEditor = e.scrollHeight - editor.getLayoutInfo().height
      const r = ratio(e.scrollTop, maxEditor)
      syncingRef.current = 'editor'
      preview.scrollTop = r * (preview.scrollHeight - preview.clientHeight)
      requestAnimationFrame(() => { syncingRef.current = null })
    })

    const onPreviewScroll = () => {
      if (syncingRef.current === 'editor') return
      const r = ratio(preview.scrollTop, preview.scrollHeight - preview.clientHeight)
      const editorScrollHeight = editor.getScrollHeight()
      const editorLayoutHeight = editor.getLayoutInfo().height
      syncingRef.current = 'preview'
      editor.setScrollTop(r * (editorScrollHeight - editorLayoutHeight))
      requestAnimationFrame(() => { syncingRef.current = null })
    }

    preview.addEventListener('scroll', onPreviewScroll)
    return () => {
      onEditorScroll.dispose()
      preview.removeEventListener('scroll', onPreviewScroll)
    }
  }, [viewMode, sizeMode, prompt])

  useEffect(() => {
    if (sizeMode !== 'full') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSizeMode('fixed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sizeMode])

  useEffect(() => {
    apiClient.agents.listPromptVersions(agentId)
      .then(setVersions)
      .catch(() => {})
  }, [agentId])

  // 외부 (Agent Assistant edit_agent 적용, 다른 탭에서 저장, 버전 복원 등) 로 agent.systemPrompt
  // 가 갱신되면 local state 도 sync. 같은 값으로 set 하면 React 가 no-op 처리해 무한 루프
  // 안전. 사용자가 편집 중일 때는 handlePromptChange 가 즉시 외부 state 도 갱신하므로 외부
  // 값과 같아져 useEffect 가 한 사이클 더 돌아도 no-op.
  useEffect(() => {
    setPrompt(agent.systemPrompt)
  }, [agent.systemPrompt])

  const handlePromptChange = (val: string | undefined) => {
    const v = val ?? ''
    setPrompt(v)
    onChange({ systemPrompt: v })
  }

  const handleRestoreVersion = async (version: PromptVersion) => {
    setPrompt(version.systemPrompt)
    onChange({ systemPrompt: version.systemPrompt })
    setShowVersions(false)
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

  const addFewShot = () => {
    if (!newShot.content.trim()) return
    const updated = [...fewShots, newShot]
    setFewShots(updated)
    setNewShot({ role: 'user', content: '' })
    setShowAddShot(false)
  }

  const removeFewShot = (i: number) => {
    setFewShots(prev => prev.filter((_, idx) => idx !== i))
  }

  const tokenCount = Math.ceil(prompt.length / 4)

  // 현재 활성 아키텍처 목록
  const activeArchitectures: AgentArchitecture[] = agent.architectures?.length
    ? agent.architectures
    : [agent.architecture ?? 'react']

  const variableGroups = getActiveVariableGroups(activeArchitectures)

  const heightClass = sizeMode === 'full' ? 'flex-1 min-h-0' : 'h-[360px]'

  const editorElement = (
    <Editor
      height="100%"
      language="markdown"
      value={prompt}
      onChange={handlePromptChange}
      onMount={(editor) => { editorRef.current = editor }}
      beforeMount={(monaco) => {
        defineMonacoTheme(monaco)
        const c = resolveThemeColors()
        monaco.editor.defineTheme('agent-studio-seamless', {
          base: resolveMonacoThemeBase(),
          inherit: true,
          rules: [],
          colors: {
            'editor.background': c.bg,
            'editor.lineNumbersBackground': c.bg,
          },
        })
      }}
      theme="agent-studio-seamless"
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
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 12,
        lineNumbersMinChars: 0,
        automaticLayout: true,
      }}
    />
  )

  const previewElement = (
    <div
      ref={previewRef}
      className="prose-invert-custom max-w-none px-4 py-3 text-sm overflow-y-auto h-full bg-[var(--color-bg)] text-[var(--color-fg)]"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(prompt) }}
    />
  )

  const toggleSizeMode = () => setSizeMode(prev => (prev === 'fixed' ? 'full' : 'fixed'))

  const editorContainerClass = sizeMode === 'full'
    ? 'fixed inset-0 z-50 flex flex-col rounded-none border-none bg-[var(--color-bg)] overflow-hidden'
    : 'flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden'

  const viewModeOptions: Array<{ value: 'edit' | 'preview' | 'split'; icon: React.ReactNode; label: string }> = [
    { value: 'edit', icon: <Pencil className="h-3.5 w-3.5" />, label: 'Edit' },
    { value: 'preview', icon: <Eye className="h-3.5 w-3.5" />, label: 'Preview' },
    { value: 'split', icon: <Columns2 className="h-3.5 w-3.5" />, label: 'Split' },
  ]

  const editorSection = (
    <div className={editorContainerClass}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2 bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <span className="section-title">System Prompt</span>
          <span className="text-xs text-[var(--color-fg-subtle)]">{tokenCount} 토큰 (예상)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
            {viewModeOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setViewMode(opt.value)}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={viewMode === opt.value}
                className={cn(
                  'flex h-6 w-7 items-center justify-center rounded transition-colors',
                  viewMode === opt.value
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>
          <button
            onClick={toggleSizeMode}
            className="flex h-6 w-7 items-center justify-center rounded text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            title={sizeMode === 'full' ? '축소' : '전체화면'}
            aria-label={sizeMode === 'full' ? '축소' : '전체화면'}
          >
            {sizeMode === 'full' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setShowVersions(!showVersions)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            <Clock className="h-3 w-3" />
            History
          </button>
        </div>
      </div>

      <div className={cn(heightClass, 'relative min-h-0 overflow-hidden')}>
        {viewMode === 'edit' && <div className="absolute inset-0">{editorElement}</div>}
        {viewMode === 'preview' && <div className="absolute inset-0">{previewElement}</div>}
        {viewMode === 'split' && (
          <div className="absolute inset-0 grid grid-cols-2 divide-x divide-[var(--color-border)]">
            <div className="relative min-h-0 min-w-0 overflow-hidden">
              <div className="absolute inset-0">{editorElement}</div>
            </div>
            <div className="relative min-h-0 min-w-0 overflow-hidden">
              <div className="absolute inset-0">{previewElement}</div>
            </div>
          </div>
        )}
      </div>

      {showVersions && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] p-2 max-h-[200px] overflow-y-auto">
          {versions.length === 0 ? (
            <p className="p-4 text-center text-xs text-[var(--color-fg-subtle)]">저장된 버전 없음</p>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {versions.map(v => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2">
                  <div>
                    <span className="text-xs font-semibold text-[var(--color-fg)]">v{v.version}</span>
                    <p className="text-xs text-[var(--color-fg-subtle)]">{new Date(v.createdAt).toLocaleString('ko-KR')}</p>
                  </div>
                  <button onClick={() => handleRestoreVersion(v)} className="rounded bg-blue-600/10 px-2 py-1 text-xs text-blue-400 hover:bg-blue-600/20">
                    <RotateCcw className="inline h-2.5 w-2.5 mr-0.5" />Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col space-y-4 px-6 pt-2">
      {/* Editor Area */}
      {editorSection}

      {/* Reserved Variables */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <button
          onClick={() => setShowVariables(!showVariables)}
          className="flex w-full items-center justify-between px-4 py-2.5 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="section-title">예약 변수</span>
            <span className="text-xs text-[var(--color-fg-subtle)]">클릭하면 커서 위치에 삽입됩니다</span>
          </div>
          {showVariables
            ? <ChevronUp className="h-3 w-3 text-[var(--color-fg-subtle)]" />
            : <ChevronDown className="h-3 w-3 text-[var(--color-fg-subtle)]" />}
        </button>

        {showVariables && (
          <div className="border-t border-[var(--color-border)] divide-y divide-[var(--color-border-subtle)]">
            {variableGroups.map(group => (
              <div key={group.id} className="p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-bold',
                    group.color, group.bgColor, group.borderColor
                  )}>
                    {group.label}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
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

      {/* Few-shot Examples */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="section-title">Few-shot Examples ({fewShots.length})</span>
          <button
            onClick={() => setShowAddShot(!showAddShot)}
            className="flex items-center gap-1 rounded bg-blue-600/10 px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-600/20"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>

        {showAddShot && (
          <div className="border-t border-[var(--color-border)] p-3 space-y-2">
            <select
              value={newShot.role}
              onChange={e => setNewShot(p => ({ ...p, role: e.target.value as FewShot['role'] }))}
              className="input"
            >
              <option value="user">User</option>
              <option value="assistant">Assistant</option>
            </select>
            <textarea
              className="input h-16 resize-none"
              placeholder="내용 입력..."
              value={newShot.content}
              onChange={e => setNewShot(p => ({ ...p, content: e.target.value }))}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddShot(false)} className="text-xs text-[var(--color-fg-subtle)]">Cancel</button>
              <button onClick={addFewShot} className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500">Save</button>
            </div>
          </div>
        )}

        {fewShots.length > 0 && (
          <div className="border-t border-[var(--color-border)] p-3 space-y-2 max-h-[150px] overflow-y-auto">
            {fewShots.map((s, i) => (
              <div key={i} className="group relative rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-2 pr-8">
                <span className={cn('text-xs font-bold uppercase', s.role === 'user' ? 'text-blue-400' : 'text-green-400')}>{s.role}</span>
                <p className="mt-0.5 text-xs text-[var(--color-fg-muted)] line-clamp-2 leading-relaxed">{s.content}</p>
                <button
                  onClick={() => removeFewShot(i)}
                  className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3 text-[var(--color-fg-subtle)] hover:text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

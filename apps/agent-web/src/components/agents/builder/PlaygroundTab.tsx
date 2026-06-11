'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { wsClient } from '@/lib/ws-client'
import type { Agent, AgentArchitecture, WsStepStartedEvent, WsStepCompletedEvent, WsStepFailedEvent } from '@agent-studio/shared'
import type { EnabledModel } from '@/types/provider'
import {
  Play, Square, Loader2, ChevronDown, ChevronRight,
  CheckCircle, XCircle, RotateCcw, Terminal, Brain,
  Wrench, AlertCircle, Zap, SlidersHorizontal, X, Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ============================================================
// 통합 채팅 아이템 타입
// ============================================================

type ChatItem =
  | { kind: 'message'; role: 'human' | 'ai'; content: string; timestamp: number; streaming?: boolean }
  | { kind: 'thinking'; content: string; done: boolean; id: string }
  | { kind: 'tool_call'; id: string; name: string; input: unknown; output?: unknown; latencyMs?: number; done: boolean; error?: string; subItems?: ChatItem[]; streamingContent?: string; currentMode?: 'thinking' | 'answering'; collapsed?: boolean }
  | { kind: 'error'; content: string; timestamp: number }

// ============================================================
// StreamingOneLine
// ============================================================

function StreamingOneLine({ content, done, variant = 'answering' }: { content: string; done: boolean; variant?: 'thinking' | 'answering' }) {
  const lines = useMemo(() => 
    content.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
  , [content]);

  const currentLine = lines[lines.length - 1] || '';
  const isThinking = variant === 'thinking'

  return (
    <div className="flex justify-end items-center overflow-hidden w-full h-5 relative pr-2">
      <div className="absolute inset-0 z-10 pointer-events-none" 
           style={{ background: 'linear-gradient(to right, var(--color-bg) 0%, transparent 15%, transparent 85%, var(--color-bg) 100%)' }} />
      
      <div key={content} className={cn(
        "whitespace-nowrap text-xs italic select-none tracking-tight",
        isThinking 
          ? "text-purple-400/80 animate-line-thought-in" 
          : "text-[var(--color-fg-muted)]/80 animate-line-slide-up-in"
      )}>
        {isThinking && <span className="mr-1.5 opacity-50 font-sans not-italic">사고 중:</span>}
        {currentLine}
        {!done && <span className={cn("ml-1 animate-pulse font-bold", isThinking ? "text-purple-400/40" : "text-blue-400/40")}>...</span>}
      </div>
    </div>
  )
}

interface ToolCallItem {
  name: string
  input: unknown
  output?: unknown
  latencyMs?: number
  startedAt: number
}

interface Metrics {
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  cost?: number
}

interface HitlPayload {
  threadId: string
  prompt: string
  context?: unknown
}

type RightTab = 'chat' | 'tools' | 'state'

interface Props {
  agent: Agent
  projectId: string
  onOpenSettings?: (tab?: string) => void
  onConfigureModel?: () => void
}

// ============================================================
// JsonCollapsible
// ============================================================

function JsonCollapsible({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border border-[var(--color-border-strong)] overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="font-medium">{label}</span>
        {!open && data !== undefined && (
          <span className="ml-auto truncate max-w-[160px] text-[var(--color-fg-subtle)] font-mono text-xs">
            {JSON.stringify(data).slice(0, 60)}
          </span>
        )}
      </button>
      {open && (
        <pre className="px-3 pb-3 pt-1 text-xs text-fg overflow-x-auto whitespace-pre-wrap border-t border-[var(--color-border-strong)] bg-[var(--color-bg)]/60 leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ============================================================
// ThinkingCard — 인라인 사고 과정 카드
// ============================================================

function ThinkingCard({ item }: { item: Extract<ChatItem, { kind: 'thinking' }> }) {
  const [expanded, setExpanded] = useState(false)
  const preview = item.content.slice(0, 120).replace(/\n/g, ' ')

  return (
    <div className="flex gap-3 py-0.5">
      {/* 아이콘 */}
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
        <Brain className="h-3.5 w-3.5 text-purple-400" />
      </div>

      {/* 카드 */}
      <div className="flex-1 min-w-0 rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <span className="text-xs font-semibold text-purple-400">
            {item.done ? '사고 완료' : '사고 중...'}
          </span>
          {!item.done && (
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          {item.content && (
            <span className="ml-1 flex-1 truncate text-xs text-purple-300/60 font-mono">
              {!expanded && preview}
            </span>
          )}
          <div className="ml-auto shrink-0 text-purple-400/50">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </button>
        {expanded && item.content && (
          <div className="border-t border-purple-500/20 px-3 py-2">
            <pre className="whitespace-pre-wrap text-xs text-purple-200/70 leading-relaxed font-sans">
              {item.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// ToolCallCard — 인라인 도구 호출 카드
// ============================================================

function ToolCallCard({ item }: { item: Extract<ChatItem, { kind: 'tool_call' }> }) {
  const [expanded, setExpanded] = useState(true)
  const isAgent = item.name.toLowerCase().includes('agent_')

  useEffect(() => {
    if (item.collapsed) setExpanded(false)
  }, [item.collapsed])

  return (
    <div className="flex gap-3 py-0.5">
      {/* 아이콘 */}
      <div className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border',
        item.error
          ? 'bg-red-500/10 border-red-500/20'
          : isAgent
            ? 'bg-blue-500/10 border-blue-500/20'
            : item.done
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-amber-500/10 border-amber-500/20',
      )}>
        {item.error ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
        ) : item.done ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        )}
      </div>

      {/* 카드 */}
      <div className={cn(
        'flex-1 min-w-0 rounded-xl border overflow-hidden',
        item.error
          ? 'border-red-500/20 bg-red-500/5'
          : isAgent
            ? 'border-blue-500/20 bg-blue-500/5'
            : item.done
              ? 'border-[var(--color-border-strong)] bg-[var(--color-bg)]'
              : 'border-amber-500/20 bg-amber-500/5',
      )}>
        {/* 헤더 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <Terminal className={cn('h-3.5 w-3.5 shrink-0', item.error ? 'text-red-400' : item.done ? 'text-[var(--color-fg-muted)]' : 'text-amber-400')} />
          <span className={cn('text-xs font-bold font-mono truncate max-w-[120px]', item.error ? 'text-red-400' : item.done ? 'text-[var(--color-fg)]' : 'text-amber-400')}>
            {item.name}
          </span>
          {item.done && !item.error && (
            <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400 font-medium">완료</span>
          )}
          {item.latencyMs !== undefined && (
            <span className="text-xs text-[var(--color-fg-subtle)]">{item.latencyMs}ms</span>
          )}
          {!item.done && !item.error && (
            <span className="text-xs text-amber-400/60">실행 중...</span>
          )}
          <div className="ml-auto shrink-0 text-[var(--color-fg-subtle)]">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </button>

        {/* 상세 내용 */}
        {expanded && (
          <div className="border-t border-[var(--color-border-strong)]/50 p-3 space-y-2">
            {item.input !== undefined && (
              <JsonCollapsible label="입력 (Input)" data={item.input} defaultOpen />
            )}
            
            {/* 📡 스트리밍 중인 내용 표시 (서브 에이전트 용) */}
            {item.streamingContent && !item.done && (
              <div className="rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)]/60 px-3 py-1">
                <StreamingOneLine content={item.streamingContent} done={item.done} variant={item.currentMode} />
              </div>
            )}

            {/* 중첩된 아이템 렌더링 */}
            {item.subItems && item.subItems.length > 0 && (
              <div className="mt-2 space-y-2 border-l-2 border-[var(--color-border-strong)]/50 pl-3">
                {item.subItems.map((sub, idx) => (
                  sub.kind === 'tool_call' ? <ToolCallCard key={idx} item={sub} /> :
                  sub.kind === 'thinking' ? <ThinkingCard key={idx} item={sub} /> : null
                ))}
              </div>
            )}

            {item.output !== undefined && (
              <JsonCollapsible label="출력 (Output)" data={item.output} defaultOpen />
            )}
            {item.error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
                {item.error}
              </div>
            )}
            {!item.done && !item.error && !item.subItems?.length && (
              <div className="flex items-center gap-2 py-1 text-xs text-amber-400/70">
                <Zap className="h-3 w-3" />
                <span>도구 실행 중...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// HITL 모달
// ============================================================

function HitlModal({
  payload,
  onApprove,
  onReject,
}: {
  payload: HitlPayload
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛑</span>
          <h2 className="text-sm font-bold text-[var(--color-fg)]">사람 검토 필요</h2>
        </div>
        <p className="text-xs text-[var(--color-fg-muted)]">{payload.prompt}</p>
        {payload.context !== undefined && (
          <JsonCollapsible label="컨텍스트" data={payload.context} />
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-red-500/10 hover:text-red-400"
          >
            <XCircle className="h-3.5 w-3.5" />
            거부
          </button>
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs text-white hover:bg-blue-500"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            승인
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ModelSettingsPanel
// ============================================================

interface ModelSettingsProps {
  models: EnabledModel[]
  selectedModel: string
  onModelChange: (v: string) => void
  maxTokensEnabled: boolean
  maxTokens: number
  onMaxTokensEnabled: (v: boolean) => void
  onMaxTokens: (v: number) => void
  responseFormatEnabled: boolean
  responseFormat: string
  onResponseFormatEnabled: (v: boolean) => void
  onResponseFormat: (v: string) => void
  jsonSchemaEnabled: boolean
  jsonSchema: string
  onJsonSchemaEnabled: (v: boolean) => void
  onJsonSchema: (v: string) => void
  reasoningEffortEnabled: boolean
  reasoningEffort: string
  onReasoningEffortEnabled: (v: boolean) => void
  onReasoningEffort: (v: string) => void
  verbosityEnabled: boolean
  verbosity: string
  onVerbosityEnabled: (v: boolean) => void
  onVerbosity: (v: string) => void
  streamMode: boolean
  onStreamMode: (v: boolean) => void
  onClose: () => void
}

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
        enabled ? 'bg-blue-600' : 'bg-[var(--color-border-strong)]',
      )}
    >
      <div className={cn(
        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
        enabled ? 'translate-x-4' : 'translate-x-0.5',
      )} />
    </div>
  )
}

function ModelSettingsPanel({
  models, selectedModel, onModelChange,
  maxTokensEnabled, maxTokens, onMaxTokensEnabled, onMaxTokens,
  responseFormatEnabled, responseFormat, onResponseFormatEnabled, onResponseFormat,
  jsonSchemaEnabled, jsonSchema, onJsonSchemaEnabled, onJsonSchema,
  reasoningEffortEnabled, reasoningEffort, onReasoningEffortEnabled, onReasoningEffort,
  verbosityEnabled, verbosity, onVerbosityEnabled, onVerbosity,
  streamMode, onStreamMode,
  onClose,
}: ModelSettingsProps) {
  return (
    <div className="absolute bottom-full left-0 right-0 z-20 mb-2 mx-4">
      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <span className="text-sm font-bold text-[var(--color-fg)]">Model Settings</span>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 모델 선택 */}
          {models.length === 0 ? (
            <div className="flex items-center justify-between rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-3">
              <span className="text-xs text-[var(--color-fg-subtle)]">설정된 모델이 없습니다</span>
              <a
                href="/settings/providers"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                <Settings className="h-3 w-3" />
                모델 설정 →
              </a>
            </div>
          ) : (
            <div className="relative">
              <select
                value={selectedModel}
                onChange={e => onModelChange(e.target.value)}
                className="w-full appearance-none rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-2.5 pl-4 pr-8 text-sm text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none cursor-pointer"
              >
                {models.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
            </div>
          )}

          {/* 구분선 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">매개변수</span>
            <div className="flex-1 h-px bg-[var(--color-surface-2)]" />
            <button className="rounded border border-[var(--color-border-strong)] px-2 py-0.5 text-xs text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] transition-colors">
              프리셋 로드
            </button>
          </div>

          {/* Max Tokens */}
          <div className="flex items-center gap-3">
            <Toggle enabled={maxTokensEnabled} onChange={onMaxTokensEnabled} />
            <span className="flex-1 text-sm text-[var(--color-fg-muted)]">Max Tokens</span>
            {maxTokensEnabled && (
              <>
                <input
                  type="range"
                  min={256}
                  max={32768}
                  step={256}
                  value={maxTokens}
                  onChange={e => onMaxTokens(Number(e.target.value))}
                  className="w-28 accent-blue-500"
                />
                <span className="w-14 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-2 py-1 text-center text-xs text-[var(--color-fg)]">
                  {maxTokens}
                </span>
              </>
            )}
          </div>

          {/* Response Format */}
          <div className="flex items-center gap-3">
            <Toggle enabled={responseFormatEnabled} onChange={onResponseFormatEnabled} />
            <span className="flex-1 text-sm text-[var(--color-fg-muted)]">Response Format</span>
            {responseFormatEnabled && (
              <div className="relative w-40">
                <select
                  value={responseFormat}
                  onChange={e => onResponseFormat(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-1.5 pl-3 pr-7 text-xs text-[var(--color-fg)] focus:outline-none"
                >
                  <option value="">기본값</option>
                  <option value="text">Text</option>
                  <option value="json_object">JSON Object</option>
                  <option value="json_schema">JSON Schema</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              </div>
            )}
          </div>

          {/* JSON Schema */}
          <div className="flex items-start gap-3">
            <div className="mt-1">
              <Toggle enabled={jsonSchemaEnabled} onChange={onJsonSchemaEnabled} />
            </div>
            <span className="flex-1 pt-0.5 text-sm text-[var(--color-fg-muted)]">JSON Schema</span>
            {jsonSchemaEnabled && (
              <textarea
                rows={3}
                className="w-48 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-2 font-mono text-xs text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none resize-none"
                placeholder="{}"
                value={jsonSchema}
                onChange={e => onJsonSchema(e.target.value)}
              />
            )}
          </div>

          {/* Reasoning Effort */}
          <div className="flex items-center gap-3">
            <Toggle enabled={reasoningEffortEnabled} onChange={onReasoningEffortEnabled} />
            <span className="flex-1 text-sm text-[var(--color-fg-muted)]">Reasoning Effort</span>
            {reasoningEffortEnabled && (
              <div className="relative w-40">
                <select
                  value={reasoningEffort}
                  onChange={e => onReasoningEffort(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-1.5 pl-3 pr-7 text-xs text-[var(--color-fg)] focus:outline-none"
                >
                  <option value="none">none</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              </div>
            )}
          </div>

          {/* Verbosity */}
          <div className="flex items-center gap-3">
            <Toggle enabled={verbosityEnabled} onChange={onVerbosityEnabled} />
            <span className="flex-1 text-sm text-[var(--color-fg-muted)]">Verbosity</span>
            {verbosityEnabled && (
              <div className="relative w-40">
                <select
                  value={verbosity}
                  onChange={e => onVerbosity(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-1.5 pl-3 pr-7 text-xs text-[var(--color-fg)] focus:outline-none"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
              </div>
            )}
          </div>

          {/* Streaming */}
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-[var(--color-fg-muted)]">Streaming</span>
            <div className="flex rounded-lg border border-[var(--color-border-strong)] overflow-hidden">
              <button
                onClick={() => onStreamMode(true)}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium transition-colors',
                  streamMode ? 'bg-[var(--color-border-strong)] text-[var(--color-fg)]' : 'bg-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                )}
              >
                True
              </button>
              <button
                onClick={() => onStreamMode(false)}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium transition-colors',
                  !streamMode ? 'bg-[var(--color-border-strong)] text-[var(--color-fg)]' : 'bg-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                )}
              >
                False
              </button>
            </div>
          </div>

          {/* 다중 모델 디버그 */}
          <div className="border-t border-[var(--color-border)] pt-3">
            <button className="flex w-full items-center justify-between text-xs text-blue-400 hover:text-blue-300 transition-colors">
              <span>다중 모델로 디버그</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PlaygroundTab
// ============================================================

export function PlaygroundTab({ agent, projectId, onOpenSettings, onConfigureModel }: Props) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [variables, setVariables] = useState('')
  const [showVariables, setShowVariables] = useState(false)
  const [streamMode, setStreamMode] = useState(true)
  const [running, setRunning] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('chat')

  // 모델 설정
  const [models, setModels] = useState<EnabledModel[]>([])
  const [playgroundModel, setPlaygroundModel] = useState<string>('')
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false)
  const [maxTokensEnabled, setMaxTokensEnabled] = useState(false)
  const [maxTokens, setMaxTokens] = useState(8192)
  const [responseFormatEnabled, setResponseFormatEnabled] = useState(false)
  const [responseFormat, setResponseFormat] = useState('')
  const [jsonSchemaEnabled, setJsonSchemaEnabled] = useState(false)
  const [jsonSchema, setJsonSchema] = useState('')
  const [reasoningEffortEnabled, setReasoningEffortEnabled] = useState(false)
  const [reasoningEffort, setReasoningEffort] = useState('none')
  const [verbosityEnabled, setVerbosityEnabled] = useState(false)
  const [verbosity, setVerbosity] = useState('medium')

  // 통합 채팅 아이템 (순서 보장)
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  // Tools 탭 전용 상세 데이터
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([])
  // State 탭
  const [agentState, setAgentState] = useState<unknown>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [hitlPayload, setHitlPayload] = useState<HitlPayload | null>(null)

  // 멀티 아키텍처 선택기
  const enabledArchitectures: AgentArchitecture[] = agent.architectures?.length
    ? agent.architectures
    : [agent.architecture ?? 'react']
  const [selectedArch, setSelectedArch] = useState<AgentArchitecture>(enabledArchitectures[0])

  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const isProgrammaticScrollRef = useRef(false)

  // 헬퍼: 중첩된 스트리밍 업데이트
  const updateNestedStreaming = useCallback((items: ChatItem[], runStepId: string, content: string, delta: boolean): ChatItem[] => {
    let updated: ChatItem[] | null = null
    const isSub = runStepId.startsWith('sub:')
    const targetId = isSub ? runStepId.split(':')[1] : runStepId

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      const isMatch = item.kind === 'tool_call' && (
        item.id === runStepId || 
        (isSub && item.name.toLowerCase().includes(targetId.toLowerCase()))
      )

      if (isMatch) {
        if (!updated) updated = [...items]
        const prevContent = item.streamingContent || ''
        updated[i] = { 
          ...item, 
          streamingContent: delta ? prevContent + content : content,
          currentMode: 'answering'
        }
        return updated
      }

      if (item.kind === 'tool_call' && item.subItems) {
        const children = updateNestedStreaming(item.subItems, runStepId, content, delta)
        if (children !== item.subItems) {
          if (!updated) updated = [...items]
          updated[i] = { ...item, subItems: children }
          return updated
        }
      }
    }
    return updated || items
  }, [])

  // 헬퍼: 중첩된 사고 과정 업데이트
  const updateNestedReasoning = useCallback((items: ChatItem[], runStepId: string, content: string, delta: boolean, done: boolean): ChatItem[] => {
    let updated: ChatItem[] | null = null
    const isSub = runStepId.startsWith('sub:')
    const targetId = isSub ? runStepId.split(':')[1] : runStepId

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      const isMatch = item.kind === 'tool_call' && (
        item.id === runStepId || 
        (isSub && item.name.toLowerCase().includes(targetId.toLowerCase()))
      )

      if (isMatch) {
        if (!updated) updated = [...items]
        const subItems = [...(item.subItems || [])]
        const reasoningId = `${runStepId}-thinking`
        const existingIdx = subItems.findIndex(s => s.kind === 'thinking' && s.id === reasoningId)
        
        if (existingIdx >= 0) {
          const current = subItems[existingIdx] as Extract<ChatItem, { kind: 'thinking' }>
          subItems[existingIdx] = {
            ...current,
            content: delta ? current.content + content : content,
            done: done || current.done
          }
        } else {
          subItems.push({ kind: 'thinking', id: reasoningId, content, done })
        }
        updated[i] = { 
          ...item, 
          subItems,
          currentMode: done ? 'answering' : 'thinking'
        }
        return updated
      }

      if (item.kind === 'tool_call' && item.subItems) {
        const children = updateNestedReasoning(item.subItems, runStepId, content, delta, done)
        if (children !== item.subItems) {
          if (!updated) updated = [...items]
          updated[i] = { ...item, subItems: children }
          return updated
        }
      }
    }
    return updated || items
  }, [])

  // 헬퍼: stepId로 트리에서 tool_call 업데이트
  const updateStepById = useCallback((
    items: ChatItem[],
    stepId: string,
    updater: (item: Extract<ChatItem, { kind: 'tool_call' }>) => Extract<ChatItem, { kind: 'tool_call' }>,
  ): ChatItem[] | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      if (item.kind === 'tool_call') {
        if (item.id === stepId) {
          const next = [...items]
          next[i] = updater(item)
          return next
        }
        if (item.subItems) {
          const result = updateStepById(item.subItems, stepId, updater)
          if (result) {
            const next = [...items]
            next[i] = { ...item, subItems: result }
            return next
          }
        }
      }
    }
    return null
  }, [])

  // 헬퍼: parentStepId 아래에 자식 step 추가/업데이트
  const upsertSubStep = useCallback((
    items: ChatItem[],
    parentStepId: string,
    child: Extract<ChatItem, { kind: 'tool_call' }>,
  ): ChatItem[] | null => {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      if (item.kind === 'tool_call') {
        if (item.id === parentStepId) {
          const subItems = [...(item.subItems || [])]
          const idx = subItems.findIndex(s => s.kind === 'tool_call' && (s as any).id === child.id)
          if (idx >= 0) { subItems[idx] = { ...subItems[idx], ...child } as ChatItem }
          else { subItems.push(child) }
          const next = [...items]
          next[i] = { ...item, subItems }
          return next
        }
        if (item.subItems) {
          const result = upsertSubStep(item.subItems, parentStepId, child)
          if (result) {
            const next = [...items]
            next[i] = { ...item, subItems: result }
            return next
          }
        }
      }
    }
    return null
  }, [])

  // ── WebSocket 연결 및 이벤트 핸들링 ──
  useEffect(() => {
    if (!activeThreadId) return

    console.log(`[PlaygroundTab] Connecting & Subscribing to thread: ${activeThreadId}`)
    wsClient.connect()
    wsClient.subscribeThread(activeThreadId)

    // ── agent.token ──────────────────────────────────────────
    const unsubToken = wsClient.on('agent.token', (event: any) => {
      const { stepId, parentStepId, depth, content, delta, done } = event
      const chunk = content || ''
      setChatItems(prev => {
        if (depth > 0 && parentStepId) {
          const result = updateStepById(prev, parentStepId, (item) => ({
            ...item,
            streamingContent: delta ? (item.streamingContent || '') + chunk : chunk,
            currentMode: 'answering' as const,
          }))
          if (result) return result
        }
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.kind === 'message' && last.role === 'ai') {
          const aiMsg = { ...last } as Extract<ChatItem, { kind: 'message' }>
          aiMsg.content = delta ? aiMsg.content + chunk : chunk
          aiMsg.streaming = !done
          updated[updated.length - 1] = aiMsg
        } else {
          updated.push({ kind: 'message', role: 'ai', content: chunk, timestamp: Date.now(), streaming: !done })
        }
        return updated
      })
    })

    // ── agent.reasoning ──────────────────────────────────────
    const unsubReasoning = wsClient.on('agent.reasoning', (event: any) => {
      const { stepId, parentStepId, depth, content, delta, done } = event
      const chunk = content || ''
      setChatItems(prev => {
        if (depth > 0 && parentStepId) {
          const result = updateStepById(prev, parentStepId, (item) => {
            const subItems = [...(item.subItems || [])]
            const reasoningId = `${stepId}-thinking`
            const idx = subItems.findIndex(s => s.kind === 'thinking' && s.id === reasoningId)
            if (idx >= 0) {
              const cur = subItems[idx] as Extract<ChatItem, { kind: 'thinking' }>
              subItems[idx] = { ...cur, content: delta ? cur.content + chunk : chunk, done: done ?? cur.done }
            } else {
              subItems.push({ kind: 'thinking', id: reasoningId, content: chunk, done: done ?? false })
            }
            return { ...item, subItems, currentMode: done ? 'answering' as const : 'thinking' as const }
          })
          if (result) return result
        }
        const updated = [...prev]
        const idx = updated.findIndex(i => i.kind === 'thinking' && i.id === stepId)
        if (idx !== -1) {
          const cur = updated[idx] as Extract<ChatItem, { kind: 'thinking' }>
          updated[idx] = { ...cur, content: delta ? cur.content + chunk : chunk, done: done ?? cur.done }
        } else {
          updated.push({ kind: 'thinking', id: stepId, content: chunk, done: done ?? false })
        }
        return updated
      })
    })

    // ── step.started ─────────────────────────────────────────
    const unsubStepStarted = wsClient.on('step.started', (event: any) => {
      const e = event as WsStepStartedEvent
      const newCard: Extract<ChatItem, { kind: 'tool_call' }> = {
        kind: 'tool_call',
        id: e.stepId,
        name: e.name,
        input: e.input,
        done: false,
        subItems: [],
      }
      setChatItems(prev => {
        if (e.depth > 0 && e.parentStepId) {
          const result = upsertSubStep(prev, e.parentStepId, newCard)
          if (result) return result
        }
        return [...prev, newCard]
      })
      setToolCalls(prev => {
        if (e.stepType === 'tool') {
          return [...prev, { name: e.name, input: e.input, startedAt: Date.now() }]
        }
        return prev
      })
    })

    // ── step.completed ────────────────────────────────────────
    const unsubStepCompleted = wsClient.on('step.completed', (event: any) => {
      const e = event as WsStepCompletedEvent
      setChatItems(prev => {
        const result = updateStepById(prev, e.stepId, (item) => ({
          ...item,
          output: e.output,
          latencyMs: e.latencyMs,
          done: true,
          streamingContent: undefined,
        }))
        return result || prev
      })
      setToolCalls(prev => {
        const idx = prev.findIndex(t => t.name === e.name && t.output === undefined)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], output: e.output, latencyMs: e.latencyMs }
          return updated
        }
        return prev
      })
    })

    // ── step.failed ───────────────────────────────────────────
    const unsubStepFailed = wsClient.on('step.failed', (event: any) => {
      const e = event as WsStepFailedEvent
      setChatItems(prev => {
        const result = updateStepById(prev, e.stepId, (item) => ({
          ...item,
          error: e.error,
          latencyMs: e.latencyMs,
          done: true,
          streamingContent: undefined,
        }))
        return result || prev
      })
    })

    // ── turn.completed — 도구 카드 접기 + 중간 AI 메시지 제거 + 폴백 표시 ───
    const unsubTurnCompleted = wsClient.on('turn.completed', (event: any) => {
      const { finalContent } = event as { finalContent?: string }

      setChatItems(prev => {
        // 1) 모든 tool_call 접기
        let updated: ChatItem[] = prev.map(item =>
          item.kind === 'tool_call' ? { ...item, collapsed: true } : item
        )

        // 2) 마지막 human 메시지 이후 AI 메시지 인덱스 수집
        let lastHumanIdx = -1
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].kind === 'message' && (updated[i] as Extract<ChatItem, { kind: 'message' }>).role === 'human') {
            lastHumanIdx = i
            break
          }
        }
        const aiIndices: number[] = []
        for (let i = lastHumanIdx + 1; i < updated.length; i++) {
          if (updated[i].kind === 'message' && (updated[i] as Extract<ChatItem, { kind: 'message' }>).role === 'ai') {
            aiIndices.push(i)
          }
        }

        // 3) 중간 AI 메시지 제거 (마지막만 유지)
        if (aiIndices.length > 1) {
          const removeSet = new Set(aiIndices.slice(0, -1))
          updated = updated.filter((_, i) => !removeSet.has(i))
        }

        // 4) 마지막 AI 메시지 streaming 해제 + 폴백 내용 채우기
        let lastAiIdx = -1
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].kind === 'message' && (updated[i] as Extract<ChatItem, { kind: 'message' }>).role === 'ai') {
            lastAiIdx = i
            break
          }
        }
        if (lastAiIdx >= 0) {
          const msg = updated[lastAiIdx] as Extract<ChatItem, { kind: 'message' }>
          updated = [...updated]
          // finalContent(서버 최종 확정값)를 스트리밍 누적값보다 우선 사용
          updated[lastAiIdx] = { ...msg, content: finalContent || msg.content || '', streaming: false }
        } else if (finalContent) {
          updated = [...updated, { kind: 'message', role: 'ai', content: finalContent, timestamp: Date.now(), streaming: false }]
        }

        return updated
      })
    })

    return () => {
      console.log(`[PlaygroundTab] Unsubscribing from thread: ${activeThreadId}`)
      wsClient.unsubscribeThread(activeThreadId)
      unsubToken()
      unsubReasoning()
      unsubStepStarted()
      unsubStepCompleted()
      unsubStepFailed()
      unsubTurnCompleted()
    }
  }, [activeThreadId, updateNestedReasoning, updateNestedStreaming, updateStepById, upsertSubStep])

  useEffect(() => {
    apiClient.providers.getEnabledModels().then(list => {
      setModels(list)
      if (list.length > 0 && !playgroundModel) {
        setPlaygroundModel(agent.modelId ?? list[0].id)
      }
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isAtBottomRef.current) {
      const el = scrollRef.current
      if (el) {
        isProgrammaticScrollRef.current = true
        el.scrollTop = el.scrollHeight
        setTimeout(() => { isProgrammaticScrollRef.current = false }, 0)
      }
    }
  }, [chatItems])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isProgrammaticScrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    isAtBottomRef.current = isAtBottom
  }

  const clearResults = () => {
    setChatItems([])
    setToolCalls([])
    setAgentState(null)
    setMetrics(null)
    setActiveThreadId(null)
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  const handleHitlResponse = async (approved: boolean) => {
    if (!hitlPayload) return
    setHitlPayload(null)
    try {
      await apiClient.threads.resume(hitlPayload.threadId, approved, 'studio')
    } catch {
      toast.error('HITL 응답 전송에 실패했습니다')
    }
  }

  const handleRun = async () => {
    if (!input.trim() || running) return

    let parsedVariables: Record<string, unknown> = {}
    if (variables.trim()) {
      try {
        parsedVariables = JSON.parse(variables) as Record<string, unknown>
      } catch {
        toast.error('Variables JSON 파싱 오류')
        return
      }
    }

    const userMessage = input.trim()
    setInput('')
    setRunning(true)
    isAtBottomRef.current = true

    // 사용자 메시지 즉시 추가
    setChatItems(prev => [...prev, {
      kind: 'message',
      role: 'human',
      content: userMessage,
      timestamp: Date.now(),
    }])

    abortRef.current = new AbortController()

    try {
      let threadId = activeThreadId
      if (!threadId) {
        const thread = await apiClient.threads.create(projectId, { agentId: agent.id })
        threadId = thread.id
        setActiveThreadId(threadId)
      }
      await apiClient.threads.invoke(threadId, userMessage, undefined, 'studio')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setChatItems(prev => [...prev, {
        kind: 'error',
        content: err instanceof Error ? err.message : 'Unknown error',
        timestamp: Date.now(),
      }])
    } finally {
      setRunning(false)
    }
  }

  const rightTabs: { id: RightTab; label: string }[] = [
    { id: 'chat',  label: 'Chat' },
    { id: 'tools', label: 'Tools' },
    { id: 'state', label: 'State' },
  ]

  const toolCallCount = toolCalls.length
  const hasMessages = chatItems.length > 0

  return (
    <>
      {hitlPayload && (
        <HitlModal
          payload={hitlPayload}
          onApprove={() => handleHitlResponse(true)}
          onReject={() => handleHitlResponse(false)}
        />
      )}

      <div className="flex h-full flex-col overflow-hidden bg-bg">
        {/* Header Row 1: 제목 + 리셋 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
          <span className="text-sm font-semibold text-[var(--color-fg)]">디버그 및 미리보기</span>
          <button
            onClick={clearResults}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors"
            title="대화 초기화"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Header Row 2: 탭 + Stream + Variables */}
        <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-3 py-1">
          {rightTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setRightTab(t.id)}
              className={cn(
                'relative h-7 px-3 text-xs font-bold uppercase rounded-md transition-all',
                rightTab === t.id
                  ? 'bg-[var(--color-surface-2)] text-blue-400'
                  : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
              )}
            >
              {t.label}
              {t.id === 'tools' && toolCallCount > 0 && (
                <span className="ml-1 rounded bg-amber-500/20 px-1 text-xs text-amber-400">
                  {toolCallCount}
                </span>
              )}
            </button>
          ))}

          <div className="mx-1 h-3.5 w-px bg-[var(--color-border-strong)]" />

          {/* Variables Toggle */}
          <button
            onClick={() => setShowVariables(!showVariables)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold uppercase transition-colors',
              showVariables ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]',
            )}
          >
            Variables
          </button>
        </div>

        {/* Content */}
        <div className="relative flex-1 overflow-hidden">
          {/* Variables Overlay */}
          {showVariables && (
            <div className="absolute right-4 top-4 z-10 w-64 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">Variables (JSON)</span>
                <button onClick={() => setShowVariables(false)}>
                  <XCircle className="h-3 w-3 text-[var(--color-fg-subtle)]" />
                </button>
              </div>
              <textarea
                rows={5}
                className="w-full rounded-lg border border-[var(--color-border)] bg-bg p-2 font-mono text-xs text-[var(--color-fg)] focus:border-blue-500/50 focus:outline-none resize-none"
                placeholder='{"key": "value"}'
                value={variables}
                onChange={e => setVariables(e.target.value)}
              />
            </div>
          )}

          <div 
            ref={scrollRef}
            className="h-full overflow-y-auto custom-scrollbar px-5 py-5"
            onScroll={handleScroll}
          >

            {/* ── Chat 탭 ── */}
            {rightTab === 'chat' && (
              <div className="mx-auto max-w-2xl space-y-4">
                {/* 빈 상태 */}
                {!hasMessages && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    {!agent.modelId ? (
                      <>
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-strong)] text-2xl">⊙</div>
                        <p className="text-sm font-semibold text-[var(--color-fg)]">No model provider configured</p>
                        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">Install or configure a model provider to get started.</p>
                        <button className="mt-4 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          Manage models →
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-xl">💬</div>
                        <h3 className="text-sm font-bold text-[var(--color-fg)]">에이전트와 대화를 시작하세요</h3>
                        <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">하단의 입력창에 메시지를 보내 테스트할 수 있습니다.</p>
                      </>
                    )}
                  </div>
                )}

                {/* 채팅 아이템 렌더링 */}
                {chatItems.map((item, i) => {
                  if (item.kind === 'message') {
                    return (
                      <div
                        key={i}
                        className={cn('flex gap-3', item.role === 'human' ? 'flex-row-reverse' : 'flex-row')}
                      >
                        {/* 아바타 */}
                        <div className={cn(
                          'mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
                          item.role === 'human'
                            ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]',
                        )}>
                          {item.role === 'human' ? 'U' : 'AI'}
                        </div>
                        {/* 말풍선 */}
                        <div className={cn(
                          'max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
                          item.role === 'human'
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : 'bg-[var(--color-surface)] text-[var(--color-fg)] border border-[var(--color-border)] rounded-tl-sm',
                        )}>
                          <pre className="whitespace-pre-wrap font-sans">{item.content}</pre>
                        </div>
                      </div>
                    )
                  }

                  if (item.kind === 'thinking') {
                    return <ThinkingCard key={item.id || i} item={item} />
                  }

                  if (item.kind === 'tool_call') {
                    return <ToolCallCard key={item.id || i} item={item} />
                  }

                  if (item.kind === 'error') {
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
                          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                        </div>
                        <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">
                          {item.content}
                        </div>
                      </div>
                    )
                  }

                  return null
                })}

                {/* AI 응답 대기 중 */}
                {running && chatItems[chatItems.length - 1]?.kind === 'message' && (chatItems[chatItems.length - 1] as Extract<ChatItem, { kind: 'message' }>).role === 'human' && (
                  <div className="flex gap-3">
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-[var(--color-fg-muted)]">
                      AI
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
                      <Wrench className="h-3.5 w-3.5 text-[var(--color-fg-subtle)] animate-pulse" />
                      <span className="text-xs text-[var(--color-fg-subtle)] ml-1">처리 중</span>
                      <span className="flex gap-0.5 ml-1">
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--color-fg-subtle)]" style={{ animationDelay: '0ms' }} />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--color-fg-subtle)]" style={{ animationDelay: '150ms' }} />
                        <span className="h-1 w-1 animate-bounce rounded-full bg-[var(--color-fg-subtle)]" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}

            {/* ── Tools 탭 ── */}
            {rightTab === 'tools' && (
              <div className="mx-auto max-w-2xl space-y-3">
                {toolCalls.length === 0 ? (
                  <p className="py-20 text-center text-xs text-[var(--color-fg-subtle)]">호출된 도구가 없습니다.</p>
                ) : (
                  toolCalls.map((tc, i) => (
                    <div key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                        <Terminal className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400 font-mono">{tc.name}</span>
                        {tc.latencyMs !== undefined && (
                          <span className="ml-auto text-xs text-[var(--color-fg-subtle)]">{tc.latencyMs}ms</span>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <JsonCollapsible label="Input" data={tc.input} defaultOpen />
                        {tc.output !== undefined && (
                          <JsonCollapsible label="Output" data={tc.output} defaultOpen />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── State 탭 ── */}
            {rightTab === 'state' && (
              <div className="mx-auto max-w-2xl">
                {agentState === null ? (
                  <p className="py-20 text-center text-xs text-[var(--color-fg-subtle)]">에이전트 상태 정보가 없습니다.</p>
                ) : (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4">
                    <JsonCollapsible label="Current LangGraph State" data={agentState} defaultOpen />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer (Input) */}
        <div className="relative border-t border-[var(--color-border)] px-4 pt-3 pb-2 bg-[var(--color-bg)]/50">
          {/* 모델 설정 패널 */}
          {modelSettingsOpen && (
            <ModelSettingsPanel
              models={models}
              selectedModel={playgroundModel}
              onModelChange={setPlaygroundModel}
              maxTokensEnabled={maxTokensEnabled}
              maxTokens={maxTokens}
              onMaxTokensEnabled={setMaxTokensEnabled}
              onMaxTokens={setMaxTokens}
              responseFormatEnabled={responseFormatEnabled}
              responseFormat={responseFormat}
              onResponseFormatEnabled={setResponseFormatEnabled}
              onResponseFormat={setResponseFormat}
              jsonSchemaEnabled={jsonSchemaEnabled}
              jsonSchema={jsonSchema}
              onJsonSchemaEnabled={setJsonSchemaEnabled}
              onJsonSchema={setJsonSchema}
              reasoningEffortEnabled={reasoningEffortEnabled}
              reasoningEffort={reasoningEffort}
              onReasoningEffortEnabled={setReasoningEffortEnabled}
              onReasoningEffort={setReasoningEffort}
              verbosityEnabled={verbosityEnabled}
              verbosity={verbosity}
              onVerbosityEnabled={setVerbosityEnabled}
              onVerbosity={setVerbosity}
              streamMode={streamMode}
              onStreamMode={setStreamMode}
              onClose={() => setModelSettingsOpen(false)}
            />
          )}

          {/* 아키텍처 선택 (멀티 선택 시 표시) */}
          {enabledArchitectures.length > 1 && (
            <div className="mb-2 flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-fg-subtle)] shrink-0">방식</span>
              <div className="flex flex-wrap gap-1">
                {enabledArchitectures.map(arch => {
                  const labels: Record<AgentArchitecture, string> = {
                    react: 'Deep Autonomous',
                    tool_calling: 'Fast',
                    plan_execute: 'Planning',
                    custom_graph: 'Custom Graph',
                  }
                  const active = selectedArch === arch
                  return (
                    <button
                      key={arch}
                      onClick={() => setSelectedArch(arch)}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-bold transition-all',
                        active
                          ? 'border-blue-500/60 bg-blue-500/15 text-blue-400'
                          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
                      )}
                    >
                      {labels[arch]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 모델 선택 버튼 */}
          <div className="mb-2 flex items-center gap-2">
            {models.length === 0 ? (
              <button
                onClick={() => onConfigureModel ? onConfigureModel() : router.push('/settings/providers')}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-subtle)] transition-colors hover:border-blue-500/40 hover:text-blue-400"
              >
                <Settings className="h-3 w-3" />
                모델 설정하기 →
              </button>
            ) : (
              <button
                onClick={() => setModelSettingsOpen(!modelSettingsOpen)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  modelSettingsOpen
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                    : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-fg-muted)] hover:border-border-strong hover:text-[var(--color-fg)]',
                )}
              >
                <SlidersHorizontal className="h-3 w-3" />
                <span className="max-w-[180px] truncate">
                  {(models.find(m => m.id === playgroundModel)?.name ?? playgroundModel) || 'Select Model'}
                </span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', modelSettingsOpen && 'rotate-180')} />
              </button>
            )}
          </div>

          <div className="relative">
            <textarea
              rows={1}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] py-3 pl-4 pr-12 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-blue-500/50 focus:outline-none resize-none custom-scrollbar"
              placeholder="Bot와 대화하기..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleRun()
                }
              }}
            />
            <button
              onClick={running ? handleStop : handleRun}
              disabled={!running && !input.trim()}
              className={cn(
                'absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-xl transition-all disabled:opacity-20',
                running ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500',
              )}
            >
              {running
                ? <Square className="h-4 w-4 fill-white text-white" />
                : <Play className="h-4 w-4 fill-white text-white" />}
            </button>
          </div>

          {/* 메트릭 */}
          <div className="mt-1.5 flex items-center justify-center gap-4 min-h-[18px]">
            {metrics && (
              <div className="flex gap-3 text-xs font-bold uppercase text-[var(--color-fg-subtle)]">
                <span>⏱ {((metrics.latencyMs ?? 0) / 1000).toFixed(2)}s</span>
                <span>↑ {metrics.inputTokens ?? 0} TOK</span>
                <span>↓ {metrics.outputTokens ?? 0} TOK</span>
                <span className="text-blue-400">$ {metrics.cost?.toFixed(6) ?? '0.000000'}</span>
              </div>
            )}
          </div>
        </div>

        {/* 최하단 푸터 */}
        <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-2 bg-bg">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-400" />
            <span className="text-xs text-[var(--color-fg-subtle)]">기능 활성화됨</span>
          </div>
          <button
            onClick={() => onOpenSettings?.('tools')}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            관리 →
          </button>
        </div>
      </div>
    </>
  )
}

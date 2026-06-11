'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { marked } from 'marked'
import { wsClient } from '@/lib/ws-client'
import { useAgentStore } from '@/stores/use-agent-store'
import { useToolStore } from '@/stores/use-tool-store'
import { cn, safeJsonStringify } from '@/lib/utils'
import { apiClient, ApiError } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { TodoListCard } from '@/components/chat/todo-list-card'
import { McpCredentialModal } from '@/components/chat/McpCredentialModal'
import {
  ChevronDown, ChevronRight, CheckCircle, XCircle,
  Loader2, Brain, Terminal, AlertCircle, Zap, Bot, Square, ArrowDown,
  Maximize2, Minimize2,
} from 'lucide-react'
import type {
  WebSocketEvent,
  AgentTokenEvent,
  AgentReasoningEvent,
  WsStepStartedEvent,
  WsStepCompletedEvent,
  WsStepFailedEvent,
  TodoStep,
  MissingMcpCredentialError,
  MissingCredentialItem,
} from '@agent-studio/shared'

// ──────────────────────────────────────────────
// 통합 채팅 아이템 타입
// ──────────────────────────────────────────────

type ChatItem =
  | { kind: 'message'; role: 'human' | 'ai'; content: string; timestamp: number; streaming?: boolean }
  | { kind: 'thinking'; content: string; done: boolean; id: string }
  | { kind: 'plan'; steps: TodoStep[]; done: boolean }
  | { kind: 'tool_call'; id: string; parentStepId?: string; depth: number; name: string; nodeId: string; stepType: string; input: unknown; output?: unknown; latencyMs?: number; done: boolean; error?: string; subItems?: ChatItem[]; streamingContent?: string; currentMode?: 'thinking' | 'answering' }
  | { kind: 'error'; content: string; timestamp: number }

interface ChatInterfaceProps {
  threadId: string
  onSendMessage: (content: string, signal: AbortSignal) => Promise<void>
}

// ──────────────────────────────────────────────
// StreamingOneLine
// ──────────────────────────────────────────────

function StreamingOneLine({ content, done, variant = 'answering' }: { content: string; done: boolean; variant?: 'thinking' | 'answering' }) {
  const lines = useMemo(() => 
    content.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
  , [content]);

  const currentLine = lines[lines.length - 1] || '';
  const prevLine = lines[lines.length - 2] || '';
  const lineCount = lines.length;

  const isThinking = variant === 'thinking'

  return (
    <div className="flex justify-end items-center overflow-hidden w-full h-full relative pr-4">
      {/* Fade gradients */}
      <div className="absolute inset-0 z-10 pointer-events-none" 
           style={{ background: 'linear-gradient(to right, var(--color-bg) 0%, transparent 15%, transparent 85%, var(--color-bg) 100%)' }} />
      
      <div className="relative h-4 w-full flex flex-col items-end">
        {/* Previous Line (Fading out) */}
        {prevLine && !isThinking && (
          <div 
            key={`prev-${lineCount}`}
            className="absolute top-0 right-0 whitespace-nowrap text-xs text-[var(--color-fg-muted)]/30 italic select-none tracking-tight animate-line-slide-up-out"
          >
            {prevLine}
          </div>
        )}
        
        {/* Current Line (Coming in) */}
        <div 
          key={`curr-${lineCount}`}
          className={cn(
            "absolute top-0 right-0 whitespace-nowrap text-xs italic select-none tracking-tight",
            isThinking 
              ? "text-purple-400/80 animate-line-thought-in" 
              : "text-[var(--color-fg-muted)]/80 animate-line-slide-up-in"
          )}
        >
          {isThinking && <span className="mr-1.5 opacity-50">사고 중:</span>}
          {currentLine}
          {!done && <span className={cn("ml-1 animate-pulse font-bold", isThinking ? "text-purple-400/40" : "text-blue-400/40")}>...</span>}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// PlanCard
// ──────────────────────────────────────────────

function PlanCard({ item }: { item: Extract<ChatItem, { kind: 'plan' }> }) {
  return <TodoListCard steps={item.steps} />
}

// ──────────────────────────────────────────────
// JsonCollapsible
// ──────────────────────────────────────────────

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
          <span className="ml-auto truncate max-w-[200px] text-[var(--color-fg-subtle)] font-mono text-xs">
            {safeJsonStringify(data, { maxOutputLength: 120, space: 0 })}
          </span>
        )}
      </button>
      {open && (
        <pre className="px-3 pb-3 pt-1 text-xs text-fg overflow-x-auto whitespace-pre-wrap border-t border-[var(--color-border-strong)] bg-[var(--color-bg)]/60 leading-relaxed max-h-52 overflow-y-auto">
          {safeJsonStringify(data)}
        </pre>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// ThinkingCard
// ──────────────────────────────────────────────

function ThinkingCard({ item }: { item: Extract<ChatItem, { kind: 'thinking' }> }) {
  const [expanded, setExpanded] = useState(true)
  const preview = item.content.slice(0, 100).replace(/\n/g, ' ')

  useEffect(() => {
    if (item.done) {
      const timer = setTimeout(() => setExpanded(false), 1200)
      return () => clearTimeout(timer)
    }
  }, [item.done])

  return (
    <div className="flex gap-3 py-0.5 group/card">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20 group-hover/card:border-purple-500/40 transition-colors">
        <Brain className="h-3.5 w-3.5 text-purple-400" />
      </div>
      <div className="flex-1 min-w-0 rounded-xl border border-purple-500/20 bg-purple-500/5 overflow-hidden transition-all duration-300 ease-in-out shadow-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-purple-500/10 transition-colors"
        >
          <span className="text-xs font-bold text-purple-400">
            {item.done ? '사고 완료' : '사고 중...'}
          </span>
          {!item.done && (
            <span className="flex gap-0.5">
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '0ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '150ms' }} />
              <span className="h-1 w-1 animate-bounce rounded-full bg-purple-400" style={{ animationDelay: '300ms' }} />
            </span>
          )}
          {item.content && !expanded && (
            <span className="ml-1 flex-1 truncate text-xs text-purple-300/60 font-mono italic">{preview}</span>
          )}
          <div className="ml-auto shrink-0 text-purple-400/40 group-hover/card:text-purple-400/70 transition-colors">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </button>
        <div className={cn(
          'transition-all duration-300 ease-in-out overflow-hidden',
          expanded ? 'max-h-[500px] border-t border-purple-500/10 opacity-100' : 'max-h-0 opacity-0'
        )}>
          <div className="px-3 py-2.5 bg-[var(--color-bg)]/40">
            <pre className="whitespace-pre-wrap text-xs text-purple-200/70 leading-relaxed font-sans max-h-48 overflow-y-auto custom-scrollbar">
              {item.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// MarkdownContent
// ──────────────────────────────────────────────

marked.setOptions({ breaks: true })

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const html = useMemo(() => marked.parse(content) as string, [content])
  return (
    <div className="relative">
      <div className="prose-invert-custom text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// ToolCallCard
// ──────────────────────────────────────────────

function ToolCallCard({ item }: { item: Extract<ChatItem, { kind: 'tool_call' }> }) {
  const [expanded, setExpanded] = useState(true)
  const [resultExpanded, setResultExpanded] = useState(true)
  const [oneLineMode, setOneLineMode] = useState(true)
  const [isClosing, setIsClosing] = useState(false)

  // Date.now() is impure, use lazy initialization with useState to get a stable value
  const [mountedAt] = useState(() => Date.now())
  const startTimeRef = useRef<number>(mountedAt)

  const isAgent = item.stepType === 'agent'
  const isStreaming = !item.done && !!item.streamingContent
  const showCompact = (isStreaming && oneLineMode) || isClosing

  useEffect(() => {
    if (item.done) {
      const elapsed = Date.now() - startTimeRef.current
      const remainingTime = Math.max(0, 2000 - elapsed)

      const timer = setTimeout(() => {
        setIsClosing(true)
        // 종료 애니메이션을 위해 약간의 시간차를 두고 접음
        setTimeout(() => setExpanded(false), 300)
      }, remainingTime)
      
      return () => clearTimeout(timer)
    }
  }, [item.done])

  // runner가 표시용 name을 이미 설정해서 보내므로 그대로 사용
  // stepType === 'agent'이면 "Agent: Name" 형태로 접두사 추가
  const displayName = isAgent ? `Agent: ${item.name}` : item.name

  const outputResultText = useMemo(() => {
    if (item.output === undefined) return ''
    if (typeof item.output === 'string') return item.output
    if (typeof item.output === 'object' && item.output !== null && 'result' in item.output) {
      const out = item.output as Record<string, unknown>
      const result = out.result
      return typeof result === 'string' ? result : safeJsonStringify(result)
    }
    return safeJsonStringify(item.output)
  }, [item.output])

  return (
    <div className="flex gap-3 py-0.5 group/card">
      <div className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors',
        isAgent 
          ? 'bg-blue-500/10 border-blue-500/20 group-hover/card:border-blue-500/40' 
          : item.error ? 'bg-red-500/10 border-red-500/20 group-hover/card:border-red-500/40' 
          : item.done ? 'bg-green-500/10 border-green-500/20 group-hover/card:border-green-500/40' 
          : 'bg-amber-500/10 border-amber-500/20 group-hover/card:border-amber-500/40',
      )}>
        {item.error ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-400" />
        ) : isAgent ? (
          <Bot className="h-3.5 w-3.5 text-blue-400" />
        ) : item.done ? (
          <CheckCircle className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />
        )}
      </div>
      <div className={cn(
        'flex-1 min-w-0 rounded-xl border overflow-hidden transition-all duration-300 ease-in-out shadow-sm',
        isAgent ? 'border-blue-500/20 bg-blue-500/5' :
        item.error ? 'border-red-500/20 bg-red-500/5' : 
        item.done ? 'border-[var(--color-border-strong)] bg-[var(--color-bg)]' : 
        'border-amber-500/20 bg-amber-500/5',
      )}>
        <div
          onClick={() => {
            const nextExpanded = !expanded;
            setExpanded(nextExpanded);
            if (nextExpanded) setIsClosing(false);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors cursor-pointer select-none"
        >
          {isAgent ? (
            <Bot className={cn('h-3.5 w-3.5 shrink-0', item.done ? 'text-blue-400/60' : 'text-blue-400')} />
          ) : (
            <Terminal className={cn('h-3.5 w-3.5 shrink-0', item.error ? 'text-red-400' : item.done ? 'text-[var(--color-fg-muted)]' : 'text-amber-400')} />
          )}
          <span className={cn(
            'text-xs font-bold font-mono truncate', 
            isAgent ? (item.done ? 'text-blue-100/60' : 'text-blue-100') :
            item.error ? 'text-red-400' : item.done ? 'text-[var(--color-fg)]' : 'text-amber-400'
          )}>
            {displayName}
          </span>
          {item.done && !item.error && (
            <span className={cn(
              'rounded px-1.5 py-0.5 text-xs font-bold uppercase tracking-tighter shrink-0',
              isAgent ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
            )}>완료</span>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2.5 shrink-0">
            {isStreaming && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setOneLineMode(!oneLineMode)
                }}
                className={cn(
                  "p-1 rounded hover:bg-white/10 transition-colors pointer-events-auto",
                  oneLineMode ? "text-blue-400" : "text-[var(--color-fg-subtle)]"
                )}
                title={oneLineMode ? "펼쳐서 보기" : "1줄로 보기"}
              >
                {oneLineMode ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
              </button>
            )}
            {item.latencyMs !== undefined && (
              <span className="text-xs text-[var(--color-fg-subtle)] font-medium">{item.latencyMs}ms</span>
            )}
            {!item.done && !item.error && (
              <span className={cn(
                'flex items-center gap-1 text-xs',
                isAgent ? 'text-blue-400/80 animate-pulse' : 'text-amber-400/60'
              )}>
                <Zap className="h-3 w-3" />{isAgent ? '협업 중' : '실행 중'}
              </span>
            )}
            <div className="text-[var(--color-fg-subtle)]">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </div>
          </div>
        </div>
        <div className={cn(
          'transition-all duration-500 ease-in-out overflow-hidden',
          expanded ? 'max-h-[2000px] border-t border-[var(--color-border-strong)]/50 opacity-100' : 'max-h-0 opacity-0'
        )}>
          <div className={cn(
            "bg-[var(--color-bg)]/40 transition-all duration-500 ease-in-out",
            showCompact ? "p-1.5 space-y-0" : "p-3 space-y-3"
          )}>
            
            {/* 1. Parameters (간결 모드 시 자연스럽게 사라짐) */}
            <div className={cn(
              "transition-all duration-500 ease-in-out overflow-hidden",
              showCompact ? "max-h-0 opacity-0 mb-0" : "max-h-[500px] opacity-100 mb-3"
            )}>
              {item.input !== undefined && (
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[var(--color-fg-subtle)] uppercase px-1">Parameters</div>
                  <JsonCollapsible label="Input" data={item.input} defaultOpen />
                </div>
              )}
            </div>

            {/* 2. Result / Streaming 섹션 */}
            {(item.output !== undefined || item.streamingContent) && (
              <div className="space-y-1 transition-all duration-500">
                {!showCompact && item.output !== undefined && (
                  <button 
                    onClick={() => setResultExpanded(!resultExpanded)}
                    className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-fg-subtle)] uppercase px-1 hover:text-[var(--color-fg-muted)] transition-colors group/res"
                  >
                    <div className="text-[var(--color-fg-subtle)] group-hover/res:text-[var(--color-fg-muted)]">
                      {resultExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
                    </div>
                    Result
                  </button>
                )}
                
                <div className={cn(
                  "transition-all duration-500 ease-in-out overflow-hidden",
                  showCompact || resultExpanded ? "max-h-[1500px] opacity-100" : "max-h-0 opacity-0"
                )}>
                  {isAgent ? (
                    <div className={cn(
                      "rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)]/60 px-4 shadow-inner flex flex-col justify-center transition-all duration-500 ease-in-out",
                      showCompact ? "h-8 py-0 border-transparent bg-transparent" : "min-h-[36px] py-2"
                    )}>
                      {!showCompact && item.output !== undefined ? (
                        <MarkdownContent content={outputResultText} />
                      ) : (
                        <StreamingOneLine 
                          content={item.streamingContent || outputResultText || 'Processing...'} 
                          done={item.done} 
                          variant={item.currentMode}
                        />
                      )}
                    </div>
                  ) : (
                    !showCompact && item.output !== undefined && (
                      <div className="rounded-md overflow-hidden"><JsonCollapsible label="Output" data={item.output} defaultOpen /></div>
                    )
                  )}
                </div>
              </div>
            )}

            {/* 3. Sub Tasks (간결 모드 시 숨김) */}
            <div className={cn("transition-all duration-500 ease-in-out overflow-hidden", (!showCompact && item.subItems && item.subItems.length > 0) ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
              {item.subItems && item.subItems.length > 0 && (
                <div className="space-y-2 mt-4 pl-4 border-l-2 border-[var(--color-border-strong)]/50">
                  <div className="text-xs font-bold text-[var(--color-fg-subtle)] uppercase mb-1 px-1">Sub Tasks</div>
                  {item.subItems.map((sub, i) => (
                    sub.kind === 'tool_call' ? <ToolCallCard key={i} item={sub as any} /> : sub.kind === 'thinking' ? <ThinkingCard key={i} item={sub as any} /> : null
                  ))}
                </div>
              )}
            </div>

            {item.error && !showCompact && (
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 flex items-start gap-2 animate-in fade-in">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{item.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// HumanMessageBubble
// ──────────────────────────────────────────────

function HumanMessageBubble({ content, timestamp }: { content: string; timestamp: number }) {
  return (
    <div className="flex w-full justify-end py-1">
      <div className="max-w-[75%] rounded-2xl rounded-tr-none bg-blue-600 px-4 py-3 text-sm text-white shadow-sm">
        <div className="whitespace-pre-wrap leading-relaxed">{content}</div>
        <div className="text-xs opacity-50 mt-1.5 text-right">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// AiMessageBubble
// ──────────────────────────────────────────────

function AiMessageBubble({ content, streaming, timestamp }: { content: string; streaming?: boolean; timestamp: number }) {
  if (!content && !streaming) return null
  return (
    <div className="flex w-full justify-start py-1">
      <div className="flex gap-3 max-w-[85%]">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)]">
          <Bot className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
        </div>
        <div className="flex-1 min-w-0 rounded-xl rounded-tl-none border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-fg-subtle)] mb-1.5">Assistant</div>
          <MarkdownContent content={content} streaming={streaming} />
          {!streaming && (
            <div className="text-xs text-[var(--color-fg-subtle)] mt-2 text-right">
              {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// ErrorCard
// ──────────────────────────────────────────────

function ErrorCard({ content }: { content: string }) {
  return (
    <div className="flex gap-3 py-0.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10 border border-red-500/20">
        <XCircle className="h-3.5 w-3.5 text-red-400" />
      </div>
      <div className="flex-1 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
        {content}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// StatusBar
// ──────────────────────────────────────────────

function StatusBar({ items, isRunning }: { items: ChatItem[]; isRunning: boolean }) {
  if (!isRunning) return null

  const activeToolCall = [...items].reverse().find(i => i.kind === 'tool_call' && !i.done)
  const activeThinking = [...items].reverse().find(i => i.kind === 'thinking' && !i.done)

  let label = '에이전트 응답 중...'
  if (activeToolCall) {
    const item = activeToolCall as Extract<ChatItem, { kind: 'tool_call' }>
    const isAgent = item.stepType === 'agent'
    let displayName = item.name
    label = isAgent ? `${displayName} 응답 중...` : `도구 실행 중: ${displayName}`
  } else if (activeThinking) {
    label = '사고 중...'
  }

  return (
    <div className="flex items-center px-4 py-2 border-t border-[var(--color-border)] bg-[var(--color-bg)] text-xs text-[var(--color-fg-muted)]">
      <Loader2 className="h-3 w-3 animate-spin text-blue-400 shrink-0 mr-2" />
      <span className="font-medium">{label}</span>
    </div>
  )
}

// ──────────────────────────────────────────────
// ChatInterface
// ──────────────────────────────────────────────

export function ChatInterface({ threadId, onSendMessage }: ChatInterfaceProps) {
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [mcpCredModal, setMcpCredModal] = useState<{
    missingCredentials: MissingCredentialItem[]
    pendingContent: string
  } | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const { agents, setAgents } = useAgentStore()
  const { tools, setTools } = useToolStore()
  const { activeProjectId: projectId } = useUserStore()

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  // stepId → 시작 시각 (runner가 latencyMs를 직접 보내므로 폴백용)
  const startedAtRef = useRef<Record<string, number>>({})
  const isAtBottomRef = useRef(true)

  // 요청 처리 완료 후 입력창 자동 포커스
  // 사용자가 채팅 영역 외부(다른 패널/사이드바 등)로 포커스를 옮기지 않았을 때만 복귀.
  // HITL 승인/입력 버튼처럼 채팅 컨테이너 내부에 있던 포커스는 복귀 대상으로 본다.
  useEffect(() => {
    if (isRunning) return
    const active = document.activeElement as HTMLElement | null
    const insideChat = !!(active && containerRef.current?.contains(active))
    if (active === document.body || active === null || insideChat) {
      textareaRef.current?.focus()
    }
  }, [isRunning])

  // 에이전트 및 도구 목록 로드 (매핑용)
  useEffect(() => {
    if (projectId) {
      if (agents.length === 0) {
        apiClient.agents.list(projectId).then(setAgents).catch(console.error)
      }
      if (tools.length === 0) {
        // 그룹에 속한 도구와 속하지 않은 도구 모두 가져오기
        Promise.all([
          apiClient.toolGroups.list(projectId),
          apiClient.tools.list(projectId)
        ]).then(([groups, allToolsList]) => {
          const groupTools = groups.flatMap(g => (g as any).tools || [])
          // 중복 제거 (ID 기준)
          const combined = [...allToolsList]
          groupTools.forEach(gt => {
            if (!combined.find(t => t.id === gt.id)) {
              combined.push(gt)
            }
          })
          setTools(combined)
        }).catch(console.error)
      }
    }
  }, [projectId, agents.length, tools.length, setAgents, setTools])

  // 스크롤 위치 감지
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
  }, [])

  // 맨 아래로 스크롤
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
    isAtBottomRef.current = true
  }, [])

  // chatItems 변경 시 — 하단에 있을 때만 자동 스크롤
  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatItems])

  // 중지
  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsRunning(false)
    setChatItems(prev => prev.map(item =>
      item.kind === 'message' && item.role === 'ai' && item.streaming
        ? { ...item, streaming: false }
        : item
    ))
  }, [])

  // ──────────────────────────────────────────────
  // 헬퍼: stepId로 ChatItem 트리에서 tool_call 찾아 업데이트 (Recursive)
  // ──────────────────────────────────────────────

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

  // 헬퍼: parentStepId를 가진 부모 tool_call 아래에 자식 step 추가/업데이트
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
          const idx = subItems.findIndex(s => s.kind === 'tool_call' && (s as Extract<ChatItem, { kind: 'tool_call' }>).id === child.id)
          if (idx >= 0) {
            subItems[idx] = { ...subItems[idx], ...child } as ChatItem
          } else {
            subItems.push(child)
          }
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

  // 헬퍼: 부모 tool_call의 streamingContent 업데이트
  const updateParentStreaming = useCallback((
    items: ChatItem[],
    parentStepId: string,
    content: string,
    delta: boolean,
  ): ChatItem[] | null => {
    return updateStepById(items, parentStepId, (item) => ({
      ...item,
      streamingContent: delta ? (item.streamingContent || '') + content : content,
      currentMode: 'answering' as const,
    }))
  }, [updateStepById])

  // 헬퍼: 부모 tool_call 아래의 사고 블록(thinking) 업데이트
  const updateParentReasoning = useCallback((
    items: ChatItem[],
    parentStepId: string,
    reasoningStepId: string,
    content: string,
    delta: boolean,
    done: boolean,
  ): ChatItem[] | null => {
    return updateStepById(items, parentStepId, (item) => {
      const subItems = [...(item.subItems || [])]
      const idx = subItems.findIndex(s => s.kind === 'thinking' && s.id === reasoningStepId)
      if (idx >= 0) {
        const cur = subItems[idx] as Extract<ChatItem, { kind: 'thinking' }>
        subItems[idx] = { ...cur, content: delta ? cur.content + content : content, done: done || cur.done }
      } else {
        subItems.push({ kind: 'thinking', id: reasoningStepId, content, done })
      }
      return { ...item, subItems, currentMode: done ? 'answering' as const : 'thinking' as const }
    })
  }, [updateStepById])

  // WebSocket 구독
  useEffect(() => {
    wsClient.connect()
    wsClient.subscribeThread(threadId)

    // ── agent.token: LLM 응답 토큰 스트리밍 ──────────────────
    const unsubToken = wsClient.on('agent.token', (event: WebSocketEvent) => {
      const e = event as AgentTokenEvent
      const { stepId, parentStepId, depth, content, delta, done } = e
      console.log('[agent.token]', { stepId, parentStepId, depth, done, len: content?.length })

      setChatItems(prev => {
        const chunk = content || ''

        // 서브 에이전트(depth>0)의 토큰 → 부모 카드 streamingContent에 반영
        if (depth > 0 && parentStepId) {
          const result = updateParentStreaming(prev, parentStepId, chunk, delta)
          if (result) return result
        }

        // 루트 레벨 토큰 → 마지막 AI 메시지에 반영
        const updatedItems = [...prev]
        const last = updatedItems[updatedItems.length - 1]
        if (last?.kind === 'message' && last.role === 'ai') {
          const aiMsg = { ...last }
          aiMsg.content = delta ? aiMsg.content + chunk : chunk
          aiMsg.streaming = !done
          updatedItems[updatedItems.length - 1] = aiMsg
        } else {
          updatedItems.push({ kind: 'message', role: 'ai', content: chunk, timestamp: Date.now(), streaming: !done })
        }
        return updatedItems
      })
    })

    // ── agent.reasoning: 추론(CoT) 토큰 스트리밍 ──────────────
    const unsubReasoning = wsClient.on('agent.reasoning', (event: WebSocketEvent) => {
      const e = event as AgentReasoningEvent
      const { stepId, parentStepId, depth, content, delta, done } = e
      console.log('[agent.reasoning]', { stepId, parentStepId, depth, done })

      setChatItems(prev => {
        const chunk = content || ''

        // 서브 에이전트 내부의 추론 → 부모 카드 subItems에 thinking 추가
        if (depth > 0 && parentStepId) {
          const result = updateParentReasoning(prev, parentStepId, stepId, chunk, delta, done)
          if (result) return result
        }

        // 루트 레벨 추론 → 최상위 thinking 카드
        const updatedItems = [...prev]
        const idx = updatedItems.findIndex(i => i.kind === 'thinking' && i.id === stepId)
        if (idx !== -1) {
          const cur = updatedItems[idx] as Extract<ChatItem, { kind: 'thinking' }>
          updatedItems[idx] = { ...cur, content: delta ? cur.content + chunk : chunk, done: done ?? cur.done }
        } else {
          updatedItems.push({ kind: 'thinking', id: stepId, content: chunk, done: done ?? false })
        }
        return updatedItems
      })
    })

    // ── plan.created ──────────────────────────────────────────
    // write_todos 가 호출될 때마다 전체 todo 목록이 최신 상태로 재전송됨.
    // 중복 카드 생성을 피하기 위해 기존 plan 카드가 있으면 steps 만 갱신한다.
    const unsubPlan = wsClient.on('plan.created', (event: WebSocketEvent) => {
      if (!('steps' in event)) return
      const { steps } = event as { steps: TodoStep[] }
      console.log('[plan.created]', { stepCount: steps.length })
      setChatItems(prev => {
        const cleared = prev.map(item =>
          item.kind === 'message' && item.role === 'ai' && item.streaming ? { ...item, streaming: false } : item
        )
        const existingIdx = cleared.findIndex(item => item.kind === 'plan')
        if (existingIdx !== -1) {
          const next = [...cleared]
          next[existingIdx] = { kind: 'plan', steps, done: false }
          return next
        }
        return [...cleared, { kind: 'plan', steps, done: false }]
      })
    })

    // ── step.started ──────────────────────────────────────────
    const unsubStepStarted = wsClient.on('step.started', (event: WebSocketEvent) => {
      const e = event as WsStepStartedEvent
      const { stepId, parentStepId, depth, stepType, name, nodeId, input } = e
      console.log('[step.started]', { stepId, parentStepId, depth, stepType, name })

      startedAtRef.current[stepId] = Date.now()

      const newCard: Extract<ChatItem, { kind: 'tool_call' }> = {
        kind: 'tool_call',
        id: stepId,
        parentStepId,
        depth,
        stepType,
        name,
        nodeId,
        input,
        done: false,
        subItems: [],
      }

      setChatItems(prev => {
        // 중첩 단계: 부모 카드 아래에 추가
        if (depth > 0 && parentStepId) {
          const result = upsertSubStep(prev, parentStepId, newCard)
          if (result) return result
        }
        // 루트 단계: 최상위에 추가
        return [...prev, newCard]
      })
    })

    // ── step.completed ────────────────────────────────────────
    const unsubStepCompleted = wsClient.on('step.completed', (event: WebSocketEvent) => {
      const e = event as WsStepCompletedEvent
      const { stepId, parentStepId, depth, output, latencyMs } = e
      console.log('[step.completed]', { stepId, depth, latencyMs })

      setChatItems(prev => {
        const result = updateStepById(prev, stepId, (item) => ({
          ...item,
          output,
          latencyMs: latencyMs ?? (Date.now() - (startedAtRef.current[stepId] ?? Date.now())),
          done: true,
          streamingContent: undefined,
        }))
        if (result) {
          delete startedAtRef.current[stepId]
          return result
        }
        // 폴백: 카드가 없으면 생성하지 않음 (started가 누락된 엣지 케이스)
        return prev
      })
    })

    // ── step.failed ───────────────────────────────────────────
    const unsubStepFailed = wsClient.on('step.failed', (event: WebSocketEvent) => {
      const e = event as WsStepFailedEvent
      const { stepId, error, latencyMs } = e
      console.log('[step.failed]', { stepId, error })

      setChatItems(prev => {
        const result = updateStepById(prev, stepId, (item) => ({
          ...item,
          error,
          latencyMs: latencyMs ?? (Date.now() - (startedAtRef.current[stepId] ?? Date.now())),
          done: true,
          streamingContent: undefined,
        }))
        if (result) {
          delete startedAtRef.current[stepId]
          return result
        }
        return prev
      })
    })

    // ── turn.completed: 턴 완료 → AI 메시지 스트리밍 종료 ────
    const unsubTurnCompleted = wsClient.on('turn.completed', (event: WebSocketEvent) => {
      console.log('[turn.completed]', event)
      setIsRunning(false)
      setChatItems(prev =>
        prev.map(item =>
          item.kind === 'message' && item.role === 'ai' && item.streaming ? { ...item, streaming: false } : item
        )
      )
    })

    // ── thread.updated: 스레드 레벨 상태 변경 ────────────────
    const unsubThreadUpdated = wsClient.on('thread.updated', (event: WebSocketEvent) => {
      const status = (event as { status?: string }).status
      console.log('[thread.updated]', { status })
      if (status && status !== 'active') {
        setIsRunning(false)
        setChatItems(prev =>
          prev.map(item =>
            item.kind === 'message' && item.role === 'ai' && item.streaming ? { ...item, streaming: false } : item
          )
        )
      }
    })

    return () => {
      wsClient.unsubscribeThread(threadId)
      unsubToken()
      unsubReasoning()
      unsubPlan()
      unsubStepStarted()
      unsubStepCompleted()
      unsubStepFailed()
      unsubTurnCompleted()
      unsubThreadUpdated()
    }
  }, [threadId, updateParentStreaming, updateParentReasoning, updateStepById, upsertSubStep])

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || isRunning) return

    setInput('')
    setIsRunning(true)
    // 메시지 전송 시 하단으로 강제 스크롤
    setIsAtBottom(true)
    isAtBottomRef.current = true

    setChatItems(prev => [...prev, { kind: 'message', role: 'human', content, timestamp: Date.now() }])

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      await onSendMessage(content, abortController.signal)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // 사용자 중지 — 에러 표시 안 함
      } else if (
        error instanceof ApiError &&
        error.statusCode === 403 &&
        (error.body as MissingMcpCredentialError | undefined)?.error === 'MissingMcpCredential'
      ) {
        const errorBody = error.body as MissingMcpCredentialError
        setMcpCredModal({ missingCredentials: errorBody.missingCredentials, pendingContent: content })
      } else {
        setChatItems(prev => [...prev, {
          kind: 'error',
          content: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        }])
      }
    } finally {
      setIsRunning(false)
      setChatItems(prev =>
        prev.map(item =>
          item.kind === 'message' && item.role === 'ai' && item.streaming ? { ...item, streaming: false } : item
        )
      )
    }
  }, [input, isRunning, onSendMessage])

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* 메시지 영역 */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 py-4 space-y-1"
        >
          {chatItems.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] mb-4">
                <Bot className="h-7 w-7 text-[var(--color-fg-muted)]" />
              </div>
              <p className="text-sm font-medium text-[var(--color-fg)]">AI 에이전트와 대화하기</p>
              <p className="text-xs text-[var(--color-fg-subtle)] mt-1">메시지를 입력하면 에이전트가 실시간으로 처리 과정을 보여줍니다.</p>
            </div>
          )}

          {chatItems.map((item, idx) => {
            if (item.kind === 'message' && item.role === 'human')
              return <HumanMessageBubble key={idx} content={item.content} timestamp={item.timestamp} />
            if (item.kind === 'message' && item.role === 'ai')
              return <AiMessageBubble key={idx} content={item.content} streaming={item.streaming} timestamp={item.timestamp} />
            if (item.kind === 'thinking')
              return <ThinkingCard key={item.id} item={item} />
            if (item.kind === 'plan')
              return <PlanCard key={idx} item={item} />
            if (item.kind === 'tool_call')
              return <ToolCallCard key={item.id} item={item} />
            if (item.kind === 'error')
              return <ErrorCard key={idx} content={item.content} />
            return null
          })}

          <div ref={bottomRef} />
        </div>

        {/* 하단으로 이동 버튼 */}
        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-4 right-4 flex items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-2 text-[var(--color-fg-muted)] shadow-lg hover:bg-[var(--color-surface-3)] hover:text-[var(--color-fg)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 실행 상태 바 (중지 버튼 포함) */}
      <StatusBar items={chatItems} isRunning={isRunning} />

      {/* 입력 영역 */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)]"
            rows={2}
            placeholder="메시지를 입력하세요... (Shift+Enter로 줄바꿈)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={isRunning}
          />
          {isRunning ? (
            <button
              onClick={handleStop}
              className="h-[42px] px-4 rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0 flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
            >
              <Square className="h-3.5 w-3.5" />
              중지
            </button>
          ) : (
            <button
              className={cn(
                'h-[42px] px-5 rounded-xl text-sm font-semibold transition-all shadow-sm shrink-0',
                !input.trim()
                  ? 'bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] cursor-not-allowed border border-[var(--color-border-strong)]'
                  : 'bg-blue-600 text-white hover:bg-blue-500 border border-blue-500',
              )}
              onClick={handleSend}
              disabled={!input.trim()}
            >
              전송
            </button>
          )}
        </div>
      </div>

      {/* MCP 자격증명 인라인 모달 */}
      {mcpCredModal && (
        <McpCredentialModal
          missingCredentials={mcpCredModal.missingCredentials}
          onSuccess={() => {
            const pendingContent = mcpCredModal.pendingContent
            setMcpCredModal(null)
            setInput(pendingContent)
            setTimeout(() => void handleSend(), 0)
          }}
          onClose={() => setMcpCredModal(null)}
        />
      )}
    </div>
  )
}

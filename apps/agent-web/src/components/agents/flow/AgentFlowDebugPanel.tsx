'use client'

import { useState, useRef, useEffect, useCallback, useMemo, createContext, useContext } from 'react'
import { marked } from 'marked'
import { apiClient, type ThreadAttachment } from '@/lib/api-client'
import { wsClient } from '@/lib/ws-client'
import { useUserStore } from '@/stores/use-user-store'
import { useToolStore } from '@/stores/use-tool-store'
import type { Agent, HumanInteraction, TodoStep, WebSocketEvent, WsStepStartedEvent, WsStepCompletedEvent, WsStepFailedEvent } from '@agent-studio/shared'
import {
  X, RotateCcw, Send, Square, Loader2, Terminal, Brain, LayoutList,
  CheckCircle, AlertCircle, ChevronDown, ChevronRight, Zap, Wrench,
  ShieldCheck, Paperclip, FileText, Image as ImageIcon, User, Bot, Sparkles,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { TodoListCard } from '@/components/chat/todo-list-card'
import { AttachmentPreviewModal } from '@/components/shared/AttachmentPreviewModal'
import { ResizeHandle } from '@/components/agents/flow/ResizeHandle'
import { HitlCardRenderer } from '@/components/dynamic-cards/HitlCardRenderer'
import { TOOL_DISPLAY_NAMES } from '@/components/dynamic-cards/hitl-helpers'

// ============================================================
// 공유 타입
// ============================================================

type HitlDecision = 'approve' | 'reject' | 'edit'

type ChatItem =
  | { kind: 'message'; role: 'human' | 'ai'; content: string; timestamp: number; streaming?: boolean }
  | { kind: 'thinking'; content: string; done: boolean; id: string }
  | { kind: 'plan'; steps: TodoStep[] }
  | { kind: 'tool_call'; id: string; name: string; input: unknown; output?: unknown; latencyMs?: number; done: boolean; error?: string; subItems?: ChatItem[]; streamingContent?: string; currentMode?: 'thinking' | 'answering'; collapsed?: boolean }
  | { kind: 'hitl_request'; interactionId: string; toolName: string; toolArgs: Record<string, unknown>; allowedDecisions: string[]; resolved?: HitlDecision; parentTaskDescription?: string; recursionLimitReached?: boolean; recursionPrompt?: string; recursionNextStepLimit?: number; cardDefinitionId?: string; cardVersion?: number; cardData?: Record<string, unknown>; toolSchema?: Record<string, unknown> }
  | { kind: 'error'; content: string; timestamp: number }

type DebugTab = 'chat' | 'log' | 'metrics' | 'raw' | 'warnings'

interface LogEntry {
  time: number
  level: 'INFO' | 'DONE' | 'WARN' | 'ERROR'
  nodeName: string
  message: string
}

interface Metrics {
  inputTokens: number
  outputTokens: number
  latencyMs: number
  stepCount: number
  cost: number
}

const EMPTY_METRICS: Metrics = { inputTokens: 0, outputTokens: 0, latencyMs: 0, stepCount: 0, cost: 0 }

interface ToolCallItem {
  name: string
  input: unknown
  output?: unknown
  latencyMs?: number
  startedAt: number
}

// ============================================================
// 내부 컴포넌트
// ============================================================

marked.setOptions({ breaks: true })

function MarkdownContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const html = useMemo(() => marked.parse(content) as string, [content])
  return (
    <div className="relative">
      <div className="prose-invert-custom text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      {streaming && (
        <span className="inline-block w-0.5 h-4 bg-[#3B82F6] animate-pulse ml-0.5 align-text-bottom" />
      )}
    </div>
  )
}

function JsonCollapsible({ label, data, defaultOpen = false }: { label: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border border-border overflow-hidden text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-fg-subtle hover:bg-[var(--color-surface-2)] transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="font-medium">{label}</span>
        {!open && data !== undefined && (
          <span className="ml-auto min-w-0 flex-1 truncate text-right text-fg-subtle font-mono text-xs">
            {JSON.stringify(data).slice(0, 200)}
          </span>
        )}
      </button>
      {open && (
        <pre className="px-3 pb-3 pt-1 text-xs text-fg overflow-x-auto whitespace-pre-wrap border-t border-border bg-bg leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ThinkingCard({ item }: { item: Extract<ChatItem, { kind: 'thinking' }> }) {
  const [expanded, setExpanded] = useState(false)
  const preview = item.content.slice(0, 120).replace(/\n/g, ' ')
  return (
    <div className="flex gap-3 py-0.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
        <Brain className="h-3.5 w-3.5 text-purple-400" />
      </div>
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

type RenderChatItem =
  | { kind: 'single'; item: ChatItem }
  | { kind: 'completed_group'; id: string; items: (Extract<ChatItem, { kind: 'tool_call' }> | Extract<ChatItem, { kind: 'hitl_request' }>)[] }

function groupCompletedChats(items: ChatItem[]): RenderChatItem[] {
  const result: RenderChatItem[] = []
  let currentGroup: (Extract<ChatItem, { kind: 'tool_call' }> | Extract<ChatItem, { kind: 'hitl_request' }>)[] = []

  const pushCurrentGroup = () => {
    if (currentGroup.length > 0) {
      if (currentGroup.length === 1) {
        result.push({ kind: 'single', item: currentGroup[0] })
      } else {
        // 그룹 id 는 첫 아이템 id 만으로 안정화 — 새 도구가 합류해도 동일 id 유지되어
        // 패널 레벨 expandedIds 가 펼침 상태를 잃지 않는다.
        const firstId =
          currentGroup[0].kind === 'tool_call'
            ? currentGroup[0].id
            : currentGroup[0].interactionId
        result.push({
          kind: 'completed_group',
          id: `group-${firstId}`,
          items: [...currentGroup],
        })
      }
      currentGroup = []
    }
  }

  for (const item of items) {
    const isCompletedTool = item.kind === 'tool_call' && item.done && !item.error
    const isResolvedHitl = item.kind === 'hitl_request' && !!item.resolved

    if (isCompletedTool || isResolvedHitl) {
      currentGroup.push(item as any)
    } else {
      pushCurrentGroup()
      result.push({ kind: 'single', item })
    }
  }
  pushCurrentGroup()

  return result
}

// 사용자가 펼친 카드 id 를 패널 레벨에서 추적하기 위한 context.
// 도구 카드가 그룹에 흡수되며 unmount/리마운트 되어도 펼침 상태가 유지된다.
interface ExpandedCtx {
  isExpanded: (id: string) => boolean
  toggle: (id: string) => void
}
const ExpandedStateContext = createContext<ExpandedCtx | null>(null)

function useExpandedState(id: string): [boolean, () => void] {
  const ctx = useContext(ExpandedStateContext)
  const [localOpen, setLocalOpen] = useState(false)
  if (ctx) {
    return [ctx.isExpanded(id), () => ctx.toggle(id)]
  }
  return [localOpen, () => setLocalOpen((v) => !v)]
}

function ChatItemList({
  items,
  onHitlDecide,
  onHitlEditSubmit
}: {
  items: ChatItem[];
  onHitlDecide?: (interactionId: string, d: 'approve' | 'reject') => void;
  onHitlEditSubmit?: (interactionId: string, args: Record<string, unknown>, editPrompt: string, taskDescriptionUpdate?: string) => void;
}) {
  const renderItems = useMemo(() => groupCompletedChats(items), [items])

  return (
    <div className="space-y-0.5 w-full">
      {renderItems.map((ri, idx) => {
        if (ri.kind === 'single') {
          const item = ri.item
          if (item.kind === 'message') {
            const isHuman = item.role === 'human'
            return (
              <div key={idx} className={cn('flex gap-3 py-0.5', isHuman ? 'justify-end' : 'justify-start')}>
                {!isHuman && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--color-surface-2)] text-xs font-bold text-fg select-none">
                    AI
                  </div>
                )}
                <div className={cn('flex flex-col gap-1 max-w-[80%]', isHuman ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-all duration-200',
                    isHuman
                      ? 'bg-[#3B82F6] text-white rounded-tr-none'
                      : 'bg-[var(--color-surface-2)] text-fg border border-border rounded-tl-none',
                  )}>
                    {isHuman ? (
                      <div className="whitespace-pre-wrap font-sans">{item.content}</div>
                    ) : (
                      <MarkdownContent content={item.content} streaming={item.streaming} />
                    )}
                  </div>
                  {item.timestamp && (
                    <span className={cn(
                      'text-xs text-fg-subtle px-1 font-medium tracking-tight select-none',
                      isHuman ? 'text-right' : 'text-left'
                    )}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            )
          }
          if (item.kind === 'thinking') return <ThinkingCard key={item.id || idx} item={item} />
          if (item.kind === 'plan') return null
          if (item.kind === 'tool_call') return <ToolCallCard key={item.id || idx} item={item} onHitlDecide={onHitlDecide} onHitlEditSubmit={onHitlEditSubmit} />
          if (item.kind === 'hitl_request') {
            return (
              <div key={item.interactionId || idx} className="py-0.5">
                <HitlCardRenderer
                  cardDefinitionId={item.cardDefinitionId}
                  cardVersion={item.cardVersion}
                  item={item}
                  mode="runtime"
                  onDecide={(d) => onHitlDecide?.(item.interactionId, d)}
                  onEditSubmit={(args, editPrompt, taskDescriptionUpdate) =>
                    onHitlEditSubmit?.(item.interactionId, args, editPrompt, taskDescriptionUpdate)
                  }
                />
              </div>
            )
          }
          if (item.kind === 'error') {
            return (
              <div key={idx} className="flex gap-3 py-0.5">
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
        } else {
          return (
            <CompletedGroupCard
              key={ri.id}
              groupId={ri.id}
              items={ri.items}
              onHitlDecide={onHitlDecide}
              onHitlEditSubmit={onHitlEditSubmit}
            />
          )
        }
      })}
    </div>
  )
}

function CompletedGroupCard({
  groupId,
  items,
  onHitlDecide,
  onHitlEditSubmit
}: {
  groupId: string
  items: (Extract<ChatItem, { kind: 'tool_call' }> | Extract<ChatItem, { kind: 'hitl_request' }>)[]
  onHitlDecide?: (interactionId: string, d: 'approve' | 'reject') => void;
  onHitlEditSubmit?: (interactionId: string, args: Record<string, unknown>, editPrompt: string, taskDescriptionUpdate?: string) => void;
}) {
  const [expanded, toggle] = useExpandedState(groupId)
  const count = items.length

  const displayNames = useToolStore((s) => s.builtinDisplayNames)
  const firstItem = items[0]
  const firstLabel = firstItem.kind === 'tool_call' ? getToolCallLabel(firstItem, displayNames) : `승인 요청 (${firstItem.toolName})`
  const summaryLabel = count > 1
    ? `${firstLabel} 등 ${count}개`
    : `${firstLabel}`

  return (
    <div className="flex gap-3 py-0.5 animate-merge-slide">
      <div className="w-6 shrink-0" aria-hidden />

      <div
        className="flex-1 min-w-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.02] shadow-[0_0_8px_rgba(16,185,129,0.04)] overflow-hidden transition-all duration-200 animate-glow-pulse"
      >
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-emerald-400"
        >
          <div className="shrink-0 text-emerald-400 transition-transform duration-200">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
          <Layers className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]">
            {summaryLabel}
          </span>

          {/* 카운트 변동 시에만 팝 애니메이션 재발화 — 카드 본체는 안정 id 유지 */}
          <span
            key={count}
            className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded bg-emerald-500/20 px-1.5 py-0.5 text-xs font-bold text-emerald-400 tabular-nums animate-group-pop"
          >
            {count}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-emerald-500/10 bg-bg/50 p-1 space-y-0.5">
            {items.map((it, idx) => (
              it.kind === 'tool_call' ? (
                <ToolCallCard key={it.id || idx} item={it} onHitlDecide={onHitlDecide} onHitlEditSubmit={onHitlEditSubmit} />
              ) : (
                <div key={it.interactionId || idx} className="py-0.5">
                  <HitlCardRenderer
                    cardDefinitionId={it.cardDefinitionId}
                    cardVersion={it.cardVersion}
                    item={it}
                    mode="runtime"
                    onDecide={(d) => onHitlDecide?.(it.interactionId, d)}
                    onEditSubmit={(args, editPrompt, taskDescriptionUpdate) =>
                      onHitlEditSubmit?.(it.interactionId, args, editPrompt, taskDescriptionUpdate)
                    }
                  />
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ParsedToolInput {
  isSubAgent: boolean
  subagentType?: string
  subagentName?: string
  toolCallName?: string
  toolCallId?: string
}

function parseToolCallInput(input: unknown): ParsedToolInput {
  const result: ParsedToolInput = { isSubAgent: false }
  
  if (!input || typeof input !== 'object') return result
  const obj = input as Record<string, unknown>
  
  if (obj['__type'] === 'tool_call_with_context') {
    const tc = obj['tool_call']
    if (tc && typeof tc === 'object') {
      const tcObj = tc as Record<string, unknown>
      result.toolCallName = tcObj['name'] as string | undefined
      result.toolCallId = tcObj['id'] as string | undefined
      
      const args = tcObj['args']
      if (args && typeof args === 'object') {
        const argsObj = args as Record<string, unknown>
        const subType = argsObj['subagent_type'] as string | undefined
        if (subType) {
          result.isSubAgent = true
          result.subagentType = subType
          
          // 명칭(subagentName) 추출 로직
          let nameCandidate: string | undefined = undefined
          
          // 1. skills_metadata[0].name
          const state = obj['state']
          if (state && typeof state === 'object') {
            const stateObj = state as Record<string, unknown>
            const skillsMetadata = stateObj['skills_metadata']
            if (Array.isArray(skillsMetadata) && skillsMetadata.length > 0) {
              const firstSkill = skillsMetadata[0]
              if (firstSkill && typeof firstSkill === 'object') {
                const skillObj = firstSkill as Record<string, unknown>
                if (typeof skillObj['name'] === 'string') {
                  nameCandidate = skillObj['name']
                }
              }
            }
          }
          
          // 2. args.agent_name, args.name, args.subagent_name
          if (!nameCandidate) {
            const candidateKeys = ['agent_name', 'name', 'subagent_name']
            for (const key of candidateKeys) {
              const val = argsObj[key]
              if (typeof val === 'string' && val.trim() !== '') {
                nameCandidate = val
                break
              }
            }
          }
          
          // 3. args.subagent_type
          if (!nameCandidate) {
            nameCandidate = subType
          }
          
          // 4. general-purpose fallback
          if (!nameCandidate || nameCandidate.trim() === '') {
            nameCandidate = 'general-purpose'
          }
          
          result.subagentName = nameCandidate
        }
      }
    }
  }
  
  return result
}

const MIDDLEWARE_NAME_REGEX = /^([A-Za-z0-9_]+)Middleware\.(.+)$/

function isMiddlewareName(name: string): boolean {
  return MIDDLEWARE_NAME_REGEX.test(name)
}

function countMiddleware(items: ChatItem[]): number {
  let n = 0
  for (const it of items) {
    if (it.kind === 'tool_call') {
      if (isMiddlewareName(it.name)) n += 1
      if (it.subItems) n += countMiddleware(it.subItems)
    }
  }
  return n
}

function prettifyRawName(name: string): string {
  return name
}

function getToolCallLabel(
  item: Extract<ChatItem, { kind: 'tool_call' }>,
  displayNames: Record<string, string>,
): string {
  const parsed = parseToolCallInput(item.input)
  if (parsed.isSubAgent && parsed.subagentName) {
    return `tasks (${parsed.subagentName})`
  }
  const toolName = !parsed.isSubAgent && parsed.toolCallName ? parsed.toolCallName : undefined
  if (toolName) {
    const display = TOOL_DISPLAY_NAMES[toolName] ?? displayNames[toolName]
    return display ? `tools (${display})` : `tools (${prettifyRawName(toolName)})`
  }
  const display = TOOL_DISPLAY_NAMES[item.name] ?? displayNames[item.name]
  return display ?? prettifyRawName(item.name)
}

function ToolCallCard({ 
  item,
  onHitlDecide,
  onHitlEditSubmit
}: { 
  item: Extract<ChatItem, { kind: 'tool_call' }>;
  onHitlDecide?: (interactionId: string, d: 'approve' | 'reject') => void;
  onHitlEditSubmit?: (interactionId: string, args: Record<string, unknown>, editPrompt: string, taskDescriptionUpdate?: string) => void;
}) {
  const [expanded, toggle] = useExpandedState(`tool:${item.id}`)
  const parsed = useMemo(() => parseToolCallInput(item.input), [item.input])

  const isAgent = item.name.toLowerCase().includes('agent_')
  const isTask = isAgent || parsed.isSubAgent || item.name.toLowerCase() === 'task' || item.name.toLowerCase().includes('sub_')

  const displayNames = useToolStore((s) => s.builtinDisplayNames)
  const label = getToolCallLabel(item, displayNames)

  const hasSubItems = item.subItems && item.subItems.length > 0
  const isRunning = !item.done && !item.error
  const isDone = item.done && !item.error
  const isFailed = !!item.error

  let borderBgClass = 'border-border bg-bg'

  if (isTask) {
    if (isRunning) {
      borderBgClass = 'border-purple-400/60 bg-purple-500/[0.05]'
    } else if (isDone) {
      borderBgClass = 'border-purple-500/25 bg-purple-500/[0.02]'
    } else if (isFailed) {
      borderBgClass = 'border-red-500/20 bg-red-500/5'
    } else {
      borderBgClass = 'border-purple-200/20 bg-purple-500/[0.005]'
    }
  } else {
    if (isRunning) {
      borderBgClass = 'border-amber-500/20 bg-amber-500/5'
    } else if (isDone) {
      borderBgClass = 'border-emerald-500/25 bg-emerald-500/[0.015] shadow-[0_0_8px_rgba(16,185,129,0.04)]'
    } else if (isFailed) {
      borderBgClass = 'border-red-500/20 bg-red-500/5'
    }
  }

  return (
    <div className="flex gap-2.5 py-[1px]">
      <div className={cn(
        'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors',
        isFailed ? 'bg-red-500/10 border-red-500/20' :
        isTask ? 'bg-purple-500/10 border-purple-500/20' :
        isDone ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20',
      )}>
        {isFailed ? <AlertCircle className="h-3.5 w-3.5 text-red-400" /> :
         isDone ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> :
         <Loader2 className="h-3.5 w-3.5 text-amber-400 animate-spin" />}
      </div>
      <div className={cn(
        'flex-1 min-w-0 rounded-xl border overflow-hidden transition-all duration-200',
        borderBgClass
      )}>
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        >
          <Terminal className={cn('h-3.5 w-3.5 shrink-0', isFailed ? 'text-red-400' : isTask ? 'text-purple-400' : isDone ? 'text-emerald-500/70' : 'text-amber-400')} />
          <span className={cn('min-w-0 flex-1 text-xs font-bold font-mono truncate', isFailed ? 'text-red-400' : isTask ? 'text-purple-300' : isDone ? 'text-fg' : 'text-amber-400')}>
            {label}
          </span>
          {isTask && hasSubItems && (
            <span className="shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400 font-medium tabular-nums">
              하위 {item.subItems!.length}
            </span>
          )}
          {item.latencyMs !== undefined && (
            <span className="ml-auto shrink-0 text-[9.5px] text-fg-subtle font-mono tabular-nums">{item.latencyMs}ms</span>
          )}
          <div className="shrink-0 text-fg-subtle">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </div>
        </button>
        {expanded && (
          <div className="border-t border-border/50 p-2.5 space-y-2">
            {item.input !== undefined && <JsonCollapsible label="입력 (Input)" data={item.input} defaultOpen />}
            {hasSubItems && (
              <div className="mt-1.5 space-y-1 border-l border-border/60 pl-2.5 bg-black/[0.05] rounded-r p-1">
                <ChatItemList 
                  items={item.subItems!} 
                  onHitlDecide={onHitlDecide} 
                  onHitlEditSubmit={onHitlEditSubmit} 
                />
              </div>
            )}
            {item.output !== undefined && <JsonCollapsible label="출력 (Output)" data={item.output} defaultOpen />}
            {item.error && (
              <div className="rounded-md border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10.5px] text-red-400">
                {item.error}
              </div>
            )}
            {!item.done && !item.error && !hasSubItems && (
              <div className="flex items-center gap-1.5 py-0.5 text-[10.5px] text-amber-400/70">
                <Zap className="h-3 w-3 animate-pulse" />
                <span>도구 실행 중...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function extractParentTaskDescriptionDebug(
  agentContext: Record<string, unknown> | undefined,
): string | undefined {
  if (!agentContext) return undefined
  const parentTaskArgs = agentContext['parentTaskArgs']
  if (!parentTaskArgs || typeof parentTaskArgs !== 'object') return undefined
  const desc = (parentTaskArgs as Record<string, unknown>)['description']
  if (typeof desc !== 'string' || desc.trim().length === 0) return undefined
  return desc
}



// ============================================================
// AgentFlowDebugPanel
// ============================================================

export type StepFlowEvent =
  | { type: 'reset' }
  | { type: 'started'; name: string; stepId?: string; parentStepId?: string; stepType?: string }
  | { type: 'completed'; name: string; stepId?: string; parentStepId?: string; stepType?: string }
  | { type: 'failed'; name: string; stepId?: string; parentStepId?: string; stepType?: string }

interface AgentFlowDebugPanelProps {
  agent: Agent
  projectId: string
  isRunning: boolean
  sessionToken: number
  onClose: () => void
  onStepEvent?: (event: StepFlowEvent) => void
  /** 좌측 드래그 핸들로 변경되는 패널 폭 (px). 미지정 시 460. */
  width?: number
  /** 좌측 핸들 드래그 콜백 */
  onResize?: (deltaPx: number) => void
  /** true 면 부모 영역을 가득 채운다(기본: 460px 고정 컬럼) */
  fullWidth?: boolean
}

const DEBUG_TABS: { id: DebugTab; label: string }[] = [
  { id: 'chat', label: '채팅' },
  { id: 'log', label: '실행 로그' },
  { id: 'metrics', label: '메트릭' },
  { id: 'raw', label: 'Raw' },
  { id: 'warnings', label: '경고' },
]

export function AgentFlowDebugPanel({
  agent,
  projectId,
  isRunning,
  sessionToken,
  onClose,
  onStepEvent,
  width,
  onResize,
  fullWidth = false,
}: AgentFlowDebugPanelProps) {
  const onStepEventRef = useRef(onStepEvent)
  useEffect(() => {
    onStepEventRef.current = onStepEvent
  }, [onStepEvent])
  const setBuiltinDisplayNames = useToolStore((s) => s.setBuiltinDisplayNames)
  const setBuiltinLabels = useToolStore((s) => s.setBuiltinLabels)
  useEffect(() => {
    let cancelled = false
    apiClient.tools.getBuiltin(projectId).then((groups) => {
      if (cancelled) return
      const map: Record<string, string> = {}
      const labelMap: Record<string, Record<string, string>> = {}
      for (const group of groups) {
        for (const tool of group.tools) {
          map[tool.id] = tool.name
          if (tool.labels) labelMap[tool.id] = tool.labels
        }
      }
      setBuiltinDisplayNames(map)
      setBuiltinLabels(labelMap)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [projectId, setBuiltinDisplayNames, setBuiltinLabels])
  const [activeTab, setActiveTab] = useState<DebugTab>('chat')
  const [hideMiddleware, setHideMiddleware] = useState<boolean>(true)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = window.localStorage.getItem('agent-builder.hide-middleware')
    if (v != null) setHideMiddleware(v === '1')
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('agent-builder.hide-middleware', hideMiddleware ? '1' : '0')
  }, [hideMiddleware])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const expandedCtx = useMemo<ExpandedCtx>(() => ({
    isExpanded: (id) => expandedIds.has(id),
    toggle: (id) => setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    }),
  }), [expandedIds])
  const [runMode, setRunMode] = useState<'react' | 'plan_execute'>('react')
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [lastTurnCancelled, setLastTurnCancelled] = useState(false)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [chatItems, setChatItems] = useState<ChatItem[]>([])
  const [planSteps, setPlanSteps] = useState<TodoStep[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [currentMetrics, setCurrentMetrics] = useState<Metrics>(EMPTY_METRICS)
  const [cumulativeMetrics, setCumulativeMetrics] = useState<Metrics>(EMPTY_METRICS)
  const turnBufferRef = useRef<{ latencyMs: number; stepCount: number }>({ latencyMs: 0, stepCount: 0 })
  const [rawOutputs, setRawOutputs] = useState<{ nodeName: string; output: unknown }[]>([])
  const [warnings, setWarnings] = useState<LogEntry[]>([])
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([])
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<ThreadAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRootRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  // stop 으로 사용자가 의도적으로 cancel 한 직후의 invoke 응답 에러는 chat 에 표시하지 않는다.
  const cancelRequestedRef = useRef(false)
  const isAtBottomRef = useRef(true)
  const currentUser = useUserStore((s) => s.currentUser)

  const chatItemsRef = useRef<ChatItem[]>([])
  useEffect(() => { chatItemsRef.current = chatItems }, [chatItems])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  const handleHitlDecide = useCallback((interactionId: string, decision: 'approve' | 'reject') => {
    setChatItems(prev => prev.map(item =>
      item.kind === 'hitl_request' && item.interactionId === interactionId
        ? { ...item, resolved: decision }
        : item,
    ))
    wsClient.respondToInteraction(interactionId, { decision }, currentUser?.id ?? '', 'studio')
    setRunning(true)
  }, [currentUser?.id])

  const handleHitlEditSubmit = useCallback((
    interactionId: string,
    editedArgs: Record<string, unknown>,
    editPrompt: string,
    taskDescriptionUpdate?: string,
  ) => {
    const target = chatItemsRef.current.find(
      (i): i is Extract<ChatItem, { kind: 'hitl_request' }> =>
        i.kind === 'hitl_request' && i.interactionId === interactionId,
    )
    if (!target) return
    setChatItems(prev => prev.map(item =>
      item.kind === 'hitl_request' && item.interactionId === interactionId
        ? { ...item, resolved: 'edit' }
        : item,
    ))
    const response: Record<string, unknown> = {
      decision: 'edit',
      editedAction: { name: target.toolName, args: editedArgs },
    }
    if (editPrompt) response.editPrompt = editPrompt
    if (taskDescriptionUpdate) response.taskDescriptionUpdate = taskDescriptionUpdate
    wsClient.respondToInteraction(
      interactionId,
      response,
      currentUser?.id ?? '',
      'studio',
    )
    setRunning(true)
  }, [currentUser?.id])

  const warningCount = warnings.length

  // ── 헬퍼 함수들 ──────────────────────────────────────────────

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

  // ── WebSocket 패널 마운트 시 즉시 연결 (invoke 전 연결 보장) ──
  useEffect(() => {
    wsClient.connect()
  }, [])

  // ── WebSocket 이벤트 핸들링 ──────────────────────────────────

  useEffect(() => {
    if (!activeThreadId) return

    wsClient.connect()
    wsClient.subscribeThread(activeThreadId)

    const unsubToken = wsClient.on('agent.token', (event: unknown) => {
      const e = event as { stepId: string; parentStepId?: string; depth: number; content?: string; delta?: boolean; done?: boolean }
      const chunk = e.content || ''
      setChatItems(prev => {
        if (e.depth > 0 && e.parentStepId) {
          const result = updateStepById(prev, e.parentStepId, (item) => ({
            ...item,
            streamingContent: e.delta ? (item.streamingContent || '') + chunk : chunk,
            currentMode: 'answering' as const,
          }))
          if (result) return result
        }
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.kind === 'message' && last.role === 'ai') {
          const aiMsg = { ...last } as Extract<ChatItem, { kind: 'message' }>
          aiMsg.content = e.delta ? aiMsg.content + chunk : chunk
          aiMsg.streaming = !e.done
          updated[updated.length - 1] = aiMsg
        } else {
          updated.push({ kind: 'message', role: 'ai', content: chunk, timestamp: Date.now(), streaming: !e.done })
        }
        return updated
      })
    })

    const unsubReasoning = wsClient.on('agent.reasoning', (event: unknown) => {
      const e = event as { stepId: string; parentStepId?: string; depth: number; content?: string; delta?: boolean; done?: boolean }
      const chunk = e.content || ''
      setChatItems(prev => {
        if (e.depth > 0 && e.parentStepId) {
          const result = updateStepById(prev, e.parentStepId, (item) => {
            const subItems = [...(item.subItems || [])]
            const reasoningId = `${e.stepId}-thinking`
            const idx = subItems.findIndex(s => s.kind === 'thinking' && s.id === reasoningId)
            if (idx >= 0) {
              const cur = subItems[idx] as Extract<ChatItem, { kind: 'thinking' }>
              subItems[idx] = { ...cur, content: e.delta ? cur.content + chunk : chunk, done: e.done ?? cur.done }
            } else {
              subItems.push({ kind: 'thinking', id: reasoningId, content: chunk, done: e.done ?? false })
            }
            return { ...item, subItems, currentMode: e.done ? 'answering' as const : 'thinking' as const }
          })
          if (result) return result
        }
        const updated = [...prev]
        const idx = updated.findIndex(i => i.kind === 'thinking' && i.id === e.stepId)
        if (idx !== -1) {
          const cur = updated[idx] as Extract<ChatItem, { kind: 'thinking' }>
          updated[idx] = { ...cur, content: e.delta ? cur.content + chunk : chunk, done: e.done ?? cur.done }
        } else {
          updated.push({ kind: 'thinking', id: e.stepId, content: chunk, done: e.done ?? false })
        }
        return updated
      })
    })

    const unsubStepStarted = wsClient.on('step.started', (event: unknown) => {
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
      setLogs(prev => [...prev, {
        time: Date.now(),
        level: 'INFO',
        nodeName: e.name,
        message: `단계 시작: ${e.name}`,
      }])
      setToolCalls(prev => {
        if (e.stepType === 'tool') {
          return [...prev, { name: e.name, input: e.input, startedAt: Date.now() }]
        }
        return prev
      })
      onStepEventRef.current?.({
        type: 'started',
        name: e.name,
        stepId: e.stepId,
        parentStepId: e.parentStepId,
        stepType: e.stepType,
      })
    })

    const unsubStepCompleted = wsClient.on('step.completed', (event: unknown) => {
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
      setLogs(prev => [...prev, {
        time: Date.now(),
        level: 'DONE',
        nodeName: e.name ?? '',
        message: `단계 완료: ${e.name ?? e.stepId} (${e.latencyMs ?? 0}ms)`,
      }])
      setRawOutputs(prev => [...prev, { nodeName: e.name ?? e.stepId, output: e.output }])
      if (e.latencyMs !== undefined) {
        turnBufferRef.current = {
          latencyMs: turnBufferRef.current.latencyMs + e.latencyMs,
          stepCount: turnBufferRef.current.stepCount + 1,
        }
      }
      setToolCalls(prev => {
        const idx = prev.findIndex(t => t.name === e.name && t.output === undefined)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = { ...updated[idx], output: e.output, latencyMs: e.latencyMs }
          return updated
        }
        return prev
      })
      if (e.name) {
        onStepEventRef.current?.({
          type: 'completed',
          name: e.name,
          stepId: e.stepId,
          parentStepId: e.parentStepId,
          stepType: e.stepType,
        })
      }
    })

    const unsubStepFailed = wsClient.on('step.failed', (event: unknown) => {
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
      const entry: LogEntry = {
        time: Date.now(),
        level: 'ERROR',
        nodeName: e.stepId,
        message: `단계 실패: ${e.error}`,
      }
      setLogs(prev => [...prev, entry])
      setWarnings(prev => [...prev, entry])
      if (e.name) {
        onStepEventRef.current?.({
          type: 'failed',
          name: e.name,
          stepId: e.stepId,
          parentStepId: e.parentStepId,
          stepType: e.stepType,
        })
      }
    })

    const unsubPlan = wsClient.on('plan.created', (event: WebSocketEvent) => {
      if (!('steps' in event)) return
      const { steps } = event as { steps: TodoStep[] }
      setPlanSteps(steps as TodoStep[])
    })

    const unsubHitlRequest = wsClient.on('hitl.request', (event: unknown) => {
      const e = event as { interaction?: HumanInteraction }
      const interaction = e.interaction
      if (!interaction?.id) return
      const toolName = interaction.toolName || interaction.actionRequests?.[0]?.name || 'tool'
      const toolArgs = (interaction.toolArgs ?? interaction.actionRequests?.[0]?.args ?? {}) as Record<string, unknown>
      const allowed = interaction.allowedDecisions ?? interaction.reviewConfigs?.[0]?.allowedDecisions ?? ['approve', 'edit', 'reject']
      const parentTaskDescription = extractParentTaskDescriptionDebug(
        interaction.agentContext as Record<string, unknown> | undefined,
      )
      const ctx = (interaction.agentContext ?? {}) as Record<string, unknown>
      const recursionLimitReached = ctx.recursionLimitReached === true
      const recursionNextStepLimit =
        typeof ctx.nextStepLimit === 'number' ? (ctx.nextStepLimit as number) : undefined
      // 동적 카드 메타 — 백엔드 _handle_interrupt 가 cardDefinitionId/cardData/toolSchema 발행.
      const cardDefinitionId =
        typeof ctx.cardDefinitionId === 'string' ? (ctx.cardDefinitionId as string) : 'hitl-input-card'
      const cardVersion =
        typeof ctx.cardVersion === 'number' ? (ctx.cardVersion as number) : 1
      const cardData =
        ctx.cardData && typeof ctx.cardData === 'object'
          ? (ctx.cardData as Record<string, unknown>)
          : undefined
      const toolSchema =
        cardData && typeof cardData.toolSchema === 'object'
          ? (cardData.toolSchema as Record<string, unknown>)
          : undefined
      setChatItems(prev => [
        ...prev.map(item => item.kind === 'tool_call' ? { ...item, collapsed: true } : item),
        {
          kind: 'hitl_request',
          interactionId: interaction.id,
          toolName,
          toolArgs,
          allowedDecisions: allowed,
          parentTaskDescription,
          recursionLimitReached,
          recursionPrompt: recursionLimitReached ? interaction.prompt : undefined,
          recursionNextStepLimit,
          cardDefinitionId,
          cardVersion,
          cardData,
          toolSchema,
        },
      ])
      setRunning(false)
    })

    const unsubHitlResponded = wsClient.on('hitl.responded', (event: unknown) => {
      const status = (event as { status?: string })?.status
      // paused: 곧 새 hitl.request 가 emit 됨 — 그쪽에서 running=false 처리.
      if (status === 'paused') return
      // 정상 종료: turn.completed 가 이미 running=false 처리했지만,
      // 백엔드가 비정상 종료해 turn.completed 가 누락된 케이스 안전망.
      setRunning(false)
    })

    const unsubTurnCompleted = wsClient.on('turn.completed', (event: unknown) => {
      const { finalContent, usage } = event as {
        finalContent?: string
        usage?: { inputTokens?: number; outputTokens?: number; totalCost?: number }
      }
      const turn: Metrics = {
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cost: usage?.totalCost ?? 0,
        latencyMs: turnBufferRef.current.latencyMs,
        stepCount: turnBufferRef.current.stepCount,
      }
      setCurrentMetrics(turn)
      setCumulativeMetrics(prev => ({
        inputTokens: prev.inputTokens + turn.inputTokens,
        outputTokens: prev.outputTokens + turn.outputTokens,
        latencyMs: prev.latencyMs + turn.latencyMs,
        stepCount: prev.stepCount + turn.stepCount,
        cost: prev.cost + turn.cost,
      }))
      turnBufferRef.current = { latencyMs: 0, stepCount: 0 }
      setChatItems(prev => {
        let updated: ChatItem[] = prev.map(item =>
          item.kind === 'tool_call' ? { ...item, collapsed: true } : item
        )
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
        if (aiIndices.length > 1) {
          const removeSet = new Set(aiIndices.slice(0, -1))
          updated = updated.filter((_, i) => !removeSet.has(i))
        }
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
          updated[lastAiIdx] = { ...msg, content: msg.content || finalContent || '', streaming: false }
        } else if (finalContent) {
          updated = [...updated, { kind: 'message', role: 'ai', content: finalContent, timestamp: Date.now(), streaming: false }]
        }
        return updated
      })
      setRunning(false)
      // 이메일 첨부 자동 저장(gmail_fetch_attachment / gmail_parse_pdf_attachment) 결과를
      // 첨부 목록에 반영하기 위해 turn 종료 시 목록을 재조회한다.
      if (activeThreadId) {
        apiClient.attachments
          .list(activeThreadId)
          .then(setAttachments)
          .catch(() => undefined)
      }
    })

    const unsubCancelled = wsClient.on('run.cancelled', (event: unknown) => {
      const e = event as { partialContent?: string }
      const partial = typeof e?.partialContent === 'string' ? e.partialContent : ''
      const cancelMark = '\n\n_(응답이 중지되었습니다)_'
      setChatItems(prev => {
        let updated: ChatItem[] = [...prev]
        // 1) 진행 중이던 마지막 ai 메시지가 있으면 부분 답변 끝에 cancel 마커 append.
        let lastAiIdx = -1
        for (let i = updated.length - 1; i >= 0; i--) {
          const it = updated[i]
          if (it.kind === 'message' && (it as Extract<ChatItem, { kind: 'message' }>).role === 'ai') {
            lastAiIdx = i
            break
          }
          if (it.kind === 'message' && (it as Extract<ChatItem, { kind: 'message' }>).role === 'human') {
            break
          }
        }
        if (lastAiIdx >= 0) {
          const msg = updated[lastAiIdx] as Extract<ChatItem, { kind: 'message' }>
          updated[lastAiIdx] = {
            ...msg,
            content: (msg.content || partial) + cancelMark,
            streaming: false,
          }
        } else if (partial.trim()) {
          updated.push({
            kind: 'message',
            role: 'ai',
            content: partial + cancelMark,
            timestamp: Date.now(),
            streaming: false,
          })
        } else {
          // 부분 답변도 없고 ai 메시지도 없는 경우(예: 모델이 토큰 발화 전 cancel) — 단독 안내 추가.
          updated.push({
            kind: 'message',
            role: 'ai',
            content: '_(응답이 중지되었습니다)_',
            timestamp: Date.now(),
            streaming: false,
          })
        }
        // 진행 중인 tool_call 은 collapse 처리 (chevron 정리).
        updated = updated.map(item =>
          item.kind === 'tool_call' ? { ...item, collapsed: true } : item,
        )
        return updated
      })
      // planSteps 의 in_progress/completed 변경분을 pending 으로 revert — 단순 정책(이전 turn snapshot
      // 비교는 admin 에서는 turn snapshot 을 보존하지 않으므로 단순 in_progress 만 pending 으로 보정).
      // 백엔드 graph state 는 더 정확하게 rollback 되며 다음 fetch 시 정합.
      setPlanSteps(prev =>
        prev.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' as const } : s)),
      )
      setLastTurnCancelled(true)
      setRunning(false)
    })

    return () => {
      wsClient.unsubscribeThread(activeThreadId)
      unsubToken()
      unsubReasoning()
      unsubStepStarted()
      unsubStepCompleted()
      unsubStepFailed()
      unsubPlan()
      unsubTurnCompleted()
      unsubHitlRequest()
      unsubHitlResponded()
      unsubCancelled()
    }
  }, [activeThreadId, updateStepById, upsertSubStep])

  useEffect(() => {
    if (!isRunning) setRunning(false)
  }, [isRunning])

  useEffect(() => {
    if (running) return
    const active = document.activeElement as HTMLElement | null
    const insidePanel = !!(active && panelRootRef.current?.contains(active))
    if (active === document.body || active === null || insidePanel) {
      requestAnimationFrame(() => textareaRef.current?.focus())
    }
  }, [running])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const scrollToBottom = () => {
      if (!isAtBottomRef.current) return
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
    scrollToBottom()
    const observer = new ResizeObserver(scrollToBottom)
    const mutation = new MutationObserver(scrollToBottom)
    observer.observe(el)
    Array.from(el.children).forEach((child) => observer.observe(child as Element))
    mutation.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      mutation.disconnect()
    }
  }, [activeTab])

  useEffect(() => {
    if (!isAtBottomRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [chatItems, planSteps])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 80
  }

  const clearAll = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    isAtBottomRef.current = true
    setChatItems([])
    setPlanSteps([])
    setLogs([])
    setRawOutputs([])
    setWarnings([])
    setToolCalls([])
    setCurrentMetrics(EMPTY_METRICS)
    setCumulativeMetrics(EMPTY_METRICS)
    turnBufferRef.current = { latencyMs: 0, stepCount: 0 }
    setActiveThreadId(null)
    setAttachments([])
    setRunning(false)
    setLastTurnCancelled(false)
    onStepEventRef.current?.({ type: 'reset' })
  }, [])

  /** thread 가 없으면 생성하고 id 반환. invoke / 첨부 업로드가 공통으로 사용. */
  const ensureThreadId = useCallback(async (): Promise<string> => {
    if (activeThreadId) return activeThreadId
    const thread = await apiClient.threads.create(projectId, {
      agentId: agent.id,
      metadata: { source: 'admin-debug' },
    })
    setActiveThreadId(thread.id)
    return thread.id
  }, [activeThreadId, projectId, agent.id])

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files)
      if (arr.length === 0) return
      setUploading(true)
      try {
        const threadId = await ensureThreadId()
        for (const file of arr) {
          try {
            const att = await apiClient.attachments.upload(threadId, file)
            setAttachments(prev => [...prev, att])
          } catch (err) {
            toast.error(
              `${file.name} 업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '스레드 생성 실패')
      } finally {
        setUploading(false)
      }
    },
    [ensureThreadId],
  )

  // 채팅 탭 전체 DnD — dragenter/leave 의 자식 element 이벤트 버블링은 counter 로 무력화.
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragCounterRef.current += 1
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDropFiles = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragOver(false)
      void handleFilesSelected(e.dataTransfer.files)
    },
    [handleFilesSelected],
  )

  const handleRemoveAttachment = useCallback(async (attachmentId: string) => {
    try {
      await apiClient.attachments.delete(attachmentId)
      setAttachments(prev => prev.filter(a => a.id !== attachmentId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '첨부 삭제 실패')
    }
  }, [])

  // activeThreadId 가 (history 복원 등으로) 변경되면 첨부도 다시 로드.
  useEffect(() => {
    if (!activeThreadId) {
      setAttachments([])
      return
    }
    apiClient.attachments
      .list(activeThreadId)
      .then(setAttachments)
      .catch(() => undefined)
  }, [activeThreadId])

  const initialTokenRef = useRef(sessionToken)
  useEffect(() => {
    if (sessionToken === initialTokenRef.current) return
    initialTokenRef.current = sessionToken
    clearAll()
  }, [sessionToken, clearAll])

  const handleRun = async () => {
    if (!input.trim() || running) return
    const userMessage = input.trim()
    setInput('')
    setRunning(true)
    setLastTurnCancelled(false)
    setPlanSteps([])
    onStepEventRef.current?.({ type: 'reset' })

    setChatItems(prev => [...prev, {
      kind: 'message',
      role: 'human',
      content: userMessage,
      timestamp: Date.now(),
    }])

    abortRef.current = new AbortController()

    try {
      const threadId = await ensureThreadId()
      // invoke 전 WS 연결 + 스레드 구독 보장 (최대 5초 대기)
      wsClient.connect()
      await wsClient.waitForConnection(5000)
      wsClient.subscribeThread(threadId)
      const archOverride = agent.architecture === 'react' ? runMode : undefined
      const result = await apiClient.threads.invoke(threadId, userMessage, archOverride, 'studio') as { messages?: Array<{ role: string; content: string }> } | null
      // WS turn.completed 이벤트를 놓친 경우 invoke 응답에서 직접 최종 메시지 추출
      const msgs = result?.messages ?? []
      const lastAi = [...msgs].reverse().find(m => m.role === 'assistant' && m.content?.trim())
      if (lastAi) {
        setChatItems(prev => {
          const hasAiMsg = prev.some(i => i.kind === 'message' && (i as Extract<ChatItem, { kind: 'message' }>).role === 'ai')
          if (hasAiMsg) return prev
          return [...prev, { kind: 'message', role: 'ai', content: lastAi.content, timestamp: Date.now(), streaming: false }]
        })
      }
    } catch (err) {
      // 사용자가 stop 으로 cancel 한 직후의 invoke 에러는 의도된 동작이므로 안내 skip.
      if (cancelRequestedRef.current) {
        cancelRequestedRef.current = false
      } else if (!(err instanceof Error && err.name === 'AbortError')) {
        setChatItems(prev => [...prev, {
          kind: 'error',
          content: err instanceof Error ? err.message : '알 수 없는 오류',
          timestamp: Date.now(),
        }])
        toast.error('에이전트 실행에 실패했습니다')
      }
    } finally {
      setRunning(false)
    }
  }

  const handleStop = async () => {
    if (!activeThreadId || !running) return
    cancelRequestedRef.current = true
    // 즉시 UI 반영 — planSteps 의 in_progress → pending, lastTurnCancelled=true, running=false.
    setPlanSteps(prev =>
      prev.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' as const } : s)),
    )
    setLastTurnCancelled(true)
    setRunning(false)
    try {
      await apiClient.threads.cancel(activeThreadId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '중지 요청 실패'
      toast.error(msg)
    }
  }

  // 미들웨어 필터: kind === 'tool_call' 이고 이름이 XxxMiddleware.xxx 패턴인 항목 제거.
  // subItems 안에서도 재귀 적용하되, 비-미들웨어 자식이 남아 있으면 부모는 유지.
  const { displayedChatItems, hiddenMiddlewareCount } = useMemo(() => {
    let hidden = 0
    const filter = (arr: ChatItem[]): ChatItem[] => {
      const out: ChatItem[] = []
      for (const it of arr) {
        if (it.kind === 'tool_call') {
          const filteredSub = it.subItems ? filter(it.subItems) : undefined
          if (isMiddlewareName(it.name)) {
            if (filteredSub && filteredSub.length > 0) {
              hidden += 1 // 자기 자신만 카운트 (자식 유지)
              out.push({ ...it, subItems: filteredSub })
            } else {
              hidden += 1
              if (it.subItems) hidden += countMiddleware(it.subItems)
            }
          } else {
            out.push({ ...it, subItems: filteredSub })
          }
        } else {
          out.push(it)
        }
      }
      return out
    }
    if (!hideMiddleware) {
      return { displayedChatItems: chatItems, hiddenMiddlewareCount: countMiddleware(chatItems) }
    }
    const displayed = filter(chatItems)
    return { displayedChatItems: displayed, hiddenMiddlewareCount: hidden }
  }, [chatItems, hideMiddleware])

  const hasMessages = displayedChatItems.length > 0

  // 메트릭 카드 데이터 (현재 요청 / 누적)
  const buildMetricCards = (m: Metrics) => {
    const avgLatencyMs = m.stepCount > 0 ? m.latencyMs / m.stepCount : 0
    return [
      { label: '입력 토큰', value: m.inputTokens.toLocaleString(), unit: 'tok' },
      { label: '출력 토큰', value: m.outputTokens.toLocaleString(), unit: 'tok' },
      { label: '평균 응답 시간', value: (avgLatencyMs / 1000).toFixed(2), unit: 's' },
      { label: '비용', value: `$${m.cost.toFixed(6)}`, unit: '' },
    ]
  }
  const currentCards = useMemo(() => buildMetricCards(currentMetrics), [currentMetrics])
  const cumulativeCards = useMemo(() => buildMetricCards(cumulativeMetrics), [cumulativeMetrics])

  const levelColors: Record<LogEntry['level'], string> = {
    INFO: 'text-fg-subtle',
    DONE: 'text-green-400',
    WARN: 'text-amber-400',
    ERROR: 'text-red-400',
  }

  return (
    <div
      ref={panelRootRef}
      className={cn(
        'relative flex h-full flex-col bg-bg',
        fullWidth ? 'w-full flex-1' : 'shrink-0 border-l border-border',
      )}
      style={fullWidth ? undefined : { width: width ?? 460 }}
    >
      <style>{`
        @keyframes groupPop {
          0% { transform: scale(0.85); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        @keyframes glowPulse {
          0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.45); border-color: rgba(16, 185, 129, 0.6); }
          100% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); border-color: rgba(16, 185, 129, 0.2); }
        }
        @keyframes mergeSlideUp {
          from { transform: translateY(6px); opacity: 0.7; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-group-pop {
          display: inline-flex;
          animation: groupPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .animate-glow-pulse {
          animation: glowPulse 0.7s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        .animate-merge-slide {
          animation: mergeSlideUp 0.25s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>
      {onResize && <ResizeHandle direction="horizontal" edge="left" onResize={onResize} />}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-emerald-500/40" />
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-4 w-0.5 shrink-0 rounded-full bg-emerald-500/70" />
          <Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-emerald-400">실행 &amp; 디버그</span>
          {isRunning ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              실행 중
            </span>
          ) : sessionToken > 0 ? (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-fg-subtle/10 px-1.5 py-0.5 text-[10px] font-semibold text-fg-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-fg-subtle" />
              대기
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clearAll}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
            title="초기화"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-[var(--color-surface-2)] hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border px-3 py-1.5 scrollbar-none">
        {DEBUG_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative shrink-0 rounded-md px-3 py-1 text-xs font-bold uppercase transition-colors',
              activeTab === tab.id
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            {tab.label}
            {tab.id === 'warnings' && warningCount > 0 && (
              <span className="ml-1 rounded-full bg-red-500/20 px-1 text-xs text-red-400">
                {warningCount}
              </span>
            )}
          </button>
        ))}
        {activeTab === 'chat' && (
          <button
            onClick={() => setHideMiddleware((v) => !v)}
            title="LangChain 내부 Middleware 단계 표시 여부"
            className={cn(
              'ml-auto shrink-0 rounded-md px-2 py-1 text-xs font-bold uppercase transition-colors',
              hideMiddleware
                ? 'bg-[var(--color-surface-2)] text-[#3B82F6]'
                : 'text-fg-subtle hover:text-fg',
            )}
          >
            미들웨어 숨김
            {hiddenMiddlewareCount > 0 && (
              <span className="ml-1 rounded-full bg-[#3B82F6]/20 px-1 text-xs text-[#3B82F6] tabular-nums">
                {hiddenMiddlewareCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* 탭 콘텐츠 */}
      <div
        ref={scrollContainerRef}
        className={cn(
          'relative flex-1 overflow-y-auto custom-scrollbar',
          activeTab === 'chat' && isDragOver && 'ring-2 ring-inset ring-[#3B82F6]/60 bg-[#3B82F6]/5',
        )}
        onScroll={handleScroll}
        onDragEnter={activeTab === 'chat' ? handleDragEnter : undefined}
        onDragLeave={activeTab === 'chat' ? handleDragLeave : undefined}
        onDragOver={activeTab === 'chat' ? handleDragOver : undefined}
        onDrop={activeTab === 'chat' ? handleDropFiles : undefined}
      >
        {activeTab === 'chat' && isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="rounded-xl border-2 border-dashed border-[#3B82F6] bg-bg/85 px-6 py-3 text-sm font-semibold text-[#3B82F6] shadow-xl">
              파일을 놓아 첨부
            </div>
          </div>
        )}
        {/* 채팅 탭 */}
        {activeTab === 'chat' && (
          <div className="space-y-4 px-4 py-4">
            {!hasMessages && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-surface-2)] text-xl">💬</div>
                <h3 className="text-sm font-bold text-fg">에이전트와 대화를 시작하세요</h3>
                <p className="mt-1 text-xs text-fg-subtle">하단 입력창에서 메시지를 보내세요.</p>
              </div>
            )}
            <ExpandedStateContext.Provider value={expandedCtx}>
              <ChatItemList
                items={displayedChatItems}
                onHitlDecide={handleHitlDecide}
                onHitlEditSubmit={handleHitlEditSubmit}
              />
            </ExpandedStateContext.Provider>
            {running && chatItems[chatItems.length - 1]?.kind === 'message' &&
              (chatItems[chatItems.length - 1] as Extract<ChatItem, { kind: 'message' }>).role === 'human' && (
                <div className="flex gap-3">
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-[var(--color-surface-2)] text-xs font-bold text-fg-subtle">AI</div>
                  <div className="flex items-center gap-1 rounded-2xl border border-border bg-[var(--color-surface-2)] px-4 py-3">
                    <Wrench className="h-3.5 w-3.5 text-fg-subtle animate-pulse" />
                    <span className="text-xs text-fg-subtle ml-1">처리 중</span>
                    <span className="flex gap-0.5 ml-1">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-[#5C6478]" style={{ animationDelay: '0ms' }} />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-[#5C6478]" style={{ animationDelay: '150ms' }} />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-[#5C6478]" style={{ animationDelay: '300ms' }} />
                    </span>
                  </div>
                </div>
              )
            }
            {planSteps.length > 0 && (
              <TodoListCard
                steps={planSteps}
                streamingHint={running}
                cancelled={lastTurnCancelled}
              />
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* 실행 로그 탭 */}
        {activeTab === 'log' && (
          <div className="space-y-1 px-4 py-4 font-mono">
            {logs.length === 0 ? (
              <p className="py-16 text-center text-xs text-fg-subtle">실행 로그가 없습니다.</p>
            ) : (
              logs.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-[var(--color-surface-2)]/50">
                  <span className="shrink-0 text-xs text-fg-subtle w-20">
                    {new Date(entry.time).toLocaleTimeString('ko-KR', { hour12: false })}
                  </span>
                  <span className={cn('shrink-0 text-xs font-bold w-10', levelColors[entry.level])}>
                    {entry.level}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle max-w-[80px] truncate">{entry.nodeName}</span>
                  <span className="flex-1 text-xs text-fg leading-relaxed">{entry.message}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* 메트릭 탭 */}
        {activeTab === 'metrics' && (
          <div className="space-y-5 p-4">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">현재 요청</h3>
              <div className="grid grid-cols-2 gap-3">
                {currentCards.map((card) => (
                  <div key={`cur-${card.label}`} className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-xs font-semibold uppercase text-fg-subtle">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-fg">
                      {card.value}
                      {card.unit && <span className="ml-1 text-sm font-normal text-fg-subtle">{card.unit}</span>}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-fg-muted">누적</h3>
              <div className="grid grid-cols-2 gap-3">
                {cumulativeCards.map((card) => (
                  <div key={`cum-${card.label}`} className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-xs font-semibold uppercase text-fg-subtle">{card.label}</p>
                    <p className="mt-2 text-2xl font-bold text-fg">
                      {card.value}
                      {card.unit && <span className="ml-1 text-sm font-normal text-fg-subtle">{card.unit}</span>}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Raw 탭 */}
        {activeTab === 'raw' && (
          <div className="space-y-3 p-4">
            {rawOutputs.length === 0 ? (
              <p className="py-16 text-center text-xs text-fg-subtle">출력 데이터가 없습니다.</p>
            ) : (
              rawOutputs.map((item, i) => (
                <div key={i} className="rounded-xl border border-border bg-bg overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-border bg-bg px-3 py-2">
                    <Terminal className="h-3.5 w-3.5 text-fg-subtle" />
                    <span className="text-xs font-bold font-mono text-fg">{item.nodeName}</span>
                  </div>
                  <pre className="overflow-x-auto p-3 text-xs text-fg leading-relaxed whitespace-pre-wrap">
                    {JSON.stringify(item.output, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* 경고 탭 */}
        {activeTab === 'warnings' && (
          <div className="space-y-2 p-4">
            {warnings.length === 0 ? (
              <p className="py-16 text-center text-xs text-fg-subtle">경고 없음</p>
            ) : (
              warnings.map((entry, i) => (
                <div key={i} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                    <span className="text-xs font-bold text-red-400">{entry.nodeName}</span>
                    <span className="ml-auto text-xs text-fg-subtle">
                      {new Date(entry.time).toLocaleTimeString('ko-KR', { hour12: false })}
                    </span>
                  </div>
                  <p className="text-xs text-red-300/80 pl-5">{entry.message}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 채팅 입력 (채팅 탭일 때만) */}
      {activeTab === 'chat' && (
        <div className="border-t border-border bg-bg px-3 py-3">
          {agent.architecture === 'react' && (
            <div className="mb-2 flex items-center gap-1">
              <button
                onClick={() => setRunMode('react')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  runMode === 'react'
                    ? 'border-violet-500 bg-violet-500/15 text-violet-400'
                    : 'border-transparent text-fg-subtle hover:text-fg',
                )}
              >
                <Brain className="h-3 w-3" />
                Deep Autonomous
              </button>
              <button
                onClick={() => setRunMode('plan_execute')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  runMode === 'plan_execute'
                    ? 'border-[#3B82F6] bg-[#3B82F6]/15 text-[#3B82F6]'
                    : 'border-transparent text-fg-subtle hover:text-fg',
                )}
              >
                <LayoutList className="h-3 w-3" />
                계획 및 실행
              </button>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-[var(--color-surface-2)] px-3.5 py-3 shadow-sm transition-shadow focus-within:border-[#3B82F6]/50 focus-within:shadow-md">
            {(attachments.length > 0 || uploading) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map(att => {
                  const isImage = att.mimeType.startsWith('image/')
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg hover:bg-[#0e1320]"
                      title={`${att.originalName} · ${(att.size / 1024).toFixed(1)}KB · 클릭해 미리보기`}
                    >
                      {isImage ? (
                        <ImageIcon className="h-3 w-3 text-sky-400 shrink-0" />
                      ) : (
                        <FileText className="h-3 w-3 text-amber-400 shrink-0" />
                      )}
                      <span className="max-w-[180px] truncate">{att.originalName}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleRemoveAttachment(att.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            void handleRemoveAttachment(att.id)
                          }
                        }}
                        aria-label="첨부 제거"
                        className="cursor-pointer text-fg-subtle hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  )
                })}
                {uploading && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg-subtle">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    업로드 중...
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-fg placeholder:text-fg-subtle outline-none custom-scrollbar"
              style={{ maxHeight: '160px' }}
              placeholder="메시지 입력... (Shift+Enter 줄바꿈)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (!running && input.trim()) handleRun()
                }
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleFilesSelected(e.dataTransfer.files)
                }
              }}
              disabled={running}
            />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div className="text-[11px] text-fg-subtle">
                {running ? '실행 중…' : ''}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                      void handleFilesSelected(e.target.files)
                      e.target.value = ''
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={running || uploading}
                  aria-label="파일 첨부"
                  title="파일 첨부"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-fg-subtle transition-colors hover:bg-[var(--color-surface-3)] hover:text-fg disabled:opacity-30"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                {running ? (
                  <button
                    onClick={() => void handleStop()}
                    disabled={!activeThreadId}
                    aria-label="응답 중지"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#3B82F6] text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={handleRun}
                    disabled={!input.trim()}
                    aria-label="전송"
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
                      input.trim()
                        ? 'bg-[#3B82F6] text-white hover:bg-blue-500'
                        : 'bg-[var(--color-surface-3)] text-fg-subtle',
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />
    </div>
  )
}

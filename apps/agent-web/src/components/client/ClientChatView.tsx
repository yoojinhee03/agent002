'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  LayoutList,
  Loader2,
  Paperclip,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Sparkles,
  Wrench,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ClientAgentDetail, HumanInteraction, TodoStep, MissingMcpCredentialError, MissingCredentialItem } from '@agent-studio/shared'
import type { ThreadAttachment, ThreadRun, ThreadRunStep } from '@/lib/api-client'
import { apiClient, ApiError } from '@/lib/api-client'
import { McpCredentialModal } from '@/components/chat/McpCredentialModal'
import {
  getParameterSchema,
  summarizeConstraints,
} from '@/lib/builtin-tool-schemas'
import { useUserStore } from '@/stores/use-user-store'
import { wsClient } from '@/lib/ws-client'
import { renderMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { AttachmentPreviewModal } from '@/components/shared/AttachmentPreviewModal'
import { AttachmentInlineRow } from '@/components/shared/AttachmentInlineRow'

type StepStatus = 'running' | 'done' | 'failed'

interface StepNode {
  id: string
  parentId?: string
  name: string
  stepType: string
  status: StepStatus
  latencyMs?: number
  children: StepNode[]
}

type HitlDecision = 'approve' | 'reject' | 'edit'

type FeedItem =
  | { kind: 'user'; id: string; content: string; ts: number }
  | {
      kind: 'assistant'
      id: string
      groupId?: string
      content: string
      done: boolean
      ts: number
    }
  | {
      kind: 'group'
      id: string
      ts: number
      startedAt: number
      completedAt?: number
      status: StepStatus
      cancelled?: boolean
      steps: StepNode[]
    }
  | {
      kind: 'hitl_request'
      id: string
      interactionId: string
      toolName: string
      toolArgs: Record<string, unknown>
      allowedDecisions: string[]
      resolved?: HitlDecision
      /** "수정" 의도로 reject 한 경우 사용자가 입력한 자연어 수정문. */
      editPrompt?: string
      /**
       * history 복원 시점에 채워지는 "수정 후 args" — 카드에서 "원본 → 수정 후"
       * 비교 표시에 사용. live 입력 단계엔 비어 있다.
       */
      editedAction?: { name: string; args: Record<string, unknown> }
      /**
       * preview_edit 에서 LLM 이 함께 재작성한 부모 SubAgent(task) description.
       * 승인 시 deepagents 측에 함께 전송되어 부모 task.description 까지 자연어로 교체된다.
       * SubAgent 인터셉트(부모 task 가 있는 경우)에만 설정된다.
       */
      taskDescriptionUpdate?: string
      /**
       * 부모 SubAgent(task) 의 원본 description. SubAgent 컨텍스트에서만 채워진다.
       * 직접 수정 모드의 폼에서 사용자에게 노출/편집 가능하게 한다.
       */
      parentTaskDescription?: string
      /**
       * pseudo 카드 승인 후 자동 발송할 follow-up user 메시지(자연어).
       * deepagents `edit` 은 도구 args 만 바꾸고 user 메시지는 손대지 않으므로, LLM 이
       * 도구 결과를 사용자 의도(예: "5개 정리해줘")에 맞춰 다시 정리하도록 새 turn 의 user
       * 메시지로 자동 전송된다.
       * - NL 모드: 사용자가 입력한 자연어 그대로 (예: "3개 알려줘")
       * - 직접 수정 모드: 인자 diff + 작업 의도를 합성한 자연어
       * 비어 있으면 follow-up 을 건너뛴다.
       */
      followupMessage?: string
      /**
       * pseudo 카드(=프런트가 추가한 "수정 후 확인" 단계)임을 식별. deepagents 인터럽트가
       * 아닌 클라이언트 측 확인 UI 이며, 승인 클릭 시 비로소 sourceInteractionId 로 정식
       * `edit` 결정을 보낸다.
       */
      pendingEditFor?: { sourceInteractionId: string }
      /**
       * Phase 6 — HITL 카드 통합. agent_context.cardDefinitionId 가 있으면 기본 ClientHitlCard
       * 대신 DynamicCardRenderer 로 인라인 렌더한다. 카드 정의의 actions 에서 hitl_respond
       * 핸들러를 통해 응답을 전송한다. opt-in 이므로 미지정 interaction 은 기존 흐름 그대로.
       */
      cardDefinitionId?: string
      cardVersion?: number
      cardData?: Record<string, unknown>
      /**
       * Recursion limit 도달 안내 카드. backend 가 agentContext.recursionLimitReached=true
       * 로 emit 한 interaction 을 양자택일 UI 로 분기 렌더링한다. 일반 HITL 카드의 도구/인자
       * 표시 대신 단순 "더 진행 / 그만" 으로 표시.
       */
      recursionLimitReached?: boolean
      /** "에이전트가 60 step 한도에 도달했습니다 ..." backend 가 보낸 프롬프트. */
      recursionPrompt?: string
      /** 사용자가 approve 시 부여될 새 step 한도. UI 보조 정보로 표시. */
      recursionNextStepLimit?: number
      ts: number
    }

interface PlanEntry {
  // 한 plan(=페이지)에 매핑되는 모든 turn(groupId) 목록.
  // 같은 TODO 내용이 다른 turn 에서 또 emit 되면 새 페이지를 추가하지 않고 여기에 groupId 만 push 한다.
  groupIds: string[]
  steps: TodoStep[]
  ts: number
  // 각 turn(groupId) 종료 시점의 진행 스냅샷.
  // 스크롤로 N번째 답변을 보고 있을 때 그 turn 의 snapshot 으로 체크 상태를 렌더링한다.
  snapshotsByGroup: Record<string, TodoStep[]>
}

function stepsContentEqual(a: TodoStep[], b: TodoStep[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if ((a[i]?.content ?? '') !== (b[i]?.content ?? '')) return false
  }
  return true
}

const TOOL_LABEL_KO: Record<string, string> = {
  ls: '디렉토리 조회',
  read_file: '파일 읽기',
  write_file: '파일 쓰기',
  edit_file: '파일 편집',
  grep: '파일 검색',
  web_search: '웹 검색',
  tavily_search: '웹 검색',
  serper_search: '웹 검색',
  brave_search: '웹 검색',
  context7_search_libraries: '라이브러리 검색',
  context7_get_docs: '라이브러리 문서 조회',
  current_time: '현재 시각',
  python: '코드 실행',
  gmail_search: 'Gmail 검색',
  gmail_fetch: 'Gmail 메일 조회',
  gmail_fetch_attachment: 'Gmail 첨부 다운로드',
  gmail_parse_pdf_attachment: 'Gmail PDF 분석',
  gmail_send: 'Gmail 전송',
  pdf_parse: 'PDF 분석',
  document_preprocess: '문서 전처리',
  write_todos: '계획 수립',
  task: '서브에이전트 호출',
}

const ARG_LABEL_KO: Record<string, string> = {
  q: '검색어',
  query: '검색어',
  max_results: '최대 결과 개수',
  maxResults: '최대 결과 개수',
  limit: '최대 개수',
  url: '주소',
  message_id: '메일 ID',
  messageId: '메일 ID',
  to: '받는 사람',
  subject: '제목',
  body: '본문',
  description: '작업 설명',
  path: '경로',
  content: '내용',
}

/** HumanInteraction.agentContext.parentTaskArgs.description 에서 부모 SubAgent 의
 *  자연어 작업 지시를 안전하게 꺼낸다. SubAgent 컨텍스트가 아니면 undefined. */
function extractParentTaskDescription(
  agentContext: Record<string, unknown> | undefined,
): string | undefined {
  if (!agentContext) return undefined
  const parentTaskArgs = agentContext['parentTaskArgs']
  if (!parentTaskArgs || typeof parentTaskArgs !== 'object') return undefined
  const desc = (parentTaskArgs as Record<string, unknown>)['description']
  if (typeof desc !== 'string' || desc.trim().length === 0) return undefined
  return desc
}

function valueToDraft(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/** pseudo 승인 시 followupMessage 가 비어있을 때의 defensive fallback —
 *  현재 toolArgs 를 "- key: value" 라인 목록으로 출력. */
function formatToolArgsForFollowup(args: Record<string, unknown> | undefined): string {
  if (!args || typeof args !== 'object') return ''
  const lines: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue
    if (typeof value === 'object' && Object.keys(value as object).length === 0) continue
    lines.push(`- ${key}: ${formatArgForPrompt(value)}`)
  }
  return lines.join('\n')
}

function formatArgForPrompt(value: unknown): string {
  if (value === undefined) return '(없음)'
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 직접 수정에서 args 만 변경하고 작업 설명을 그대로 둔 경우, LLM 이 args 변경에 맞춰
 *  SubAgent description 을 재작성하도록 만드는 synthetic editPrompt. */
function buildArgDiffPrompt(
  initialArgs: Record<string, unknown>,
  nextArgs: Record<string, unknown>,
): string {
  const lines: string[] = []
  const keys = Array.from(new Set([...Object.keys(initialArgs), ...Object.keys(nextArgs)]))
  for (const key of keys) {
    const before = formatArgForPrompt(initialArgs[key])
    const after = formatArgForPrompt(nextArgs[key])
    if (before !== after) lines.push(`- ${key}: ${before} → ${after}`)
  }
  if (lines.length === 0) return '인자 변경 없음.'
  return [
    '사용자가 도구 인자를 직접 다음과 같이 수정했습니다:',
    ...lines,
    '',
    '이 인자 변경에 맞춰 SubAgent 작업 설명(taskDescription)을 자연스러운 한국어로 재작성하세요.',
    '인자(예: 개수, 검색 범위, 필터)와 작업 설명이 일관되도록 맞춰주세요.',
    '도구 인자(args)는 사용자 입력을 그대로 사용할 예정이므로 그 값 그대로 반영해 주세요.',
  ].join('\n')
}

/** args diff 를 사용자 의도를 담은 자연어 user 메시지로 변환. follow-up 으로
 *  parent LLM 에게 보내서 메모리의 도구 결과를 사용자의 새 의도에 맞춰 정리하도록 한다.
 *
 *  예) initial={max_results:1}, next={max_results:5}
 *       → "방금 인자를 직접 다음과 같이 수정했어요:
 *          - max_results: 1 → 5
 *          이전 도구 결과를 새 인자에 맞춰 다시 정리해 주세요." */
function buildDirectEditFollowupMessage(
  initialArgs: Record<string, unknown>,
  nextArgs: Record<string, unknown>,
  userTaskDescription?: string,
): string {
  const lines: string[] = []
  const keys = Array.from(new Set([...Object.keys(initialArgs), ...Object.keys(nextArgs)]))
  for (const key of keys) {
    const before = formatArgForPrompt(initialArgs[key])
    const after = formatArgForPrompt(nextArgs[key])
    if (before !== after) lines.push(`- ${key}: ${before} → ${after}`)
  }
  const parts: string[] = []
  if (lines.length > 0) {
    parts.push('방금 인자를 직접 다음과 같이 수정했어요:')
    parts.push(...lines)
    parts.push('')
  }
  if (userTaskDescription && userTaskDescription.trim().length > 0) {
    parts.push(`그리고 작업 의도는 다음과 같습니다: ${userTaskDescription.trim()}`)
    parts.push('')
  }
  parts.push('이전 도구 결과를 새 인자·의도에 맞춰 다시 정리해 주세요.')
  return parts.join('\n')
}

function parseArgValueOrThrow(original: unknown, input: string): unknown {
  const trimmed = input.trim()
  if (typeof original === 'number') {
    if (trimmed === '') return original
    const n = Number(trimmed)
    if (!Number.isFinite(n)) throw new Error(`'${trimmed}' 은(는) 숫자가 아닙니다.`)
    return n
  }
  if (typeof original === 'boolean') {
    const low = trimmed.toLowerCase()
    if (['예', 'true', 'yes', 'y', '1'].includes(low)) return true
    if (['아니오', 'false', 'no', 'n', '0'].includes(low)) return false
    throw new Error(`'${trimmed}' 은(는) 예/아니오가 아닙니다.`)
  }
  if (original !== null && typeof original === 'object') {
    try {
      return JSON.parse(input)
    } catch {
      throw new Error('JSON 형식이 올바르지 않습니다.')
    }
  }
  return input
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const ampm = d.getHours() < 12 ? '오전' : '오후'
  const h12 = d.getHours() % 12 || 12
  return `${ampm} ${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function stepKind(name: string, stepType: string): 'tool' | 'model' | 'agent' {
  const t = (stepType || '').toLowerCase()
  if (t === 'agent') return 'agent'
  if (t === 'llm') return 'model'
  if (t === 'middleware') return 'tool'
  if (name === 'task' || name.startsWith('Sub_') || name.endsWith('_Sub_Agent')) return 'agent'
  return 'tool'
}

function stepLabel(name: string): string {
  return TOOL_LABEL_KO[name] ?? name
}

function countSteps(nodes: StepNode[]): number {
  let n = 0
  for (const node of nodes) {
    n += 1
    n += countSteps(node.children)
  }
  return n
}

function insertInto(parent: StepNode, node: StepNode): [StepNode, boolean] {
  if (parent.id === node.parentId) {
    return [{ ...parent, children: [...parent.children, node] }, true]
  }
  let didInsert = false
  const nextChildren = parent.children.map((c) => {
    const [n, ok] = insertInto(c, node)
    if (ok) didInsert = true
    return n
  })
  return [{ ...parent, children: nextChildren }, didInsert]
}

function insertNode(roots: StepNode[], node: StepNode): StepNode[] {
  if (!node.parentId) return [...roots, node]
  let inserted = false
  const next = roots.map((r) => {
    const [child, didInsert] = insertInto(r, node)
    if (didInsert) inserted = true
    return child
  })
  if (inserted) return next
  return [...roots, { ...node, parentId: undefined }]
}

function updateInto(node: StepNode, id: string, patch: Partial<StepNode>): StepNode {
  if (node.id === id) return { ...node, ...patch }
  return { ...node, children: node.children.map((c) => updateInto(c, id, patch)) }
}

function updateNode(roots: StepNode[], id: string, patch: Partial<StepNode>): StepNode[] {
  return roots.map((r) => updateInto(r, id, patch))
}

function extractPlansFromMessages(messages: unknown[]): PlanEntry[] {
  // user 메시지를 turn 경계로 삼고, 각 turn 안 마지막 write_todos 호출만 PlanEntry 로 채택한다.
  // 같은 TODO 내용이 여러 turn 에서 반복되면 페이지를 새로 만들지 않고 groupIds 에 turn id 만 추가한다.
  // sweep(상태 정규화) 은 별도 함수 `applyHistorySweep` 가 runs 정보를 받아 적용한다 —
  //   정상 turn 의 in_progress 는 completed 로, cancelled turn 의 in_progress 는 pending 으로 분기.
  const plans: PlanEntry[] = []
  let currentTodos: TodoStep[] | null = null
  let turnIdx = 0
  const flush = () => {
    if (!currentTodos || currentTodos.length === 0) return
    const gid = `restored-turn-${turnIdx}`
    const snapshot: TodoStep[] = currentTodos.map((t) => ({ ...t }))
    const sameIdx = plans.findIndex((p) => stepsContentEqual(p.steps, snapshot))
    if (sameIdx >= 0) {
      const existing = plans[sameIdx]
      plans[sameIdx] = {
        ...existing,
        groupIds: existing.groupIds.includes(gid) ? existing.groupIds : [...existing.groupIds, gid],
        steps: snapshot,
        snapshotsByGroup: { ...existing.snapshotsByGroup, [gid]: snapshot },
      }
      return
    }
    plans.push({
      groupIds: [gid],
      steps: snapshot,
      ts: 0,
      snapshotsByGroup: { [gid]: snapshot },
    })
  }
  for (const m of messages) {
    const msg = m as {
      role?: string
      toolCalls?: Array<{ name?: string; args?: { todos?: TodoStep[] } }>
    }
    if (msg?.role === 'user') {
      flush()
      currentTodos = null
      turnIdx += 1
      continue
    }
    if ((msg?.role === 'assistant' || msg?.role === 'ai') && Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        if (tc?.name === 'write_todos' && Array.isArray(tc.args?.todos)) {
          currentTodos = tc.args!.todos as TodoStep[]
        }
      }
    }
  }
  flush()
  return plans
}

function applyHistorySweep(plans: PlanEntry[], sortedRuns: ThreadRun[]): PlanEntry[] {
  // 각 plan 의 snapshotsByGroup 키(gid)가 `restored-turn-{N}` 형식이고,
  // N 은 1-based turn 인덱스로 sortedRuns[N-1] 와 1:1 매칭된다.
  //
  // 정책:
  //  - 정상 turn (run.status !== 'cancelled'): 모델이 답변 직전 마킹 누락 보정 →
  //    in_progress → completed sweep.
  //  - cancelled turn: 모델이 본문 응답 전에 선언적으로 completed 마킹 후 cancel 된
  //    패턴까지 잡기 위해, 이전 turn snapshot 과 비교해 status 가 바뀌었거나 base 에
  //    없던 항목 중 'in_progress'/'completed' 인 것을 모두 'pending' 으로 rollback.
  return plans.map((p) => {
    const sortedGids = [...p.groupIds]
    const newSnapshots: Record<string, TodoStep[]> = {}
    for (let gIdx = 0; gIdx < sortedGids.length; gIdx++) {
      const gid = sortedGids[gIdx]
      const steps = p.snapshotsByGroup[gid] ?? p.steps
      const match = gid.match(/^restored-turn-(\d+)$/)
      const turnIdx = match ? parseInt(match[1], 10) : -1
      const run = turnIdx > 0 ? sortedRuns[turnIdx - 1] : null
      if (run?.status === 'cancelled') {
        const prevSnap: TodoStep[] = gIdx > 0 ? (newSnapshots[sortedGids[gIdx - 1]] ?? []) : []
        const prevByContent = new Map(prevSnap.map((s) => [s.content, s.status]))
        newSnapshots[gid] = steps.map((s) => {
          const prevStatus = prevByContent.get(s.content)
          // 이전 turn 에서 이미 completed 였던 항목은 어떤 변경도 무시하고 completed 유지.
          if (prevStatus === 'completed' && s.status !== 'completed') {
            return { ...s, status: 'completed' as const }
          }
          if ((s.status === 'in_progress' || s.status === 'completed') && prevStatus !== s.status) {
            return { ...s, status: 'pending' as const }
          }
          return s
        })
      } else {
        newSnapshots[gid] = steps.map((s) =>
          s.status === 'in_progress' ? { ...s, status: 'completed' as const } : s,
        )
      }
    }
    const lastGid = p.groupIds[p.groupIds.length - 1]
    const newSteps = (lastGid ? newSnapshots[lastGid] : undefined) ?? p.steps
    return { ...p, steps: newSteps, snapshotsByGroup: newSnapshots }
  })
}

function applyCancelToPlans(prev: PlanEntry[], groupId: string | null): PlanEntry[] {
  // cancel 시점에 활성 turn(groupId) 의 todos 를 이전 turn snapshot 과 비교해 정책 적용:
  //   - 이전 turn 의 completed 는 무조건 보존 (cancel 로 완료가 사라지지 않도록).
  //   - 이번 turn 에서 새로 in_progress/completed 가 된 항목은 pending 으로 revert.
  if (!groupId) return prev
  return prev.map((p) => {
    const gidOrder = p.groupIds
    const curIdx = gidOrder.indexOf(groupId)
    const curSnap = p.snapshotsByGroup[groupId]
    if (!curSnap) return p
    const prevGid = curIdx > 0 ? gidOrder[curIdx - 1] : null
    const prevSnap: TodoStep[] = prevGid ? (p.snapshotsByGroup[prevGid] ?? []) : []
    const prevByContent = new Map(prevSnap.map((s) => [s.content, s.status]))
    const revertSnap = (xs: TodoStep[]) =>
      xs.map((s) => {
        const prevStatus = prevByContent.get(s.content)
        if (prevStatus === 'completed' && s.status !== 'completed') {
          return { ...s, status: 'completed' as const }
        }
        if ((s.status === 'in_progress' || s.status === 'completed') && prevStatus !== s.status) {
          return { ...s, status: 'pending' as const }
        }
        return s
      })
    const newCur = revertSnap(curSnap)
    return {
      ...p,
      steps: gidOrder[gidOrder.length - 1] === groupId ? newCur : p.steps,
      snapshotsByGroup: { ...p.snapshotsByGroup, [groupId]: newCur },
    }
  })
}

function restoreStepTree(flat: ThreadRunStep[]): StepNode[] {
  const idToNode = new Map<string, StepNode>()
  const roots: StepNode[] = []
  flat.forEach((s, idx) => {
    const id = s.stepId ?? `restored-step-${idx}`
    const node: StepNode = {
      id,
      parentId: s.parentStepId ?? undefined,
      name: s.name,
      stepType: s.stepType,
      status:
        s.status === 'completed' ? 'done' : s.status === 'failed' ? 'failed' : 'done',
      latencyMs: s.latencyMs ?? undefined,
      children: [],
    }
    idToNode.set(id, node)
  })
  flat.forEach((s, idx) => {
    const id = s.stepId ?? `restored-step-${idx}`
    const node = idToNode.get(id)
    if (!node) return
    const parent = s.parentStepId ? idToNode.get(s.parentStepId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}

export interface ClientChatViewProps {
  slug: string
  threadId?: string | null
  showHeader?: boolean
  onThreadCreated?: (threadId: string) => void
}

export function ClientChatView({
  slug,
  threadId: threadIdProp,
  showHeader = true,
  onThreadCreated,
}: ClientChatViewProps) {
  const { activeProjectId: projectId } = useUserStore()
  const currentUser = useUserStore((s) => s.currentUser)

  const [agent, setAgent] = useState<ClientAgentDetail | null>(null)
  const [threadId, setThreadId] = useState<string | null>(threadIdProp ?? null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [composer, setComposer] = useState('')
  const [sending, setSending] = useState(false)
  const [mcpCredModal, setMcpCredModal] = useState<{
    missingCredentials: MissingCredentialItem[]
    pendingText: string
  } | null>(null)
  const [bootstrapping, setBootstrapping] = useState(!threadIdProp)
  const [plans, setPlans] = useState<PlanEntry[]>([])
  const [todoOpen, setTodoOpen] = useState(false)
  const [planIdx, setPlanIdx] = useState(0)
  // 현재 보고 있는 turn(groupId). 스크롤 위치/페이지 매김 버튼 변경에 따라 갱신되며,
  // TodoSidePanel 은 plans[planIdx].snapshotsByGroup[activeGroupId] 로 체크 상태를 렌더링한다.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  // 사용자가 현재 chat viewport 에서 보고 있는 turn(groupId). 스크롤 위치 기준으로 항상 갱신되며
  // (todoOpen 과 무관), 해당 turn 의 사용자 질문 말풍선을 초록 하이라이트한다.
  const [viewedGroupId, setViewedGroupId] = useState<string | null>(null)
  const [runMode, setRunMode] = useState<'react' | 'plan_execute'>('react')
  // HITL 수정 요청 모드 — 설정되면 composer 가 수정 입력 모드로 전환된다.
  // feedItemId 는 편집 대상이 HITL #1(real) 인지 pseudo 카드인지 식별하기 위함.
  const [editingHitl, setEditingHitl] = useState<{
    feedItemId: string
    sourceInteractionId: string
    toolName: string
    toolLabel: string
    /** 수정 시작 시점의 args 스냅샷 — 직접 수정 모드 폼 초기값 + 타입 유추 기준. */
    initialArgs: Record<string, unknown>
    /** SubAgent 컨텍스트의 원본 task description (있을 때만). */
    initialTaskDescription?: string
    /** 'nl' = 자연어 textarea (기본). 'direct' = 인자 폼 직접 편집. */
    mode: 'nl' | 'direct'
  } | null>(null)
  // 직접 수정 모드의 폼 입력 상태 — key 별 문자열 draft. 제출 시 원본 타입에 맞춰 파싱한다.
  const [directDrafts, setDirectDrafts] = useState<Record<string, string>>({})
  // 직접 수정 모드 — 부모 SubAgent task description 의 편집 draft (SubAgent 컨텍스트일 때만).
  const [taskDescriptionDraft, setTaskDescriptionDraft] = useState<string>('')
  // 직접 수정 모드 — 각 파라미터의 도움말 펼침 상태 (key → open).
  const [helpOpenForKey, setHelpOpenForKey] = useState<Record<string, boolean>>({})
  // 수정문 LLM 변환 진행 상태 — 다중 전송 방지.
  const [editPreviewing, setEditPreviewing] = useState(false)
  // ── 첨부 (per-thread sandbox 동기화) ──────────────────────────
  const [attachments, setAttachments] = useState<ThreadAttachment[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<ThreadAttachment | null>(null)
  // 사용자가 직접 업로드한 첨부(uploaderId 존재)는 입력창 칩으로, 에이전트가 자동 저장한
  // 첨부(이메일 등 — uploaderId 없음)는 메시지 영역 읽기전용 행으로 분리해 표시한다.
  const composerAttachments = useMemo(
    () => attachments.filter((a) => Boolean(a.uploaderId)),
    [attachments],
  )
  const savedAttachments = useMemo(
    () => attachments.filter((a) => !a.uploaderId),
    [attachments],
  )
  const [uploading, setUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const activeGroupIdRef = useRef<string | null>(null)
  // setFeed reducer 외부에서 최신 feed snapshot 을 읽기 위한 ref. token 핸들러가 reducer
  // 밖에서 streamingIdRef 결정을 idempotent 하게 처리할 수 있도록 한다.
  const feedRef = useRef<FeedItem[]>([])
  // turn 시작 시점에 이미 ever-completed 였던 항목 content 들. workingTargetIdx 후보 판정 시
  // "직전까지 완료로 보였던 항목"을 영구 배제하는 용도. snapshot 누락(plan.created 미emit /
  // sweep 한계 / sameContentIdx 분리) 케이스에도 robust.
  const everCompletedAtTurnStartRef = useRef<Set<string>>(new Set())
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  // 사용자가 viewport 하단 근처에 있을 때만 자동 스크롤이 발동한다.
  // 답변 생성 중 위로 스크롤해 이전 내용을 읽으려는 사용자 의도를 강제 스크롤이 덮어쓰지 않도록.
  const nearBottomRef = useRef(true)
  // 사용자가 페이지 매김 버튼/스크롤로 plan 을 직접 선택한 적이 있는지.
  // true 면 새 plan 이 추가되어도 자동으로 마지막 페이지로 이동하지 않는다 (다음 user 메시지 시 reset).
  const userPickedPlanRef = useRef(false)
  // stop 버튼을 통해 사용자가 의도적으로 cancel 한 직후의 invoke 응답 에러는 toast 로 띄우지 않는다.
  // (cancel 시 백엔드가 task.cancel() 하면 invoke fetch 가 502 등으로 떨어지는데, 그건 사용자가
  //  이미 의도한 동작이므로 별도 에러 안내가 불필요.)
  const cancelRequestedRef = useRef(false)
  // pseudo HITL 카드 승인 시 deepagents 에 `edit` decision 을 보내 도구가 수정된 args 로
  // 실행되도록 한 뒤, turn 이 모두 완료되면(=`turn.completed` 도착 또는 `hitl.responded`
  // 의 status !== 'paused') 사용자의 자연어 수정문(`editPrompt`)을 새 user 메시지로
  // 자동 전송하기 위한 ref. deepagents `edit` 은 도구 args 만 바꾸고 user 메시지는
  // 손대지 않으므로, 도구 결과는 3개로 갱신되어도 LLM 이 "최근메일 하나 보여줘" 원본
  // 메시지를 따라 1개만 답할 수 있다. follow-up 으로 새 turn 을 만들어 LLM 이 메모리에
  // 있는 도구 결과를 사용자 의도("3개 보여줘")에 맞춰 다시 정리하도록 한다.
  const editFollowupRef = useRef<{ active: boolean; editPrompt: string } | null>(null)
  // turn.completed / hitl.responded WS handler 에서 follow-up 자동 전송 시 최신
  // handleSend closure 를 참조하기 위한 ref.
  const handleSendRef = useRef<
    (text?: string, opts?: { force?: boolean }) => Promise<void> | void
  >(() => {})

  // threadId prop 변경 시 reset (다른 thread 선택 시)
  useEffect(() => {
    setThreadId(threadIdProp ?? null)
    setFeed([])
    setPlans([])
    setTodoOpen(false)
    setPlanIdx(0)
    setActiveGroupId(null)
    setViewedGroupId(null)
    setBootstrapping(!threadIdProp)
    streamingIdRef.current = null
    activeGroupIdRef.current = null
    feedRef.current = []
    nearBottomRef.current = true
    userPickedPlanRef.current = false
  }, [threadIdProp])

  // feedRef 동기화 — setFeed reducer 외부에서 최신 feed 를 idempotent 하게 읽기 위함.
  useEffect(() => {
    feedRef.current = feed
  }, [feed])

  // 1) agent 상세
  useEffect(() => {
    if (!slug) return
    let cancelled = false
    apiClient.clientAgents
      .getBySlug(slug)
      .then((d) => {
        if (cancelled) return
        setAgent(d)
        if (d.missingCredentials.length > 0) {
          toast.error('자격증명이 누락되어 있습니다. 도구 관리에서 등록해주세요.')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : '에이전트 로드 실패'
        toast.error(msg)
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // 2) thread 생성 (새 대화인 경우에만)
  useEffect(() => {
    if (!agent || !projectId || threadId) return
    apiClient.threads
      .create(projectId, {
        agentId: agent.agentId,
        agentDeploymentId: agent.deploymentId,
        title: `${agent.name} 대화`,
      })
      .then((t) => {
        setThreadId(t.id)
        onThreadCreated?.(t.id)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'thread 생성 실패'
        toast.error(msg)
      })
      .finally(() => setBootstrapping(false))
  }, [agent, projectId, threadId, onThreadCreated])

  // 2-b) 이전 대화 복원 (history에서 threadId로 진입 시)
  // user → group → assistant 순서를 강제하기 위해 user 직후에 1:1 매칭으로 run 카드를 끼워넣는다.
  // (단순 timestamp 정렬은 LangGraph 가 user msg 에 turn 종료 시점을 찍기 때문에 group 이 user 보다 위로 가는 문제가 발생함)
  useEffect(() => {
    if (!threadIdProp) return
    void Promise.all([
      apiClient.threads.messages(threadIdProp).catch(() => [] as unknown[]),
      apiClient.threads.runs(threadIdProp).catch(() => [] as ThreadRun[]),
      apiClient.hitl
        .listByThread(threadIdProp)
        .catch(() => [] as HumanInteraction[]),
    ]).then(([msgRes, runs, interactions]) => {
      const messages: unknown[] = Array.isArray(msgRes)
        ? msgRes
        : ((msgRes as { messages?: unknown[] })?.messages ?? [])

      // 부모-자식 deepagent 구조에서 todo 는 sub-agent ns 에만 남아 메인 messages 의
      // toolCalls 로 복원할 수 없다. runner 의 /messages 응답이 subagentTodos 를 함께
      // 내려보내면 messages 기반 복원이 비었을 때 fallback 으로 plan 을 채운다.
      const subagentTodos: Array<{ namespace?: string; todos?: TodoStep[] }> =
        !Array.isArray(msgRes) &&
        Array.isArray((msgRes as { subagentTodos?: unknown })?.subagentTodos)
          ? ((msgRes as { subagentTodos: Array<{ namespace?: string; todos?: TodoStep[] }> })
              .subagentTodos)
          : []

      let restoredPlansRaw = extractPlansFromMessages(messages)
      if (restoredPlansRaw.length === 0 && subagentTodos.length > 0) {
        restoredPlansRaw = subagentTodos
          .map((entry, idx) => {
            const steps = (Array.isArray(entry.todos) ? entry.todos : []).filter(
              (s) => !!s?.content,
            ) as TodoStep[]
            if (steps.length === 0) return null
            const gid = `subagent-${idx}`
            return {
              groupIds: [gid],
              steps,
              ts: 0,
              snapshotsByGroup: { [gid]: steps },
            } as PlanEntry
          })
          .filter((p): p is PlanEntry => p !== null)
      }

      const sortedRuns = Array.isArray(runs)
        ? [...runs].sort((a, b) => {
            const ta = a.startedAt ? new Date(a.startedAt).getTime() : 0
            const tb = b.startedAt ? new Date(b.startedAt).getTime() : 0
            return ta - tb
          })
        : []
      const restoredPlans = applyHistorySweep(restoredPlansRaw, sortedRuns)
      if (restoredPlans.length > 0) {
        setPlans(restoredPlans)
      }

      // HITL 카드는 ts 정렬로는 올바른 위치에 못 들어간다. 이유:
      //   - LangGraph HITL pause → resume 시, workflow_runs 행은 "최종 성공 phase" 만
      //     기록되어 run.startedAt 이 HITL.createdAt 보다 늦은 경우가 흔하다.
      //   - 백엔드가 메시지에 stamp 하는 timestamp 는 응답 시점이라 신뢰 불가.
      // 따라서 각 HITL 을 "respondedAt(또는 createdAt) ≤ run.completedAt 을 만족하는
      // 가장 빠른 run" 에 매칭하고, 해당 turn 의 user → group 직후에 명시적으로 삽입한다.
      // 정렬은 의도된 push 순서를 그대로 유지 (turn 시작 ts 기준 일괄 정렬).
      const interactionList = (interactions ?? []).slice().sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return ta - tb
      })
      const interactionsByRunId = new Map<string, HumanInteraction[]>()
      const orphanInteractions: HumanInteraction[] = []
      for (const it of interactionList) {
        const anchorMs = it.respondedAt
          ? new Date(it.respondedAt).getTime()
          : it.createdAt
            ? new Date(it.createdAt).getTime()
            : 0
        // run.completedAt 이 anchorMs 보다 늦은 첫 run = 이 HITL 이 속한 turn.
        const matched = sortedRuns.find((r) => {
          const c = r.completedAt ? new Date(r.completedAt).getTime() : Number.POSITIVE_INFINITY
          return c >= anchorMs
        })
        if (matched) {
          const list = interactionsByRunId.get(matched.runId) ?? []
          list.push(it)
          interactionsByRunId.set(matched.runId, list)
        } else {
          orphanInteractions.push(it)
        }
      }

      const buildHitlItem = (i: HumanInteraction, ts: number): FeedItem => {
        // editPrompt 가 살아 있으면 reject 라도 사용자 의도는 "수정" → resolved='edit' 로 노출.
        const editPrompt =
          typeof i.editPrompt === 'string' && i.editPrompt.trim().length > 0
            ? i.editPrompt
            : undefined
        const resolved: HitlDecision | undefined = editPrompt
          ? 'edit'
          : i.status === 'approved'
            ? 'approve'
            : i.status === 'rejected' || i.status === 'cancelled' || i.status === 'timed_out'
              ? 'reject'
              : undefined
        const editedAction =
          i.editedAction &&
          typeof i.editedAction === 'object' &&
          i.editedAction.args &&
          typeof i.editedAction.args === 'object'
            ? {
                name: i.editedAction.name,
                args: i.editedAction.args as Record<string, unknown>,
              }
            : undefined
        const agentCtx = (i.agentContext ?? {}) as Record<string, unknown>
        const recursionLimitReached = agentCtx.recursionLimitReached === true
        const recursionNextStepLimit =
          typeof agentCtx.nextStepLimit === 'number'
            ? (agentCtx.nextStepLimit as number)
            : undefined
        // cardDefinitionId 가 없으면 자동 폴백 — recursion 은 카드 정의를 사용하지 않고
        // HitlAcCard 가 recursionLimitReached 플래그를 보고 인라인 amber variant 로 렌더한다.
        const cardDefinitionIdRaw =
          typeof agentCtx.cardDefinitionId === 'string'
            ? (agentCtx.cardDefinitionId as string)
            : undefined
        const cardDefinitionId = cardDefinitionIdRaw ?? 'hitl-input-card'
        const cardVersion =
          typeof agentCtx.cardVersion === 'number' ? (agentCtx.cardVersion as number) : 1
        const cardData =
          agentCtx.cardData && typeof agentCtx.cardData === 'object'
            ? (agentCtx.cardData as Record<string, unknown>)
            : undefined
        return {
          kind: 'hitl_request',
          id: `hitl-${i.id}`,
          interactionId: i.id,
          toolName: i.toolName ?? i.actionRequests?.[0]?.name ?? 'tool',
          toolArgs: (i.toolArgs ?? i.actionRequests?.[0]?.args ?? {}) as Record<string, unknown>,
          allowedDecisions:
            i.allowedDecisions ?? i.reviewConfigs?.[0]?.allowedDecisions ?? [
              'approve',
              'reject',
            ],
          parentTaskDescription: extractParentTaskDescription(i.agentContext),
          recursionLimitReached,
          recursionPrompt: recursionLimitReached ? i.prompt : undefined,
          recursionNextStepLimit,
          cardDefinitionId,
          cardVersion,
          cardData,
          resolved,
          editPrompt,
          editedAction,
          ts,
        }
      }

      const items: FeedItem[] = []
      let runIdx = 0
      // 첫 turn 의 anchor 가 Date.now() 에 끌려가지 않도록 0 으로 초기화. 매 turn 마다
      // 직전 assistant 의 ts 까지 끌어올려 다음 turn 이 항상 뒤로 가도록 한다.
      let lastUserTs = 0
      let restoredTurnIdx = 0
      let currentRun: (typeof sortedRuns)[number] | undefined

      messages.forEach((m, idx) => {
        const msg = m as { role?: string; content?: unknown; timestamp?: string }
        const content = typeof msg.content === 'string' ? msg.content.trim() : ''
        if (!content) return
        const msgExplicitTs = msg.timestamp ? new Date(msg.timestamp).getTime() : undefined
        if (msg.role === 'user') {
          currentRun = runIdx < sortedRuns.length ? sortedRuns[runIdx] : undefined
          if (currentRun) runIdx += 1
          const runStartTs = currentRun?.startedAt
            ? new Date(currentRun.startedAt).getTime()
            : undefined
          // 같은 turn 의 모든 항목은 turnAnchor 베이스 위에 ms 단위 offset 으로 위치
          // 시켜 의도한 순서(user → group → HITLs → assistant) 가 정렬 후에도 유지되게
          // 한다. 다음 turn 의 user 가 이전 turn 의 assistant 보다 항상 뒤로 가도록
          // turnAnchor 는 매 turn 마다 증가.
          const turnAnchor = Math.max(
            (runStartTs ?? msgExplicitTs ?? lastUserTs + idx),
            lastUserTs + 100,
          )
          const userTs = turnAnchor
          lastUserTs = userTs
          restoredTurnIdx += 1
          items.push({ kind: 'user', id: `restored-msg-${idx}`, content, ts: userTs })
          if (currentRun) {
            const startTs = runStartTs ?? userTs
            const completeTs = currentRun.completedAt
              ? new Date(currentRun.completedAt).getTime()
              : undefined
            items.push({
              kind: 'group',
              id: `restored-run-${currentRun.runId}`,
              ts: userTs + 1,
              startedAt: startTs,
              completedAt: completeTs,
              status:
                currentRun.status === 'completed'
                  ? 'done'
                  : currentRun.status === 'failed'
                    ? 'failed'
                    : 'done',
              cancelled: currentRun.status === 'cancelled',
              steps: restoreStepTree(currentRun.steps),
            })
            const turnHitls = interactionsByRunId.get(currentRun.runId) ?? []
            turnHitls.forEach((hitl, hIdx) => {
              items.push(buildHitlItem(hitl, userTs + 2 + hIdx))
            })
            interactionsByRunId.delete(currentRun.runId)
          }
          // turn 의 다음 lastUserTs anchor 는 assistant 위치까지 끌어올려 둔다.
          const completeTs = currentRun?.completedAt
            ? new Date(currentRun.completedAt).getTime()
            : undefined
          lastUserTs = Math.max(lastUserTs, (completeTs ?? userTs + 1000))
        } else if (msg.role === 'assistant') {
          const groupId = restoredTurnIdx > 0 ? `restored-turn-${restoredTurnIdx}` : undefined
          const runCompleteTs = currentRun?.completedAt
            ? new Date(currentRun.completedAt).getTime()
            : undefined
          const assistantTs = Math.max(
            (runCompleteTs ?? msgExplicitTs ?? lastUserTs + idx),
            lastUserTs + 50,
          )
          let merged = false
          for (let i = items.length - 1; i >= 0; i--) {
            const prev = items[i]
            if (prev.kind === 'user') break
            if (prev.kind === 'assistant' && prev.groupId === groupId) {
              items[i] = {
                ...prev,
                content: `${prev.content}\n\n${content}`,
                ts: Math.max(prev.ts, assistantTs),
              }
              merged = true
              break
            }
          }
          if (!merged) {
            items.push({
              kind: 'assistant',
              id: `restored-msg-${idx}`,
              groupId,
              content,
              done: true,
              ts: assistantTs,
            })
          }
          lastUserTs = Math.max(lastUserTs, assistantTs)
        }
      })

      // 매칭되지 못한 잔여 run (실패/timeout 등) 은 마지막에 시간순으로 append
      while (runIdx < sortedRuns.length) {
        const run = sortedRuns[runIdx++]
        const startTs = run.startedAt ? new Date(run.startedAt).getTime() : Date.now()
        const completeTs = run.completedAt ? new Date(run.completedAt).getTime() : undefined
        items.push({
          kind: 'group',
          id: `restored-run-${run.runId}`,
          ts: Math.max(startTs, lastUserTs + 100),
          startedAt: startTs,
          completedAt: completeTs,
          status:
            run.status === 'completed' ? 'done' : run.status === 'failed' ? 'failed' : 'done',
          steps: restoreStepTree(run.steps),
        })
        lastUserTs = Math.max(lastUserTs, completeTs ?? startTs)
        // 이 run 에 매칭된 HITL 도 함께 출력
        const turnHitls = interactionsByRunId.get(run.runId) ?? []
        turnHitls.forEach((hitl, hIdx) => {
          items.push(buildHitlItem(hitl, lastUserTs + 1 + hIdx))
        })
        interactionsByRunId.delete(run.runId)
      }

      // 매칭 실패한 HITL (orphan) — 채팅 맨 위에 표시되도록 매우 작은 ts 로 push.
      // 데이터 정합성 문제일 때만 발생.
      if (orphanInteractions.length > 0) {
        orphanInteractions.forEach((hitl, oIdx) => {
          items.push(buildHitlItem(hitl, oIdx))
        })
      }

      if (items.length > 0) {
        const sorted = [...items].sort((a, b) => a.ts - b.ts)
        setFeed(sorted)
      }
    })
  }, [threadIdProp])

  // 3) ws
  useEffect(() => {
    if (!threadId) return
    wsClient.connect()
    void wsClient.waitForConnection(5000).then(() => wsClient.subscribeThread(threadId))

    const offToken = wsClient.on('agent.token', (e) => {
      const d = (e as unknown as {
        threadId?: string
        content?: string
        done?: boolean
        depth?: number
      }) ?? {}
      // 모든 depth 의 token 을 본문에 흘려보낸다 — sub-agent (Writer 등) 가 최종 답변을
      // 만드는 위임형 시나리오에서 main(depth=0) 만 streaming 하면 본문이 한꺼번에
      // 채워지는 회귀가 있어 depth filter 를 제거. 진행 단계는 step 카드로 별도 표시.
      const text = d.content ?? ''
      if (!text) return
      // ref 갱신을 setFeed reducer 밖으로 — reducer 는 idempotent 해야 React 가 두 번
      // 실행해도(예: StrictMode/dev) 동일 결과. setFeed 안에서 ref mutation 을 하면
      // 두 번째 실행에서 ref 가 이미 set 되어 매칭 실패 → token 손실 → 한 번에 표시.
      const gid = activeGroupIdRef.current
      let targetId = streamingIdRef.current
      if (!targetId) {
        // 같은 turn(groupId) 의 assistant 메시지가 이미 있으면 거기에 이어쓴다.
        if (gid) {
          // feed snapshot 으로 1회만 결정 — 이후 chunk 는 ref 가 이미 set 되어 이 분기를 안 탄다.
          const snapshot = feedRef.current
          for (let i = snapshot.length - 1; i >= 0; i--) {
            const cur = snapshot[i]
            if (cur.kind === 'user') break
            if (cur.kind === 'assistant' && cur.groupId === gid) {
              targetId = cur.id
              break
            }
          }
        }
        if (!targetId) targetId = `assistant-${Date.now()}`
        streamingIdRef.current = targetId
      }
      const targetIdFinal = targetId
      // React 18 자동 batching 이 socket.io 콜백 안의 setFeed 를 한 paint 로 묶지 않도록
      // flushSync 로 매 chunk 즉시 commit + paint 강제.
      flushSync(() => {
        setFeed((prev) => {
          const idx = prev.findIndex((it) => it.kind === 'assistant' && it.id === targetIdFinal)
          if (idx >= 0) {
            const next = prev.slice()
            const existing = next[idx] as Extract<FeedItem, { kind: 'assistant' }>
            next[idx] = { ...existing, content: existing.content + text, done: false }
            return next
          }
          return [
            ...prev,
            {
              kind: 'assistant',
              id: targetIdFinal,
              groupId: gid ?? undefined,
              content: text,
              done: false,
              ts: Date.now(),
            },
          ]
        })
      })
    })

    const onTurnCompleted = wsClient.on('turn.completed', (e) => {
      const d = (e as unknown as { finalContent?: string }) ?? {}
      const finalText = d.finalContent ?? ''
      const groupId = activeGroupIdRef.current
      setFeed((prev) => {
        let next = prev
        if (groupId) {
          next = next.map((it) =>
            it.kind === 'group' && it.id === groupId
              ? { ...it, status: 'done' as StepStatus, completedAt: Date.now() }
              : it,
          )
        }
        const streamingId = streamingIdRef.current
        if (streamingId) {
          next = next.map((it) =>
            it.kind === 'assistant' && it.id === streamingId ? { ...it, done: true } : it,
          )
        }
        // 같은 groupId 의 모든 assistant 가 done=true 가 되도록 보장 — streamingIdRef 와의 매칭이
        // 깨져서 cursor 가 영구 표시되는 케이스 방지.
        if (groupId) {
          next = next.map((it) =>
            it.kind === 'assistant' && it.groupId === groupId && !it.done
              ? { ...it, done: true }
              : it,
          )
        }
        if (!streamingId && finalText.trim()) {
          // 같은 turn(groupId) 에 이미 assistant 가 있으면 중복 추가하지 않는다.
          const alreadyHasAnswer = next.some(
            (it) => it.kind === 'assistant' && it.groupId === (groupId ?? undefined),
          )
          if (!alreadyHasAnswer) {
            next = [
              ...next,
              {
                kind: 'assistant',
                id: `assistant-${Date.now()}`,
                groupId: groupId ?? undefined,
                content: finalText,
                done: true,
                ts: Date.now(),
              },
            ]
          }
        }
        return next
      })
      // turn 종료 시 보정: "진행됐던(in_progress)" 항목은 완료된 것으로 마무리.
      // pending 은 LLM 이 시작하지도 않은 항목이므로 그대로 둔다 (진행 안 됨을 정확히 표시).
      // in_progress 가 하나도 없으면 LLM 이 질문만 한 경우이거나 이미 모두 완료되었으므로 보정 skip.
      if (groupId) {
        setPlans((prev) =>
          prev.map((p) => {
            if (!p.groupIds.includes(groupId)) return p
            const hasInProgress = p.steps.some((s) => s.status === 'in_progress')
            if (!hasInProgress) return p
            const completeInProgress = (xs: TodoStep[]) =>
              xs.map((s) =>
                s.status === 'in_progress' ? { ...s, status: 'completed' as const } : s,
              )
            return {
              ...p,
              steps: completeInProgress(p.steps),
              snapshotsByGroup: {
                ...p.snapshotsByGroup,
                [groupId]: completeInProgress(p.snapshotsByGroup[groupId] ?? p.steps),
              },
            }
          }),
        )
      }
      streamingIdRef.current = null
      // activeGroupIdRef 는 reset 하지 않는다 — turn.completed 이후에 도착하는 backend
      // safety net plan.created 가 같은 groupId 로 합쳐지도록(=새 페이지가 추가되지 않도록).
      // 다음 user 메시지 전송 시 handleSend 에서 새 groupId 로 자연스럽게 교체된다.
      // edit follow-up 활성 시: setSending(false) 생략하고 follow-up handleSend 호출 →
      //   handleSend 가 곧바로 setSending(true) 로 이어받아 빈 깜빡임을 피한다.
      // 이메일 첨부 자동 저장(gmail_fetch_attachment / gmail_parse_pdf_attachment) 결과를
      // 첨부 목록에 반영하기 위해 turn 종료 시 목록을 재조회한다.
      if (threadId) {
        apiClient.attachments
          .list(threadId)
          .then(setAttachments)
          .catch(() => undefined)
      }
      const ref = editFollowupRef.current
      if (ref?.active) {
        editFollowupRef.current = null
        setTimeout(() => void handleSendRef.current?.(ref.editPrompt, { force: true }), 0)
      } else {
        setSending(false)
      }
    })

    const onStepStart = wsClient.on('step.started', (e) => {
      const d = (e as unknown as {
        stepId?: string
        name?: string
        stepType?: string
        depth?: number
        parentStepId?: string
      }) ?? {}
      if (!d.stepId) return
      const groupId = activeGroupIdRef.current
      if (!groupId) return
      const node: StepNode = {
        id: d.stepId,
        parentId: d.parentStepId,
        name: d.name ?? '',
        stepType: d.stepType ?? 'tool',
        status: 'running',
        children: [],
      }
      setFeed((prev) =>
        prev.map((it) =>
          it.kind === 'group' && it.id === groupId
            ? { ...it, steps: insertNode(it.steps, node) }
            : it,
        ),
      )
    })

    const onStepCompleted = wsClient.on('step.completed', (e) => {
      const d = (e as unknown as { stepId?: string; latencyMs?: number }) ?? {}
      if (!d.stepId) return
      const groupId = activeGroupIdRef.current
      if (!groupId) return
      setFeed((prev) =>
        prev.map((it) =>
          it.kind === 'group' && it.id === groupId
            ? {
                ...it,
                steps: updateNode(it.steps, d.stepId!, {
                  status: 'done',
                  latencyMs: d.latencyMs,
                }),
              }
            : it,
        ),
      )
    })
    const onStepFailed = wsClient.on('step.failed', (e) => {
      const d = (e as unknown as { stepId?: string; latencyMs?: number }) ?? {}
      if (!d.stepId) return
      const groupId = activeGroupIdRef.current
      if (!groupId) return
      setFeed((prev) =>
        prev.map((it) =>
          it.kind === 'group' && it.id === groupId
            ? {
                ...it,
                steps: updateNode(it.steps, d.stepId!, {
                  status: 'failed',
                  latencyMs: d.latencyMs,
                }),
              }
            : it,
        ),
      )
    })

    const offPlan = wsClient.on('plan.created', (e) => {
      const ev = (e as unknown as { steps?: TodoStep[] }) ?? {}
      const steps = Array.isArray(ev.steps) ? ev.steps : []
      if (steps.length === 0) return
      const gid = activeGroupIdRef.current ?? `plan-${Date.now()}`
      setPlans((prev) => {
        // 1) 같은 groupId 의 plan 이 이미 있으면 in-place update (현재 turn 의 후속 emit).
        //    snapshotsByGroup[gid] 도 최신 steps 로 덮어써서 그 turn 의 종료 시점 상태로 유지.
        const sameGroupIdx = prev.findIndex((p) => p.groupIds.includes(gid))
        if (sameGroupIdx >= 0) {
          const next = [...prev]
          const existing = prev[sameGroupIdx]
          next[sameGroupIdx] = {
            ...existing,
            steps,
            ts: Date.now(),
            snapshotsByGroup: { ...existing.snapshotsByGroup, [gid]: steps },
          }
          return next
        }
        // 2) groupId 는 다르지만 steps 내용이 동일하면 — 같은 TODO 가 다른 turn 에서 또 만들어진 경우 —
        //    페이지를 새로 만들지 않고 기존 plan 에 groupId + snapshot 만 추가한다.
        const sameContentIdx = prev.findIndex((p) => stepsContentEqual(p.steps, steps))
        if (sameContentIdx >= 0) {
          const next = [...prev]
          const existing = prev[sameContentIdx]
          next[sameContentIdx] = {
            ...existing,
            groupIds: existing.groupIds.includes(gid)
              ? existing.groupIds
              : [...existing.groupIds, gid],
            steps,
            ts: Date.now(),
            snapshotsByGroup: { ...existing.snapshotsByGroup, [gid]: steps },
          }
          return next
        }
        // 3) 완전히 다른 TODO → 새 페이지 추가.
        return [
          ...prev,
          { groupIds: [gid], steps, ts: Date.now(), snapshotsByGroup: { [gid]: steps } },
        ]
      })
    })

    const offCancelled = wsClient.on('run.cancelled', (e) => {
      const d = (e as unknown as { partialContent?: string }) ?? {}
      const partial = typeof d.partialContent === 'string' ? d.partialContent : ''
      const groupId = activeGroupIdRef.current
      const streamingId = streamingIdRef.current
      const cancelMark = '\n\n_(응답이 중지되었습니다)_'
      setFeed((prev) => {
        let next = prev
        if (groupId) {
          next = next.map((it) =>
            it.kind === 'group' && it.id === groupId
              ? { ...it, status: 'done' as StepStatus, completedAt: Date.now(), cancelled: true }
              : it,
          )
        }
        if (streamingId) {
          // 스트리밍으로 이미 들어온 부분 답변에 cancel 마커 append.
          next = next.map((it) =>
            it.kind === 'assistant' && it.id === streamingId
              ? {
                  ...it,
                  content: (it.content || partial) + cancelMark,
                  done: true,
                }
              : it,
          )
        } else if (partial.trim()) {
          // 사용자가 떠나있다 돌아온 직후 등 streaming feed item 이 없는 경우 fallback.
          next = [
            ...next,
            {
              kind: 'assistant',
              id: `assistant-cancelled-${Date.now()}`,
              groupId: groupId ?? undefined,
              content: partial + cancelMark,
              done: true,
              ts: Date.now(),
            },
          ]
        }
        return next
      })
      // 라이브 화면의 todos 를 백엔드 cancel rollback 과 같은 정책으로 갱신.
      setPlans((prev) => applyCancelToPlans(prev, groupId))
      streamingIdRef.current = null
      setSending(false)
    })

    const offHitlRequest = wsClient.on('hitl.request', (e) => {
      const d = (e as unknown as { interaction?: HumanInteraction }) ?? {}
      const interaction = d.interaction
      if (!interaction?.id) return
      const toolName =
        interaction.toolName ?? interaction.actionRequests?.[0]?.name ?? 'tool'
      const toolArgs = (interaction.toolArgs ??
        interaction.actionRequests?.[0]?.args ??
        {}) as Record<string, unknown>
      const allowed =
        interaction.allowedDecisions ??
        interaction.reviewConfigs?.[0]?.allowedDecisions ??
        ['approve', 'reject']
      const parentTaskDescription = extractParentTaskDescription(interaction.agentContext)
      const agentCtx = (interaction.agentContext ?? {}) as Record<string, unknown>
      const recursionLimitReached = agentCtx.recursionLimitReached === true
      const recursionNextStepLimit =
        typeof agentCtx.nextStepLimit === 'number'
          ? (agentCtx.nextStepLimit as number)
          : undefined
      setFeed((prev) => {
        if (prev.some((it) => it.kind === 'hitl_request' && it.interactionId === interaction.id)) {
          return prev
        }
        const groupId = activeGroupIdRef.current
        let next = prev
        if (groupId) {
          next = next.map((it) =>
            it.kind === 'group' && it.id === groupId
              ? { ...it, status: 'done' as StepStatus, completedAt: Date.now() }
              : it,
          )
        }
        return [
          ...next,
          {
            kind: 'hitl_request',
            id: `hitl-${interaction.id}`,
            interactionId: interaction.id,
            toolName,
            toolArgs,
            allowedDecisions: allowed,
            parentTaskDescription,
            recursionLimitReached,
            recursionPrompt: recursionLimitReached ? interaction.prompt : undefined,
            recursionNextStepLimit,
            cardDefinitionId:
              typeof agentCtx.cardDefinitionId === 'string'
                ? (agentCtx.cardDefinitionId as string)
                : undefined,
            cardVersion:
              typeof agentCtx.cardVersion === 'number'
                ? (agentCtx.cardVersion as number)
                : 1,
            cardData:
              agentCtx.cardData && typeof agentCtx.cardData === 'object'
                ? (agentCtx.cardData as Record<string, unknown>)
                : undefined,
            ts: Date.now(),
          },
        ]
      })
      setSending(false)
    })

    const offHitlResponded = wsClient.on('hitl.responded', (e) => {
      const d = (e as unknown as { status?: string }) ?? {}
      // paused: 곧 새 hitl.request 가 emit 되어 다음 카드가 추가된다. sending 유지.
      if (d.status === 'paused') return
      // 정상 종료(또는 status 누락): turn.completed 가 같은 시점에 도착해 setSending(false)
      // 처리하지만, 어떤 이유로 turn.completed 가 누락된 케이스의 안전망 + follow-up 트리거.
      const ref = editFollowupRef.current
      if (ref?.active) {
        editFollowupRef.current = null
        setTimeout(() => void handleSendRef.current?.(ref.editPrompt, { force: true }), 0)
        return
      }
      setSending(false)
    })

    return () => {
      offToken()
      onTurnCompleted()
      onStepStart()
      onStepCompleted()
      onStepFailed()
      offPlan()
      offCancelled()
      offHitlRequest()
      offHitlResponded()
      wsClient.unsubscribeThread(threadId)
    }
  }, [threadId])

  // 새 plan 이 추가될 때만 마지막 페이지로 자동 이동.
  // 같은 plan 의 snapshot 만 갱신되는 경우(=plans.length 그대로)는 사용자의 수동 선택을 덮어쓰지 않는다.
  const plansRef = useRef<PlanEntry[]>([])
  useEffect(() => {
    plansRef.current = plans
  }, [plans])
  useEffect(() => {
    if (plans.length === 0) return
    // 사용자가 페이지를 직접 선택한 상태에선 새 plan 이 추가되어도 그 페이지에 머문다.
    if (userPickedPlanRef.current) return
    const lastIdx = plans.length - 1
    setPlanIdx(lastIdx)
    const last = plans[lastIdx]
    if (last) {
      setActiveGroupId(last.groupIds[last.groupIds.length - 1] ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans.length])

  // 4) 자동 스크롤 — 사용자가 viewport 하단 근처에 있을 때만 발동.
  //    위로 스크롤한 상태에선 답변 생성 중 token 이 추가되어도 강제 스크롤하지 않는다.
  //    behavior: 'auto' — token 마다 즉시 scroll. 'smooth' 이면 짧은 시간에 수백개 token
  //    으로 scrollTo 가 쇄도해 부드러운 scroll 이 누적되며 viewport 가 streaming 본문을
  //    따라가지 못하는 회귀가 있어 즉시 scroll 로 변경.
  useEffect(() => {
    if (!nearBottomRef.current) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
  }, [feed])

  // 4-a) 사용자의 스크롤 위치 추적 — nearBottom 여부를 갱신.
  //      하단으로 돌아오면 "최신을 보겠다" 는 의도로 간주해 userPickedPlanRef 를 해제하고,
  //      그 사이 추가됐을 수 있는 새 plan 으로 명시적으로 동기화한다.
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const onScroll = () => {
      const dist = root.scrollHeight - root.scrollTop - root.clientHeight
      const nearBottom = dist < 120
      nearBottomRef.current = nearBottom
      if (nearBottom) {
        userPickedPlanRef.current = false
        const currentPlans = plansRef.current
        if (currentPlans.length > 0) {
          const lastIdx = currentPlans.length - 1
          const last = currentPlans[lastIdx]
          const lastGid = last.groupIds[last.groupIds.length - 1] ?? null
          setPlanIdx((prev) => (prev === lastIdx ? prev : lastIdx))
          setActiveGroupId((prev) => (prev === lastGid ? prev : lastGid))
        }
      }
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [])

  // 4-b) 스크롤 위치 → 화면에 보이는 답변의 groupId 에 매칭되는 plan idx 자동 전환.
  //      실제 scroll 이벤트가 발생할 때만 전환한다. 사용자가 페이지 매김 버튼으로 수동 이동한 후
  //      스크롤이 멈춰 있는 상태에선 자동 전환이 발동하지 않아야 한다.
  useEffect(() => {
    if (!todoOpen || !scrollRef.current) return
    const root = scrollRef.current

    const pickAndSwitch = () => {
      const currentPlans = plansRef.current
      if (currentPlans.length === 0) return
      const nodes = root.querySelectorAll<HTMLElement>('[data-assistant-group-id]')
      if (nodes.length === 0) return
      const rootRect = root.getBoundingClientRect()
      const center = rootRect.top + rootRect.height / 2
      let best: { el: HTMLElement; dist: number } | null = null
      nodes.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < rootRect.top || r.top > rootRect.bottom) return
        const elCenter = r.top + r.height / 2
        const dist = Math.abs(elCenter - center)
        if (!best || dist < best.dist) best = { el, dist }
      })
      if (!best) return
      const gid = (best as { el: HTMLElement; dist: number }).el.getAttribute(
        'data-assistant-group-id',
      )
      if (!gid) return
      const idx = currentPlans.findIndex((p) => p.groupIds.includes(gid))
      if (idx >= 0) {
        // 하단(=최신을 보겠다는 의도) 이 아닌 위치에서 plan 을 옮긴 경우에만 stick.
        // nearBottom 상태에선 새 plan 추가 시 자동 이동이 정상 발동해야 한다.
        if (nearBottomRef.current) {
          userPickedPlanRef.current = false
        } else {
          userPickedPlanRef.current = true
        }
        setPlanIdx(idx)
        setActiveGroupId(gid)
      }
    }

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(pickAndSwitch)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [todoOpen])

  // 4-c) 스크롤 위치 → viewport 중앙에 보이는 turn(groupId) 추적. todoOpen 과 무관하게 항상 동작.
  //      사용자가 현재 보고 있는 답변에 대응하는 user 질문 말풍선을 초록 하이라이팅하기 위함.
  useEffect(() => {
    if (!scrollRef.current) return
    const root = scrollRef.current
    let raf = 0
    const pick = () => {
      const nodes = root.querySelectorAll<HTMLElement>('[data-assistant-group-id]')
      if (nodes.length === 0) return
      const rootRect = root.getBoundingClientRect()
      const center = rootRect.top + rootRect.height / 2
      let best: { el: HTMLElement; dist: number } | null = null
      nodes.forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.bottom < rootRect.top || r.top > rootRect.bottom) return
        const elCenter = r.top + r.height / 2
        const dist = Math.abs(elCenter - center)
        if (!best || dist < best.dist) best = { el, dist }
      })
      if (!best) return
      const gid = (best as { el: HTMLElement; dist: number }).el.getAttribute(
        'data-assistant-group-id',
      )
      if (gid) setViewedGroupId(gid)
    }
    pick()
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(pick)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      root.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [feed.length])

  const scrollToAssistant = useCallback((groupId: string) => {
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(`[data-assistant-group-id="${CSS.escape(groupId)}"]`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // 5) textarea 자동 높이
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [composer])

  // ── 첨부 핸들러 ──────────────────────────────────────────────
  /** thread 가 아직 생성 중일 때 잠시 기다린 뒤 id 반환. 첨부 업로드가 thread 생성 직후
   *  자동 useEffect 보다 빨리 클릭되는 경우 race 보호. */
  const ensureThreadIdForUpload = useCallback(async (): Promise<string | null> => {
    if (threadId) return threadId
    // 최대 3초 (100ms * 30) 대기 — 그래도 없으면 null 반환해 에러 표시
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100))
      if (threadId) return threadId
    }
    return null
  }, [threadId])

  const handleFilesSelected = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files)
      if (arr.length === 0) return
      setUploading(true)
      try {
        const tid = await ensureThreadIdForUpload()
        if (!tid) {
          toast.error('스레드가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.')
          return
        }
        for (const file of arr) {
          try {
            const att = await apiClient.attachments.upload(tid, file)
            setAttachments((prev) => [...prev, att])
          } catch (err) {
            toast.error(
              `${file.name} 업로드 실패: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      } finally {
        setUploading(false)
      }
    },
    [ensureThreadIdForUpload],
  )

  const handleRemoveAttachment = useCallback(async (attachmentId: string) => {
    try {
      await apiClient.attachments.delete(attachmentId)
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '첨부 삭제 실패')
    }
  }, [])

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

  // threadId 변경 시 첨부 목록 로드/초기화
  useEffect(() => {
    if (!threadId) {
      setAttachments([])
      return
    }
    apiClient.attachments
      .list(threadId)
      .then(setAttachments)
      .catch(() => undefined)
  }, [threadId])

  const handleSend = useCallback(
    async (textOverride?: string, opts?: { force?: boolean }) => {
      const text = (textOverride ?? composer).trim()
      if (!text || !threadId) return
      // sending 가드는 사용자 중복 클릭 방지용. follow-up 자동 발송(opts.force)에서는 우회.
      if (sending && !opts?.force) return
      setSending(true)
      streamingIdRef.current = null
      const groupId = `group-${Date.now()}`
      activeGroupIdRef.current = groupId
      // turn 시작 시점의 ever-completed snapshot freeze — 이미 완료로 보였던 항목은
      // 이번 turn 의 WORKING 후보에서 영구 배제 (snapshot 누락에도 robust).
      const frozen = new Set<string>()
      for (const plan of plansRef.current) {
        for (const gid of plan.groupIds) {
          for (const s of plan.snapshotsByGroup[gid] ?? []) {
            if (s.status === 'completed') frozen.add(s.content)
          }
        }
        for (const s of plan.steps) {
          if (s.status === 'completed') frozen.add(s.content)
        }
      }
      everCompletedAtTurnStartRef.current = frozen
      // 새 메시지를 보내면 사용자 의도가 "최신 답변을 보겠다" 로 리셋된 것으로 간주.
      // 자동 스크롤·자동 plan 이동을 다시 활성화한다.
      nearBottomRef.current = true
      userPickedPlanRef.current = false
      const ts = Date.now()
      const isFirstUserMessage = !feed.some((it) => it.kind === 'user')
      setFeed((prev) => [
        ...prev,
        { kind: 'user', id: `user-${Date.now()}`, content: text, ts },
        { kind: 'group', id: groupId, ts, startedAt: ts, status: 'running', steps: [] },
      ])
      setComposer('')

      if (isFirstUserMessage) {
        const title = text.replace(/\s+/g, ' ').trim().slice(0, 40)
        if (title) {
          apiClient.threads
            .update(threadId, { title })
            .then(() => {
              // 사이드바에 새 thread upsert (title + agent 정보 동봉) — 첫 메시지 시점에만 노출
              window.dispatchEvent(
                new CustomEvent('thread-upserted', {
                  detail: {
                    thread: {
                      id: threadId,
                      title,
                      updatedAt: new Date().toISOString(),
                      agent: agent
                        ? { id: agent.agentId, name: agent.name, slug: agent.slug }
                        : null,
                    },
                  },
                }),
              )
            })
            .catch(() => {})
        }
      }
      try {
        const archOverride = agent?.architecture === 'react' ? runMode : undefined
        const res = (await apiClient.threads.invoke(threadId, text, archOverride, 'client')) as {
          messages?: Array<{ role?: string; content?: string; toolCalls?: unknown[] }>
        }
        if (res?.messages && Array.isArray(res.messages)) {
          const last = [...res.messages]
            .reverse()
            .find(
              (m) =>
                (m?.role === 'assistant' || m?.role === 'ai') &&
                !m?.toolCalls &&
                typeof m?.content === 'string' &&
                m.content.trim().length > 0,
            )
          if (last?.content) {
            const fallback = last.content
            setFeed((prev) => {
              const streamingId = streamingIdRef.current
              if (streamingId) {
                return prev.map((it) =>
                  it.kind === 'assistant' && it.id === streamingId
                    ? { ...it, content: it.content || fallback, done: true }
                    : it,
                )
              }
              // streaming 으로 이미 답변이 도착한 경우(turn.completed 가 invoke 응답보다 먼저 옴)
              // 같은 turn(groupId)의 assistant 가 이미 있으면 fallback 을 추가하지 않는다 — 답변 중복 방지.
              const alreadyHasAnswer = prev.some(
                (it) => it.kind === 'assistant' && it.groupId === groupId,
              )
              if (alreadyHasAnswer) return prev
              return [
                ...prev,
                {
                  kind: 'assistant',
                  id: `assistant-${Date.now()}`,
                  groupId,
                  content: fallback,
                  done: true,
                  ts: Date.now(),
                },
              ]
            })
            streamingIdRef.current = null
          }
        }
      } catch (err) {
        // 사용자가 stop 으로 cancel 한 직후의 invoke 에러는 의도된 동작이므로 안내 skip.
        if (cancelRequestedRef.current) {
          cancelRequestedRef.current = false
        } else if (
          err instanceof ApiError &&
          err.statusCode === 403 &&
          (err.body as MissingMcpCredentialError | undefined)?.error === 'MissingMcpCredential'
        ) {
          const errorBody = err.body as MissingMcpCredentialError
          setMcpCredModal({ missingCredentials: errorBody.missingCredentials, pendingText: text })
        } else {
          const msg = err instanceof Error ? err.message : '전송 실패'
          toast.error(msg)
        }
      } finally {
        setFeed((prev) =>
          prev.map((it) => {
            if (it.kind === 'group' && it.id === groupId && it.status === 'running') {
              return { ...it, status: 'done' as StepStatus, completedAt: Date.now() }
            }
            // streamingIdRef 매칭이 깨졌어도 같은 groupId 의 미완료 assistant 는 모두 done=true.
            if (it.kind === 'assistant' && it.groupId === groupId && !it.done) {
              return { ...it, done: true }
            }
            return it
          }),
        )
        streamingIdRef.current = null
        // activeGroupIdRef 는 reset 하지 않는다 — turn.completed 이후에 도착하는 backend
        // safety net plan.created 가 같은 plan 에 합쳐지도록.
        setSending(false)
      }
    },
    [composer, threadId, sending, feed, agent, runMode],
  )

  // handleSend 의 최신 closure 를 ref 에 동기화 — useEffect 안의 WS handler 들이
  // edit follow-up 자동 전송에 사용한다.
  useEffect(() => {
    handleSendRef.current = handleSend
  }, [handleSend])

  // HITL 카드 결정 처리.
  //   - real 카드(deepagents 인터럽트 그 자체): approve/reject 그대로 전송.
  //   - pseudo 카드(=프런트가 "수정 후 확인" 용도로 추가한 단계):
  //       approve → deepagents `edit` decision 으로 직행. 새 args(toolArgs) 와 도구
  //         이름을 editedAction 으로 전달하면 deepagents 가 수정된 args 로 도구를
  //         실행하고 결과를 같은 turn 의 LLM 에 전달한다.
  //         (참고: docs.langchain.com/oss/python/deepagents/human-in-the-loop)
  //         단, deepagents `edit` 은 user 메시지는 손대지 않아 LLM 답변이 원본 의도를
  //         계속 따를 수 있다("최근메일 하나" → 결과 3개여도 1개만 답변). 그래서
  //         editFollowupRef 를 활성화해 마지막 turn 종료 시 사용자의 자연어 수정문을
  //         새 user 메시지로 자동 전송 → 새 turn 에서 LLM 이 도구 결과를 사용자
  //         의도에 맞춰 다시 정리하도록 한다.
  //       reject → 그대로 reject 전송. 단 sourceInteractionId(=real 인터럽트 id)로 보낸다.
  const handleHitlDecide = useCallback(
    (item: Extract<FeedItem, { kind: 'hitl_request' }>, decision: 'approve' | 'reject') => {
      const feedItemId = item.id
      const sourceInteractionId = item.pendingEditFor?.sourceInteractionId ?? item.interactionId
      const isPseudoApprove = Boolean(item.pendingEditFor) && decision === 'approve'
      const editPrompt = item.editPrompt?.trim() ?? ''
      // Follow-up user 메시지 자동 발송 메커니즘은 비활성화됨.
      // backend(deepagent_bridge.resume_stream_with_deepagent) 가 edit decision 처리 시
      // parent state 의 마지막 HumanMessage 에 직접 수정 의도 안내를 inject + finally revert
      // 하는 방식으로 변경 — visible 한 follow-up user 메시지 없이 곧장 새 의도로 답변.
      void editPrompt
      // editFollowupRef 는 사용하지 않음(legacy). 필요시 추후 제거.
      setFeed((prev) =>
        prev.map((it) => {
          if (it.kind !== 'hitl_request') return it
          // pseudo 승인 시: pseudo 카드는 resolved='approve' 로 마킹.
          // real 카드(있다면)는 resolved='edit' + editedAction 으로 갱신해 history 와
          // 동일한 모양으로 보이도록 한다 (DB 에는 어차피 editedAction 이 기록됨).
          if (isPseudoApprove) {
            if (it.id === feedItemId) {
              return { ...it, resolved: 'approve' as HitlDecision }
            }
            if (it.interactionId === sourceInteractionId && !it.pendingEditFor) {
              return {
                ...it,
                resolved: 'edit' as HitlDecision,
                editPrompt: editPrompt || it.editPrompt,
                editedAction: { name: item.toolName, args: item.toolArgs },
              }
            }
            return it
          }
          if (it.id === feedItemId) {
            return { ...it, resolved: decision }
          }
          return it
        }),
      )
      setEditingHitl((cur) => (cur && cur.feedItemId === feedItemId ? null : cur))
      const payload: Record<string, unknown> = isPseudoApprove
        ? {
            decision: 'edit',
            editPrompt,
            editedAction: { name: item.toolName, args: item.toolArgs },
            ...(item.taskDescriptionUpdate
              ? { taskDescriptionUpdate: item.taskDescriptionUpdate }
              : {}),
          }
        : item.pendingEditFor
          ? { decision: 'reject' }
          : { decision }
      wsClient.respondToInteraction(sourceInteractionId, payload, currentUser?.id ?? '', 'client')
      setSending(true)
    },
    [currentUser?.id],
  )

  const handleHitlEditStart = useCallback(
    (item: Extract<FeedItem, { kind: 'hitl_request' }>) => {
      const initialTaskDescription =
        typeof item.taskDescriptionUpdate === 'string' &&
        item.taskDescriptionUpdate.trim().length > 0
          ? item.taskDescriptionUpdate
          : item.parentTaskDescription
      setEditingHitl({
        feedItemId: item.id,
        sourceInteractionId: item.pendingEditFor?.sourceInteractionId ?? item.interactionId,
        toolName: item.toolName,
        toolLabel: TOOL_LABEL_KO[item.toolName] ?? item.toolName,
        initialArgs: item.toolArgs ?? {},
        initialTaskDescription,
        mode: 'nl',
      })
      setDirectDrafts({})
      setTaskDescriptionDraft(initialTaskDescription ?? '')
      setHelpOpenForKey({})
      setComposer('')
      requestAnimationFrame(() => textareaRef.current?.focus())
    },
    [],
  )

  const handleHitlEditCancel = useCallback(() => {
    setEditingHitl(null)
    setDirectDrafts({})
    setTaskDescriptionDraft('')
    setHelpOpenForKey({})
    setComposer('')
  }, [])

  // 수정 모드 전환.
  //   - 'direct' 로 처음 진입(드래프트 비어있음) 시 initialArgs 로 폼 draft 초기화
  //   - 직접 ↔ 자연어 토글 시에는 이미 입력한 draft 를 유지하여 사용자 작업 손실 방지
  const handleEditModeChange = useCallback(
    (mode: 'nl' | 'direct') => {
      setEditingHitl((cur) => {
        if (!cur || cur.mode === mode) return cur
        if (mode === 'direct') {
          setDirectDrafts((prev) => {
            if (Object.keys(prev).length > 0) return prev
            const drafts: Record<string, string> = {}
            for (const [key, value] of Object.entries(cur.initialArgs)) {
              drafts[key] = valueToDraft(value)
            }
            return drafts
          })
        }
        return { ...cur, mode }
      })
      if (mode === 'nl') {
        requestAnimationFrame(() => textareaRef.current?.focus())
      }
    },
    [],
  )

  // 수정 미리보기(pseudo) 카드 적용 — NL/direct 공용 헬퍼.
  const applyHitlPreview = useCallback(
    (params: {
      targetFeedId: string
      sourceInteractionId: string
      name: string
      args: Record<string, unknown>
      editPrompt: string
      taskDescriptionUpdate?: string
      /** pseudo 승인 시 follow-up 으로 발송할 자연어 user 메시지. */
      followupMessage?: string
    }) => {
      setFeed((prev) => {
        const idx = prev.findIndex(
          (it) => it.kind === 'hitl_request' && it.id === params.targetFeedId,
        )
        if (idx < 0) return prev
        const target0 = prev[idx]
        if (target0.kind !== 'hitl_request') return prev
        const next = [...prev]
        // undefined 일 때 이전 값 보존(pseudo 재수정에서 손실 방지).
        const mergedTaskDesc =
          params.taskDescriptionUpdate !== undefined
            ? params.taskDescriptionUpdate
            : target0.taskDescriptionUpdate
        const mergedFollowup =
          params.followupMessage !== undefined
            ? params.followupMessage
            : target0.followupMessage
        if (target0.pendingEditFor) {
          // 이미 pseudo — args 만 갱신 (resolved 는 유지/리셋).
          next[idx] = {
            ...target0,
            toolName: params.name,
            toolArgs: params.args,
            editPrompt: params.editPrompt,
            taskDescriptionUpdate: mergedTaskDesc,
            followupMessage: mergedFollowup,
            resolved: undefined,
          }
          return next
        }
        // real HITL #1 → resolved='edit' 으로 마킹 (deepagents 응답은 아직 보내지 않음).
        next[idx] = { ...target0, resolved: 'edit' as HitlDecision, editPrompt: params.editPrompt }
        // pseudo 카드도 동적 카드 경로로 렌더 — cardDefinitionId/cardData 주입.
        // hitl_respond 핸들러는 cardData.isPseudoEdit=true 를 보고 approve → edit 으로 변환.
        const pseudoArgsJson = (() => {
          try { return JSON.stringify(params.args) } catch { return String(params.args) }
        })()
        const pseudo: FeedItem = {
          kind: 'hitl_request',
          id: `hitl-pending-${Date.now()}`,
          interactionId: params.sourceInteractionId,
          toolName: params.name,
          toolArgs: params.args,
          allowedDecisions: target0.allowedDecisions,
          pendingEditFor: { sourceInteractionId: params.sourceInteractionId },
          editPrompt: params.editPrompt,
          taskDescriptionUpdate: mergedTaskDesc,
          followupMessage: mergedFollowup,
          parentTaskDescription: target0.parentTaskDescription,
          cardDefinitionId: 'hitl-input-card',
          cardVersion: 1,
          cardData: {
            mode: 'pseudo_edit',
            prompt: '아래 수정안으로 진행할까요?',
            primaryToolName: params.name,
            primaryToolArgs: params.args,
            actionRequests: [
              { name: params.name, args: params.args, title: params.name, body: pseudoArgsJson, severity: 'med' },
            ],
            allowedDecisions: target0.allowedDecisions,
            isPseudoEdit: true,
            editPrompt: params.editPrompt,
            taskDescriptionUpdate: mergedTaskDesc,
          },
          ts: target0.ts + 1,
        }
        next.splice(idx + 1, 0, pseudo)
        return next
      })
      setEditingHitl(null)
      setDirectDrafts({})
      setTaskDescriptionDraft('')
      setHelpOpenForKey({})
      setComposer('')
    },
    [],
  )

  // HitlDynamicCard 의 hitl_respond 핸들러가 발행하는 resolved 이벤트 — feed 의 resolved 마킹.
  useEffect(() => {
    function onResolved(e: Event) {
      const d = (e as CustomEvent).detail as {
        interactionId: string
        decision: 'approve' | 'reject' | 'edit' | 'respond'
        isPseudoEdit?: boolean
        editPrompt?: string
        editedAction?: { name: string; args: Record<string, unknown> }
      }
      if (!d?.interactionId) return
      const mappedDecision: HitlDecision =
        d.decision === 'approve'
          ? 'approve'
          : d.decision === 'reject'
            ? 'reject'
            : 'edit'
      setFeed((prev) =>
        prev.map((it) => {
          if (it.kind !== 'hitl_request') return it
          if (d.isPseudoEdit) {
            // pseudo 카드 자신 → 'approve' 마킹.
            if (it.interactionId === d.interactionId && it.pendingEditFor) {
              return { ...it, resolved: 'approve' as HitlDecision }
            }
            // pseudo 의 원본 real 카드 → 'edit' + editedAction.
            if (it.interactionId === d.interactionId && !it.pendingEditFor) {
              return {
                ...it,
                resolved: 'edit' as HitlDecision,
                editPrompt: d.editPrompt ?? it.editPrompt,
                editedAction: d.editedAction ?? it.editedAction,
              }
            }
            return it
          }
          if (it.interactionId === d.interactionId && !it.pendingEditFor) {
            return { ...it, resolved: mappedDecision }
          }
          return it
        }),
      )
      setSending(true)
    }
    window.addEventListener('dynamic-card:hitl-resolved', onResolved)
    return () => window.removeEventListener('dynamic-card:hitl-resolved', onResolved)
  }, [])

  // HitlDynamicCard 의 preview_edit 핸들러가 발행하는 window event 를 받아
  // 기존 applyHitlPreview 로 위임 — 동적 카드 경로에서 NL 수정 미리보기 지원.
  useEffect(() => {
    function onPreviewEdit(e: Event) {
      const detail = (e as CustomEvent).detail as {
        interactionId: string
        editPrompt: string
        name: string
        args: Record<string, unknown>
        taskDescriptionUpdate?: string | null
      }
      if (!detail?.interactionId) return
      const target = feedRef.current.find(
        (it) => it.kind === 'hitl_request' && it.interactionId === detail.interactionId,
      )
      if (!target || target.kind !== 'hitl_request') return
      applyHitlPreview({
        targetFeedId: target.id,
        sourceInteractionId: detail.interactionId,
        name: detail.name,
        args: detail.args,
        editPrompt: detail.editPrompt,
        taskDescriptionUpdate: detail.taskDescriptionUpdate ?? undefined,
      })
    }
    window.addEventListener('dynamic-card:preview-edit', onPreviewEdit)
    return () => window.removeEventListener('dynamic-card:preview-edit', onPreviewEdit)
  }, [applyHitlPreview])

  // 도움말 예시 클릭 — 객체/배열 타입이면 replace, 그 외엔 append(공백 분리).
  const handleInsertExamplePattern = useCallback(
    (key: string, pattern: string, replace: boolean) => {
      setDirectDrafts((prev) => {
        const current = prev[key] ?? ''
        if (replace || current.trim().length === 0) {
          return { ...prev, [key]: pattern }
        }
        const sep = current.endsWith(' ') ? '' : ' '
        return { ...prev, [key]: current + sep + pattern }
      })
    },
    [],
  )

  // 자연어 수정 전송:
  //   1) runner `preview-edit` 엔드포인트에 자연어 수정문을 보내 새 args 를 받음 (LLM 변환).
  //   2) applyHitlPreview 로 real → resolved='edit' 마킹 + pseudo 카드 push (또는 기존
  //      pseudo args 갱신).
  //   3) deepagents 에는 사용자가 pseudo 카드를 승인할 때 비로소 `edit` 결정을 보낸다.
  const handleHitlEditSubmit = useCallback(async () => {
    const target = editingHitl
    const text = composer.trim()
    if (!target || !text || editPreviewing) return
    setEditPreviewing(true)
    try {
      const preview = await apiClient.hitl.previewEdit(target.sourceInteractionId, text)
      const previewTaskDesc =
        typeof preview.taskDescriptionUpdate === 'string' &&
        preview.taskDescriptionUpdate.trim().length > 0
          ? preview.taskDescriptionUpdate
          : undefined
      applyHitlPreview({
        targetFeedId: target.feedItemId,
        sourceInteractionId: target.sourceInteractionId,
        name: preview.name,
        args: preview.args,
        editPrompt: text,
        taskDescriptionUpdate: previewTaskDesc,
        // NL 모드: 사용자가 입력한 자연어 그대로를 follow-up user 메시지로 전송.
        followupMessage: text,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '수정 요청 변환 실패'
      toast.error(msg)
    } finally {
      setEditPreviewing(false)
    }
  }, [editingHitl, composer, editPreviewing, applyHitlPreview])

  // 직접 수정 전송 — args 는 LLM 우회, drafts 를 원본 타입에 맞춰 파싱한 뒤 그대로 사용.
  // 파싱 실패 시 toast 로 알리고 중단(폼 값은 유지).
  //
  // 작업 설명(SubAgent 컨텍스트에서만 노출) 처리 — 3 가지 경우:
  //   1) 사용자가 작업 설명을 직접 편집함  → 그 값 그대로 사용 (LLM 호출 안 함)
  //   2) 사용자가 작업 설명은 그대로 두고 args 만 변경  → LLM 으로 description 만 자동 재작성
  //      (sync prompt 로 args diff 를 명시하고 그에 맞게 description 만 받음. args 는 사용자 값
  //       우선 적용. SubAgent context 가 없으면 LLM 호출 자체를 건너뜀.)
  //   3) args·description 둘 다 변경 없음  → no-op (그래도 pseudo 카드 흐름 정상 진행)
  const handleHitlEditSubmitDirect = useCallback(async () => {
    const target = editingHitl
    if (!target || target.mode !== 'direct' || editPreviewing) return
    const nextArgs: Record<string, unknown> = {}
    try {
      for (const [key, original] of Object.entries(target.initialArgs)) {
        const raw = directDrafts[key] ?? ''
        nextArgs[key] = parseArgValueOrThrow(original, raw)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '인자 값 파싱 실패'
      toast.error(msg)
      return
    }

    const hasSubAgentContext = target.initialTaskDescription !== undefined
    const initialDescTrim = (target.initialTaskDescription ?? '').trim()
    const draftDescTrim = taskDescriptionDraft.trim()
    const userEditedDescription =
      hasSubAgentContext && draftDescTrim.length > 0 && draftDescTrim !== initialDescTrim
    const argsChanged =
      JSON.stringify(target.initialArgs) !== JSON.stringify(nextArgs)

    let taskDescriptionUpdate: string | undefined
    let editPromptLabel = '(직접 수정)'

    if (userEditedDescription) {
      // Case 1 — 사용자가 직접 작업 설명을 편집했으니 그 값 그대로 신뢰.
      taskDescriptionUpdate = draftDescTrim
    } else if (hasSubAgentContext && argsChanged) {
      // Case 2 — args 만 바뀜. LLM 으로 description 을 args 변경에 맞춰 재작성.
      setEditPreviewing(true)
      try {
        const synthPrompt = buildArgDiffPrompt(target.initialArgs, nextArgs)
        const preview = await apiClient.hitl.previewEdit(
          target.sourceInteractionId,
          synthPrompt,
        )
        const tdu = preview.taskDescriptionUpdate
        if (typeof tdu === 'string' && tdu.trim().length > 0) {
          taskDescriptionUpdate = tdu.trim()
          editPromptLabel = '(직접 수정 — 작업 설명 자동 갱신)'
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        toast.warning(`작업 설명 자동 갱신 실패: ${msg}. 인자만 적용됩니다.`)
      } finally {
        setEditPreviewing(false)
      }
    }
    // Case 3 — taskDescriptionUpdate undefined, args 그대로 사용 (변경 사항 없으면 사실상 no-op).

    // pseudo 승인 후 parent LLM 에게 보낼 follow-up user 메시지.
    // deepagents `edit` 은 도구 args 만 바꾸고 user 메시지는 손대지 않으므로 parent LLM 이
    // 원본 user 의도("하나")에 묶일 수 있다. 인자 변경 + (사용자가 적은) 작업 의도를 합성한
    // 자연어를 새 user 메시지로 전송해 결과를 다시 정리하도록 유도.
    // - 변경된 게 전혀 없으면 follow-up 자체를 건너뜀(빈 문자열).
    let followupMessage: string | undefined
    if (argsChanged || userEditedDescription) {
      followupMessage = buildDirectEditFollowupMessage(
        target.initialArgs,
        nextArgs,
        userEditedDescription ? draftDescTrim : undefined,
      )
    }

    applyHitlPreview({
      targetFeedId: target.feedItemId,
      sourceInteractionId: target.sourceInteractionId,
      name: target.toolName,
      args: nextArgs,
      editPrompt: editPromptLabel,
      taskDescriptionUpdate,
      followupMessage,
    })
  }, [editingHitl, directDrafts, taskDescriptionDraft, editPreviewing, applyHitlPreview])

  const handleStop = useCallback(async () => {
    if (!threadId) return
    cancelRequestedRef.current = true
    const groupId = activeGroupIdRef.current
    // 즉시 UI 반영 — WS run.cancelled 도착 전이라도 group chip 을 "취소됨" 으로 즉시 변경.
    // (WS 이벤트 도착이 invoke fetch reject(→ finally) 보다 늦거나 누락된 케이스 보호.)
    if (groupId) {
      setFeed((prev) =>
        prev.map((it) =>
          it.kind === 'group' && it.id === groupId
            ? { ...it, status: 'done' as StepStatus, completedAt: Date.now(), cancelled: true }
            : it,
        ),
      )
      setPlans((prev) => applyCancelToPlans(prev, groupId))
    }
    setSending(false)
    streamingIdRef.current = null
    try {
      await apiClient.threads.cancel(threadId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '중지 요청 실패'
      toast.error(msg)
    }
    // run.cancelled WS 이벤트가 추가로 도착해도 idempotent.
  }, [threadId])

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (editingHitl && e.key === 'Escape') {
      e.preventDefault()
      handleHitlEditCancel()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (editingHitl) {
        handleHitlEditSubmit()
      } else {
        void handleSend()
      }
    }
  }

  const agentName = agent?.name ?? 'Assistant'

  return (
    <div className="relative flex h-full flex-col" style={{ background: 'var(--client-bg)' }}>
      {showHeader && (
        <div
          className="flex h-14 shrink-0 items-center justify-between border-b px-6"
          style={{ background: 'var(--client-panel)', borderColor: 'var(--client-border)' }}
        >
          <Link
            href={`/client/agents/${slug}`}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
            style={{ color: 'var(--client-muted)' }}
          >
            <ArrowLeft className="h-4 w-4" />
            {agent?.name ?? '에이전트'}
          </Link>
          <span className="text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
            {agentName}
          </span>
          <span className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
            {agent ? `v${agent.version} · ${agent.env.name}` : ''}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className={cn(
          'relative flex-1 overflow-y-auto',
          isDragOver && 'ring-2 ring-inset',
        )}
        style={isDragOver ? { boxShadow: 'inset 0 0 0 2px var(--client-accent, #0EA5E9)' } : undefined}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDropFiles}
      >
        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div
              className="rounded-xl border-2 border-dashed px-6 py-3 text-sm font-semibold shadow-xl"
              style={{
                background: 'var(--client-panel, #0b1220)',
                borderColor: 'var(--client-accent, #0EA5E9)',
                color: 'var(--client-accent, #0EA5E9)',
              }}
            >
              파일을 놓아 첨부
            </div>
          </div>
        )}
        <div className="mx-auto max-w-[756px] pt-20 pr-4 pb-5 pl-7">
          {bootstrapping ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--client-muted)' }} />
            </div>
          ) : feed.length === 0 ? (
            <EmptyComposer
              agentName={agentName}
              starters={agent?.starters ?? []}
              onPick={(t) => void handleSend(t)}
            />
          ) : (
            <div className="space-y-6">
              {feed.map((it) => {
                if (it.kind === 'user')
                  return <UserBubble key={it.id} content={it.content} ts={it.ts} />
                if (it.kind === 'assistant')
                  return (
                    <AssistantMessage
                      key={it.id}
                      groupId={it.groupId}
                      content={it.content}
                      done={it.done}
                      ts={it.ts}
                      agentName={agentName}
                    />
                  )
                if (it.kind === 'hitl_request') {
                  // 옛 디자인: 코드 인라인 카드. resolved 도 같은 카드 안에서 라벨 표시.
                  return (
                    <ClientHitlCard
                      key={it.id}
                      item={it}
                      editing={editingHitl?.feedItemId === it.id}
                      previewing={editPreviewing}
                      onDecide={handleHitlDecide}
                      onEditStart={handleHitlEditStart}
                      onEditCancel={handleHitlEditCancel}
                    />
                  )
                }
                return <ActivityGroupCard key={it.id} group={it} />
              })}
              {savedAttachments.length > 0 && (
                <div className="space-y-1.5">
                  <p
                    className="text-xs font-medium"
                    style={{ color: 'var(--client-muted-2)' }}
                  >
                    첨부 파일
                  </p>
                  {savedAttachments.map((att) => (
                    <AttachmentInlineRow
                      key={att.id}
                      attachment={att}
                      onPreview={setPreviewAttachment}
                      variant="client"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="mx-auto max-w-[756px]">
          {(agent?.architecture === 'react' || plans.length > 0) && (
            <div className="mb-2 flex items-center justify-between gap-2">
              {agent?.architecture === 'react' ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setRunMode('react')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      runMode === 'react'
                        ? 'border-violet-500 bg-violet-500/15 text-violet-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600',
                    )}
                  >
                    <Brain className="h-3 w-3" />
                    Deep Autonomous
                  </button>
                  <button
                    onClick={() => setRunMode('plan_execute')}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      runMode === 'plan_execute'
                        ? 'border-blue-500 bg-blue-500/15 text-blue-600'
                        : 'border-transparent text-gray-400 hover:text-gray-600',
                    )}
                  >
                    <LayoutList className="h-3 w-3" />
                    계획 및 실행
                  </button>
                </div>
              ) : (
                <span />
              )}
              {plans.length > 0 && (
                <button
                  onClick={() => setTodoOpen((v) => !v)}
                  aria-pressed={todoOpen}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                    todoOpen
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-700'
                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20',
                  )}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  TO-DO List
                  <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10.5px] font-semibold text-white tabular-nums">
                    {plans.length}
                  </span>
                </button>
              )}
            </div>
          )}
          <div
            className="rounded-3xl border px-5 py-4 shadow-lg transition-shadow focus-within:shadow-xl"
            style={{
              background: 'var(--client-panel)',
              borderColor: editingHitl ? 'rgba(14,165,233,0.6)' : 'var(--client-border)',
              boxShadow: editingHitl ? '0 0 0 3px rgba(14,165,233,0.12)' : undefined,
            }}
          >
            {editingHitl && (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-medium"
                  style={{
                    borderColor: 'rgba(14,165,233,0.45)',
                    background: 'rgba(14,165,233,0.08)',
                    color: '#0284c7',
                  }}
                >
                  <CornerDownRight className="h-3 w-3" />
                  <span className="font-mono">{editingHitl.toolName}</span>
                  <span>수정 요청</span>
                  <button
                    type="button"
                    onClick={handleHitlEditCancel}
                    aria-label="수정 요청 취소"
                    className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded transition-colors hover:bg-sky-500/15"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
                <div
                  role="tablist"
                  aria-label="수정 방식 선택"
                  className="inline-flex items-center gap-0.5 rounded-md border p-0.5 text-[11.5px]"
                  style={{
                    borderColor: 'var(--client-border)',
                    background: 'var(--client-bg)',
                  }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editingHitl.mode === 'nl'}
                    onClick={() => handleEditModeChange('nl')}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 transition-colors"
                    style={{
                      background:
                        editingHitl.mode === 'nl' ? 'rgba(14,165,233,0.12)' : 'transparent',
                      color: editingHitl.mode === 'nl' ? '#0284c7' : 'var(--client-muted)',
                      fontWeight: editingHitl.mode === 'nl' ? 600 : 500,
                    }}
                  >
                    <Sparkles className="h-3 w-3" />
                    자연어
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editingHitl.mode === 'direct'}
                    onClick={() => handleEditModeChange('direct')}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 transition-colors"
                    style={{
                      background:
                        editingHitl.mode === 'direct' ? 'rgba(14,165,233,0.12)' : 'transparent',
                      color:
                        editingHitl.mode === 'direct' ? '#0284c7' : 'var(--client-muted)',
                      fontWeight: editingHitl.mode === 'direct' ? 600 : 500,
                    }}
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    직접 수정
                  </button>
                </div>
              </div>
            )}
            {!editingHitl && (composerAttachments.length > 0 || uploading) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {composerAttachments.map((att) => {
                  const isImage = att.mimeType.startsWith('image/')
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      className="group inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:brightness-110"
                      style={{
                        borderColor: 'var(--client-border)',
                        background: 'var(--client-panel)',
                        color: 'var(--client-text)',
                      }}
                      title={`${att.originalName} · ${(att.size / 1024).toFixed(1)}KB · 클릭해 미리보기`}
                    >
                      {isImage ? (
                        <ImageIcon className="h-3 w-3 shrink-0 text-sky-500" />
                      ) : (
                        <FileText className="h-3 w-3 shrink-0 text-amber-500" />
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
                        style={{ color: 'var(--client-muted-2)' }}
                        className="cursor-pointer hover:text-red-500"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </button>
                  )
                })}
                {uploading && (
                  <div
                    className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
                    style={{
                      borderColor: 'var(--client-border)',
                      background: 'var(--client-panel)',
                      color: 'var(--client-muted-2)',
                    }}
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    업로드 중...
                  </div>
                )}
              </div>
            )}
            {editingHitl && editingHitl.mode === 'direct' ? (
              <div
                className="rounded-md border px-3 py-3"
                style={{
                  borderColor: 'var(--client-border)',
                  background: 'var(--client-bg)',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    handleHitlEditCancel()
                  }
                }}
              >
                {editingHitl.initialTaskDescription !== undefined && (
                  <div
                    className="mb-3 space-y-1 rounded-md border px-2.5 py-2"
                    style={{
                      borderColor: 'rgba(14,165,233,0.35)',
                      background: 'rgba(14,165,233,0.05)',
                    }}
                  >
                    <label
                      className="flex items-baseline gap-2 text-[11.5px]"
                      style={{ color: 'var(--client-text)' }}
                    >
                      <span className="font-medium">작업 설명</span>
                      <span
                        className="font-mono text-[10.5px]"
                        style={{ color: 'var(--client-muted)' }}
                      >
                        parent.description
                      </span>
                      <span
                        className="ml-auto text-[10.5px]"
                        style={{ color: 'var(--client-muted)' }}
                      >
                        SubAgent 자연어 지시
                      </span>
                    </label>
                    <p
                      className="text-[10.5px] leading-snug"
                      style={{ color: 'var(--client-muted-2)' }}
                    >
                      이 도구를 호출한 SubAgent 의 작업 지시문. <b>그대로 두면</b> 인자 변경에
                      맞춰 자동으로 재작성됩니다 (1~2초 소요). 직접 수정하면 그 내용 그대로
                      사용되며 자동 재작성을 건너뜁니다.
                    </p>
                    <textarea
                      rows={2}
                      value={taskDescriptionDraft}
                      onChange={(e) => setTaskDescriptionDraft(e.target.value)}
                      className="w-full resize-y rounded-md border px-2 py-1.5 text-xs leading-relaxed outline-none focus:border-sky-500/60"
                      style={{
                        borderColor: 'var(--client-border)',
                        background: 'var(--client-panel)',
                        color: 'var(--client-text)',
                      }}
                    />
                  </div>
                )}
                {Object.keys(editingHitl.initialArgs).length === 0 &&
                editingHitl.initialTaskDescription === undefined ? (
                  <p className="text-xs" style={{ color: 'var(--client-muted)' }}>
                    수정할 인자가 없습니다.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(editingHitl.initialArgs).map(([key, value]) => {
                      const paramSchema = getParameterSchema(editingHitl.toolName, key)
                      const label = ARG_LABEL_KO[key] ?? key
                      const draft = directDrafts[key] ?? ''
                      const schemaTypeIsComplex =
                        paramSchema?.type === 'object' || paramSchema?.type === 'array'
                      const isLong =
                        schemaTypeIsComplex ||
                        (typeof value === 'object' && value !== null) ||
                        (typeof value === 'string' && (value.length > 60 || value.includes('\n')))
                      const inferredHelper =
                        typeof value === 'boolean'
                          ? '예 / 아니오'
                          : typeof value === 'number'
                            ? '숫자'
                            : typeof value === 'object' && value !== null
                              ? 'JSON 형식'
                              : ''
                      const schemaHelper =
                        paramSchema?.type === 'boolean'
                          ? '예 / 아니오'
                          : paramSchema?.type === 'number'
                            ? '숫자'
                            : paramSchema?.type === 'object'
                              ? 'JSON 객체'
                              : paramSchema?.type === 'array'
                                ? 'JSON 배열'
                                : ''
                      const helper = schemaHelper || inferredHelper
                      const description = paramSchema?.description
                      const constraintLine = paramSchema
                        ? summarizeConstraints(paramSchema)
                        : ''
                      const required = paramSchema?.required === true
                      const placeholder = paramSchema?.example ?? ''
                      const help = paramSchema?.help
                      const hasHelp = Boolean(
                        help && (help.intro || (help.examples && help.examples.length > 0)),
                      )
                      const helpOpen = helpOpenForKey[key] === true
                      const replaceOnInsert = schemaTypeIsComplex
                      return (
                        <div key={key} className="space-y-1">
                          <label
                            className="flex items-baseline gap-2 text-[11.5px]"
                            style={{ color: 'var(--client-text)' }}
                          >
                            <span className="font-medium">{label}</span>
                            {required && (
                              <span
                                className="text-[10.5px] font-semibold"
                                style={{ color: '#dc2626' }}
                                title="필수"
                              >
                                *
                              </span>
                            )}
                            {label !== key && (
                              <span
                                className="font-mono text-[10.5px]"
                                style={{ color: 'var(--client-muted)' }}
                              >
                                {key}
                              </span>
                            )}
                            <span className="ml-auto inline-flex items-center gap-2">
                              {helper && (
                                <span
                                  className="text-[10.5px]"
                                  style={{ color: 'var(--client-muted)' }}
                                >
                                  {helper}
                                </span>
                              )}
                              {hasHelp && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setHelpOpenForKey((s) => ({ ...s, [key]: !helpOpen }))
                                  }
                                  aria-expanded={helpOpen}
                                  aria-label={helpOpen ? '도움말 닫기' : '도움말 열기'}
                                  className="inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors"
                                  style={{
                                    borderColor: helpOpen
                                      ? 'rgba(14,165,233,0.55)'
                                      : 'var(--client-border)',
                                    background: helpOpen
                                      ? 'rgba(14,165,233,0.08)'
                                      : 'transparent',
                                    color: helpOpen ? '#0284c7' : 'var(--client-muted)',
                                  }}
                                >
                                  <HelpCircle className="h-3 w-3" />
                                  도움말
                                </button>
                              )}
                            </span>
                          </label>
                          {description && (
                            <p
                              className="text-[10.5px] leading-snug"
                              style={{ color: 'var(--client-muted-2)' }}
                            >
                              {description}
                            </p>
                          )}
                          {constraintLine && (
                            <p
                              className="text-[10.5px] font-mono leading-snug"
                              style={{ color: 'var(--client-muted)' }}
                            >
                              {constraintLine}
                            </p>
                          )}
                          {hasHelp && helpOpen && help && (
                            <div
                              className="rounded-md border px-2.5 py-2"
                              style={{
                                borderColor: 'rgba(14,165,233,0.35)',
                                background: 'rgba(14,165,233,0.05)',
                              }}
                            >
                              {help.intro && (
                                <p
                                  className="whitespace-pre-wrap text-xs leading-relaxed"
                                  style={{ color: 'var(--client-text)' }}
                                >
                                  {help.intro}
                                </p>
                              )}
                              {help.examples && help.examples.length > 0 && (
                                <>
                                  {help.intro && (
                                    <p
                                      className="mt-1.5 text-xs"
                                      style={{ color: 'var(--client-muted)' }}
                                    >
                                      클릭하면 입력란에
                                      {replaceOnInsert ? ' 덮어씁니다' : ' 추가됩니다'}
                                    </p>
                                  )}
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {help.examples.map((ex, i) => (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() =>
                                          handleInsertExamplePattern(
                                            key,
                                            ex.pattern,
                                            replaceOnInsert,
                                          )
                                        }
                                        title={ex.description}
                                        className="inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors hover:bg-sky-500/10"
                                        style={{
                                          borderColor: 'var(--client-border)',
                                          background: 'var(--client-panel)',
                                          color: 'var(--client-text)',
                                        }}
                                      >
                                        <span className="truncate">{ex.pattern}</span>
                                        <span
                                          className="font-sans text-xs"
                                          style={{ color: 'var(--client-muted)' }}
                                        >
                                          {ex.description}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {isLong ? (
                            <textarea
                              rows={3}
                              value={draft}
                              placeholder={placeholder}
                              onChange={(e) =>
                                setDirectDrafts((d) => ({ ...d, [key]: e.target.value }))
                              }
                              className="w-full resize-y rounded-md border px-2 py-1.5 font-mono text-xs outline-none focus:border-sky-500/60"
                              style={{
                                borderColor: 'var(--client-border)',
                                background: 'var(--client-panel)',
                                color: 'var(--client-text)',
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              value={draft}
                              placeholder={placeholder}
                              onChange={(e) =>
                                setDirectDrafts((d) => ({ ...d, [key]: e.target.value }))
                              }
                              className="w-full rounded-md border px-2 py-1.5 font-mono text-xs outline-none focus:border-sky-500/60"
                              style={{
                                borderColor: 'var(--client-border)',
                                background: 'var(--client-panel)',
                                color: 'var(--client-text)',
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : (
              <textarea
                ref={textareaRef}
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                placeholder={
                  editingHitl
                    ? `${editingHitl.toolLabel} 도구 호출을 어떻게 수정할지 알려주세요`
                    : '메시지를 입력하세요'
                }
                className="w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none"
                style={{ color: 'var(--client-text)', maxHeight: '160px' }}
              />
            )}
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="text-[11.5px]" style={{ color: 'var(--client-muted-2)' }}>
                {editingHitl
                  ? editingHitl.mode === 'direct'
                    ? '인자를 수정한 뒤 보내기 · Esc로 취소'
                    : 'Enter로 수정 요청 보내기 · Esc로 취소'
                  : ''}
              </div>
              <div className="flex items-center gap-2">
                {!editingHitl && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          void handleFilesSelected(e.target.files)
                          e.target.value = ''
                        }
                      }}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sending || uploading}
                      aria-label="파일 첨부"
                      title="파일 첨부"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-30"
                      style={{
                        borderColor: 'var(--client-border)',
                        background: 'transparent',
                        color: 'var(--client-muted)',
                      }}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              {sending && !editingHitl ? (
                <button
                  onClick={() => void handleStop()}
                  disabled={!threadId}
                  aria-label="응답 중지"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                  style={{ background: 'var(--client-primary)', color: '#ffffff' }}
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : editingHitl ? (
                editingHitl.mode === 'direct' ? (
                  (() => {
                    const hasArgs = Object.keys(editingHitl.initialArgs).length > 0
                    const hasTaskDesc = editingHitl.initialTaskDescription !== undefined
                    const canSubmit = hasArgs || hasTaskDesc
                    return (
                      <button
                        onClick={() => void handleHitlEditSubmitDirect()}
                        disabled={editPreviewing || !canSubmit}
                        aria-label={
                          editPreviewing ? '작업 설명 자동 갱신 중' : '수정 요청 보내기'
                        }
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                        style={{
                          background: canSubmit ? '#0284c7' : 'var(--client-border)',
                          color: canSubmit ? '#ffffff' : 'var(--client-muted)',
                        }}
                      >
                        {editPreviewing ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )
                  })()
                ) : (
                  <button
                    onClick={handleHitlEditSubmit}
                    disabled={!composer.trim() || editPreviewing}
                    aria-label={editPreviewing ? '수정 요청 변환 중' : '수정 요청 보내기'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                    style={{
                      background: composer.trim() ? '#0284c7' : 'var(--client-border)',
                      color: composer.trim() ? '#ffffff' : 'var(--client-muted)',
                    }}
                  >
                    {editPreviewing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </button>
                )
              ) : (
                <button
                  onClick={() => void handleSend()}
                  disabled={!composer.trim() || !threadId}
                  aria-label="전송"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
                  style={{
                    background: composer.trim() ? 'var(--client-primary)' : 'var(--client-border)',
                    color: composer.trim() ? '#ffffff' : 'var(--client-muted)',
                  }}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {todoOpen && plans.length > 0 && (
        <TodoSidePanel
          plans={plans}
          planIdx={Math.min(planIdx, plans.length - 1)}
          activeGroupId={activeGroupId}
          viewedGroupId={viewedGroupId}
          onJumpToGroup={scrollToAssistant}
          onPrev={() => {
            userPickedPlanRef.current = true
            setPlanIdx((i) => {
              const ni = Math.max(0, i - 1)
              const p = plans[ni]
              if (p) setActiveGroupId(p.groupIds[p.groupIds.length - 1] ?? null)
              return ni
            })
          }}
          onNext={() => {
            userPickedPlanRef.current = true
            setPlanIdx((i) => {
              const ni = Math.min(plans.length - 1, i + 1)
              const p = plans[ni]
              if (p) setActiveGroupId(p.groupIds[p.groupIds.length - 1] ?? null)
              return ni
            })
          }}
          onPickIdx={(i) => {
            userPickedPlanRef.current = true
            setPlanIdx(i)
            const p = plans[i]
            if (p) setActiveGroupId(p.groupIds[p.groupIds.length - 1] ?? null)
          }}
          onClose={() => setTodoOpen(false)}
          onAdvance={(text) => {
            setComposer(text)
            requestAnimationFrame(() => {
              const ta = textareaRef.current
              if (!ta) return
              ta.focus()
              const len = ta.value.length
              ta.setSelectionRange(len, len)
            })
          }}
          sending={sending}
          everCompletedAtTurnStart={everCompletedAtTurnStartRef.current}
        />
      )}
      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      {/* MCP 자격증명 인라인 모달 */}
      {mcpCredModal && (
        <McpCredentialModal
          missingCredentials={mcpCredModal.missingCredentials}
          onSuccess={() => {
            const pendingText = mcpCredModal.pendingText
            setMcpCredModal(null)
            // 저장 완료 후 마지막 메시지 자동 재전송
            void handleSendRef.current?.(pendingText, { force: true })
          }}
          onClose={() => setMcpCredModal(null)}
        />
      )}
    </div>
  )
}

function humanizeGmailQuery(q: string): string {
  const trimmed = q.trim()
  if (!trimmed) return '전체 메일'
  const tokens = trimmed.split(/\s+/)
  const out: string[] = []
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (t === 'in:anywhere') out.push('모든 메일함')
    else if (t === 'in:inbox') out.push('받은편지함')
    else if (t === 'in:sent') out.push('보낸편지함')
    else if (t === 'in:drafts') out.push('임시보관함')
    else if (t === 'in:trash') out.push('휴지통')
    else if (t === 'in:spam') out.push('스팸함')
    else if (t === 'is:unread') out.push('읽지 않은 메일')
    else if (t === 'is:starred') out.push('별표 표시된 메일')
    else if (t === 'is:important') out.push('중요 메일')
    else if (t === 'has:attachment') out.push('첨부 있는 메일')
    else if (t.startsWith('from:')) out.push(`보낸이 "${raw.slice(5)}"`)
    else if (t.startsWith('to:')) out.push(`받는이 "${raw.slice(3)}"`)
    else if (t.startsWith('subject:')) out.push(`제목 "${raw.slice(8)}"`)
    else if (t.startsWith('after:')) out.push(`${raw.slice(6)} 이후`)
    else if (t.startsWith('before:')) out.push(`${raw.slice(7)} 이전`)
    else if (t.startsWith('newer_than:')) out.push(`최근 ${raw.slice(11)}`)
    else if (t.startsWith('older_than:')) out.push(`${raw.slice(11)} 이상 지난`)
    else out.push(`"${raw}"`)
  }
  return out.join(' · ')
}

function describeHitlArgs(toolName: string, args: Record<string, unknown>): string[] {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined)

  switch (toolName) {
    case 'gmail_search': {
      const acct = args.user_id === 'me' || !str(args.user_id) ? '내 Gmail' : `${args.user_id} 의 Gmail`
      const where = humanizeGmailQuery(str(args.q))
      const max = num(args.max_results)
      const countText = typeof max === 'number' && max > 0 ? `${max}개` : '여러 개'
      const lines: string[] = [`${acct}의 ${where}에서 메일 ${countText}을 검색합니다.`]
      if (args.include_spam_trash === true) lines.push('스팸·휴지통도 포함됩니다.')
      else if (args.include_spam_trash === false) lines.push('스팸·휴지통은 제외됩니다.')
      return lines
    }
    case 'gmail_fetch': {
      const id = str(args.message_id) || str(args.id)
      return [id ? `메일(ID: ${id})의 본문을 조회합니다.` : 'Gmail 메일 본문을 조회합니다.']
    }
    case 'gmail_fetch_attachment':
      return ['Gmail 메일의 첨부파일을 다운로드합니다.']
    case 'gmail_parse_pdf_attachment':
      return ['Gmail 메일의 PDF 첨부파일을 분석합니다.']
    case 'gmail_send': {
      const to = str(args.to)
      const cc = str(args.cc)
      const bcc = str(args.bcc)
      const subject = str(args.subject)
      const body = str(args.body)
      const lines: string[] = ['다음 내용으로 Gmail 메일을 전송합니다.']
      if (to) lines.push(`받는 사람: ${to}`)
      if (cc) lines.push(`참조: ${cc}`)
      if (bcc) lines.push(`숨은 참조: ${bcc}`)
      if (subject) lines.push(`제목: ${subject}`)
      if (body) lines.push(`본문:\n${body}`)
      return lines
    }
    case 'web_search':
    case 'tavily_search':
    case 'serper_search':
    case 'brave_search': {
      const q = str(args.query) || str(args.q)
      return [q ? `"${q}" 로 웹을 검색합니다.` : '웹 검색을 실행합니다.']
    }
    case 'context7_search_libraries': {
      const name = str(args.library_name)
      const q = str(args.query)
      const lines: string[] = [name ? `Context7 에서 "${name}" 라이브러리를 검색합니다.` : 'Context7 라이브러리를 검색합니다.']
      if (q) lines.push(`보조 키워드: ${q}`)
      return lines
    }
    case 'context7_get_docs': {
      const libId = str(args.library_id)
      const q = str(args.query)
      const lines: string[] = [libId ? `Context7 "${libId}" 의 공식 문서를 조회합니다.` : 'Context7 문서를 조회합니다.']
      if (q) lines.push(`질의: ${q}`)
      return lines
    }
    case 'read_file': {
      const path = str(args.file_path) || str(args.path)
      return [path ? `파일 "${path}" 의 내용을 읽습니다.` : '파일을 읽습니다.']
    }
    case 'write_file': {
      const path = str(args.file_path) || str(args.path)
      const content = str(args.content)
      const lines: string[] = [path ? `파일 "${path}" 을 새로 작성합니다.` : '파일을 새로 작성합니다.']
      if (content) lines.push(`작성할 내용:\n${content}`)
      return lines
    }
    case 'edit_file': {
      const path = str(args.file_path) || str(args.path)
      return [path ? `파일 "${path}" 을 수정합니다.` : '파일을 수정합니다.']
    }
    case 'pdf_parse': {
      const path = str(args.file_path) || str(args.path)
      return [path ? `PDF 문서 "${path}" 를 분석합니다.` : 'PDF 문서를 분석합니다.']
    }
    case 'document_preprocess': {
      const path = str(args.file_path) || str(args.path)
      return [path ? `문서 "${path}" 를 전처리합니다.` : '문서를 전처리합니다.']
    }
    case 'python': {
      const code = str(args.code) || str(args.script)
      const lines: string[] = ['Python 코드를 실행합니다.']
      if (code) lines.push(`실행할 코드:\n${code}`)
      return lines
    }
    case 'task': {
      const desc = str(args.description) || str(args.subagent_type) || str(args.name)
      return [desc ? `서브에이전트(${desc})를 호출합니다.` : '서브에이전트를 호출합니다.']
    }
    case 'current_time':
      return ['현재 시각을 조회합니다.']
    default:
      return []
  }
}


function ClientHitlCard({
  item,
  editing,
  previewing,
  onDecide,
  onEditStart,
  onEditCancel,
}: {
  item: Extract<FeedItem, { kind: 'hitl_request' }>
  editing: boolean
  previewing: boolean
  onDecide: (
    item: Extract<FeedItem, { kind: 'hitl_request' }>,
    decision: 'approve' | 'reject',
  ) => void
  onEditStart: (item: Extract<FeedItem, { kind: 'hitl_request' }>) => void
  onEditCancel: () => void
}) {
  const toolLabel = TOOL_LABEL_KO[item.toolName] ?? item.toolName
  const allowed = item.allowedDecisions.length > 0 ? item.allowedDecisions : ['approve', 'reject']
  const canApprove = allowed.includes('approve')
  const canReject = allowed.includes('reject')
  const argLines = useMemo(
    () => describeHitlArgs(item.toolName, item.toolArgs ?? {}),
    [item.toolName, item.toolArgs],
  )
  const editedArgLines = useMemo(
    () =>
      item.editedAction
        ? describeHitlArgs(item.editedAction.name, item.editedAction.args ?? {})
        : [],
    [item.editedAction],
  )
  const resolved = item.resolved
  const resolvedLabel =
    resolved === 'approve'
      ? '승인됨 — 응답 처리 중…'
      : resolved === 'reject'
        ? '거부됨'
        : resolved === 'edit'
          ? '수정 요청을 전송했습니다…'
          : ''
  const resolvedColor =
    resolved === 'approve' ? '#059669' : resolved === 'edit' ? '#0284c7' : '#dc2626'
  const buttonsDisabled = Boolean(resolved) || previewing

  // Recursion limit 도달 안내 카드 — 일반 HITL 과 분리된 단순 양자택일 UI.
  if (item.recursionLimitReached) {
    const promptText =
      item.recursionPrompt ?? '에이전트가 한도에 도달했습니다. 이어서 더 진행할까요?'
    const nextLimit = item.recursionNextStepLimit
    const continueResolvedLabel =
      resolved === 'approve' ? '응답 처리 중…' : resolved === 'reject' ? '중단했습니다' : ''
    return (
      <div className="flex items-start gap-3">
        <div
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'rgba(245,158,11,0.12)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#d97706',
          }}
        >
          <AlertCircle className="h-4 w-4" />
        </div>
        <div
          className="min-w-0 flex-1 overflow-hidden rounded-2xl border"
          style={{
            borderColor: 'rgba(245,158,11,0.3)',
            background: 'rgba(245,158,11,0.05)',
          }}
        >
          <div className="px-5 py-4">
            <p
              className="text-[14px] font-semibold leading-snug"
              style={{ color: 'var(--client-text)' }}
            >
              {promptText}
            </p>
            {typeof nextLimit === 'number' && (
              <p
                className="mt-1 text-[11.5px]"
                style={{ color: 'var(--client-muted-2)' }}
              >
                다음 한도: {nextLimit} step
              </p>
            )}
            {resolved && (
              <p
                className="mt-2 text-[11.5px] font-semibold"
                style={{ color: resolved === 'approve' ? '#d97706' : '#dc2626' }}
              >
                {continueResolvedLabel}
              </p>
            )}
          </div>
          {!resolved && (
            <div
              className="flex items-center justify-end gap-2 border-t px-4 py-2.5"
              style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'transparent' }}
            >
              <button
                onClick={() => onDecide(item, 'reject')}
                disabled={previewing}
                className="rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40"
                style={{
                  background: 'transparent',
                  border: '1px solid var(--client-border)',
                  color: 'var(--client-text)',
                }}
              >
                그만
              </button>
              <button
                onClick={() => onDecide(item, 'approve')}
                disabled={previewing}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-40"
                style={{ background: '#d97706' }}
              >
                더 진행
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ background: 'var(--client-panel)', border: '1px solid var(--client-border)', color: '#64748b' }}
      >
        <ShieldCheck className="h-4 w-4" />
      </div>
      <div
        className="min-w-0 flex-1 overflow-hidden rounded-2xl border"
        style={{ borderColor: 'var(--client-border)', background: 'var(--client-panel)' }}
      >
        <div className="px-5 py-4">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: '#10b981' }}
              />
              안전
            </span>
            <span className="text-xs" style={{ color: 'var(--client-muted)' }}>
              도구 실행 요청
            </span>
          </div>
          <p
            className="mt-2 text-[15px] font-semibold leading-snug"
            style={{ color: 'var(--client-text)' }}
          >
            에이전트가 {toolLabel} 도구 실행을 요청했습니다.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--client-muted)' }}>
              도구 이름
            </span>
            <code
              className="rounded-md border px-2 py-0.5 font-mono text-xs"
              style={{
                borderColor: 'var(--client-border)',
                background: 'var(--client-bg)',
                color: 'var(--client-text)',
              }}
            >
              {item.toolName}
            </code>
          </div>
          {argLines.length > 0 && (
            <div
              className="mt-3 rounded-xl border px-4 py-3"
              style={{ borderColor: 'var(--client-border)', background: 'var(--client-bg)' }}
            >
              <p
                className="text-[11.5px] font-medium"
                style={{ color: 'var(--client-muted-2)' }}
              >
                이렇게 동작합니다
              </p>
              <div
                className="mt-1.5 space-y-1 text-sm leading-relaxed"
                style={{ color: 'var(--client-text)' }}
              >
                {argLines.map((line, i) => (
                  <p key={i} className="whitespace-pre-wrap break-words">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
          {item.editPrompt && !item.pendingEditFor && (
            <div
              className="mt-3 rounded-xl border px-4 py-3"
              style={{
                borderColor: 'rgba(14,165,233,0.35)',
                background: 'rgba(14,165,233,0.06)',
              }}
            >
              <p
                className="text-[11.5px] font-medium"
                style={{ color: '#0284c7' }}
              >
                사용자의 수정 요청
              </p>
              <p
                className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed"
                style={{ color: 'var(--client-text)' }}
              >
                {item.editPrompt}
              </p>
            </div>
          )}
          {editedArgLines.length > 0 && (
            <div
              className="mt-3 rounded-xl border px-4 py-3"
              style={{
                borderColor: 'rgba(16,185,129,0.35)',
                background: 'rgba(16,185,129,0.06)',
              }}
            >
              <p
                className="text-[11.5px] font-medium"
                style={{ color: '#059669' }}
              >
                수정 후 도구 실행
              </p>
              <div
                className="mt-1.5 space-y-1 text-sm leading-relaxed"
                style={{ color: 'var(--client-text)' }}
              >
                {editedArgLines.map((line, i) => (
                  <p key={i} className="whitespace-pre-wrap break-words">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="text-[11.5px]" style={{ color: 'var(--client-muted)' }}>
              {resolved ? (
                <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: resolvedColor }}>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: resolvedColor }}
                  />
                  {resolvedLabel}
                </span>
              ) : editing ? (
                <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: '#0284c7' }}>
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: '#0284c7' }}
                  />
                  아래에서 수정 입력 중...
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {canReject && (
                <button
                  type="button"
                  disabled={buttonsDisabled}
                  onClick={() => onDecide(item, 'reject')}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: 'rgba(220,38,38,0.4)',
                    color: '#dc2626',
                    background: 'transparent',
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  거부
                </button>
              )}
              <button
                type="button"
                disabled={buttonsDisabled}
                onClick={() =>
                  editing ? onEditCancel() : onEditStart(item)
                }
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: 'rgba(14,165,233,0.55)',
                  color: '#0284c7',
                  background: editing ? 'rgba(14,165,233,0.08)' : 'transparent',
                }}
              >
                <Wrench className="h-3.5 w-3.5" />
                {editing ? '수정 중' : '수정'}
              </button>
              {canApprove && (
                <button
                  type="button"
                  disabled={buttonsDisabled}
                  onClick={() => onDecide(item, 'approve')}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: '#0284c7' }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  승인
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


function UserBubble({ content, ts }: { content: string; ts: number }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%]">
        <div
          className="rounded-2xl px-4 py-3 text-[14px] leading-relaxed"
          style={{ background: 'var(--client-user-bubble)', color: 'var(--client-user-text)' }}
        >
          {content}
        </div>
        <p className="mt-1 text-right text-xs" style={{ color: 'var(--client-muted-2)' }}>
          {formatTime(ts)}
        </p>
      </div>
    </div>
  )
}

function AssistantMessage({
  groupId,
  content,
  done,
  ts,
  agentName,
}: {
  groupId?: string
  content: string
  done: boolean
  ts: number
  agentName: string
}) {
  const html = useMemo(() => (content ? renderMarkdown(content) : ''), [content])
  return (
    <div className="flex items-start gap-3" data-assistant-group-id={groupId ?? undefined}>
      <AgentAvatar agentName={agentName} />
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--client-text)' }}>
            {agentName}
          </span>
          <span className="text-xs" style={{ color: 'var(--client-muted-2)' }}>
            {formatTime(ts)}
          </span>
        </div>
        <div className="text-[14px] leading-relaxed" style={{ color: 'var(--client-text)' }}>
          {content ? (
            <div className="prose-client max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--client-muted)' }}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              응답 생성 중…
            </span>
          )}
          {!done && content && (
            <span
              className="ml-0.5 inline-block h-[14px] w-[2px] animate-pulse align-middle"
              style={{ background: 'var(--client-muted)' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityGroupCard({
  group,
}: {
  group: Extract<FeedItem, { kind: 'group' }>
}) {
  const [open, setOpen] = useState(false)
  const totalSteps = countSteps(group.steps)
  const totalMs = group.completedAt ? group.completedAt - group.startedAt : null
  const running = group.status === 'running'
  const failed = group.status === 'failed'
  const cancelled = !!group.cancelled
  // 취소된 turn 은 step 펼쳐볼 정보가 없으므로 chip 자체를 펼침 비활성 div 로 렌더링.
  const Tag = cancelled ? 'div' : 'button'

  return (
    <div className="flex items-start gap-3">
      {/* 아바타/에이전트 이름 라벨을 제거해 답변(AssistantMessage)과 시각적으로 구분.
          왼쪽 들여쓰기는 답변과 동일하게 맞추기 위한 placeholder. */}
      <span className="h-8 w-8 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 pt-0.5">
        <Tag
          onClick={cancelled ? undefined : () => setOpen((v) => !v)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            running
              ? 'text-blue-600'
              : failed
                ? 'text-red-500'
                : cancelled
                  ? 'text-pink-600'
                  : 'text-gray-600',
          )}
          style={{
            background: running
              ? 'rgba(59,130,246,0.08)'
              : failed
                ? 'rgba(239,68,68,0.08)'
                : cancelled
                  ? 'rgba(244,114,182,0.14)'
                  : 'rgba(0,0,0,0.05)',
          }}
        >
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : failed ? (
            <XCircle className="h-3.5 w-3.5" />
          ) : cancelled ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>
            {running
              ? totalSteps > 0
                ? `${totalSteps}개 작업 진행 중…`
                : '작업 준비 중…'
              : failed
                ? '실행 실패'
                : cancelled
                  ? '취소됨'
                  : `${totalSteps}개 작업 완료`}
            {totalMs !== null && !running && !cancelled && (
              <span className="ml-1 text-xs font-normal opacity-60">{totalMs}ms</span>
            )}
          </span>
          {!cancelled && (open ? (
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          ))}
        </Tag>

        {open && group.steps.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            <StepList nodes={group.steps} depth={0} />
          </div>
        )}
      </div>
    </div>
  )
}

function AgentAvatar({ agentName }: { agentName: string }) {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: 'linear-gradient(135deg, #1a73e8, #7c4dff)' }}
    >
      {agentName.slice(0, 1)}
    </div>
  )
}

function StepList({ nodes, depth }: { nodes: StepNode[]; depth: number }) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <StepRow key={node.id} node={node} depth={depth} />
      ))}
    </div>
  )
}

function StepRow({ node, depth }: { node: StepNode; depth: number }) {
  const [open, setOpen] = useState(false)
  const hasChildren = node.children.length > 0
  const kind = stepKind(node.name, node.stepType)
  const label = stepLabel(node.name)

  const isTask = kind === 'agent'
  const Icon = isTask || kind === 'model' ? Bot : Wrench

  const isRunning = node.status === 'running'
  const isDone = node.status === 'done'
  const isFailed = node.status === 'failed'

  let borderStyle = 'border border-transparent'
  let bgStyle = 'bg-black/[0.025]'
  let textColor = 'var(--client-text)'
  let iconColor = 'text-gray-400'

  if (isTask) {
    iconColor = 'text-purple-500'
    if (isRunning) {
      borderStyle = 'border border-purple-400/70 shadow-sm'
      bgStyle = 'bg-purple-500/[0.06]'
    } else if (isDone) {
      borderStyle = 'border border-purple-500/25 shadow-sm'
      bgStyle = 'bg-purple-500/[0.02]'
    } else if (isFailed) {
      borderStyle = 'border border-red-500/25 shadow-sm'
      bgStyle = 'bg-red-500/[0.02]'
    } else {
      borderStyle = 'border border-purple-200/40'
      bgStyle = 'bg-purple-500/[0.005]'
    }
  } else {
    if (kind === 'model') {
      iconColor = 'text-amber-500'
    }
    
    if (isRunning) {
      borderStyle = 'border border-blue-400/70 shadow-sm'
      bgStyle = 'bg-blue-500/[0.04]'
    } else if (isDone) {
      borderStyle = 'border border-emerald-500/20 shadow-sm'
      bgStyle = 'bg-emerald-500/[0.015]'
    } else if (isFailed) {
      borderStyle = 'border border-red-500/20 shadow-sm'
      bgStyle = 'bg-red-500/[0.015]'
    } else {
      bgStyle = 'bg-black/[0.015]'
    }
  }

  return (
    <div style={{ marginLeft: depth * 16 }} className="transition-all duration-200">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11.5px] transition-all",
          borderStyle,
          bgStyle
        )}
        style={{ color: textColor }}
      >
        {hasChildren ? (
          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 transition-transform duration-200"
            style={{ color: 'var(--client-muted)' }}
            aria-label={open ? '접기' : '펼치기'}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={cn('h-3.5 w-3.5 shrink-0', iconColor)} />
        <span className={cn("flex-1 truncate", isTask && "font-semibold")} style={{ color: 'var(--client-muted)' }}>
          {label}
        </span>

        {isTask && hasChildren && (
          <span className="inline-flex h-4 items-center justify-center rounded bg-purple-500/10 px-1 py-0.5 text-xs font-bold text-purple-700 tabular-nums">
            하위 {node.children.length}
          </span>
        )}

        {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
        {isDone && (
          <span className="flex items-center gap-1 text-green-600">
            {node.latencyMs ? <span className="text-xs opacity-70">{node.latencyMs}ms</span> : null}
            <CheckCircle2 className="h-3 w-3" />
          </span>
        )}
        {isFailed && (
          <span className="flex items-center gap-1 text-red-500">
            {node.latencyMs ? <span className="text-xs opacity-70">{node.latencyMs}ms</span> : null}
            <XCircle className="h-3 w-3" />
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div className="mt-0.5 space-y-0.5">
          <StepList nodes={node.children} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}

function EmptyComposer({
  agentName,
  starters,
  onPick,
}: {
  agentName: string
  starters: string[]
  onPick: (t: string) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white"
        style={{ background: 'linear-gradient(135deg, #1a73e8, #7c4dff)' }}
      >
        <Sparkles className="h-7 w-7" />
      </div>
      <p className="mb-1 text-[18px] font-semibold" style={{ color: 'var(--client-text)' }}>
        {agentName}에게 물어보세요
      </p>
      <p className="mb-6 text-sm" style={{ color: 'var(--client-muted)' }}>
        무엇이든 도와드릴 수 있습니다
      </p>
      {starters.length > 0 && (
        <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
          {starters.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="rounded-2xl border px-4 py-3 text-left text-sm transition-colors"
              style={{
                borderColor: 'var(--client-border)',
                background: 'var(--client-panel)',
                color: 'var(--client-text)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--client-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--client-border)'
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TodoSidePanel({
  plans,
  planIdx,
  activeGroupId,
  viewedGroupId,
  onPrev,
  onNext,
  onPickIdx,
  onClose,
  onAdvance,
  onJumpToGroup,
  sending = false,
  everCompletedAtTurnStart,
}: {
  plans: PlanEntry[]
  planIdx: number
  activeGroupId: string | null
  viewedGroupId: string | null
  onPrev: () => void
  onNext: () => void
  onPickIdx: (idx: number) => void
  onClose: () => void
  onAdvance?: (text: string) => void
  onJumpToGroup?: (groupId: string) => void
  sending?: boolean
  everCompletedAtTurnStart?: Set<string>
}) {
  const active = plans[planIdx]
  if (!active) return null
  const total = plans.length
  // 보고 있는 turn(activeGroupId) 의 snapshot 이 있으면 그 시점 상태로 렌더링,
  // 없으면 최신 steps 로 fallback.
  const rawActiveSteps =
    (activeGroupId && active.snapshotsByGroup[activeGroupId]) ||
    active.snapshotsByGroup[active.groupIds[active.groupIds.length - 1] ?? ''] ||
    active.steps
  // "한 번 완료된 항목은 다시 미완료로 풀리지 않게" — 같은 plan 의 어느 snapshot 에서든
  // 한 번이라도 completed 였던 항목은 어느 스냅샷(과거·현재·미래)을 보든 completed 로 표시한다.
  // 모델이 후속 turn 에서 동일 항목을 pending/in_progress 로 잘못 되돌리는 경우도 막는다.
  const everCompletedByContent = new Map<string, true>()
  for (const gid of active.groupIds) {
    const snap = active.snapshotsByGroup[gid] ?? []
    for (const s of snap) {
      if (s.status === 'completed') everCompletedByContent.set(s.content, true)
    }
  }
  for (const s of active.steps) {
    if (s.status === 'completed') everCompletedByContent.set(s.content, true)
  }
  const activeSteps: TodoStep[] = rawActiveSteps.map((s) =>
    s.status !== 'completed' && everCompletedByContent.get(s.content)
      ? { ...s, status: 'completed' as const }
      : s,
  )
  // 각 TODO 항목(content)이 "처음 completed 가 된" turn(groupId) 매핑.
  // 클릭 시 그 turn 의 답변 위치로 점프, 현재 보고 있는 turn 의 신규 완료 항목을 하이라이트할 때 사용.
  const completedAtGroupByContent = new Map<string, string>()
  for (const gid of active.groupIds) {
    const snap = active.snapshotsByGroup[gid] ?? []
    for (const s of snap) {
      if (s.status === 'completed' && !completedAtGroupByContent.has(s.content)) {
        completedAtGroupByContent.set(s.content, gid)
      }
    }
  }
  const highlightedGid = viewedGroupId ?? activeGroupId ?? null
  const completed = activeSteps.filter((s) => s.status === 'completed').length
  const totalSteps = activeSteps.length
  const nextPendingIdx = activeSteps.findIndex((s) => s.status !== 'completed')
  const nextPending = nextPendingIdx >= 0 ? activeSteps[nextPendingIdx] : null
  // 스트리밍 중이고 모델이 아직 in_progress 마킹을 보내지 않은 경우, 첫 미완료 항목에
  // 클라이언트 사이드 hint(WORKING...)를 표시한다. write_todos가 도착해 진짜 상태가
  // 갱신되면 그 쪽이 우선 적용된다.
  const hasInProgress = activeSteps.some((s) => s.status === 'in_progress')
  const isLatestPlan = planIdx === total - 1
  // 모델이 현재 turn 에서 이미 completed 로 마킹한 항목 중 마지막 것을 working target 으로 본다.
  // (예: Quick Action 으로 1일차를 진행 중인데 모델이 1일차를 미리 completed 로 마킹한 케이스에서
  //  "다음 pending" 으로 WORKING 이 잘못 옮겨가는 것을 방지.)
  // turn 시작 시점에 freeze 된 ever-completed snapshot 을 기준으로, 그 시점 이미 완료로 보였던
  // 항목은 후보에서 영구 배제. snapshot 누락(plan.created 미emit 등)에도 robust.
  const currentTurnGid = active.groupIds[active.groupIds.length - 1] ?? null
  const frozenEverCompleted = everCompletedAtTurnStart ?? new Set<string>()
  let workingTargetIdx = -1
  if (sending && isLatestPlan && currentTurnGid) {
    for (let i = 0; i < activeSteps.length; i++) {
      const s = activeSteps[i]
      if (s.status === 'completed' && !frozenEverCompleted.has(s.content)) {
        workingTargetIdx = i
      }
    }
  }
  const streamingHintIdx =
    sending && isLatestPlan && !hasInProgress
      ? workingTargetIdx >= 0
        ? workingTargetIdx
        : nextPendingIdx >= 0
          ? nextPendingIdx
          : -1
      : -1
  const showAdvance =
    !sending && !!onAdvance && !!nextPending && completed < totalSteps && isLatestPlan

  return (
    <aside className="pointer-events-auto absolute bottom-28 right-5 z-30 flex max-h-[calc(100%-9rem)] w-[400px] flex-col overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100">
            <CheckSquare className="h-5 w-5 text-emerald-600" />
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">TO-DO List</h3>
            <p className="mt-0.5 text-[11.5px] text-gray-500">
              <span className="font-semibold text-gray-700 tabular-nums">
                {planIdx + 1} / {total}
              </span>
              <span className="mx-1 text-gray-300">·</span>
              TodoListMiddleware 결과
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold tracking-wider text-gray-500">TODO 항목</span>
        <div className="flex items-center gap-2">
          <RingProgress completed={completed} total={totalSteps} />
          <span className="text-sm font-bold tabular-nums text-gray-900">
            {completed}
            <span className="text-gray-400">/{totalSteps}</span>
          </span>
        </div>
      </div>

      <ul className="space-y-2">
        {activeSteps.map((step, i) => {
          const completedAt = completedAtGroupByContent.get(step.content) ?? null
          const isCurrent = !!completedAt && !!highlightedGid && completedAt === highlightedGid
          return (
            <TodoSidePanelRow
              key={i}
              step={step}
              index={i}
              streamingHint={i === streamingHintIdx}
              isCurrent={isCurrent}
              onJump={completedAt && onJumpToGroup ? () => onJumpToGroup(completedAt) : undefined}
            />
          )
        })}
      </ul>

      {showAdvance && nextPending && (
        <button
          type="button"
          onClick={() => onAdvance?.(`다음 TODO 항목을 이어서 진행해줘 — ${nextPending.content}`)}
          className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-left text-[12.5px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 font-bold tabular-nums text-emerald-700">
              {String(nextPendingIdx + 1).padStart(2, '0')}
            </span>
            <span className="truncate text-emerald-900">{nextPending.content}</span>
          </span>
          <span className="shrink-0 text-emerald-600">이어서 진행 →</span>
        </button>
      )}

      {total > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
          <button
            onClick={onPrev}
            disabled={planIdx === 0}
            className="flex items-center gap-1 text-[12.5px] font-medium text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-gray-500"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            이전
          </button>
          <div className="flex items-center gap-0.5 rounded-full border border-gray-200 bg-white p-1">
            {plans.map((_, i) =>
              i === planIdx ? (
                <span
                  key={i}
                  className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold tabular-nums text-white"
                >
                  {i + 1}
                </span>
              ) : (
                <button
                  key={i}
                  onClick={() => onPickIdx(i)}
                  className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums text-gray-400 transition-colors hover:text-gray-600"
                >
                  {i + 1}
                </button>
              ),
            )}
          </div>
          <button
            onClick={onNext}
            disabled={planIdx === total - 1}
            className="flex items-center gap-1 text-[12.5px] font-medium text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-gray-500"
          >
            다음
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </aside>
  )
}

function RingProgress({ completed, total }: { completed: number; total: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const ratio = total > 0 ? completed / total : 0
  const dash = c * ratio
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r={r} stroke="#e5e7eb" strokeWidth="2" fill="none" />
      <circle
        cx="11"
        cy="11"
        r={r}
        stroke="#10b981"
        strokeWidth="2"
        fill="none"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 11 11)"
      />
    </svg>
  )
}

function TodoSidePanelRow({
  step,
  index,
  streamingHint = false,
  isCurrent = false,
  onJump,
}: {
  step: TodoStep
  index: number
  streamingHint?: boolean
  isCurrent?: boolean
  onJump?: () => void
}) {
  // streamingHint 가 true 인 동안에는 step.status 가 completed 더라도 시각적으로 in_progress
  // (spinner + WORKING) 로 표시한다. 모델이 답변 streaming 중 미리 completed 로 마킹한 항목을
  // "현재 작업 중" 으로 보여주기 위함이다. streaming 이 끝나면(streamingHint=false) 다시
  // 정상 completed 시각으로 돌아간다.
  const isWorking = streamingHint
  const isDone = !isWorking && step.status === 'completed'
  const isActive = isWorking || step.status === 'in_progress'
  // 현재 보기 시각은 working 상태와 겹치지 않게 — 작업 중일 땐 WORKING 만, 끝났을 땐 현재 보기.
  const showCurrent = isCurrent && !isWorking
  const clickable = !!onJump
  const rowClass = cn(
    'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors',
    clickable && 'cursor-pointer hover:bg-emerald-50/40',
    // 베이스 배경 — 완료/진행/펜딩 시각은 showCurrent 와 무관하게 유지
    isWorking
      ? 'bg-emerald-50/40'
      : isActive
        ? 'bg-emerald-50/50'
        : isDone
          ? 'bg-gray-50'
          : 'bg-white',
    // 테두리 — 현재 보기일 때만 굵게 + 외곽 발광, 그 외는 기본
    showCurrent
      ? 'border-2 border-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.18)] ring-1 ring-emerald-300/50'
      : isWorking || isActive
        ? 'border border-emerald-400'
        : isDone
          ? 'border border-gray-100'
          : 'border border-gray-200',
  )
  const inner = (
    <>
      {isWorking ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-emerald-400 bg-emerald-50">
          <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
        </span>
      ) : isDone ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
      ) : isActive ? (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-500">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </span>
      ) : (
        <span className="h-5 w-5 shrink-0 rounded-md border-2 border-gray-300" />
      )}
      <span
        className={cn(
          'flex-1 text-[13.5px]',
          isWorking
            ? 'font-semibold text-gray-900'
            : isDone
              ? 'text-gray-400 line-through'
              : isActive
                ? 'font-semibold text-gray-900'
                : 'text-gray-700',
        )}
      >
        {step.content}
      </span>
      {isWorking ? (
        <span className="flex items-center gap-1 text-[11.5px] font-bold text-emerald-600">
          <Loader2 className="h-3 w-3 animate-spin" />
          WORKING
        </span>
      ) : isActive ? (
        <span className="flex items-center gap-1 text-[11.5px] font-bold text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          NOW
        </span>
      ) : showCurrent ? (
        <span className="text-[10.5px] font-bold tracking-wider text-emerald-600">현재 보기</span>
      ) : !isDone ? (
        <span className="text-xs font-bold tabular-nums text-gray-300">
          {String(index + 1).padStart(2, '0')}
        </span>
      ) : null}
    </>
  )
  return (
    <li>
      {clickable ? (
        <button
          type="button"
          onClick={onJump}
          title="이 항목이 완료된 답변 위치로 이동"
          className={rowClass}
        >
          {inner}
        </button>
      ) : (
        <div className={rowClass}>{inner}</div>
      )}
    </li>
  )
}

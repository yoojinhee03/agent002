'use client'

/**
 * HITL 전용 React 슬롯 컴포넌트.
 *
 * AC payload 가 표현하지 못하는 도구 스키마 의존 UI 를 모아둔다:
 *  - 가변 인자 표시/편집 (typeof 기반 introspection + 선택적 argSchema)
 *  - NL preview 2-step 흐름
 *  - recursion limit variant (amber early-return)
 *  - taskDescription (subagent) 편집
 *
 * agent002-sub `HitlApprovalCard` JSX 를 픽셀 단위로 복원.
 */

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { AlertCircle, Loader2, Minus, Plus, Zap } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { useToolStore } from '@/stores/use-tool-store'
import {
  ARG_LABELS,
  TOOL_DISPLAY_NAMES,
  applyHideOrder,
  buildDirectEditFollowup,
  flattenLeaves,
  formatArgValue,
  inferWidgetFromValue,
  parseArgValue,
  pushArrayItem,
  removeArrayItem,
  resetLeafValues,
  setByPath,
  walkArgs,
  type FieldNode,
  type LabelSources,
} from '../hitl-helpers'
import type {
  AcCustomHitlArgsEditor,
  AcCustomHitlArgsView,
  AcCustomHitlHeader,
} from './types'

/** 카드 메타에서 슬롯이 인자 표현을 통제할 때 쓰는 스키마. */
export interface HitlArgFieldSchema {
  key: string
  label?: string
  widget?: 'input' | 'textarea' | 'number' | 'switch' | 'select' | 'json'
  helper?: string
  required?: boolean
  default?: unknown
  choices?: { title: string; value: string }[]
}

/** HitlAcCard → 슬롯이 공유하는 컨텍스트. AcRenderCtx 와는 별도 (HITL 전용). */
export interface HitlSlotContext {
  interactionId: string
  toolName: string
  toolArgs: Record<string, unknown>
  allowedDecisions: string[]
  resolved?: 'approve' | 'reject' | 'edit'
  parentTaskDescription?: string
  recursionLimitReached?: boolean
  recursionPrompt?: string
  recursionNextStepLimit?: number
  argSchema?: HitlArgFieldSchema[] | null
  /** 도구 사전 (PR3 에서 주입). 카드 element labelsOverride 보다 낮은 우선순위. */
  toolLabels?: Record<string, string>
  mode: 'runtime' | 'preview'
  editMode: 'none' | 'direct' | 'nl'
  setEditMode: (m: 'none' | 'direct' | 'nl') => void
  onDecide?: (decision: 'approve' | 'reject') => void
  onEditSubmit?: (
    editedArgs: Record<string, unknown>,
    editPrompt: string,
    taskDescriptionUpdate?: string,
  ) => void
  /** hitl-choice 흐름 — 사용자가 라디오에서 선택한 값. approve 시 함께 송신. */
  choiceValue?: string | null
  setChoiceValue?: (v: string | null) => void
  /** cardData 의 prompt/choices 를 슬롯 사이 공유. */
  choiceMeta?: { prompt?: string; choices?: { title: string; value: string }[] }
}

// ============================================================
// HitlSlotCtx — render.tsx 의 Custom.* 디스패치가 lookup 하는 context
// ============================================================

const HitlSlotCtxImpl = createContext<HitlSlotContext | null>(null)

export function HitlSlotCtxProvider({
  value,
  children,
}: {
  value: HitlSlotContext
  children: React.ReactNode
}) {
  return <HitlSlotCtxImpl.Provider value={value}>{children}</HitlSlotCtxImpl.Provider>
}

export function useHitlSlotCtx(): HitlSlotContext {
  const v = useContext(HitlSlotCtxImpl)
  if (!v) throw new Error('Custom.Hitl* 슬롯은 HitlSlotCtxProvider 안에서만 렌더 가능합니다')
  return v
}

// ============================================================
// Custom.HitlHeader — 좌측 ShieldCheck 아이콘 + 본문 카드 외곽
// (실제로 외곽 wrapping 은 HitlAcCard 가 담당. 이 컴포넌트는 헤더 영역만)
// ============================================================

export function HitlHeaderSlot({
  ctx,
  overrides,
}: {
  ctx: HitlSlotContext
  overrides?: AcCustomHitlHeader
}) {
  const displayNames = useToolStore((s) => s.builtinDisplayNames)
  const toolDisplayName =
    overrides?.toolLabelOverride ??
    TOOL_DISPLAY_NAMES[ctx.toolName] ??
    displayNames[ctx.toolName] ??
    ctx.toolName
  const title = overrides?.title?.trim()
  return (
    <div className="px-4 pt-3 pb-3">
      {title ? (
        <p className="text-sm font-semibold text-fg leading-relaxed whitespace-pre-wrap">
          {title}
        </p>
      ) : (
        <p className="text-sm font-semibold text-fg leading-relaxed">
          에이전트가 <span className="text-sky-300">{toolDisplayName}</span> 도구를 실행하려 합니다.
          허용하시겠습니까?
        </p>
      )}
      <p className="mt-1 text-xs text-fg-subtle font-mono">도구 이름: {ctx.toolName}</p>
    </div>
  )
}

// ============================================================
// Custom.HitlArgsView — 읽기 모드 인자 표시 (재귀 트리)
// ============================================================

/** argSchema → 라벨 사전 변환 (top-level key 만). */
function argSchemaToLabels(schema: HitlArgFieldSchema[] | null | undefined): Record<string, string> {
  const m: Record<string, string> = {}
  for (const f of schema ?? []) {
    if (f.label) m[f.key] = f.label
  }
  return m
}

function buildLabelSources(
  overrides:
    | {
        labelsOverride?: Record<string, string>
        fields?: Array<{ path: string; label?: string }>
      }
    | undefined,
  ctx: HitlSlotContext,
): LabelSources {
  const schemaLabels = argSchemaToLabels(ctx.argSchema)
  // 슬롯의 fields[].label 도 동일 사전 채널로 흘려보내 root argSchema 라벨을 override.
  const slotFieldLabels: Record<string, string> = {}
  for (const f of overrides?.fields ?? []) {
    if (f.label) slotFieldLabels[f.path] = f.label
  }
  return {
    override: overrides?.labelsOverride,
    tool: {
      ...(ctx.toolLabels ?? {}),
      ...schemaLabels,
      ...slotFieldLabels,
    },
  }
}

/** leaf 값이 비었는지(undefined/null/'') 검사. 빈 group(자식 모두 비움)도 제거. */
function pruneEmpty(nodes: FieldNode[]): FieldNode[] {
  const out: FieldNode[] = []
  for (const n of nodes) {
    if (n.kind === 'leaf') {
      const v = n.value
      if (v === undefined || v === null || v === '') continue
      out.push(n)
    } else {
      const kids = pruneEmpty(n.children ?? [])
      if (kids.length === 0) continue
      out.push({ ...n, children: kids })
    }
  }
  return out
}

/**
 * argSchema 와 slot overrides.fields 를 합쳐 path 기준 Map 으로 변환.
 * 우선순위: overrides.fields[].* > ctx.argSchema (slot 의 명시 설정이 우선).
 */
function mergedFieldMap(
  schema: HitlArgFieldSchema[] | null | undefined,
  overrideFields: Array<{
    path: string
    label?: string
    required?: boolean
    widget?: HitlArgFieldSchema['widget']
    helper?: string
    choices?: HitlArgFieldSchema['choices']
  }> | undefined,
): Map<string, HitlArgFieldSchema> {
  const m = new Map<string, HitlArgFieldSchema>()
  for (const f of schema ?? []) m.set(f.key, f)
  for (const f of overrideFields ?? []) {
    const base = m.get(f.path) ?? { key: f.path }
    m.set(f.path, {
      ...base,
      ...(f.label !== undefined ? { label: f.label } : {}),
      ...(f.required !== undefined ? { required: f.required } : {}),
      ...(f.widget !== undefined ? { widget: f.widget } : {}),
      ...(f.helper !== undefined ? { helper: f.helper } : {}),
      ...(f.choices !== undefined ? { choices: f.choices } : {}),
    })
  }
  return m
}

const WIDGET_LABEL: Record<NonNullable<HitlArgFieldSchema['widget']> | 'default', string> = {
  input: 'TEXT',
  textarea: 'TEXT',
  number: 'NUM',
  switch: 'BOOL',
  select: 'ENUM',
  json: 'JSON',
  default: '',
}

function TypeBadge({ widget }: { widget?: HitlArgFieldSchema['widget'] }) {
  const label = WIDGET_LABEL[widget ?? 'default']
  if (!label) return null
  return (
    <span className="rounded border border-border bg-bg/40 px-1 py-px text-[9px] font-medium uppercase tracking-wider text-fg-subtle">
      {label}
    </span>
  )
}

export function HitlArgsViewSlot({
  ctx,
  overrides,
}: {
  ctx: HitlSlotContext
  overrides?: AcCustomHitlArgsView
}) {
  const sources = useMemo(() => buildLabelSources(overrides, ctx), [overrides, ctx])
  const tree = useMemo(() => {
    const raw = walkArgs(ctx.toolArgs, sources)
    return pruneEmpty(applyHideOrder(raw, overrides?.hide, overrides?.order))
  }, [ctx.toolArgs, sources, overrides?.hide, overrides?.order])
  const schemaMap = useMemo(
    () => mergedFieldMap(ctx.argSchema, overrides?.fields),
    [ctx.argSchema, overrides?.fields],
  )

  if (tree.length === 0) return null
  if (ctx.editMode !== 'none') return null
  return (
    <div className="mx-4 -mt-1 mb-3 space-y-1 rounded-lg border border-sky-500/20 bg-bg/40 px-3 py-2">
      <p className="text-xs font-semibold text-fg-subtle uppercase tracking-wide">실행 인자</p>
      {tree.map((node) => (
        <ViewNode key={node.path} node={node} schemaMap={schemaMap} />
      ))}
    </div>
  )
}

function ViewNode({
  node,
  schemaMap,
}: {
  node: FieldNode
  schemaMap: Map<string, HitlArgFieldSchema>
}) {
  const indent = node.depth > 0 ? { paddingLeft: `${node.depth * 12}px` } : undefined
  const meta = schemaMap.get(node.templatePath)
  if (node.kind === 'leaf') {
    return (
      <div className="flex items-start gap-2 text-xs leading-relaxed" style={indent}>
        <span className="flex shrink-0 items-center gap-1 text-fg-subtle">
          {node.label}
          {meta?.required && <span className="text-red-400">*</span>}
          <TypeBadge widget={meta?.widget} />
          <span>:</span>
        </span>
        <span className="flex-1 break-all text-fg font-mono">{formatArgValue(node.value)}</span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-semibold text-fg pt-0.5" style={indent}>
        {node.label}
        {meta?.required && <span className="text-red-400">*</span>}
      </div>
      {(node.children ?? []).map((c) => (
        <ViewNode key={c.path} node={c} schemaMap={schemaMap} />
      ))}
    </div>
  )
}

// ============================================================
// Custom.HitlArgsEditor — 편집 모드 (direct / nl) — 재귀 트리
// ============================================================

type EditorWidget = NonNullable<HitlArgFieldSchema['widget']>

function helperFor(widget: EditorWidget, custom?: string): string {
  if (custom) return custom
  if (widget === 'switch') return '예 / 아니오'
  if (widget === 'number') return '숫자'
  if (widget === 'json') return 'JSON 형식'
  return ''
}

export function HitlArgsEditorSlot({
  ctx,
  overrides,
}: {
  ctx: HitlSlotContext
  overrides?: AcCustomHitlArgsEditor
}) {
  const sources = useMemo(() => buildLabelSources(overrides, ctx), [overrides, ctx])
  // 구조 변경(배열 +/-)을 위해 ctx.toolArgs 를 mutable copy 로 보관.
  const [editedArgs, setEditedArgs] = useState<Record<string, unknown>>(() =>
    JSON.parse(JSON.stringify(ctx.toolArgs ?? {})),
  )
  const tree = useMemo(
    () => applyHideOrder(walkArgs(editedArgs, sources), overrides?.hide, overrides?.order),
    [editedArgs, sources, overrides?.hide, overrides?.order],
  )
  const leaves = useMemo(() => flattenLeaves(tree), [tree])

  const widgetMap = useMemo(() => {
    const schemaMap = new Map<string, EditorWidget>()
    for (const f of ctx.argSchema ?? []) {
      if (f.widget) schemaMap.set(f.key, f.widget)
    }
    const fieldOverrideMap = new Map<string, EditorWidget>()
    for (const f of overrides?.fields ?? []) {
      if (f.widget) fieldOverrideMap.set(f.path, f.widget)
    }
    return (node: FieldNode): EditorWidget =>
      fieldOverrideMap.get(node.templatePath) ??
      schemaMap.get(node.templatePath) ??
      inferWidgetFromValue(node.value)
  }, [ctx.argSchema, overrides?.fields])

  const helperMap = useMemo(() => {
    const schemaHelpers = new Map<string, string>()
    for (const f of ctx.argSchema ?? []) {
      if (f.helper) schemaHelpers.set(f.key, f.helper)
    }
    const fieldHelpers = new Map<string, string>()
    for (const f of overrides?.fields ?? []) {
      if (f.helper) fieldHelpers.set(f.path, f.helper)
    }
    return (node: FieldNode) =>
      fieldHelpers.get(node.templatePath) ?? schemaHelpers.get(node.templatePath)
  }, [ctx.argSchema, overrides?.fields])

  const requiredMap = useMemo(() => {
    const set = new Set<string>()
    for (const f of ctx.argSchema ?? []) if (f.required) set.add(f.key)
    for (const f of overrides?.fields ?? []) {
      if (f.required) set.add(f.path)
      else if (f.required === false) set.delete(f.path)
    }
    return (node: FieldNode) => set.has(node.templatePath)
  }, [ctx.argSchema, overrides?.fields])

  const hasSubAgentContext = ctx.parentTaskDescription !== undefined
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [taskDescDraft, setTaskDescDraft] = useState<string>(ctx.parentTaskDescription ?? '')
  const [nlText, setNlText] = useState('')
  const [nlPreviewing, setNlPreviewing] = useState(false)
  const [nlPreview, setNlPreview] = useState<{
    args: Record<string, unknown>
    taskDescriptionUpdate?: string
  } | null>(null)

  useEffect(() => {
    if (ctx.editMode === 'direct') {
      setEditedArgs(JSON.parse(JSON.stringify(ctx.toolArgs ?? {})))
      setDraft({})
      setTaskDescDraft(ctx.parentTaskDescription ?? '')
    }
    if (ctx.editMode === 'nl') {
      setNlText('')
      setNlPreview(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.editMode])

  // editedArgs 가 바뀔 때마다 신규 leaf 의 draft 만 채워준다 (기존 draft 보존).
  useEffect(() => {
    if (ctx.editMode !== 'direct') return
    setDraft((prev) => {
      const next = { ...prev }
      for (const leaf of leaves) {
        if (next[leaf.path] !== undefined) continue
        const v = leaf.value
        if (typeof v === 'string') next[leaf.path] = v
        else if (v === null || v === undefined) next[leaf.path] = ''
        else if (typeof v === 'object') next[leaf.path] = JSON.stringify(v, null, 2)
        else next[leaf.path] = String(v)
      }
      return next
    })
  }, [leaves, ctx.editMode])

  // 배열 항목 추가 — 기존 첫 항목을 템플릿으로 사용하고 leaf 값만 빈 placeholder 로 리셋.
  const handleAddItem = (arrayPath: string, arrayValue: unknown[]) => {
    let template: unknown
    if (arrayValue.length > 0) {
      template = resetLeafValues(arrayValue[0])
    } else {
      // argSchema 에서 prefix 매칭으로 객체 skeleton 시도. 없으면 빈 문자열.
      const prefix = `${arrayPath.replace(/\[\d+\]/g, '[*]')}[*].`
      const subFields = (ctx.argSchema ?? []).filter((f) => f.key.startsWith(prefix))
      if (subFields.length > 0) {
        const obj: Record<string, unknown> = {}
        for (const f of subFields) {
          const sub = f.key.slice(prefix.length)
          if (sub.includes('.') || sub.includes('[')) continue
          if (f.widget === 'switch') obj[sub] = false
          else if (f.widget === 'number') obj[sub] = 0
          else obj[sub] = ''
        }
        template = obj
      } else {
        template = ''
      }
    }
    setEditedArgs((prev) => pushArrayItem(prev, arrayPath, template))
  }

  const handleRemoveItem = (itemPath: string) => {
    setEditedArgs((prev) => removeArrayItem(prev, itemPath))
    setDraft((prev) => {
      const prefix = itemPath
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${prefix}[`)) continue
        next[k] = v
      }
      return next
    })
  }

  if (ctx.editMode === 'none') return null

  const cancelEditing = () => {
    ctx.setEditMode('none')
    setNlPreview(null)
  }

  // ---------- 직접 수정 ----------
  if (ctx.editMode === 'direct') {
    const submitDirect = () => {
      let nextArgs = JSON.parse(JSON.stringify(editedArgs)) as Record<string, unknown>
      for (const leaf of leaves) {
        const raw = draft[leaf.path] ?? ''
        const widget = widgetMap(leaf)
        let val: unknown
        if (widget === 'switch') {
          if (typeof leaf.value === 'boolean') {
            const low = raw.trim().toLowerCase()
            val = ['true', 'on', '예', 'yes', '1'].includes(low)
          } else {
            val = raw
          }
        } else {
          val = parseArgValue(leaf.value, raw)
        }
        nextArgs = setByPath(nextArgs, leaf.path, val)
      }
      const initialDescTrim = (ctx.parentTaskDescription ?? '').trim()
      const draftDescTrim = taskDescDraft.trim()
      const descChanged =
        hasSubAgentContext && draftDescTrim.length > 0 && draftDescTrim !== initialDescTrim
      const argsChanged = JSON.stringify(ctx.toolArgs) !== JSON.stringify(nextArgs)
      const editPrompt =
        argsChanged || descChanged
          ? buildDirectEditFollowup(
              ctx.toolArgs,
              nextArgs,
              descChanged ? draftDescTrim : undefined,
            )
          : '(직접 수정 — 변경 없음)'
      if (ctx.mode === 'preview') {
        toast.info('미리보기 모드 — 제출 생략')
        ctx.setEditMode('none')
        return
      }
      ctx.setEditMode('none')
      ctx.onEditSubmit?.(nextArgs, editPrompt, descChanged ? draftDescTrim : undefined)
    }

    return (
      <>
        <div className="mx-4 -mt-1 mb-3 space-y-3 rounded-lg border border-sky-500/30 bg-bg/60 px-3 py-3">
          <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide">인자 수정</p>
          {hasSubAgentContext && (
            <div className="space-y-1">
              <label className="text-xs text-fg font-semibold">상위 SubAgent 작업 설명</label>
              <textarea
                rows={2}
                value={taskDescDraft}
                onChange={(e) => setTaskDescDraft(e.target.value)}
                className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg focus:border-sky-500/60 focus:outline-none"
              />
            </div>
          )}
          {leaves.length === 0 && (
            <p className="text-xs text-fg-subtle">수정할 인자가 없습니다.</p>
          )}
          {tree.map((node) => (
            <EditorNode
              key={node.path}
              node={node}
              draft={draft}
              setDraft={setDraft}
              widgetMap={widgetMap}
              helperMap={helperMap}
              requiredMap={requiredMap}
              onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem}
            />
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-sky-500/20 px-3 py-2 bg-bg/40">
          <button
            onClick={cancelEditing}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-surface-2 transition-colors"
          >
            취소
          </button>
          <button
            onClick={submitDirect}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-colors"
          >
            수정하고 실행
          </button>
        </div>
      </>
    )
  }

  // ---------- NL 수정 ----------
  const handlePreviewNl = async () => {
    const text = nlText.trim()
    if (!text || nlPreviewing) return
    if (ctx.mode === 'preview') {
      setNlPreview({ args: ctx.toolArgs })
      toast.info('미리보기 모드 — LLM 호출 없이 원래 인자로 표시')
      return
    }
    setNlPreviewing(true)
    try {
      const preview = await apiClient.hitl.previewEdit(ctx.interactionId, text)
      const tdu =
        typeof preview.taskDescriptionUpdate === 'string' &&
        preview.taskDescriptionUpdate.trim().length > 0
          ? preview.taskDescriptionUpdate.trim()
          : undefined
      setNlPreview({ args: preview.args, taskDescriptionUpdate: tdu })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '자연어 수정 미리보기 실패')
    } finally {
      setNlPreviewing(false)
    }
  }

  const submitNl = () => {
    if (!nlPreview) return
    if (ctx.mode === 'preview') {
      toast.info('미리보기 모드 — 적용 생략')
      ctx.setEditMode('none')
      setNlPreview(null)
      return
    }
    const text = nlText.trim()
    ctx.setEditMode('none')
    setNlPreview(null)
    ctx.onEditSubmit?.(nlPreview.args, text, nlPreview.taskDescriptionUpdate)
  }

  return (
    <>
      <div className="mx-4 -mt-1 mb-3 space-y-3 rounded-lg border border-sky-500/30 bg-bg/60 px-3 py-3">
        <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide">자연어로 수정</p>
        <textarea
          rows={3}
          value={nlText}
          onChange={(e) => setNlText(e.target.value)}
          placeholder='예: "max_results를 5로 바꿔서 다시 시도해줘"'
          className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg placeholder-[#3a4256] focus:border-sky-500/60 focus:outline-none"
        />
        <button
          onClick={handlePreviewNl}
          disabled={nlPreviewing || nlText.trim().length === 0}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-surface-2 transition-colors disabled:opacity-40"
        >
          {nlPreviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          미리보기 (LLM 변환)
        </button>
        {nlPreview && (
          <div className="space-y-2 rounded-md border border-sky-500/20 bg-[#0A0E1A] px-3 py-2">
            <p className="text-xs font-semibold text-sky-300 uppercase tracking-wide">수정 후 인자</p>
            <pre className="text-xs text-fg font-mono whitespace-pre-wrap break-all">
              {JSON.stringify(nlPreview.args, null, 2)}
            </pre>
            {nlPreview.taskDescriptionUpdate && (
              <>
                <p className="pt-1 text-xs font-semibold text-sky-300 uppercase tracking-wide">
                  수정 후 작업 설명
                </p>
                <p className="text-xs text-fg">{nlPreview.taskDescriptionUpdate}</p>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-sky-500/20 px-3 py-2 bg-bg/40">
        <button
          onClick={cancelEditing}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-surface-2 transition-colors"
        >
          취소
        </button>
        <button
          onClick={submitNl}
          disabled={!nlPreview}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-colors disabled:opacity-40"
        >
          수정하고 실행
        </button>
      </div>
    </>
  )
}

// ============================================================
// Custom.HitlActions — 4-액션 footer (거부/자연어수정/직접수정/허용)
// ============================================================

export interface HitlActionLabels {
  reject?: string
  nlEdit?: string
  directEdit?: string
  approve?: string
}

export function HitlActionsSlot({
  ctx,
  labels,
}: {
  ctx: HitlSlotContext
  labels?: HitlActionLabels
}) {
  if (ctx.resolved) {
    return (
      <p className="px-4 pb-3 text-xs text-fg-subtle">
        응답됨: {ctx.resolved === 'approve' ? '허용' : ctx.resolved === 'reject' ? '거부' : '수정'}
      </p>
    )
  }
  if (ctx.editMode !== 'none') return null // 편집 footer 는 ArgsEditor 가 직접 렌더
  const allowed = ctx.allowedDecisions.length > 0 ? ctx.allowedDecisions : ['approve', 'edit', 'reject']
  const canApprove = allowed.includes('approve')
  const canEdit = allowed.includes('edit')
  const canReject = allowed.includes('reject')
  // labels.<key> 명시 여부를 노출 토글로 사용. 키가 없으면 해당 버튼 미렌더.
  // labels 자체가 undefined 면 기본값(모두 노출 + 한국어 fallback).
  const showNlEdit = canEdit && (labels === undefined || labels.nlEdit !== undefined)
  const showDirectEdit = canEdit && (labels === undefined || labels.directEdit !== undefined)
  const submitChoice = () => {
    if (ctx.mode === 'preview') {
      toast.info('미리보기 모드 — 송신 생략')
      return
    }
    const v = ctx.choiceValue ?? null
    if (ctx.choiceMeta && (ctx.choiceMeta.choices?.length ?? 0) > 0 && !v) {
      toast.error('옵션을 선택하세요')
      return
    }
    if (v != null) {
      ctx.onEditSubmit?.({ choice: v }, '')
      return
    }
    ctx.onDecide?.('approve')
  }
  return (
    <div className="flex items-center justify-end gap-2 border-t border-sky-500/20 px-3 py-2 bg-bg/40">
      {canReject && (
        <button
          onClick={() => {
            if (ctx.mode === 'preview') {
              toast.info('미리보기 모드 — 거부 송신 생략')
              return
            }
            ctx.onDecide?.('reject')
          }}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-red-600/20 hover:text-red-300 transition-colors"
        >
          {labels?.reject ?? '거부'}
        </button>
      )}
      {showNlEdit && (
        <button
          onClick={() => ctx.setEditMode('nl')}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-surface-2 transition-colors"
        >
          {labels?.nlEdit ?? '자연어로 수정'}
        </button>
      )}
      {showDirectEdit && (
        <button
          onClick={() => ctx.setEditMode('direct')}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-surface-2 transition-colors"
        >
          {labels?.directEdit ?? '직접 수정'}
        </button>
      )}
      {canApprove && (
        <button
          onClick={submitChoice}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white bg-sky-500 hover:bg-sky-400 transition-colors"
        >
          {labels?.approve ?? '허용'}
        </button>
      )}
    </div>
  )
}

// ============================================================
// EditorNode — HitlArgsEditor 재귀 렌더 헬퍼
// ============================================================

function EditorNode({
  node,
  draft,
  setDraft,
  widgetMap,
  helperMap,
  requiredMap,
  onAddItem,
  onRemoveItem,
}: {
  node: FieldNode
  draft: Record<string, string>
  setDraft: Dispatch<SetStateAction<Record<string, string>>>
  widgetMap: (node: FieldNode) => EditorWidget
  helperMap: (node: FieldNode) => string | undefined
  requiredMap: (node: FieldNode) => boolean
  onAddItem: (arrayPath: string, arrayValue: unknown[]) => void
  onRemoveItem: (itemPath: string) => void
}) {
  const indent = node.depth > 0 ? { paddingLeft: `${node.depth * 12}px` } : undefined
  if (node.kind === 'group') {
    const isArrayContainer = Array.isArray(node.value)
    const items = isArrayContainer ? (node.value as unknown[]) : null
    return (
      <div className="space-y-2" style={indent}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300/80">
          <span>{node.label}</span>
          {requiredMap(node) && <span className="text-red-400">*</span>}
          {node.isArrayItem && (
            <button
              type="button"
              onClick={() => onRemoveItem(node.path)}
              title="이 항목 삭제"
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              <Minus className="h-2.5 w-2.5" />
            </button>
          )}
          {isArrayContainer && (
            <button
              type="button"
              onClick={() => onAddItem(node.path, items ?? [])}
              title="항목 추가"
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
            >
              <Plus className="h-2.5 w-2.5" />
            </button>
          )}
          {isArrayContainer && items && (
            <span className="ml-1 text-[10px] font-normal text-fg-subtle">({items.length})</span>
          )}
        </div>
        {isArrayContainer && (items?.length ?? 0) === 0 && (
          <p className="text-[11px] text-fg-subtle italic" style={{ paddingLeft: '12px' }}>
            (항목 없음 — + 로 추가)
          </p>
        )}
        {(node.children ?? []).map((c) => (
          <EditorNode
            key={c.path}
            node={c}
            draft={draft}
            setDraft={setDraft}
            widgetMap={widgetMap}
            helperMap={helperMap}
            requiredMap={requiredMap}
            onAddItem={onAddItem}
            onRemoveItem={onRemoveItem}
          />
        ))}
      </div>
    )
  }
  const widget = widgetMap(node)
  const helper = helperFor(widget, helperMap(node))
  const isRequired = requiredMap(node)
  return (
    <div className="space-y-1" style={indent}>
      <label className="flex items-baseline gap-2 text-xs text-fg">
        <span className="font-semibold">
          {node.label}
          {isRequired && <span className="ml-1 text-red-400">*</span>}
        </span>
        <TypeBadge widget={widget} />
        <span className="text-xs text-fg-subtle font-mono">{node.path}</span>
        {node.isArrayItem && (
          <button
            type="button"
            onClick={() => onRemoveItem(node.path)}
            title="이 항목 삭제"
            className="inline-flex h-4 w-4 items-center justify-center rounded border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
          >
            <Minus className="h-2.5 w-2.5" />
          </button>
        )}
        {helper && <span className="ml-auto text-xs text-fg-subtle">{helper}</span>}
      </label>
      {widget === 'textarea' || widget === 'json' ? (
        <textarea
          rows={3}
          required={isRequired}
          value={draft[node.path] ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, [node.path]: e.target.value }))}
          className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs font-mono text-fg focus:border-sky-500/60 focus:outline-none"
        />
      ) : (
        <input
          type={widget === 'number' ? 'number' : 'text'}
          required={isRequired}
          value={draft[node.path] ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, [node.path]: e.target.value }))}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs font-mono text-fg focus:border-sky-500/60 focus:outline-none"
        />
      )}
    </div>
  )
}

// ============================================================
// Custom.HitlChoicePrompt / Custom.HitlChoiceOptions — 선택지 카드 전용 슬롯
// ============================================================

export function HitlChoicePromptSlot({
  ctx,
  overrides,
}: {
  ctx: HitlSlotContext
  overrides?: { text?: string }
}) {
  const text = (overrides?.text ?? ctx.choiceMeta?.prompt ?? '').trim()
  if (!text) return null
  if (ctx.editMode !== 'none') return null
  return (
    <div className="px-4 pb-2">
      <p className="text-sm text-fg leading-relaxed whitespace-pre-wrap">{text}</p>
    </div>
  )
}

export function HitlChoiceOptionsSlot({
  ctx,
  overrides,
}: {
  ctx: HitlSlotContext
  overrides?: { choices?: { title: string; value: string }[] }
}) {
  const choices = overrides?.choices ?? ctx.choiceMeta?.choices ?? []
  if (choices.length === 0) return null
  if (ctx.editMode !== 'none') return null
  const selected = ctx.choiceValue ?? null
  return (
    <div className="mx-4 -mt-1 mb-3 space-y-1.5 rounded-lg border border-sky-500/20 bg-bg/40 px-3 py-2">
      {choices.map((c, i) => {
        const checked = selected === c.value
        return (
          <label
            key={`${c.value}-${i}`}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              checked
                ? 'border-sky-500/60 bg-sky-500/10 text-fg'
                : 'border-border bg-bg/30 text-fg hover:border-sky-500/30'
            }`}
          >
            <input
              type="radio"
              name="hitl-choice"
              value={c.value}
              checked={checked}
              onChange={() => {
                if (ctx.mode === 'preview' && !ctx.setChoiceValue) return
                ctx.setChoiceValue?.(c.value)
              }}
              className="h-3 w-3 accent-sky-500"
            />
            <span className="flex-1">{c.title}</span>
            <span className="font-mono text-[10px] text-fg-subtle">{c.value}</span>
          </label>
        )
      })}
    </div>
  )
}

// ============================================================
// Recursion limit variant — 일반 HITL 과 분리된 amber 양자택일
// ============================================================

export function HitlRecursionVariant({ ctx }: { ctx: HitlSlotContext }) {
  const promptText =
    ctx.recursionPrompt ?? '에이전트가 한도에 도달했습니다. 이어서 더 진행할까요?'
  const nextLimit = ctx.recursionNextStepLimit
  // promptText 에서 current step limit 추출(`{N} step 한도`).
  const currentLimitMatch = /(\d+)\s*step\s*한도/.exec(promptText)
  const currentLimit = currentLimitMatch ? Number(currentLimitMatch[1]) : undefined
  const delta =
    typeof currentLimit === 'number' && typeof nextLimit === 'number'
      ? nextLimit - currentLimit
      : undefined
  return (
    <div className="flex gap-3 py-0.5">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
        <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
        <div className="px-4 py-3">
          <p className="text-sm font-semibold text-fg leading-relaxed">{promptText}</p>
          {(typeof currentLimit === 'number' || typeof nextLimit === 'number') && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              {typeof currentLimit === 'number' && (
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-amber-300">
                  현재 {currentLimit} step
                </span>
              )}
              {typeof currentLimit === 'number' && typeof nextLimit === 'number' && (
                <span className="text-fg-subtle">→</span>
              )}
              {typeof nextLimit === 'number' && (
                <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-mono text-amber-200">
                  최대 {nextLimit} step
                </span>
              )}
              {typeof delta === 'number' && delta > 0 && (
                <span className="text-fg-subtle">(+{delta} step 부여)</span>
              )}
            </div>
          )}
          {ctx.resolved && (
            <p className="mt-2 text-xs text-fg-subtle">
              응답됨: {ctx.resolved === 'approve' ? '계속 진행' : '중단'}
            </p>
          )}
        </div>
        {!ctx.resolved && (
          <div className="flex items-center justify-end gap-2 border-t border-amber-500/20 px-3 py-2 bg-bg/40">
            <button
              onClick={() => ctx.mode === 'runtime' && ctx.onDecide?.('reject')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-fg bg-[var(--color-surface-2)] hover:bg-red-600/20 hover:text-red-300 transition-colors"
            >
              중단하기
            </button>
            <button
              onClick={() => ctx.mode === 'runtime' && ctx.onDecide?.('approve')}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-400 transition-colors"
            >
              계속 진행
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 외곽 wrapper 는 hitl-layouts.tsx 의 레이아웃 컴포넌트가 책임짐.
 * (sky-standard / amber-emphasis / minimal / panel 중 카드의 layout 필드로 선택)
 */

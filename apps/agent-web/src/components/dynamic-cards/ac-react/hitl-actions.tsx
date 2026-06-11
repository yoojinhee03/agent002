'use client'

/**
 * HITL 카드 외곽 + 슬롯 컨텍스트 공급.
 *
 * - recursionLimitReached → 별도 amber 변형으로 early-return (AC body 무시)
 * - 그 외 → 카드의 layout id 로 HITL_LAYOUTS 에서 디자인 컴포넌트 lookup → 그 안에서 AC body 렌더
 * - HitlSlotCtxProvider 로 Custom.* 슬롯이 lookup 할 context 공급
 */

import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { toast } from 'sonner'
import {
  HitlRecursionVariant,
  HitlSlotCtxProvider,
  type HitlActionLabels,
  type HitlArgFieldSchema,
  type HitlSlotContext,
} from './hitl-slots'
import { getLayout, type HitlLayoutId } from './hitl-layouts'
import type { AcAdaptiveCard } from './types'
import { useToolStore } from '@/stores/use-tool-store'

export interface HitlAcCardItem {
  interactionId: string
  toolName: string
  toolArgs: Record<string, unknown>
  allowedDecisions: string[]
  resolved?: 'approve' | 'reject' | 'edit'
  parentTaskDescription?: string
  recursionLimitReached?: boolean
  recursionPrompt?: string
  recursionNextStepLimit?: number
}

interface Props {
  payload: AcAdaptiveCard
  data: Record<string, unknown>
  mode?: 'runtime' | 'preview'
  item: HitlAcCardItem
  argSchema?: HitlArgFieldSchema[] | null
  /** 카드 정의의 디자인 레이아웃 id. */
  layout?: HitlLayoutId | string | null
  /** 외부에서 editMode 를 제어할 때 — 미리보기 모달의 pills 등. 미지정 시 내부 state 사용. */
  editMode?: 'none' | 'direct' | 'nl'
  setEditMode?: Dispatch<SetStateAction<'none' | 'direct' | 'nl'>>
  onDecide?: (decision: 'approve' | 'reject') => void
  onEditSubmit?: (
    editedArgs: Record<string, unknown>,
    editPrompt: string,
    taskDescriptionUpdate?: string,
  ) => void
}

export function HitlAcCard({
  payload,
  data,
  mode = 'runtime',
  item,
  argSchema,
  layout,
  editMode: editModeProp,
  setEditMode: setEditModeProp,
  onDecide,
  onEditSubmit,
}: Props) {
  const [editModeInternal, setEditModeInternal] = useState<'none' | 'direct' | 'nl'>('none')
  const editMode = editModeProp ?? editModeInternal
  const setEditMode = setEditModeProp ?? setEditModeInternal
  const [choiceValue, setChoiceValue] = useState<string | null>(null)
  const choiceMeta = (() => {
    const prompt = typeof data.prompt === 'string' ? (data.prompt as string) : undefined
    const rawChoices = Array.isArray(data.choices) ? (data.choices as unknown[]) : undefined
    const choices = rawChoices
      ?.map((c) => {
        if (!c || typeof c !== 'object') return null
        const obj = c as { title?: unknown; value?: unknown }
        if (typeof obj.title !== 'string' || typeof obj.value !== 'string') return null
        return { title: obj.title, value: obj.value }
      })
      .filter((c): c is { title: string; value: string } => c !== null)
    if (!prompt && !choices?.length) return undefined
    return { prompt, choices }
  })()
  const toolLabels = useToolStore((s) => {
    const user = s.tools.find((t) => t.name === item.toolName)?.labels
    if (user) return user
    return s.builtinLabels[item.toolName] ?? undefined
  })

  const slotCtx: HitlSlotContext = {
    interactionId: item.interactionId,
    toolName: item.toolName,
    toolArgs: item.toolArgs,
    allowedDecisions: item.allowedDecisions,
    resolved: item.resolved,
    parentTaskDescription: item.parentTaskDescription,
    recursionLimitReached: item.recursionLimitReached,
    recursionPrompt: item.recursionPrompt,
    recursionNextStepLimit: item.recursionNextStepLimit,
    argSchema,
    toolLabels: toolLabels ?? undefined,
    mode,
    editMode,
    setEditMode,
    onDecide,
    onEditSubmit,
    choiceValue,
    setChoiceValue,
    choiceMeta,
  }

  if (item.recursionLimitReached) {
    return (
      <HitlSlotCtxProvider value={slotCtx}>
        <HitlRecursionVariant ctx={slotCtx} />
      </HitlSlotCtxProvider>
    )
  }

  const Layout = getLayout(layout).Component

  return (
    <HitlSlotCtxProvider value={slotCtx}>
      <Layout
        ctx={slotCtx}
        payload={payload}
        data={data}
        onAction={(a) => {
          const handler = typeof a.data.__handler === 'string' ? a.data.__handler : ''
          if (handler === 'hitl_respond') {
            const decision = String(a.data.decision ?? '')
            if (mode === 'preview') {
              toast.info(`미리보기 모드 — "${decision}" 송신 생략`)
              return
            }
            if (decision === 'approve' || decision === 'reject') onDecide?.(decision)
            return
          }
          if (mode === 'preview') {
            toast.info(`미리보기 모드 — 액션 "${a.title ?? '실행'}" 클릭됨`)
          }
        }}
      />
    </HitlSlotCtxProvider>
  )
}

export type { HitlActionLabels, HitlArgFieldSchema }

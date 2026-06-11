'use client'

/**
 * HITL 카드 렌더러.
 *
 * 카드 정의 (AC payload) 를 React-from-AC 로 렌더한다.
 *  - 런타임(`mode='runtime'`): cardDefinitionId 로 백엔드에서 payload + argSchema fetch.
 *  - 미리보기(`mode='preview'`): 빌더가 직접 payload 를 prop 으로 주입.
 *
 * 슬롯 (`Custom.HitlArgsView` 등) 은 HitlAcCard 가 공급하는 HitlSlotCtx 에서
 * `item` + `argSchema` 를 읽어 가변 인자 UI 를 렌더한다.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { apiClient } from '@/lib/api-client'
import { HitlAcCard, type HitlArgFieldSchema } from './ac-react/hitl-actions'
import type { AcAdaptiveCard } from './ac-react/types'

export interface HitlCardItem {
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
  /** 빌더 미리보기 — payload 직접 주입. */
  payload?: Record<string, unknown> | null
  /** 빌더 미리보기 — argSchema 직접 주입. */
  argSchema?: HitlArgFieldSchema[] | null
  /** 빌더 미리보기 — 레이아웃 id 직접 주입. */
  layout?: string | null
  /** 런타임 — cardDefinitionId 로 fetch. */
  cardDefinitionId?: string
  cardVersion?: number
  /** 미리보기에서는 sample 데이터를 그대로 사용. 런타임은 item 으로 합성. */
  sampleData?: Record<string, unknown>
  item?: HitlCardItem
  mode?: 'runtime' | 'preview'
  /** 외부에서 editMode 를 제어 — 미리보기 모달의 pills. */
  editMode?: 'none' | 'direct' | 'nl'
  setEditMode?: Dispatch<SetStateAction<'none' | 'direct' | 'nl'>>
  onDecide?: (decision: 'approve' | 'reject') => void
  onEditSubmit?: (
    editedArgs: Record<string, unknown>,
    editPrompt: string,
    taskDescriptionUpdate?: string,
  ) => void
}

const PREVIEW_ITEM: HitlCardItem = {
  interactionId: 'preview-interaction',
  toolName: 'web_search',
  toolArgs: { q: 'AgentStudio', max_results: 5 },
  allowedDecisions: ['approve', 'edit', 'reject'],
}

export function HitlCardRenderer({
  payload,
  argSchema,
  layout,
  cardDefinitionId,
  cardVersion,
  sampleData,
  item,
  mode = 'runtime',
  editMode,
  setEditMode,
  onDecide,
  onEditSubmit,
}: Props) {
  const [fetched, setFetched] = useState<Record<string, unknown> | null>(null)
  const [fetchedSample, setFetchedSample] = useState<Record<string, unknown> | null>(null)
  const [fetchedSchema, setFetchedSchema] = useState<HitlArgFieldSchema[] | null>(null)
  const [fetchedLayout, setFetchedLayout] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (payload || !cardDefinitionId) return
    let cancelled = false
    ;(async () => {
      try {
        const def = cardVersion
          ? await apiClient.cards.get(cardDefinitionId, cardVersion)
          : await apiClient.cards.getLatest(cardDefinitionId)
        if (cancelled) return
        setFetched((def?.payload ?? null) as Record<string, unknown> | null)
        setFetchedSample((def?.sampleData ?? null) as Record<string, unknown> | null)
        const meta = def as { argSchema?: HitlArgFieldSchema[] | null; layout?: string | null }
        setFetchedSchema(Array.isArray(meta?.argSchema) ? meta.argSchema : null)
        setFetchedLayout(typeof meta?.layout === 'string' ? meta.layout : null)
      } catch (err) {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : '카드 정의 조회 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [payload, cardDefinitionId, cardVersion])

  const effectivePayload = (payload ?? fetched) as AcAdaptiveCard | null
  const effectiveSchema = argSchema ?? fetchedSchema
  const effectiveLayout = layout ?? fetchedLayout

  const effectiveItem: HitlCardItem = useMemo(() => {
    if (item) return item
    if (mode === 'preview') {
      const s = sampleData ?? fetchedSample ?? {}
      return {
        interactionId: (s.interactionId as string) ?? 'preview-interaction',
        toolName: (s.toolName as string) ?? PREVIEW_ITEM.toolName,
        toolArgs: (s.toolArgs as Record<string, unknown>) ?? PREVIEW_ITEM.toolArgs,
        allowedDecisions:
          (s.allowedDecisions as string[]) ?? PREVIEW_ITEM.allowedDecisions,
        parentTaskDescription: s.parentTaskDescription as string | undefined,
        recursionLimitReached: s.recursionLimitReached as boolean | undefined,
        recursionPrompt: s.recursionPrompt as string | undefined,
        recursionNextStepLimit: s.recursionNextStepLimit as number | undefined,
      }
    }
    return PREVIEW_ITEM
  }, [item, mode, sampleData, fetchedSample])

  const data = useMemo<Record<string, unknown>>(() => {
    // hitl-choice 흐름은 sampleData(또는 cardData)의 prompt/choices 를 슬롯이 직접 읽는다.
    const extra = (sampleData ?? fetchedSample ?? {}) as Record<string, unknown>
    return {
      interactionId: effectiveItem.interactionId,
      toolName: effectiveItem.toolName,
      toolArgs: effectiveItem.toolArgs,
      toolArgsJson: JSON.stringify(effectiveItem.toolArgs, null, 2),
      toolArgsList: Object.entries(effectiveItem.toolArgs ?? {}).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
      allowedDecisions: effectiveItem.allowedDecisions,
      parentTaskDescription: effectiveItem.parentTaskDescription,
      recursionLimitReached: effectiveItem.recursionLimitReached,
      recursionPrompt: effectiveItem.recursionPrompt,
      recursionNextStepLimit: effectiveItem.recursionNextStepLimit,
      prompt: extra.prompt,
      choices: extra.choices,
    }
  }, [effectiveItem, sampleData, fetchedSample])

  if (loadError) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
        카드 로드 실패: {loadError}
      </div>
    )
  }
  if (!effectivePayload) {
    return <div className="text-xs text-fg-subtle">카드 로딩 중…</div>
  }

  return (
    <HitlAcCard
      payload={effectivePayload}
      data={data}
      mode={mode}
      item={effectiveItem}
      argSchema={effectiveSchema}
      layout={effectiveLayout}
      editMode={editMode}
      setEditMode={setEditMode}
      onDecide={onDecide}
      onEditSubmit={onEditSubmit}
    />
  )
}

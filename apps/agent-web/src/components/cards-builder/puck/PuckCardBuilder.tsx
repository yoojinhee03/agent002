'use client'

/**
 * Puck 기반 시각 빌더 (실험 PoC).
 *
 * 실제 렌더 결과 위에서 드래그/드롭/속성 편집. JSON 은 사용자가 직접 보지 않음.
 * 변경 사항은 AC payload 형식으로 onChange 콜백으로 흘려보냄.
 *
 * 제약:
 *  - body[] 평면 구조만 지원. 중첩 자식 편집은 JSON 빌더로 전환 필요.
 *  - HITL 슬롯은 HitlSlotCtxProvider 안에서만 렌더 가능 → sampleData 로 컨텍스트 합성.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Puck, type Data as PuckData } from '@measured/puck'
import '@measured/puck/puck.css'
import './puck-dark.css'
import { cn } from '@/lib/utils'
import { puckConfig } from './config'
import { acPayloadToPuckData, puckDataToAcPayload } from './adapter'
import {
  HitlSlotCtxProvider,
  type HitlArgFieldSchema,
  type HitlSlotContext,
} from '@/components/dynamic-cards/ac-react/hitl-slots'
import { seedArgsFromSchema } from '@/lib/cards/seed-args-from-schema'

type EditMode = 'none' | 'direct' | 'nl'

const STATE_PILLS: Array<{ id: EditMode; label: string; hint: string }> = [
  { id: 'none', label: '일반', hint: '기본 상태 — 인자 표시 + 4버튼' },
  { id: 'direct', label: '직접 수정', hint: 'directEdit 버튼 누른 상태 — 인자 폼 노출' },
  { id: 'nl', label: '자연어 수정', hint: 'nlEdit 버튼 누른 상태 — NL 입력 노출' },
]

interface Props {
  payload: Record<string, unknown>
  sampleData: Record<string, unknown>
  argSchema?: HitlArgFieldSchema[] | null
  /**
   * 외부에서 payload 가 비파괴적으로 갱신되었음을 알리는 토큰 (예: 도구 선택).
   * 값이 바뀌면 Puck 인스턴스를 remount 해서 새 payload 를 초기 상태로 받음.
   */
  resetKey?: string | number
  onChange: (nextPayload: Record<string, unknown>) => void
}

function buildSlotCtx(
  sampleData: Record<string, unknown>,
  editMode: EditMode,
  setEditMode: (m: EditMode) => void,
  argSchema: HitlArgFieldSchema[] | null | undefined,
): HitlSlotContext {
  const rawArgs = (sampleData.toolArgs as Record<string, unknown>) ?? {}
  const toolArgs = seedArgsFromSchema(rawArgs, argSchema)
  return {
    interactionId: (sampleData.interactionId as string) ?? 'preview-interaction',
    toolName: (sampleData.toolName as string) ?? 'web_search',
    toolArgs,
    allowedDecisions:
      (sampleData.allowedDecisions as string[]) ?? ['approve', 'edit', 'reject'],
    parentTaskDescription: sampleData.parentTaskDescription as string | undefined,
    recursionLimitReached: sampleData.recursionLimitReached as boolean | undefined,
    recursionPrompt: sampleData.recursionPrompt as string | undefined,
    recursionNextStepLimit: sampleData.recursionNextStepLimit as number | undefined,
    argSchema: argSchema ?? null,
    mode: 'preview',
    editMode,
    setEditMode,
    onDecide: () => {},
    onEditSubmit: () => {},
  }
}

export function PuckCardBuilder({ payload, sampleData, argSchema, resetKey, onChange }: Props) {
  // 최초 mount 의 payload 만 Puck 의 initial state 로 사용. 이후 편집은 Puck 이 owner.
  // resetKey 가 바뀔 때마다 Puck 을 remount 해야 하므로 useMemo 로 그 시점의 payload 캡쳐.
  const initialData = useMemo<PuckData>(
    () => acPayloadToPuckData(payload),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resetKey],
  )
  const [editMode, setEditMode] = useState<EditMode>('none')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const puckHostRef = useRef<HTMLDivElement | null>(null)

  // Puck 의 _PuckLayout-inner 가 height:100dvh 고정 → 외부 헤더 바 아래에 임베드 시
  // 하단이 viewport 밖으로 밀려 잘림. puck-dark.css 가 `--puck-embed-h` CSS 변수를
  // 읽도록 했고, 여기서 호스트 div 의 실제 높이를 ResizeObserver 로 측정해 주입.
  useEffect(() => {
    const root = rootRef.current
    const host = puckHostRef.current
    if (!root || !host) return
    const apply = () => {
      const h = host.clientHeight
      if (h > 0) root.style.setProperty('--puck-embed-h', `${h}px`)
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(host)
    window.addEventListener('resize', apply)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])
  const slotCtx = useMemo(
    () => buildSlotCtx(sampleData, editMode, setEditMode, argSchema),
    [sampleData, editMode, argSchema],
  )

  // onChange 디바운싱 — Puck 이 매 키스트로크마다 fire 함
  const onChangeRef = useRef(onChange)
  const basePayloadRef = useRef(payload)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    basePayloadRef.current = payload
  }, [payload])

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [])

  const handleChange = (data: PuckData) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      const next = puckDataToAcPayload(data, basePayloadRef.current)
      onChangeRef.current(next)
    }, 250)
  }

  return (
    <div ref={rootRef} className="ac-puck-builder flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border bg-bg/60 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle">상태 미리보기</span>
        {STATE_PILLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setEditMode(p.id)}
            title={p.hint}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors',
              editMode === p.id
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                : 'border-border bg-[var(--color-surface-2)] text-fg-muted hover:text-fg',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div ref={puckHostRef} className="min-h-0 flex-1 overflow-hidden">
        <HitlSlotCtxProvider value={slotCtx}>
          <Puck
            key={resetKey ?? 'default'}
            config={puckConfig}
            data={initialData}
            ui={{ leftSideBarVisible: false }}
            onChange={handleChange}
            iframe={{ enabled: false }}
            overrides={{
              headerActions: () => <></>,
            }}
          />
        </HitlSlotCtxProvider>
      </div>
    </div>
  )
}

export { isAllSupported } from './adapter'

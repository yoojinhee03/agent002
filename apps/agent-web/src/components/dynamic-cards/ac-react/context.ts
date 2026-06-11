/**
 * React-from-AC 렌더러 컨텍스트.
 *
 * 트리 walk 중 모든 element/action 이 공유하는 상태/콜백:
 *  - inputs: Input.* 의 현재 값 (id → value)
 *  - setInput: 입력 변경 콜백
 *  - dispatch: Action 발생 시 호출되는 단일 진입점 (__handler 라우팅 포함)
 *  - mode: 'runtime' / 'preview' (preview 는 API 호출 비활성)
 *  - showCardOpen: 현재 펼쳐진 ShowCard id (단일 선택 — 동시에 하나만)
 *  - toggleShowCard: ShowCard 열고/닫기
 */

import { createContext, useContext } from 'react'

export interface AcRenderContext {
  inputs: Record<string, string>
  setInput: (id: string, value: string) => void
  dispatch: (action: AcDispatchAction) => void
  mode: 'runtime' | 'preview'
  showCardOpen: string | null
  toggleShowCard: (id: string) => void
  /** true: 본문 슬롯 사이의 기본 space-y-3 여백을 제거 (HITL 슬롯이 자체 여백 책임). */
  compact: boolean
}

export interface AcDispatchAction {
  /** action.data 의 합본 (data + 현재 inputs 값들). */
  data: Record<string, unknown>
  /** action.title — 디버그/토스트용. */
  title?: string
  /** action 의 id (있으면). */
  actionId?: string
}

export const AcRenderCtx = createContext<AcRenderContext | null>(null)

export function useAcRender(): AcRenderContext {
  const ctx = useContext(AcRenderCtx)
  if (!ctx) throw new Error('useAcRender must be used inside AcRenderCtx.Provider')
  return ctx
}

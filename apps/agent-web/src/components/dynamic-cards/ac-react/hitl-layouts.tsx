'use client'

/**
 * HITL 디자인 레이아웃 레지스트리.
 *
 * 같은 슬롯/액션/argSchema 를 공유하되, 외곽 프레임·아이콘·색상만 다른 디자인 변형들.
 * 카드 정의의 `layout` 필드로 선택. 빌더에서 갤러리로 노출.
 *
 * 새 레이아웃 추가:
 *   1. 컴포넌트 작성 ({ ctx, payload, data })
 *   2. HITL_LAYOUTS 배열에 항목 등록
 *   3. (선택) 썸네일 SVG 추가
 */

import { ShieldCheck, AlertCircle, MessageSquare, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { AcReactCard } from './render'
import type { AcAdaptiveCard } from './types'
import type { HitlSlotContext } from './hitl-slots'

export type HitlLayoutId = 'sky-standard' | 'amber-emphasis' | 'minimal' | 'panel'

export interface HitlLayoutProps {
  ctx: HitlSlotContext
  payload: AcAdaptiveCard
  data: Record<string, unknown>
  onAction?: Parameters<typeof AcReactCard>[0]['onAction']
}

export interface HitlLayout {
  id: HitlLayoutId
  name: string
  description: string
  Component: (props: HitlLayoutProps) => ReactNode
  /** 빌더 갤러리용 작은 미리보기 SVG. */
  thumbnail: ReactNode
}

// ============================================================
// 공용 프레임 헬퍼
// ============================================================

function IconBox({
  tone,
  icon,
}: {
  tone: 'sky' | 'amber' | 'fg' | 'emerald'
  icon: ReactNode
}) {
  const cls =
    tone === 'sky'
      ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
      : tone === 'amber'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
        : tone === 'emerald'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-fg/15 bg-fg/5 text-fg-subtle'
  return (
    <div
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${cls}`}
    >
      {icon}
    </div>
  )
}

// ============================================================
// 1) sky-standard — 현재 기본 디자인 (ShieldCheck + 하늘색)
// ============================================================

function SkyStandard({ ctx, payload, data, onAction }: HitlLayoutProps) {
  return (
    <div className="flex gap-3 py-0.5">
      <IconBox tone="sky" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
      <div className="flex-1 min-w-0 rounded-xl border border-sky-500/30 bg-sky-500/5 overflow-hidden">
        <AcReactCard payload={payload} data={data} mode={ctx.mode} compact onAction={onAction} />
      </div>
    </div>
  )
}

// ============================================================
// 2) amber-emphasis — 경고/주의 톤 (AlertCircle + 주황)
// ============================================================

function AmberEmphasis({ ctx, payload, data, onAction }: HitlLayoutProps) {
  return (
    <div className="flex gap-3 py-0.5">
      <IconBox tone="amber" icon={<AlertCircle className="h-3.5 w-3.5" />} />
      <div className="flex-1 min-w-0 rounded-xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
        <AcReactCard payload={payload} data={data} mode={ctx.mode} compact onAction={onAction} />
      </div>
    </div>
  )
}

// ============================================================
// 3) minimal — 아이콘 없음, 단순 보더
// ============================================================

function Minimal({ ctx, payload, data, onAction }: HitlLayoutProps) {
  return (
    <div className="py-0.5">
      <div className="rounded-lg border border-border bg-bg/40 overflow-hidden">
        <AcReactCard payload={payload} data={data} mode={ctx.mode} compact onAction={onAction} />
      </div>
    </div>
  )
}

// ============================================================
// 4) panel — 큰 헤더 영역 + 좌측 강조 바
// ============================================================

function Panel({ ctx, payload, data, onAction }: HitlLayoutProps) {
  return (
    <div className="flex gap-3 py-0.5">
      <div className="w-1 shrink-0 rounded-full bg-sky-500/60" />
      <div className="flex-1 min-w-0 rounded-xl border border-fg/10 bg-fg/[0.03] overflow-hidden shadow-[0_0_10px_rgba(56,189,248,0.04)]">
        <AcReactCard payload={payload} data={data} mode={ctx.mode} compact onAction={onAction} />
      </div>
    </div>
  )
}

// ============================================================
// 썸네일 SVG (16x12 비율)
// ============================================================

const ThumbSky = (
  <svg viewBox="0 0 64 40" className="w-full h-auto">
    <rect x="2" y="6" width="8" height="28" rx="3" fill="rgba(14,165,233,0.15)" stroke="rgba(14,165,233,0.5)" />
    <rect x="14" y="6" width="48" height="28" rx="4" fill="rgba(14,165,233,0.05)" stroke="rgba(14,165,233,0.45)" />
    <rect x="18" y="11" width="22" height="3" rx="1" fill="rgba(255,255,255,0.55)" />
    <rect x="18" y="17" width="14" height="2" rx="1" fill="rgba(255,255,255,0.3)" />
    <rect x="18" y="24" width="40" height="6" rx="2" fill="rgba(14,165,233,0.18)" />
  </svg>
)
const ThumbAmber = (
  <svg viewBox="0 0 64 40" className="w-full h-auto">
    <rect x="2" y="6" width="8" height="28" rx="3" fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.5)" />
    <rect x="14" y="6" width="48" height="28" rx="4" fill="rgba(245,158,11,0.05)" stroke="rgba(245,158,11,0.5)" />
    <rect x="18" y="11" width="22" height="3" rx="1" fill="rgba(255,255,255,0.55)" />
    <rect x="18" y="17" width="20" height="2" rx="1" fill="rgba(255,255,255,0.3)" />
    <rect x="18" y="24" width="40" height="6" rx="2" fill="rgba(245,158,11,0.18)" />
  </svg>
)
const ThumbMinimal = (
  <svg viewBox="0 0 64 40" className="w-full h-auto">
    <rect x="3" y="6" width="58" height="28" rx="3" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.18)" />
    <rect x="8" y="12" width="22" height="3" rx="1" fill="rgba(255,255,255,0.55)" />
    <rect x="8" y="19" width="32" height="2" rx="1" fill="rgba(255,255,255,0.3)" />
    <rect x="8" y="26" width="20" height="4" rx="1" fill="rgba(255,255,255,0.12)" />
  </svg>
)
const ThumbPanel = (
  <svg viewBox="0 0 64 40" className="w-full h-auto">
    <rect x="3" y="6" width="2" height="28" rx="1" fill="rgba(14,165,233,0.7)" />
    <rect x="9" y="6" width="52" height="28" rx="4" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.1)" />
    <rect x="13" y="11" width="28" height="3" rx="1" fill="rgba(255,255,255,0.55)" />
    <rect x="13" y="17" width="20" height="2" rx="1" fill="rgba(255,255,255,0.3)" />
    <rect x="13" y="24" width="40" height="6" rx="2" fill="rgba(14,165,233,0.18)" />
  </svg>
)

// ============================================================
// 등록
// ============================================================

export const HITL_LAYOUTS: HitlLayout[] = [
  {
    id: 'sky-standard',
    name: 'sky 기본',
    description: 'ShieldCheck 아이콘 + 하늘색 외곽 — 기본 HITL 톤.',
    Component: SkyStandard,
    thumbnail: ThumbSky,
  },
  {
    id: 'amber-emphasis',
    name: 'amber 강조',
    description: '경고/위험성 강조 — 주황 톤. 파괴적 도구에 권장.',
    Component: AmberEmphasis,
    thumbnail: ThumbAmber,
  },
  {
    id: 'minimal',
    name: 'minimal',
    description: '아이콘 없는 단순 박스 — 채팅 흐름 방해 최소화.',
    Component: Minimal,
    thumbnail: ThumbMinimal,
  },
  {
    id: 'panel',
    name: 'panel',
    description: '좌측 강조 바 + 넓은 패널 — 정보량 많은 카드.',
    Component: Panel,
    thumbnail: ThumbPanel,
  },
]

export function getLayout(id: string | null | undefined): HitlLayout {
  return HITL_LAYOUTS.find((l) => l.id === id) ?? HITL_LAYOUTS[0]
}

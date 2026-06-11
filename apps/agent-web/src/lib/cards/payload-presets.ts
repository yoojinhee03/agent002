/**
 * HITL 카드 프리셋 — Custom.* 슬롯 기반.
 *
 * 디자인/액션은 슬롯이 책임, payload 는 헤더/인자영역/액션 위치만 정의.
 * 빌더에서 편집 가능한 것:
 *  - 슬롯 위치 (위/아래 순서)
 *  - 슬롯 사이에 일반 TextBlock 등 추가
 *  - Custom.HitlActions 의 labels (버튼 텍스트 한국어/영어/이모지 자유)
 *  - argSchema (카드 메타) — 빌더 별도 탭에서 도구별 라벨/위젯 정의
 */

import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-actions'

export type CardPresetId = 'hitl-approve' | 'hitl-input' | 'hitl-choice'

export interface CardPreset {
  id: CardPresetId
  label: string
  description: string
  payload: Record<string, unknown>
  sampleData: Record<string, unknown>
  argSchema?: HitlArgFieldSchema[] | null
}

const AC_HEADER = {
  type: 'AdaptiveCard',
  $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
  version: '1.5',
} as const

/** 슬롯 기반 표준 HITL payload. */
const HITL_SLOT_PAYLOAD: Record<string, unknown> = {
  ...AC_HEADER,
  body: [
    { type: 'Custom.HitlHeader' },
    { type: 'Custom.HitlArgsView' },
    { type: 'Custom.HitlArgsEditor' },
    {
      type: 'Custom.HitlActions',
      labels: { reject: '거부', nlEdit: '자연어로 수정', directEdit: '직접 수정', approve: '허용' },
    },
  ],
}

const HITL_SAMPLE_DATA = {
  interactionId: 'preview-interaction',
  toolName: 'web_search',
  toolArgs: { q: 'AgentStudio', max_results: 5 },
  allowedDecisions: ['approve', 'edit', 'reject'],
}

/** 자연어 수정 액션을 뺀 변형 — 직접 수정만. */
const HITL_INPUT_PAYLOAD: Record<string, unknown> = {
  ...AC_HEADER,
  body: [
    { type: 'Custom.HitlHeader' },
    { type: 'Custom.HitlArgsView' },
    { type: 'Custom.HitlArgsEditor' },
    {
      type: 'Custom.HitlActions',
      labels: { reject: '거부', directEdit: '직접 수정', approve: '허용' },
    },
  ],
}

export const CARD_PRESETS: CardPreset[] = [
  {
    id: 'hitl-approve',
    label: 'HITL · 기본 승인 카드',
    description: '🛡️ 표준 디자인 — 거부 / 자연어 수정 / 직접 수정 / 허용 4종 액션.',
    payload: HITL_SLOT_PAYLOAD,
    sampleData: HITL_SAMPLE_DATA,
    argSchema: null,
  },
  {
    id: 'hitl-input',
    label: 'HITL · 직접 수정만',
    description: '자연어 수정 액션 제거 — 인자 폼만 노출하는 단순 변형.',
    payload: HITL_INPUT_PAYLOAD,
    sampleData: HITL_SAMPLE_DATA,
    argSchema: null,
  },
  {
    id: 'hitl-choice',
    label: 'HITL · 선택지',
    description: '에이전트가 제안한 옵션 중 선택해서 응답 — 슬롯 기반.',
    payload: {
      ...AC_HEADER,
      body: [
        { type: 'Custom.HitlHeader' },
        { type: 'Custom.HitlChoicePrompt' },
        { type: 'Custom.HitlChoiceOptions' },
        {
          type: 'Custom.HitlActions',
          labels: { reject: '취소', approve: '제출' },
        },
      ],
    },
    sampleData: {
      interactionId: 'preview-interaction',
      toolName: 'select_model',
      toolArgs: {},
      allowedDecisions: ['approve', 'reject'],
      prompt: '어느 모델로 호출할까요?',
      choices: [
        { title: 'GPT-5', value: 'gpt-5' },
        { title: 'Claude Opus', value: 'claude-opus' },
      ],
    },
    argSchema: null,
  },
]

export function getPreset(id: CardPresetId): CardPreset {
  return CARD_PRESETS.find((p) => p.id === id) ?? CARD_PRESETS[0]
}

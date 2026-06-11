'use client'

/**
 * Puck Config — AgentStudio HITL 카드 빌더용 컴포넌트 등록.
 *
 * 각 컴포넌트는 우리의 React-from-AC 컴포넌트를 그대로 감싸 Puck Edit 모드에서도
 * 실제 렌더 결과 위에서 드래그/선택/필드 패널 편집이 가능하도록 한다.
 *
 * 등록 컴포넌트:
 *  - HITL 슬롯: HitlHeader / HitlArgsView / HitlArgsEditor / HitlActions
 *  - 텍스트 / 레이아웃: TextBlock / Container (자식 재귀 편집 지원)
 *  - 입력: InputText / InputNumber / InputToggle / InputChoiceSet
 */

import type { Config, CustomField, Slot } from '@measured/puck'
import {
  HitlActionsSlot,
  HitlArgsEditorSlot,
  HitlArgsViewSlot,
  HitlHeaderSlot,
  useHitlSlotCtx,
} from '@/components/dynamic-cards/ac-react/hitl-slots'
import { Asterisk } from 'lucide-react'

/**
 * 필수 여부 토글 — 라디오 대신 시각적으로 명확한 segmented switch.
 * Puck Custom Field — value: boolean.
 */
const makeRequiredField = (): CustomField<boolean> => ({
  type: 'custom',
  label: '필수 여부',
  render: ({ value, onChange }) => {
    const v = value === true
    return (
      <button
        type="button"
        role="switch"
        aria-checked={v}
        data-required-toggle
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onChange(!v)
        }}
        style={{ minWidth: 72 }}
        className={
          'inline-flex shrink-0 items-center justify-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ' +
          (v
            ? 'border-red-500/50 bg-red-500/15 text-red-300 hover:bg-red-500/20'
            : 'border-border bg-[var(--color-surface-2)] text-fg-subtle hover:text-fg')
        }
      >
        {v ? <Asterisk className="h-3 w-3" /> : null}
        {v ? '필수' : '옵션'}
      </button>
    )
  },
})

type LabelEntry = { path: string; label: string }
type PathEntry = { path: string }
/** AdaptiveCard 루트의 argSchema 한 항목 — Puck root fields 에서 편집. */
type ArgSchemaEntry = {
  key: string
  label: string
  required: boolean
  widget: '' | 'input' | 'textarea' | 'number' | 'switch' | 'select' | 'json'
  helper: string
  choices: Array<{ title: string; value: string }>
}

function toRecord(list: LabelEntry[] | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of list ?? []) {
    if (e?.path) out[e.path] = e.label ?? ''
  }
  return out
}
function toPathArray(list: PathEntry[] | undefined): string[] {
  return (list ?? []).map((e) => e?.path).filter((p): p is string => Boolean(p))
}

function HitlHeaderRender({
  title,
  toolLabelOverride,
}: {
  title: string
  toolLabelOverride: string
}) {
  const ctx = useHitlSlotCtx()
  return (
    <HitlHeaderSlot
      ctx={ctx}
      overrides={{
        type: 'Custom.HitlHeader',
        title: title || undefined,
        toolLabelOverride: toolLabelOverride || undefined,
      }}
    />
  )
}
function HitlArgsViewRender({
  labelsOverride,
  hide,
  order,
}: {
  labelsOverride: LabelEntry[]
  hide: PathEntry[]
  order: PathEntry[]
}) {
  const ctx = useHitlSlotCtx()
  return (
    <HitlArgsViewSlot
      ctx={ctx}
      overrides={{
        type: 'Custom.HitlArgsView',
        labelsOverride: toRecord(labelsOverride),
        hide: toPathArray(hide),
        order: toPathArray(order),
      }}
    />
  )
}
function HitlArgsEditorRender({
  labelsOverride,
  hide,
  order,
}: {
  labelsOverride: LabelEntry[]
  hide: PathEntry[]
  order: PathEntry[]
}) {
  const ctx = useHitlSlotCtx()
  return (
    <HitlArgsEditorSlot
      ctx={ctx}
      overrides={{
        type: 'Custom.HitlArgsEditor',
        labelsOverride: toRecord(labelsOverride),
        hide: toPathArray(hide),
        order: toPathArray(order),
      }}
    />
  )
}
function HitlActionsRender({
  rejectLabel,
  nlEditLabel,
  directEditLabel,
  approveLabel,
}: {
  rejectLabel: string
  nlEditLabel: string
  directEditLabel: string
  approveLabel: string
}) {
  const ctx = useHitlSlotCtx()
  return (
    <HitlActionsSlot
      ctx={ctx}
      labels={{
        reject: rejectLabel,
        nlEdit: nlEditLabel,
        directEdit: directEditLabel,
        approve: approveLabel,
      }}
    />
  )
}

export interface PuckProps {
  HitlHeader: {
    id: string
    title: string
    toolLabelOverride: string
  }
  HitlArgsView: {
    id: string
    labelsOverride: LabelEntry[]
    hide: PathEntry[]
    order: PathEntry[]
  }
  HitlArgsEditor: {
    id: string
    labelsOverride: LabelEntry[]
    hide: PathEntry[]
    order: PathEntry[]
  }
  HitlActions: {
    id: string
    rejectLabel: string
    nlEditLabel: string
    directEditLabel: string
    approveLabel: string
  }
  TextBlock: {
    id: string
    text: string
    weight: 'Default' | 'Bolder' | 'Lighter'
    size: 'Small' | 'Default' | 'Medium' | 'Large' | 'ExtraLarge'
    wrap: boolean
  }
  Container: {
    id: string
    style: 'default' | 'emphasis' | 'accent' | 'good' | 'warning' | 'attention'
    items: Slot
  }
  FactSet: {
    id: string
    facts: Array<{ title: string; value: string }>
  }
  InputText: {
    id: string
    label: string
    placeholder: string
    isMultiline: boolean
  }
  InputNumber: {
    id: string
    label: string
    min: number
    max: number
  }
  InputToggle: {
    id: string
    title: string
  }
  InputChoiceSet: {
    id: string
    label: string
    style: 'compact' | 'expanded'
    choices: Array<{ title: string; value: string }>
  }
}

const STYLE_CLASS: Record<PuckProps['Container']['style'], string> = {
  default: 'p-3',
  emphasis: 'bg-fg/[0.04] border border-fg/15 rounded-xl p-3',
  accent: 'bg-sky-500/5 border border-sky-500/30 rounded-xl p-3',
  good: 'bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3',
  warning: 'bg-amber-500/5 border border-amber-500/30 rounded-xl p-3',
  attention: 'bg-red-500/5 border border-red-500/30 rounded-xl p-3',
}

const TEXT_SIZE_CLS = {
  Small: 'text-[11px]',
  Default: 'text-xs',
  Medium: 'text-sm',
  Large: 'text-base',
  ExtraLarge: 'text-lg',
} as const

const TEXT_WEIGHT_CLS = {
  Lighter: 'font-light',
  Default: 'font-normal',
  Bolder: 'font-semibold',
} as const

export const puckConfig: Config<PuckProps> = {
  categories: {
    hitl: {
      title: 'HITL 슬롯',
      components: ['HitlHeader', 'HitlArgsView', 'HitlArgsEditor', 'HitlActions'],
    },
    text: { title: '텍스트 / 레이아웃', components: ['TextBlock', 'Container', 'FactSet'] },
    input: {
      title: '입력',
      components: ['InputText', 'InputNumber', 'InputToggle', 'InputChoiceSet'],
    },
  },
  root: {
    fields: {
      argSchema: {
        type: 'array',
        label: '인자 사전 (도구 인자 → 라벨/필수/위젯)',
        getItemSummary: (item: { key?: string; required?: boolean; widget?: string }, index?: number) =>
          item?.key
            ? `${item.key}${item?.required ? ' *' : ''}${item?.widget ? ` (${item.widget})` : ''}`
            : `항목 ${(index ?? 0) + 1}`,
        defaultItemProps: {
          key: '',
          label: '',
          required: false,
          widget: '',
          helper: '',
          choices: [],
        },
        arrayFields: {
          key: { type: 'text', label: 'key (dot-path)' },
          label: { type: 'text', label: '라벨' },
          required: makeRequiredField(),
          widget: {
            type: 'select',
            label: '위젯 (빈칸 시 자동)',
            options: [
              { label: '자동', value: '' },
              { label: 'input', value: 'input' },
              { label: 'textarea', value: 'textarea' },
              { label: 'number', value: 'number' },
              { label: 'switch', value: 'switch' },
              { label: 'select', value: 'select' },
              { label: 'json', value: 'json' },
            ],
          },
          helper: { type: 'text', label: '도움말 (선택)' },
          choices: {
            type: 'array',
            label: 'select 위젯 선택지',
            getItemSummary: (item: { title?: string; value?: string }, index?: number) =>
              item?.title || item?.value || `선택지 ${(index ?? 0) + 1}`,
            defaultItemProps: { title: '', value: '' },
            arrayFields: {
              title: { type: 'text', label: '표시 텍스트' },
              value: { type: 'text', label: '값' },
            },
          },
        },
      },
    } as never,
  },
  components: {
    HitlHeader: {
      label: 'HitlHeader',
      fields: {
        id: { type: 'text', label: 'id' },
        title: { type: 'textarea', label: '본문 (빈칸 시 기본 안내)' },
        toolLabelOverride: { type: 'text', label: '도구 표시명 (빈칸 시 사전 사용)' },
      },
      defaultProps: { id: 'hitl-header', title: '', toolLabelOverride: '' },
      render: HitlHeaderRender,
    },
    HitlArgsView: {
      label: 'HitlArgsView',
      fields: {
        id: { type: 'text', label: 'id' },
        labelsOverride: {
          type: 'array',
          label: '라벨 오버라이드 (path → 한국어)',
          getItemSummary: (item: { path?: string; label?: string }, index?: number) =>
            item?.path ? `${item.path} → ${item.label ?? ''}` : `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '', label: '' },
          arrayFields: {
            path: { type: 'text', label: 'path (예: filters[*].field)' },
            label: { type: 'text', label: '한국어 라벨' },
          },
        },
        hide: {
          type: 'array',
          label: '숨길 path',
          getItemSummary: (item: { path?: string }, index?: number) =>
            item?.path || `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '' },
          arrayFields: { path: { type: 'text', label: 'path' } },
        },
        order: {
          type: 'array',
          label: '표시 순서 (path)',
          getItemSummary: (item: { path?: string }, index?: number) =>
            item?.path || `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '' },
          arrayFields: { path: { type: 'text', label: 'path' } },
        },
      },
      defaultProps: { id: 'hitl-args-view', labelsOverride: [], hide: [], order: [] },
      render: HitlArgsViewRender,
    },
    HitlArgsEditor: {
      label: 'HitlArgsEditor',
      fields: {
        id: { type: 'text', label: 'id' },
        labelsOverride: {
          type: 'array',
          label: '라벨 오버라이드 (path → 한국어)',
          getItemSummary: (item: { path?: string; label?: string }, index?: number) =>
            item?.path ? `${item.path} → ${item.label ?? ''}` : `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '', label: '' },
          arrayFields: {
            path: { type: 'text', label: 'path' },
            label: { type: 'text', label: '한국어 라벨' },
          },
        },
        hide: {
          type: 'array',
          label: '숨길 path',
          getItemSummary: (item: { path?: string }, index?: number) =>
            item?.path || `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '' },
          arrayFields: { path: { type: 'text', label: 'path' } },
        },
        order: {
          type: 'array',
          label: '표시 순서 (path)',
          getItemSummary: (item: { path?: string }, index?: number) =>
            item?.path || `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { path: '' },
          arrayFields: { path: { type: 'text', label: 'path' } },
        },
      },
      defaultProps: {
        id: 'hitl-args-editor',
        labelsOverride: [],
        hide: [],
        order: [],
      },
      render: HitlArgsEditorRender,
    },
    HitlActions: {
      label: 'HitlActions',
      fields: {
        id: { type: 'text', label: 'id' },
        rejectLabel: { type: 'text', label: '거부 버튼 텍스트' },
        nlEditLabel: { type: 'text', label: '자연어 수정 버튼 텍스트' },
        directEditLabel: { type: 'text', label: '직접 수정 버튼 텍스트' },
        approveLabel: { type: 'text', label: '허용 버튼 텍스트' },
      },
      defaultProps: {
        id: 'hitl-actions',
        rejectLabel: '거부',
        nlEditLabel: '자연어로 수정',
        directEditLabel: '직접 수정',
        approveLabel: '허용',
      },
      render: HitlActionsRender,
    },
    TextBlock: {
      label: 'TextBlock',
      fields: {
        id: { type: 'text', label: 'id' },
        text: { type: 'textarea', label: '텍스트 (${바인딩} 가능)' },
        weight: {
          type: 'select',
          label: '굵기',
          options: [
            { label: 'Default', value: 'Default' },
            { label: 'Bolder', value: 'Bolder' },
            { label: 'Lighter', value: 'Lighter' },
          ],
        },
        size: {
          type: 'select',
          label: '크기',
          options: [
            { label: 'Small', value: 'Small' },
            { label: 'Default', value: 'Default' },
            { label: 'Medium', value: 'Medium' },
            { label: 'Large', value: 'Large' },
            { label: 'ExtraLarge', value: 'ExtraLarge' },
          ],
        },
        wrap: {
          type: 'radio',
          label: '줄바꿈',
          options: [
            { label: '예', value: true },
            { label: '아니오', value: false },
          ],
        },
      },
      defaultProps: {
        id: 'text-1',
        text: '본문 텍스트',
        weight: 'Default',
        size: 'Default',
        wrap: true,
      },
      render: ({ text, weight, size, wrap }) => (
        <p
          className={`${TEXT_SIZE_CLS[size]} ${TEXT_WEIGHT_CLS[weight]} text-fg ${
            wrap ? 'whitespace-pre-wrap break-words' : 'truncate'
          }`}
        >
          {text}
        </p>
      ),
    },
    Container: {
      label: 'Container',
      fields: {
        id: { type: 'text', label: 'id' },
        style: {
          type: 'select',
          label: '스타일',
          options: [
            { label: 'default', value: 'default' },
            { label: 'emphasis', value: 'emphasis' },
            { label: 'accent', value: 'accent' },
            { label: 'good', value: 'good' },
            { label: 'warning', value: 'warning' },
            { label: 'attention', value: 'attention' },
          ],
        },
        items: { type: 'slot' },
      },
      defaultProps: { id: 'container-1', style: 'emphasis', items: [] },
      render: ({ style, items: Items }) => (
        <div className="rounded-xl overflow-hidden px-4 py-3">
          <div className={`${STYLE_CLASS[style]} min-h-[60px]`}>
            <Items className="space-y-2" />
          </div>
        </div>
      ),
    },
    FactSet: {
      label: 'FactSet (key/value 배열)',
      fields: {
        id: { type: 'text', label: 'id' },
        facts: {
          type: 'array',
          label: '항목',
          getItemSummary: (item: { title?: string; value?: string }, index?: number) =>
            item?.title || `항목 ${(index ?? 0) + 1}`,
          defaultItemProps: { title: '제목', value: '값' },
          arrayFields: {
            title: { type: 'text', label: '키 (title)' },
            value: { type: 'text', label: '값 (value)' },
          },
        },
      },
      defaultProps: {
        id: 'factset-1',
        facts: [
          { title: '항목 1', value: '값 1' },
          { title: '항목 2', value: '값 2' },
        ],
      },
      render: ({ facts }) => {
        const list = Array.isArray(facts) ? facts : []
        if (list.length === 0) {
          return (
            <p className="text-[11px] text-fg-subtle italic">FactSet — 항목 없음</p>
          )
        }
        return (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {list.map((f, i) => (
              <div key={i} className="contents">
                <dt className="font-semibold text-fg-muted">{f.title}</dt>
                <dd className="text-fg whitespace-pre-wrap break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        )
      },
    },
    InputText: {
      label: 'Input.Text',
      fields: {
        id: { type: 'text', label: 'id (field name)' },
        label: { type: 'text', label: '레이블' },
        placeholder: { type: 'text', label: 'placeholder' },
        isMultiline: {
          type: 'radio',
          label: '멀티라인',
          options: [
            { label: '예', value: true },
            { label: '아니오', value: false },
          ],
        },
      },
      defaultProps: {
        id: 'fieldId',
        label: '레이블',
        placeholder: '입력하세요',
        isMultiline: false,
      },
      render: ({ label, placeholder, isMultiline }) => (
        <div className="space-y-1">
          {label && <label className="text-xs font-semibold text-fg">{label}</label>}
          {isMultiline ? (
            <textarea
              rows={3}
              placeholder={placeholder}
              className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs font-mono text-fg"
              readOnly
            />
          ) : (
            <input
              type="text"
              placeholder={placeholder}
              className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg"
              readOnly
            />
          )}
        </div>
      ),
    },
    InputNumber: {
      label: 'Input.Number',
      fields: {
        id: { type: 'text', label: 'id (field name)' },
        label: { type: 'text', label: '레이블' },
        min: { type: 'number', label: 'min' },
        max: { type: 'number', label: 'max' },
      },
      defaultProps: { id: 'fieldId', label: '레이블', min: 0, max: 100 },
      render: ({ label, min, max }) => (
        <div className="space-y-1">
          {label && <label className="text-xs font-semibold text-fg">{label}</label>}
          <input
            type="number"
            min={min}
            max={max}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg"
            readOnly
          />
        </div>
      ),
    },
    InputToggle: {
      label: 'Input.Toggle',
      fields: {
        id: { type: 'text', label: 'id (field name)' },
        title: { type: 'text', label: '제목' },
      },
      defaultProps: { id: 'fieldId', title: '활성화' },
      render: ({ title }) => (
        <label className="flex items-center gap-2 text-xs text-fg">
          <input type="checkbox" readOnly />
          <span>{title}</span>
        </label>
      ),
    },
    InputChoiceSet: {
      label: 'Input.ChoiceSet',
      fields: {
        id: { type: 'text', label: 'id (field name)' },
        label: { type: 'text', label: '레이블' },
        style: {
          type: 'radio',
          label: '스타일',
          options: [
            { label: 'expanded (라디오)', value: 'expanded' },
            { label: 'compact (드롭다운)', value: 'compact' },
          ],
        },
        choices: {
          type: 'array',
          label: '선택지',
          getItemSummary: (item: { title?: string; value?: string }, index?: number) =>
            item?.title || item?.value || `선택지 ${(index ?? 0) + 1}`,
          defaultItemProps: { title: '새 옵션', value: 'new-value' },
          arrayFields: {
            title: { type: 'text', label: '표시 텍스트' },
            value: { type: 'text', label: '값' },
          },
        },
      },
      defaultProps: {
        id: 'choice',
        label: '선택',
        style: 'expanded',
        choices: [
          { title: '옵션 1', value: 'opt-1' },
          { title: '옵션 2', value: 'opt-2' },
        ],
      },
      render: ({ label, style, choices: choicesProp }) => {
        const choices = Array.isArray(choicesProp) ? choicesProp : []
        if (style === 'expanded') {
          return (
            <div className="space-y-1">
              {label && <label className="text-xs font-semibold text-fg">{label}</label>}
              <div className="space-y-1">
                {choices.map((c) => (
                  <label key={c.value} className="flex items-center gap-2 text-xs text-fg">
                    <input type="radio" readOnly />
                    <span>{c.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )
        }
        return (
          <div className="space-y-1">
            {label && <label className="text-xs font-semibold text-fg">{label}</label>}
            <select className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg">
              <option value="">선택</option>
              {choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )
      },
    },
  },
}

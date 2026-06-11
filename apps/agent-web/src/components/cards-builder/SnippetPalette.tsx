'use client'

import { useState } from 'react'
import { ChevronRight, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Snippet {
  id: string
  label: string
  description: string
  payload: Record<string, unknown>
  /** body 안에 들어가는 element 인지, actions 안에 들어가는 action 인지 */
  target: 'body' | 'actions' | 'root'
}

interface Section {
  id: string
  label: string
  items: Snippet[]
}

const SECTIONS: Section[] = [
  {
    id: 'hitl-slots',
    label: 'HITL 슬롯',
    items: [
      {
        id: 'Custom.HitlHeader',
        label: 'HitlHeader',
        description: '헤더 슬롯 — 아이콘·타이틀·도구명 자동 렌더',
        target: 'body',
        payload: { type: 'Custom.HitlHeader' },
      },
      {
        id: 'Custom.HitlArgsView',
        label: 'HitlArgsView',
        description: '인자 표시 슬롯 — typeof 인트로스펙션 / argSchema 자동',
        target: 'body',
        payload: { type: 'Custom.HitlArgsView' },
      },
      {
        id: 'Custom.HitlArgsEditor',
        label: 'HitlArgsEditor',
        description: '직접/자연어 인자 편집 + taskDescription 편집',
        target: 'body',
        payload: { type: 'Custom.HitlArgsEditor' },
      },
      {
        id: 'Custom.HitlActions',
        label: 'HitlActions',
        description: '거부·자연어 수정·직접 수정·허용 4버튼 (labels 로 텍스트 변경)',
        target: 'body',
        payload: {
          type: 'Custom.HitlActions',
          labels: { reject: '거부', nlEdit: '자연어로 수정', directEdit: '직접 수정', approve: '허용' },
        },
      },
    ],
  },
  {
    id: 'text',
    label: '텍스트 / 레이아웃',
    items: [
      {
        id: 'TextBlock',
        label: 'TextBlock',
        description: '본문 텍스트 (markdown / ${바인딩})',
        target: 'body',
        payload: { type: 'TextBlock', text: '${value}', wrap: true },
      },
      {
        id: 'TextBlock-Heading',
        label: 'TextBlock · 제목',
        description: '굵게 + Medium 사이즈',
        target: 'body',
        payload: { type: 'TextBlock', text: '제목', weight: 'Bolder', size: 'Medium', wrap: true },
      },
      {
        id: 'Container',
        label: 'Container',
        description: '내부 요소 묶음 (style/spacing/separator 가능)',
        target: 'body',
        payload: {
          type: 'Container',
          style: 'emphasis',
          items: [{ type: 'TextBlock', text: '내용', wrap: true }],
        },
      },
      {
        id: 'ColumnSet',
        label: 'ColumnSet',
        description: '가로 컬럼 분할 (좌/우)',
        target: 'body',
        payload: {
          type: 'ColumnSet',
          columns: [
            {
              type: 'Column',
              width: 'auto',
              items: [{ type: 'TextBlock', text: '좌측', wrap: true }],
            },
            {
              type: 'Column',
              width: 'stretch',
              items: [{ type: 'TextBlock', text: '우측', wrap: true }],
            },
          ],
        },
      },
      {
        id: 'FactSet',
        label: 'FactSet',
        description: 'Key-Value 목록',
        target: 'body',
        payload: {
          type: 'FactSet',
          facts: [
            { title: '항목 1', value: '${field1}' },
            { title: '항목 2', value: '${field2}' },
          ],
        },
      },
      {
        id: 'Image',
        label: 'Image',
        description: '이미지 url',
        target: 'body',
        payload: { type: 'Image', url: '${imageUrl}', size: 'Medium' },
      },
    ],
  },
  {
    id: 'input',
    label: '입력',
    items: [
      {
        id: 'Input.Text',
        label: 'Input.Text',
        description: '한 줄 텍스트 입력 (isMultiline 으로 멀티라인)',
        target: 'body',
        payload: { type: 'Input.Text', id: 'fieldId', label: '레이블', placeholder: '입력하세요' },
      },
      {
        id: 'Input.Text-Multiline',
        label: 'Input.Text · 멀티라인 (JSON)',
        description: 'JSON 등 긴 텍스트 입력',
        target: 'body',
        payload: {
          type: 'Input.Text',
          id: 'editedArgsJson',
          label: '인자 (JSON)',
          isMultiline: true,
          value: '${toolArgsJson}',
        },
      },
      {
        id: 'Input.Number',
        label: 'Input.Number',
        description: '숫자 입력',
        target: 'body',
        payload: { type: 'Input.Number', id: 'fieldId', label: '레이블', min: 0, max: 100 },
      },
      {
        id: 'Input.Toggle',
        label: 'Input.Toggle',
        description: 'boolean 토글',
        target: 'body',
        payload: { type: 'Input.Toggle', id: 'fieldId', title: '활성화', valueOn: 'true', valueOff: 'false' },
      },
      {
        id: 'Input.ChoiceSet',
        label: 'Input.ChoiceSet',
        description: '선택지 (expanded / compact)',
        target: 'body',
        payload: {
          type: 'Input.ChoiceSet',
          id: 'choice',
          style: 'expanded',
          isRequired: true,
          choices: [
            { title: '옵션 1', value: 'opt-1' },
            { title: '옵션 2', value: 'opt-2' },
          ],
        },
      },
      {
        id: 'Input.Date',
        label: 'Input.Date',
        description: '날짜 선택',
        target: 'body',
        payload: { type: 'Input.Date', id: 'fieldId', label: '날짜' },
      },
    ],
  },
  {
    id: 'action',
    label: '액션',
    items: [
      {
        id: 'Action.Submit',
        label: 'Action.Submit',
        description: '핸들러 dispatch 용 기본 버튼 (data.__handler 로 라우팅) · HITL 응답은 Custom.HitlActions 슬롯을 사용하세요',
        target: 'actions',
        payload: { type: 'Action.Submit', title: '제출', data: { __handler: 'dismiss' } },
      },
      {
        id: 'Action.OpenUrl',
        label: 'Action.OpenUrl',
        description: '외부 URL 열기',
        target: 'actions',
        payload: { type: 'Action.OpenUrl', title: '열기', url: '${url}' },
      },
    ],
  },
  {
    id: 'flow',
    label: '상태 전이 (visibleWhen 대체)',
    items: [
      {
        id: 'Action.ToggleVisibility',
        label: 'Action.ToggleVisibility',
        description: 'targetElements 의 id 들을 보였다/숨겼다 토글',
        target: 'actions',
        payload: {
          type: 'Action.ToggleVisibility',
          title: '편집',
          targetElements: ['editBox'],
        },
      },
      {
        id: 'Container-Hidden',
        label: 'Container · 처음엔 숨김',
        description: 'isVisible:false + id — Action.ToggleVisibility 의 target',
        target: 'body',
        payload: {
          type: 'Container',
          id: 'editBox',
          isVisible: false,
          items: [
            { type: 'Input.Text', id: 'note', label: '메모', isMultiline: true },
          ],
        },
      },
      {
        id: 'Action.ShowCard',
        label: 'Action.ShowCard',
        description: '서브 카드 펼치기',
        target: 'actions',
        payload: {
          type: 'Action.ShowCard',
          title: '상세',
          card: {
            type: 'AdaptiveCard',
            body: [{ type: 'TextBlock', text: '상세 내용', wrap: true }],
          },
        },
      },
    ],
  },
]

interface Props {
  onInsert: (snippet: Snippet) => void
}

export function SnippetPalette({ onInsert }: Props) {
  const [openSection, setOpenSection] = useState<string | null>('hitl-slots')
  const [filter, setFilter] = useState('')

  const norm = filter.trim().toLowerCase()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border bg-bg/40 px-3 py-1.5">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="요소 검색..."
          className="w-full rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 text-[11px] text-fg placeholder:text-fg-subtle outline-none focus:border-blue-400/60"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {SECTIONS.map((section) => {
          const items = norm
            ? section.items.filter(
                (i) =>
                  i.label.toLowerCase().includes(norm) ||
                  i.description.toLowerCase().includes(norm) ||
                  i.id.toLowerCase().includes(norm),
              )
            : section.items
          if (norm && items.length === 0) return null
          const open = norm ? true : openSection === section.id
          return (
            <div key={section.id} className="border-b border-border">
              <button
                type="button"
                onClick={() => setOpenSection(open ? null : section.id)}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted hover:bg-bg/40"
              >
                <span>{section.label}</span>
                <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
              </button>
              {open && (
                <ul className="px-2 pb-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onInsert(item)}
                        className="group flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-blue-500/10"
                        title={`${item.target} 에 삽입`}
                      >
                        <Plus className="mt-0.5 h-3 w-3 shrink-0 text-fg-subtle group-hover:text-blue-300" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-fg">{item.label}</div>
                          <div className="text-[10px] leading-snug text-fg-subtle">
                            {item.description}
                          </div>
                        </div>
                        <span className="rounded bg-bg/60 px-1 text-[9px] uppercase text-fg-subtle">
                          {item.target}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export type { Snippet }

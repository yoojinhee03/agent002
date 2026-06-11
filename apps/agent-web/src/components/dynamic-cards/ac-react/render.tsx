'use client'

/**
 * React-from-AC 렌더러 — Adaptive Cards payload 를 React 트리로 직접 렌더.
 *
 * AC SDK 의존 없이 우리가 지원하는 element 만 React 컴포넌트로 그린다.
 * - 토큰 / $data / $when 은 expand 단계(template.ts)에서 처리되어 들어옴.
 * - Input.* 값과 Action 디스패치는 AcRenderCtx 로 공유.
 *
 * 미지원 element 는 회색 경고 박스로 렌더 (debug 용).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type {
  AcAction,
  AcActionShowCard,
  AcActionSubmit,
  AcAdaptiveCard,
  AcColumn,
  AcColumnSet,
  AcContainer,
  AcElement,
  AcFactSet,
  AcImage,
  AcInputChoiceSet,
  AcInputText,
  AcTextBlock,
  AcContainerStyle,
} from './types'
import { expandPayload, visibleChildren, evalWhen } from './template'
import { AcRenderCtx, useAcRender, type AcRenderContext } from './context'
import {
  HitlActionsSlot,
  HitlArgsEditorSlot,
  HitlArgsViewSlot,
  HitlChoiceOptionsSlot,
  HitlChoicePromptSlot,
  HitlHeaderSlot,
  useHitlSlotCtx,
} from './hitl-slots'
import type {
  AcCustomHitlActions,
  AcCustomHitlArgsEditor,
  AcCustomHitlArgsView,
  AcCustomHitlChoiceOptions,
  AcCustomHitlChoicePrompt,
  AcCustomHitlHeader,
} from './types'

interface RootProps {
  payload: AcAdaptiveCard
  data: Record<string, unknown>
  mode?: 'runtime' | 'preview'
  onAction?: (action: { data: Record<string, unknown>; title?: string; actionId?: string }) => void
  className?: string
  /** true: 본문/액션을 감싸는 space-y-3 제거 (HITL 슬롯이 자체 여백을 책임짐). */
  compact?: boolean
}

export function AcReactCard({ payload, data, mode = 'runtime', onAction, className, compact = false }: RootProps) {
  const expanded = useMemo(() => expandPayload(payload, data), [payload, data])
  const [inputs, setInputs] = useState<Record<string, string>>(() => collectDefaultInputs(expanded))
  const [showCardOpen, setShowCardOpen] = useState<string | null>(null)

  // preview 에서는 payload 가 자주 바뀐다. expanded 가 바뀔 때마다 inputs 도 재seed 해서
  // value 바인딩이 즉시 반영되도록 한다 (사용자가 미리보기에서 input 에 손댔다면 그 값은 사라지지만
  // 미리보기 자체가 verification 목적이라 허용).
  useEffect(() => {
    if (mode === 'preview') {
      setInputs(collectDefaultInputs(expanded))
    }
  }, [expanded, mode])

  const ctx: AcRenderContext = useMemo(
    () => ({
      inputs,
      setInput: (id, value) => setInputs((prev) => ({ ...prev, [id]: value })),
      dispatch: (a) => {
        const merged = { ...inputs, ...a.data }
        onAction?.({ data: merged, title: a.title, actionId: a.actionId })
      },
      mode,
      showCardOpen,
      toggleShowCard: (id) => setShowCardOpen((cur) => (cur === id ? null : id)),
      compact,
    }),
    [inputs, onAction, mode, showCardOpen, compact],
  )

  return (
    <AcRenderCtx.Provider value={ctx}>
      <div className={cn('ac-react-card', className)}>
        <AcAdaptiveCardEl element={expanded} />
      </div>
    </AcRenderCtx.Provider>
  )
}

function collectDefaultInputs(card: AcAdaptiveCard): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(el: AcElement | undefined) {
    if (!el) return
    if (el.type === 'Input.Text' || el.type === 'Input.ChoiceSet') {
      const v = (el as AcInputText | AcInputChoiceSet).value
      if (typeof v === 'string') out[(el as AcInputText).id] = v
    }
    if (el.type === 'AdaptiveCard' || el.type === 'Container') {
      const items = (el as AcContainer).items ?? (el as AcAdaptiveCard).body
      items?.forEach(walk)
    }
    if (el.type === 'ColumnSet') {
      ;(el as AcColumnSet).columns?.forEach((c) => c.items?.forEach(walk))
    }
    // Action.ShowCard 내부 입력은 펼쳐졌을 때만 reset
  }
  card.body?.forEach(walk)
  return out
}

function AcAdaptiveCardEl({ element }: { element: AcAdaptiveCard }) {
  const ctx = useAcRender()
  return (
    <div className={ctx.compact ? '' : 'space-y-3'}>
      {visibleChildren(element.body).map((child, i) => (
        <AcAnyElement key={i} element={child} />
      ))}
      {element.actions && element.actions.length > 0 && (
        <AcActionRow actions={element.actions} />
      )}
    </div>
  )
}

function AcAnyElement({ element }: { element: AcElement }) {
  switch (element.type) {
    case 'AdaptiveCard':
      return <AcAdaptiveCardEl element={element} />
    case 'Container':
      return <AcContainerEl element={element} />
    case 'ColumnSet':
      return <AcColumnSetEl element={element} />
    case 'Column':
      return <AcColumnEl element={element} />
    case 'TextBlock':
      return <AcTextBlockEl element={element} />
    case 'FactSet':
      return <AcFactSetEl element={element} />
    case 'Input.Text':
      return <AcInputTextEl element={element} />
    case 'Input.ChoiceSet':
      return <AcInputChoiceSetEl element={element} />
    case 'Image':
      return <AcImageEl element={element} />
    case 'ActionSet':
      return <AcActionRow actions={element.actions} />
    case 'Custom.HitlHeader':
      return <HitlHeaderSlotDispatch overrides={element as AcCustomHitlHeader} />
    case 'Custom.HitlArgsView':
      return <HitlArgsViewSlotDispatch overrides={element as AcCustomHitlArgsView} />
    case 'Custom.HitlArgsEditor':
      return <HitlArgsEditorSlotDispatch overrides={element as AcCustomHitlArgsEditor} />
    case 'Custom.HitlActions':
      return <HitlActionsSlotDispatch labels={(element as AcCustomHitlActions).labels} />
    case 'Custom.HitlChoicePrompt':
      return <HitlChoicePromptSlotDispatch overrides={element as AcCustomHitlChoicePrompt} />
    case 'Custom.HitlChoiceOptions':
      return <HitlChoiceOptionsSlotDispatch overrides={element as AcCustomHitlChoiceOptions} />
    default: {
      const unknownEl = element as { type?: string }
      return (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[10px] text-amber-300">
          미지원 요소: {unknownEl.type ?? '(unknown)'}
        </div>
      )
    }
  }
}

const CONTAINER_STYLE_CLASS: Record<AcContainerStyle, string> = {
  default: 'p-3',
  emphasis: 'bg-fg/[0.04] border border-fg/15 rounded-xl p-3',
  accent: 'bg-sky-500/5 border border-sky-500/30 rounded-xl p-3',
  good: 'bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3',
  warning: 'bg-amber-500/5 border border-amber-500/30 rounded-xl p-3',
  attention: 'bg-red-500/5 border border-red-500/30 rounded-xl p-3',
}

function HitlHeaderSlotDispatch({ overrides }: { overrides?: AcCustomHitlHeader }) {
  const ctx = useHitlSlotCtx()
  return <HitlHeaderSlot ctx={ctx} overrides={overrides} />
}
function HitlArgsViewSlotDispatch({ overrides }: { overrides?: AcCustomHitlArgsView }) {
  const ctx = useHitlSlotCtx()
  return <HitlArgsViewSlot ctx={ctx} overrides={overrides} />
}
function HitlArgsEditorSlotDispatch({ overrides }: { overrides?: AcCustomHitlArgsEditor }) {
  const ctx = useHitlSlotCtx()
  return <HitlArgsEditorSlot ctx={ctx} overrides={overrides} />
}
function HitlActionsSlotDispatch({ labels }: { labels?: AcCustomHitlActions['labels'] }) {
  const ctx = useHitlSlotCtx()
  return <HitlActionsSlot ctx={ctx} labels={labels} />
}
function HitlChoicePromptSlotDispatch({ overrides }: { overrides?: AcCustomHitlChoicePrompt }) {
  const ctx = useHitlSlotCtx()
  return <HitlChoicePromptSlot ctx={ctx} overrides={overrides} />
}
function HitlChoiceOptionsSlotDispatch({ overrides }: { overrides?: AcCustomHitlChoiceOptions }) {
  const ctx = useHitlSlotCtx()
  return <HitlChoiceOptionsSlot ctx={ctx} overrides={overrides} />
}

function AcContainerEl({ element }: { element: AcContainer }) {
  const style = element.style ?? 'default'
  return (
    <div className="rounded-xl overflow-hidden px-4 py-3">
      <div className={cn(CONTAINER_STYLE_CLASS[style], 'space-y-2')}>
        {visibleChildren(element.items).map((child, i) => (
          <AcAnyElement key={i} element={child} />
        ))}
      </div>
    </div>
  )
}

function AcColumnSetEl({ element }: { element: AcColumnSet }) {
  const cols = (element.columns ?? []).filter((c) => c.isVisible !== false && evalWhen(c.$when))
  return (
    <div className="flex gap-3">
      {cols.map((c, i) => (
        <AcColumnEl key={i} element={c} />
      ))}
    </div>
  )
}

function AcColumnEl({ element }: { element: AcColumn }) {
  const width = element.width
  const isAuto = width === 'auto'
  const isStretch = width === 'stretch' || width === undefined
  return (
    <div
      className={cn(
        'min-w-0',
        isAuto && 'shrink-0',
        isStretch && 'flex-1',
        element.verticalContentAlignment === 'Center' && 'self-center',
        element.verticalContentAlignment === 'Bottom' && 'self-end',
      )}
      style={!isAuto && !isStretch && typeof width === 'number' ? { flexBasis: `${width}px` } : undefined}
    >
      <div className="space-y-2">
        {visibleChildren(element.items).map((child, i) => (
          <AcAnyElement key={i} element={child} />
        ))}
      </div>
    </div>
  )
}

const TEXT_SIZE_CLASS = {
  Small: 'text-[11px]',
  Default: 'text-xs',
  Medium: 'text-sm',
  Large: 'text-base',
  ExtraLarge: 'text-lg',
} as const

const TEXT_WEIGHT_CLASS = {
  Lighter: 'font-light',
  Default: 'font-normal',
  Bolder: 'font-semibold',
} as const

const TEXT_COLOR_CLASS = {
  Default: 'text-fg',
  Accent: 'text-sky-400',
  Good: 'text-emerald-400',
  Warning: 'text-amber-400',
  Attention: 'text-red-400',
} as const

function AcTextBlockEl({ element }: { element: AcTextBlock }) {
  const size = element.size ?? 'Default'
  const weight = element.weight ?? 'Default'
  const color = element.color ?? 'Default'
  const html = useMemo(() => renderInlineMarkdown(element.text ?? ''), [element.text])
  return (
    <p
      className={cn(
        TEXT_SIZE_CLASS[size],
        TEXT_WEIGHT_CLASS[weight],
        TEXT_COLOR_CLASS[color],
        element.fontType === 'Monospace' && 'font-mono',
        element.isSubtle && 'opacity-70',
        element.wrap === false ? 'truncate' : 'whitespace-pre-wrap break-words',
        element.horizontalAlignment === 'Center' && 'text-center',
        element.horizontalAlignment === 'Right' && 'text-right',
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** 매우 보수적인 inline markdown — bold (**...**) 와 줄바꿈만 처리. AC TextBlock 기본 동작과 호환. */
function renderInlineMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
}

function AcFactSetEl({ element }: { element: AcFactSet }) {
  const facts = element.facts ?? []
  if (facts.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {facts.map((f, i) => (
        <div key={i} className="contents">
          <dt className="font-semibold text-fg-muted">{f.title}</dt>
          <dd className="text-fg whitespace-pre-wrap break-words">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function AcInputTextEl({ element }: { element: AcInputText }) {
  const ctx = useAcRender()
  const value = ctx.inputs[element.id] ?? element.value ?? ''
  return (
    <div className="space-y-1">
      {element.label && <label className="text-xs font-semibold text-fg">{element.label}</label>}
      {element.isMultiline ? (
        <textarea
          rows={3}
          value={value}
          placeholder={element.placeholder}
          onChange={(e) => ctx.setInput(element.id, e.target.value)}
          className="w-full resize-y rounded-md border border-border bg-bg px-2 py-1.5 text-xs font-mono text-fg focus:border-sky-500/60 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          placeholder={element.placeholder}
          onChange={(e) => ctx.setInput(element.id, e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs font-mono text-fg focus:border-sky-500/60 focus:outline-none"
        />
      )}
    </div>
  )
}

function AcInputChoiceSetEl({ element }: { element: AcInputChoiceSet }) {
  const ctx = useAcRender()
  const value = ctx.inputs[element.id] ?? element.value ?? ''
  const choices = element.choices ?? []
  const expanded = element.style === 'expanded'
  if (expanded) {
    return (
      <div className="space-y-1">
        {element.label && <label className="text-xs font-semibold text-fg">{element.label}</label>}
        <div className="space-y-1">
          {choices.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-xs text-fg">
              <input
                type="radio"
                name={element.id}
                value={c.value}
                checked={value === c.value}
                onChange={() => ctx.setInput(element.id, c.value)}
              />
              <span>{c.title}</span>
            </label>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {element.label && <label className="text-xs font-semibold text-fg">{element.label}</label>}
      <select
        value={value}
        onChange={(e) => ctx.setInput(element.id, e.target.value)}
        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg focus:border-sky-500/60 focus:outline-none"
      >
        <option value="">선택</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.title}
          </option>
        ))}
      </select>
    </div>
  )
}

function AcImageEl({ element }: { element: AcImage }) {
  const size = element.size ?? 'auto'
  const dim =
    size === 'small'
      ? 'w-8 h-8'
      : size === 'medium'
        ? 'w-14 h-14'
        : size === 'large'
          ? 'w-20 h-20'
          : ''
  return (
    <div
      className={cn(
        'flex',
        element.horizontalAlignment === 'Center' && 'justify-center',
        element.horizontalAlignment === 'Right' && 'justify-end',
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={element.url}
        alt={element.altText ?? ''}
        className={cn(dim, element.style === 'person' && 'rounded-full', 'object-contain')}
      />
    </div>
  )
}

function AcActionRow({ actions }: { actions: AcAction[] }) {
  const visible = actions.filter((a) => a.isVisible !== false && evalWhen(a.$when))
  if (visible.length === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
      {visible.map((a, i) => (
        <AcActionBtn key={i} action={a} />
      ))}
    </div>
  )
}

function AcActionBtn({ action }: { action: AcAction }) {
  if (action.type === 'Action.Submit') return <AcActionSubmitBtn action={action} />
  if (action.type === 'Action.ShowCard') return <AcActionShowCardBtn action={action} />
  return null
}

const ACTION_STYLE_CLASS = {
  default: 'border border-border bg-[var(--color-surface-2)] text-fg hover:bg-surface-2',
  positive: 'bg-sky-500 text-white border border-sky-500 hover:bg-sky-400',
  destructive: 'border border-red-500/50 text-red-400 hover:bg-red-500/10',
} as const

function AcActionSubmitBtn({ action }: { action: AcActionSubmit }) {
  const ctx = useAcRender()
  const style = action.style ?? 'default'
  return (
    <button
      onClick={() =>
        ctx.dispatch({
          data: { ...(action.data ?? {}) },
          title: action.title,
          actionId: action.id,
        })
      }
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
        ACTION_STYLE_CLASS[style],
      )}
    >
      {action.title ?? '실행'}
    </button>
  )
}

function AcActionShowCardBtn({ action }: { action: AcActionShowCard }) {
  const ctx = useAcRender()
  const id = action.id ?? `showcard-${action.title ?? ''}`
  const open = ctx.showCardOpen === id
  const style = action.style ?? 'default'
  return (
    <ShowCardWrapper open={open} card={action.card}>
      <button
        onClick={() => ctx.toggleShowCard(id)}
        className={cn(
          'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
          ACTION_STYLE_CLASS[style],
          open && 'ring-1 ring-sky-500/40',
        )}
      >
        {action.title ?? '펼치기'}
      </button>
    </ShowCardWrapper>
  )
}

/**
 * ShowCard 본체는 ActionRow 옆이 아니라 ActionRow 아래에 표시되어야 한다.
 * 단순화 위해 button 과 함께 묶어서 wrapping fragment 로 처리하지 않고, button 만 노출하고
 * ShowCard 본체는 외부에서 컨텍스트(showCardOpen) 로 매칭해 별도 렌더한다.
 *
 * 1차에선 inline-after-button 방식: 펼쳐지면 버튼 아래에 카드 본체 노출.
 */
function ShowCardWrapper({
  open,
  card,
  children,
}: {
  open: boolean
  card: AcAdaptiveCard | undefined
  children: ReactNode
}) {
  return (
    <>
      {children}
      {open && card && (
        <div className="basis-full mt-2 rounded-lg border border-sky-500/30 bg-bg/60 p-3">
          <AcAdaptiveCardEl element={card} />
        </div>
      )}
    </>
  )
}

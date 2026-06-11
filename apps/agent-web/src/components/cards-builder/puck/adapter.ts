/**
 * Adaptive Cards payload ↔ Puck data 양방향 어댑터.
 *
 * DB 저장 형식은 AC payload 그대로 유지. Puck 은 편집 surface 일 뿐.
 *
 * 지원:
 *  - body[] 의 element 들 (재귀 — Container.items 도 편집 가능)
 *  - HITL 슬롯 4종 + TextBlock + Container + Input.Text/Number/Toggle/ChoiceSet
 *
 * 미지원 (1차 PoC 범위 밖):
 *  - ColumnSet/Column 자식 편집
 *  - actions[] (AdaptiveCard 최상위) — 시각 편집은 body 안의 ActionSet 으로 우회 필요
 *  - Action.ShowCard / Image / FactSet
 */

import type { Data as PuckData } from '@measured/puck'

const TYPE_MAP_AC_TO_PUCK: Record<string, string> = {
  'Custom.HitlHeader': 'HitlHeader',
  'Custom.HitlArgsView': 'HitlArgsView',
  'Custom.HitlArgsEditor': 'HitlArgsEditor',
  'Custom.HitlActions': 'HitlActions',
  TextBlock: 'TextBlock',
  Container: 'Container',
  FactSet: 'FactSet',
  'Input.Text': 'InputText',
  'Input.Number': 'InputNumber',
  'Input.Toggle': 'InputToggle',
  'Input.ChoiceSet': 'InputChoiceSet',
}

const TYPE_MAP_PUCK_TO_AC = Object.fromEntries(
  Object.entries(TYPE_MAP_AC_TO_PUCK).map(([k, v]) => [v, k]),
) as Record<string, string>

interface PuckItem {
  type: string
  props: Record<string, unknown> & { id: string }
}

type AcElement = Record<string, unknown> & { type?: string }

function isSupportedElement(el: AcElement | unknown): boolean {
  if (!el || typeof el !== 'object') return false
  const t = (el as AcElement).type
  if (typeof t !== 'string' || !(t in TYPE_MAP_AC_TO_PUCK)) return false
  if (t === 'Container') {
    const items = (el as { items?: unknown }).items
    if (Array.isArray(items)) return items.every(isSupportedElement)
  }
  return true
}

export function isAllSupported(payload: Record<string, unknown> | null): {
  ok: boolean
  reason?: string
} {
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'payload 가 비어있음' }
  const body = (payload as { body?: unknown }).body
  if (!Array.isArray(body)) return { ok: false, reason: 'body 가 배열이 아님' }
  const actions = (payload as { actions?: unknown }).actions
  if (Array.isArray(actions) && actions.length > 0) {
    return {
      ok: false,
      reason: '최상위 actions[] 는 시각 편집 미지원 — JSON 빌더에서 편집 후 토글하세요',
    }
  }
  for (let i = 0; i < body.length; i += 1) {
    const el = body[i] as AcElement
    if (!isSupportedElement(el)) {
      return {
        ok: false,
        reason: `body[${i}] 의 "${el?.type ?? '(unknown)'}" 는 시각 편집 미지원`,
      }
    }
  }
  return { ok: true }
}

let _idCounter = 0
function nextId(prefix: string): string {
  _idCounter += 1
  return `${prefix}-${Date.now()}-${_idCounter}`
}

function acElementToPuckItem(el: AcElement): PuckItem | null {
  const acType = el.type ?? ''
  const puckType = TYPE_MAP_AC_TO_PUCK[acType]
  if (!puckType) return null
  const { type: _t, items, ...rest } = el as { type?: string; items?: unknown } & Record<
    string,
    unknown
  >
  const props: Record<string, unknown> & { id: string } = {
    id: (typeof rest.id === 'string' && rest.id) || nextId(puckType),
    ...rest,
  }
  if (puckType === 'Container') {
    props.items = Array.isArray(items)
      ? items.map((c) => acElementToPuckItem(c as AcElement)).filter(Boolean)
      : []
  }
  // HitlActions: AC payload 의 nested labels{} 를 평탄화해서 필드에 노출
  if (puckType === 'HitlActions') {
    const labels = (rest.labels as Record<string, string> | undefined) ?? {}
    props.rejectLabel = labels.reject ?? '거부'
    props.nlEditLabel = labels.nlEdit ?? '자연어로 수정'
    props.directEditLabel = labels.directEdit ?? '직접 수정'
    props.approveLabel = labels.approve ?? '허용'
    delete (props as Record<string, unknown>).labels
  }
  if (puckType === 'HitlHeader') {
    props.title = (typeof rest.title === 'string' ? rest.title : '') || ''
    props.toolLabelOverride =
      (typeof rest.toolLabelOverride === 'string' ? rest.toolLabelOverride : '') || ''
  }
  if (puckType === 'HitlArgsView' || puckType === 'HitlArgsEditor') {
    const lo = (rest.labelsOverride as Record<string, string> | undefined) ?? {}
    props.labelsOverride = Object.entries(lo).map(([path, label]) => ({ path, label }))
    const hide = Array.isArray(rest.hide) ? (rest.hide as unknown[]) : []
    props.hide = hide.filter((p): p is string => typeof p === 'string').map((path) => ({ path }))
    const order = Array.isArray(rest.order) ? (rest.order as unknown[]) : []
    props.order = order.filter((p): p is string => typeof p === 'string').map((path) => ({ path }))
  }
  // Input.ChoiceSet: choices[] 그대로 통과 (Puck array field 가 동일 shape 사용)
  if (puckType === 'InputChoiceSet') {
    const choices = (rest.choices as Array<{ title?: string; value?: string }> | undefined) ?? []
    props.choices = choices.map((c) => ({ title: c.title ?? '', value: c.value ?? '' }))
  }
  // FactSet: facts[] 그대로 통과
  if (puckType === 'FactSet') {
    const facts = (rest.facts as Array<{ title?: string; value?: string }> | undefined) ?? []
    props.facts = facts.map((f) => ({ title: f.title ?? '', value: f.value ?? '' }))
  }
  return { type: puckType, props }
}

function puckItemToAcElement(item: PuckItem): AcElement {
  const acType = TYPE_MAP_PUCK_TO_AC[item.type] ?? item.type
  const {
    items,
    rejectLabel,
    nlEditLabel,
    directEditLabel,
    approveLabel,
    ...propsRest
  } = item.props as Record<string, unknown>
  const el: AcElement = { type: acType, ...propsRest }
  if (acType === 'Container' && Array.isArray(items)) {
    el.items = (items as PuckItem[])
      .filter((c) => c && typeof c === 'object' && 'type' in c)
      .map(puckItemToAcElement)
  }
  if (acType === 'Custom.HitlActions') {
    const labels: Record<string, string> = {}
    if (typeof rejectLabel === 'string') labels.reject = rejectLabel
    if (typeof nlEditLabel === 'string') labels.nlEdit = nlEditLabel
    if (typeof directEditLabel === 'string') labels.directEdit = directEditLabel
    if (typeof approveLabel === 'string') labels.approve = approveLabel
    if (Object.keys(labels).length) el.labels = labels
  }
  if (acType === 'Custom.HitlHeader') {
    const title = typeof el.title === 'string' ? (el.title as string).trim() : ''
    const toolLabelOverride =
      typeof el.toolLabelOverride === 'string' ? (el.toolLabelOverride as string).trim() : ''
    if (title) el.title = title
    else delete el.title
    if (toolLabelOverride) el.toolLabelOverride = toolLabelOverride
    else delete el.toolLabelOverride
  }
  if (acType === 'Custom.HitlArgsView' || acType === 'Custom.HitlArgsEditor') {
    const loArr = Array.isArray(el.labelsOverride)
      ? (el.labelsOverride as Array<{ path?: string; label?: string }>)
      : []
    const lo: Record<string, string> = {}
    for (const e of loArr) {
      if (e?.path) lo[e.path] = e.label ?? ''
    }
    if (Object.keys(lo).length) el.labelsOverride = lo
    else delete el.labelsOverride

    const hideArr = Array.isArray(el.hide) ? (el.hide as Array<{ path?: string }>) : []
    const hide = hideArr.map((e) => e?.path).filter((p): p is string => Boolean(p))
    if (hide.length) el.hide = hide
    else delete el.hide

    const orderArr = Array.isArray(el.order) ? (el.order as Array<{ path?: string }>) : []
    const order = orderArr.map((e) => e?.path).filter((p): p is string => Boolean(p))
    if (order.length) el.order = order
    else delete el.order

    // 슬롯 자체에는 더 이상 fields[] 를 관리하지 않음 (루트 argSchema 로 통합) — 기존에
    // 남아 있다면 정리.
    delete el.fields
  }
  return el
}

type ArgSchemaItem = {
  key: string
  label?: string
  required?: boolean
  widget?: string
  helper?: string
  default?: unknown
  choices?: Array<{ title: string; value: string }>
}

/** AC payload.argSchema → Puck root.props.argSchema (편집용 shape) */
function argSchemaToPuckItems(raw: unknown): ArgSchemaItem[] {
  if (!Array.isArray(raw)) return []
  return (raw as Array<Record<string, unknown>>).map((f) => ({
    key: typeof f.key === 'string' ? f.key : '',
    label: typeof f.label === 'string' ? f.label : '',
    required: f.required === true,
    widget: typeof f.widget === 'string' ? f.widget : '',
    helper: typeof f.helper === 'string' ? f.helper : '',
    choices: Array.isArray(f.choices)
      ? (f.choices as Array<{ title?: string; value?: string }>).map((c) => ({
          title: c.title ?? '',
          value: c.value ?? '',
        }))
      : [],
  })) as ArgSchemaItem[]
}

/** Puck root.props.argSchema → AC payload.argSchema (sparse 형식 — false/빈 값은 생략) */
function argSchemaFromPuckItems(items: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(items)) return []
  return (items as Array<Record<string, unknown>>)
    .filter((f) => typeof f?.key === 'string' && (f.key as string).length > 0)
    .map((f) => {
      const out: Record<string, unknown> = { key: f.key as string }
      if (typeof f.label === 'string' && f.label) out.label = f.label
      if (f.required === true) out.required = true
      if (typeof f.widget === 'string' && f.widget) out.widget = f.widget
      if (typeof f.helper === 'string' && f.helper) out.helper = f.helper
      if (Array.isArray(f.choices) && f.choices.length > 0) {
        out.choices = (f.choices as Array<{ title?: string; value?: string }>).map((c) => ({
          title: c.title ?? '',
          value: c.value ?? '',
        }))
      }
      return out
    })
}

export function acPayloadToPuckData(payload: Record<string, unknown>): PuckData {
  const body = Array.isArray((payload as { body?: unknown }).body)
    ? ((payload as { body: unknown[] }).body as AcElement[])
    : []
  const content = body
    .map((el) => acElementToPuckItem(el))
    .filter(Boolean) as PuckData['content']
  const argSchema = argSchemaToPuckItems(
    (payload as { argSchema?: unknown }).argSchema,
  )
  return {
    content,
    root: { props: { argSchema } as Record<string, unknown> },
  } as PuckData
}

export function puckDataToAcPayload(
  data: PuckData,
  basePayload: Record<string, unknown>,
): Record<string, unknown> {
  const body = (data.content ?? []).map((item) => puckItemToAcElement(item as PuckItem))
  const rootProps = ((data.root as { props?: Record<string, unknown> } | undefined)?.props ?? {}) as
    Record<string, unknown>
  const argSchema = argSchemaFromPuckItems(rootProps.argSchema)
  const next: Record<string, unknown> = { ...basePayload, body }
  if (argSchema.length > 0) next.argSchema = argSchema
  else delete next.argSchema
  return next
}

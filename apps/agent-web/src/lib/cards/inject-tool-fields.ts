/**
 * 도구 선택 시 payload 갱신:
 *  - AdaptiveCard 루트의 `argSchema` 에 inputSchema 변환 결과 set
 *    → HitlArgsView / HitlArgsEditor 슬롯이 ctx.argSchema 로 lookup (단일 source).
 *  - 슬롯의 `fields[]` 는 더 이상 사용하지 않으므로 정리.
 *  - 슬롯의 `labelsOverride` placeholder 도 박지 않고 사용자가 채운 값만 보존.
 *
 * inputSchema 가 null 이면 root argSchema 도 제거 (도구 해제).
 */

import { inputSchemaToArgSchema } from './input-schema-to-arg-schema'
import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-slots'

type AcElement = Record<string, unknown>

const SLOT_TYPES = new Set(['Custom.HitlArgsView', 'Custom.HitlArgsEditor'])

/** 빈 문자열 값만 있는 labelsOverride 는 placeholder 잔재로 보고 제거. */
function pruneEmptyOverrides(
  overrides: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!overrides) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(overrides)) {
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function injectToolFieldsIntoPayload(
  payload: Record<string, unknown> | null | undefined,
  inputSchema: unknown,
): { payload: Record<string, unknown>; argSchema: HitlArgFieldSchema[] | null } | null {
  if (!payload || typeof payload !== 'object') return null
  const next = { ...payload }
  const argSchema = inputSchema ? inputSchemaToArgSchema(inputSchema) : null

  // 1) 루트 argSchema 갱신
  if (argSchema && argSchema.length > 0) {
    next.argSchema = argSchema
  } else {
    delete next.argSchema
  }

  // 2) 슬롯의 fields[] 잔재 제거 + labelsOverride placeholder 정리
  const body = Array.isArray(next.body) ? (next.body as AcElement[]) : []
  const newBody = body.map((el) => {
    if (!el || typeof el !== 'object') return el
    const type = String((el as AcElement).type ?? '')
    if (!SLOT_TYPES.has(type)) return el
    const copy = { ...el } as AcElement
    delete copy.fields
    const kept = pruneEmptyOverrides(copy.labelsOverride as Record<string, string> | undefined)
    if (kept) copy.labelsOverride = kept
    else delete copy.labelsOverride
    return copy
  })
  next.body = newBody

  return { payload: next, argSchema }
}

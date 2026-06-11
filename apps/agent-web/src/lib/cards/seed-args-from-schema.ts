/**
 * argSchema (HitlArgFieldSchema[]) 를 walk 해 toolArgs 를 채운다.
 *
 * - dot-path / `[*]` 와일드카드 모두 처리. (`attendees[*].email` → `{ attendees: [{ email: '—' }] }`)
 * - 빈/누락된 항목만 placeholder 로 채움. 이미 채워진 값은 보존.
 * - 미리보기·시각 빌더 ctx 에서만 사용. 실제 런타임 toolArgs 는 건드리지 않는다.
 */

import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-slots'

function placeholderForWidget(widget: HitlArgFieldSchema['widget']): unknown {
  if (widget === 'switch') return false
  if (widget === 'number') return 0
  return '—'
}

function defaultForField(field: HitlArgFieldSchema): unknown {
  if (field.default !== undefined) return field.default
  if (field.choices && field.choices.length > 0) return field.choices[0].value
  return placeholderForWidget(field.widget)
}

export function seedArgsFromSchema(
  base: Record<string, unknown>,
  argSchema: HitlArgFieldSchema[] | null | undefined,
): Record<string, unknown> {
  if (!argSchema || argSchema.length === 0) return base
  const next: Record<string, unknown> = JSON.parse(JSON.stringify(base ?? {}))
  for (const field of argSchema) {
    const key = field.key
    if (!key) continue
    const segs = key.split('.')
    let cursor: Record<string, unknown> = next
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      const isLast = i === segs.length - 1
      const isArrayLeaf = seg.endsWith('[*]')
      const name = isArrayLeaf ? seg.slice(0, -3) : seg
      if (isArrayLeaf) {
        if (!Array.isArray(cursor[name])) cursor[name] = []
        const arr = cursor[name] as unknown[]
        if (arr.length === 0) arr.push({})
        const first = arr[0]
        if (first === null || typeof first !== 'object' || Array.isArray(first)) {
          arr[0] = {}
        }
        if (isLast) {
          // 배열 leaf (primitive) — 첫 항목을 placeholder 로
          if (arr[0] === undefined || arr[0] === null || arr[0] === '') {
            arr[0] = defaultForField(field)
          }
        } else {
          cursor = arr[0] as Record<string, unknown>
        }
      } else if (isLast) {
        const v = cursor[name]
        if (v === undefined || v === null || v === '') {
          cursor[name] = defaultForField(field)
        }
      } else {
        const v = cursor[name]
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
          cursor[name] = {}
        }
        cursor = cursor[name] as Record<string, unknown>
      }
    }
  }
  return next
}

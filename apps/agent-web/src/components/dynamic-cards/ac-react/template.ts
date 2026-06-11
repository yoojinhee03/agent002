/**
 * Adaptive Cards 템플릿 expand 래퍼.
 *
 * `adaptivecards-templating` 패키지를 그대로 사용한다. $data 반복, ${...} 토큰,
 * 일부 헬퍼(${if(...)}, ${count(...)}, ${contains(...)}) 모두 지원.
 *
 * 결과 트리는 다시 우리 React 렌더러가 walk 한다.
 */

import * as ACData from 'adaptivecards-templating'
import type { AcAdaptiveCard, AcElement } from './types'

/**
 * AC payload 에 root 데이터를 바인딩해 expand. 실패 시 원본 그대로 반환.
 */
export function expandPayload(
  payload: AcAdaptiveCard,
  data: Record<string, unknown>,
): AcAdaptiveCard {
  try {
    const template = new ACData.Template(payload as unknown as object)
    const expanded = template.expand({ $root: data })
    return expanded as AcAdaptiveCard
  } catch {
    return payload
  }
}

/**
 * $when 표현식 평가. expand 후에는 보통 boolean 으로 환원되지만 안전을 위해 string 도 처리.
 *  - true / "true"            → true
 *  - false / "false" / 비어있음 → false
 *  - 미지정 (undefined)         → true (default visible)
 */
export function evalWhen(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    if (t === '' || t === 'false' || t === '0' || t === 'null' || t === 'undefined') return false
    return true
  }
  return Boolean(value)
}

/**
 * 자식 elements 중 visible 한 것만 필터.
 */
export function visibleChildren<T extends AcElement>(items: T[] | undefined): T[] {
  if (!items) return []
  return items.filter((it) => {
    if (it.isVisible === false) return false
    if ('$when' in it) return evalWhen(it.$when)
    return true
  })
}

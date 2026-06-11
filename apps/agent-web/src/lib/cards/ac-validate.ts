/**
 * Adaptive Card payload 의 ${...} 토큰 추출, sampleData 와의 매핑 검사,
 * 카테고리별 invariants 검사 유틸.
 */

const TOKEN_RE = /\$\{([^${}]+)\}/g

function walkStrings(value: unknown, visit: (s: string) => void) {
  if (typeof value === 'string') {
    visit(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit)
    return
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) walkStrings(v, visit)
  }
}

export function extractTokens(payload: unknown): string[] {
  const found = new Set<string>()
  walkStrings(payload, (s) => {
    let m: RegExpExecArray | null
    TOKEN_RE.lastIndex = 0
    while ((m = TOKEN_RE.exec(s)) !== null) {
      const expr = m[1].trim()
      if (!expr) continue
      // root key only — `foo.bar[0]` → `foo`, skip $when / built-in $root
      const root = expr.replace(/^\$root\./, '').split(/[.[]/)[0]
      if (!root || root.startsWith('$')) continue
      found.add(root)
    }
  })
  return Array.from(found).sort()
}

export function sampleDataKeys(sample: Record<string, unknown> | null | undefined): string[] {
  if (!sample) return []
  return Object.keys(sample).sort()
}

export function unresolvedTokens(payload: unknown, sample: Record<string, unknown> | null): string[] {
  const tokens = extractTokens(payload)
  const keys = new Set(sampleDataKeys(sample))
  return tokens.filter((t) => !keys.has(t))
}

export interface PayloadIssue {
  severity: 'error' | 'warn'
  message: string
}

export function basicStructureIssues(payload: unknown): PayloadIssue[] {
  const issues: PayloadIssue[] = []
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    issues.push({ severity: 'error', message: 'payload 는 JSON 객체여야 합니다' })
    return issues
  }
  const p = payload as Record<string, unknown>
  if (p.type !== 'AdaptiveCard') {
    issues.push({ severity: 'error', message: 'type 은 "AdaptiveCard" 이어야 합니다' })
  }
  if (!('version' in p) || typeof p.version !== 'string') {
    issues.push({ severity: 'warn', message: 'version 이 누락되었습니다 (예: "1.5")' })
  }
  if (!Array.isArray(p.body)) {
    issues.push({ severity: 'error', message: 'body 는 배열이어야 합니다' })
  }
  if ('actions' in p && !Array.isArray(p.actions)) {
    issues.push({ severity: 'error', message: 'actions 는 배열이어야 합니다' })
  }
  return issues
}

function collectActions(payload: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const it of v) visit(it)
      return
    }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (typeof o.type === 'string' && o.type.startsWith('Action.')) out.push(o)
    for (const val of Object.values(o)) visit(val)
  }
  visit(payload)
  return out
}

function hasCustomType(payload: unknown, typeName: string): boolean {
  let found = false
  const visit = (v: unknown) => {
    if (found) return
    if (Array.isArray(v)) {
      for (const it of v) visit(it)
      return
    }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    if (o.type === typeName) {
      found = true
      return
    }
    for (const val of Object.values(o)) visit(val)
  }
  visit(payload)
  return found
}

export function categoryInvariants(payload: unknown): PayloadIssue[] {
  const issues: PayloadIssue[] = []
  // 슬롯 기반(Custom.HitlActions) 카드는 footer 버튼이 슬롯 내부에서 렌더되므로 통과시킨다.
  if (hasCustomType(payload, 'Custom.HitlActions')) return issues

  const actions = collectActions(payload)
  const submits = actions.filter((a) => a.type === 'Action.Submit')
  const decisions = new Set<string>()
  for (const a of submits) {
    const data = (a.data as Record<string, unknown> | undefined) ?? undefined
    if (!data) continue
    if (data.__handler !== 'hitl_respond') continue
    if (typeof data.decision === 'string') decisions.add(data.decision)
  }
  if (!decisions.has('approve') && !decisions.has('edit') && !decisions.has('choose')) {
    issues.push({
      severity: 'error',
      message: 'HITL 카드는 승인 계열(approve / edit / choose) Submit 액션 또는 Custom.HitlActions 슬롯이 최소 1개 필요합니다',
    })
  }
  if (!decisions.has('reject')) {
    issues.push({
      severity: 'warn',
      message: 'HITL 카드는 reject Submit 액션을 두는 것을 권장합니다',
    })
  }
  return issues
}

export interface ValidationReport {
  errors: PayloadIssue[]
  warnings: PayloadIssue[]
  unresolved: string[]
}

export function validatePayload(
  payload: unknown,
  sample: Record<string, unknown> | null,
): ValidationReport {
  const all = [...basicStructureIssues(payload), ...categoryInvariants(payload)]
  return {
    errors: all.filter((i) => i.severity === 'error'),
    warnings: all.filter((i) => i.severity === 'warn'),
    unresolved: unresolvedTokens(payload, sample),
  }
}

/**
 * HITL 카드 공용 헬퍼.
 *
 * 클라이언트 채팅·디버그 패널 양쪽에서 같은 라벨/포맷팅 규칙을 쓰도록 단일 출처로 모은다.
 * (원래 `AgentFlowDebugPanel.tsx` 에만 있던 정의를 추출)
 */

/**
 * 도구 라벨 오버라이드.
 * 우선순위: 이 맵 → 빌더 카탈로그(`apps/api/src/modules/tools/builtin-catalog.ts`) → 폴백(raw name).
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  gmail_search: 'Gmail 검색',
  gmail_fetch: 'Gmail 메일 본문 읽기',
  current_time: '현재 시각 조회',
  web_search: '웹 검색',
  web_fetch: '웹 페이지 읽기',
}

export const ARG_LABELS: Record<string, string> = {
  q: '검색어',
  query: '검색어',
  max_results: '최대 결과 개수',
  maxResults: '최대 결과 개수',
  limit: '최대 개수',
  url: '주소',
  message_id: '메일 ID',
  messageId: '메일 ID',
  to: '받는 사람',
  subject: '제목',
  body: '본문',
}

export function formatArgValue(value: unknown): string {
  if (value === null || value === undefined) return '(없음)'
  if (typeof value === 'string') return value.length > 0 ? value : '(빈 문자열)'
  if (typeof value === 'boolean') return value ? '예' : '아니오'
  if (typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function formatArgForPrompt(value: unknown): string {
  if (value === undefined) return '(없음)'
  if (value === null) return 'null'
  if (typeof value === 'string') return `"${value}"`
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** 직접 수정 시 args diff + 사용자 의도를 자연어 editPrompt 로 합성. */
export function buildDirectEditFollowup(
  initialArgs: Record<string, unknown>,
  nextArgs: Record<string, unknown>,
  userTaskDescription?: string,
): string {
  const lines: string[] = []
  const keys = Array.from(new Set([...Object.keys(initialArgs), ...Object.keys(nextArgs)]))
  for (const key of keys) {
    const before = formatArgForPrompt(initialArgs[key])
    const after = formatArgForPrompt(nextArgs[key])
    if (before !== after) lines.push(`- ${key}: ${before} → ${after}`)
  }
  const parts: string[] = []
  if (lines.length > 0) {
    parts.push('방금 인자를 직접 다음과 같이 수정했어요:')
    parts.push(...lines)
    parts.push('')
  }
  if (userTaskDescription && userTaskDescription.trim().length > 0) {
    parts.push(`그리고 작업 의도는 다음과 같습니다: ${userTaskDescription.trim()}`)
    parts.push('')
  }
  parts.push('이전 도구 결과를 새 인자·의도에 맞춰 다시 정리해 주세요.')
  return parts.join('\n')
}

// ============================================================
// 다계층 인자 트리 — 자동 introspection + dot-path 라벨 해석
// ============================================================

export interface FieldNode {
  /** 'filters[0].field' — 실제 값 위치 (편집 시 setByPath 인자) */
  path: string
  /** 'filters[*].field' — 라벨 lookup 키 (배열은 [*] 와일드카드) */
  templatePath: string
  label: string
  value: unknown
  /** leaf = primitive, group = object/array */
  kind: 'leaf' | 'group'
  depth: number
  /** group 인 경우 children */
  children?: FieldNode[]
  /** array 자식 그룹 표시용 */
  isArrayItem?: boolean
  arrayIndex?: number
}

export interface LabelSources {
  /** 카드 element 의 labelsOverride props */
  override?: Record<string, string>
  /** 도구 사전 (PR3 에서 주입) */
  tool?: Record<string, string>
}

const _lastSegment = (templatePath: string): string => {
  const noIndex = templatePath.replace(/\[\*\]/g, '')
  const segs = noIndex.split('.')
  return segs[segs.length - 1] ?? templatePath
}

export function resolveLabel(templatePath: string, sources: LabelSources): string {
  const override = sources.override?.[templatePath]
  if (override) return override
  const tool = sources.tool?.[templatePath]
  if (tool) return tool
  const last = _lastSegment(templatePath)
  const fallback = ARG_LABELS[last]
  if (fallback) return fallback
  return last || templatePath
}

/**
 * toolArgs 를 재귀적으로 walk 해 FieldNode 트리를 만든다.
 * 최상위는 항상 object 가정 (toolArgs: Record<string, unknown>).
 */
export function walkArgs(
  value: unknown,
  sources: LabelSources = {},
  opts: { depth?: number; path?: string; tplPath?: string } = {},
): FieldNode[] {
  const depth = opts.depth ?? 0
  const path = opts.path ?? ''
  const tplPath = opts.tplPath ?? ''
  if (value === null || value === undefined || typeof value !== 'object') return []

  if (Array.isArray(value)) {
    return value.map((item, i): FieldNode => {
      const childPath = `${path}[${i}]`
      const childTpl = `${tplPath}[*]`
      const itemLabel = `${i + 1}`
      const isContainer = item !== null && typeof item === 'object'
      if (isContainer) {
        const children = walkArgs(item, sources, {
          depth: depth + 1,
          path: childPath,
          tplPath: childTpl,
        })
        return {
          path: childPath,
          templatePath: childTpl,
          label: itemLabel,
          value: item,
          kind: 'group',
          depth,
          children,
          isArrayItem: true,
          arrayIndex: i,
        }
      }
      return {
        path: childPath,
        templatePath: childTpl,
        label: itemLabel,
        value: item,
        kind: 'leaf',
        depth,
        isArrayItem: true,
        arrayIndex: i,
      }
    })
  }

  return Object.entries(value as Record<string, unknown>).map(([key, v]): FieldNode => {
    const childPath = path ? `${path}.${key}` : key
    const childTpl = tplPath ? `${tplPath}.${key}` : key
    const label = resolveLabel(childTpl, sources)
    const isContainer = v !== null && typeof v === 'object'
    if (isContainer) {
      const children = walkArgs(v, sources, {
        depth: depth + 1,
        path: childPath,
        tplPath: childTpl,
      })
      return {
        path: childPath,
        templatePath: childTpl,
        label,
        value: v,
        kind: 'group',
        depth,
        children,
      }
    }
    return {
      path: childPath,
      templatePath: childTpl,
      label,
      value: v,
      kind: 'leaf',
      depth,
    }
  })
}

/**
 * hide / order 를 트리에 적용. templatePath 기준.
 * - hide 에 포함된 templatePath 의 노드(및 그 하위) 제거
 * - order 가 있으면 최상위만 그 순서대로 정렬 (없는 항목은 뒤에 원래 순서 유지)
 */
export function applyHideOrder(
  nodes: FieldNode[],
  hide?: string[],
  order?: string[],
): FieldNode[] {
  const hideSet = new Set(hide ?? [])
  const recurse = (list: FieldNode[]): FieldNode[] =>
    list
      .filter((n) => !hideSet.has(n.templatePath))
      .map((n) =>
        n.children ? { ...n, children: recurse(n.children) } : n,
      )
  let result = recurse(nodes)
  if (order && order.length > 0) {
    const idx = new Map(order.map((p, i) => [p, i] as const))
    result = [...result].sort((a, b) => {
      const ai = idx.get(a.templatePath) ?? Number.MAX_SAFE_INTEGER
      const bi = idx.get(b.templatePath) ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
  }
  return result
}

/** 'filters[0].field' → ['filters', 0, 'field'] */
function tokenize(path: string): (string | number)[] {
  const tokens: (string | number)[] = []
  let i = 0
  let buf = ''
  while (i < path.length) {
    const c = path[i]
    if (c === '.') {
      if (buf) {
        tokens.push(buf)
        buf = ''
      }
      i++
    } else if (c === '[') {
      if (buf) {
        tokens.push(buf)
        buf = ''
      }
      const end = path.indexOf(']', i)
      if (end < 0) break
      tokens.push(Number(path.slice(i + 1, end)))
      i = end + 1
    } else {
      buf += c
      i++
    }
  }
  if (buf) tokens.push(buf)
  return tokens
}

/** 깊은 클론 후 path 위치에 value 를 쓰는 헬퍼. 원본은 변경하지 않음. */
export function setByPath<T>(root: T, path: string, value: unknown): T {
  const cloned: unknown = JSON.parse(JSON.stringify(root))
  const tokens = tokenize(path)
  if (tokens.length === 0) return value as T
  let node: unknown = cloned
  for (let j = 0; j < tokens.length - 1; j++) {
    const seg = tokens[j]
    if (node && typeof node === 'object') {
      node = (node as Record<string | number, unknown>)[seg]
    }
  }
  const last = tokens[tokens.length - 1]
  if (node && typeof node === 'object') {
    ;(node as Record<string | number, unknown>)[last] = value
  }
  return cloned as T
}

/** 깊은 클론 후 path 위치에 새 배열 항목을 push. path 가 '' 이면 root 가 배열이어야 함. */
export function pushArrayItem<T>(root: T, arrayPath: string, item: unknown): T {
  const cloned: unknown = JSON.parse(JSON.stringify(root))
  if (arrayPath === '') {
    if (Array.isArray(cloned)) cloned.push(item)
    return cloned as T
  }
  const tokens = tokenize(arrayPath)
  let node: unknown = cloned
  for (const seg of tokens) {
    if (node && typeof node === 'object') {
      node = (node as Record<string | number, unknown>)[seg]
    }
  }
  if (Array.isArray(node)) node.push(item)
  return cloned as T
}

/** 깊은 클론 후 `xxx[idx]` 형식의 path 위치의 배열 항목을 제거. */
export function removeArrayItem<T>(root: T, itemPath: string): T {
  const m = itemPath.match(/^(.*)\[(\d+)\]$/)
  if (!m) return root
  const arrayPath = m[1]
  const idx = Number(m[2])
  const cloned: unknown = JSON.parse(JSON.stringify(root))
  let node: unknown = cloned
  if (arrayPath !== '') {
    const tokens = tokenize(arrayPath)
    for (const seg of tokens) {
      if (node && typeof node === 'object') {
        node = (node as Record<string | number, unknown>)[seg]
      }
    }
  }
  if (Array.isArray(node)) node.splice(idx, 1)
  return cloned as T
}

/** 객체/배열 트리의 leaf 값들을 빈 placeholder 로 리셋한다 (새 배열 항목 템플릿용). */
export function resetLeafValues(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean') return false
  if (typeof v === 'number') return 0
  if (typeof v === 'string') return ''
  if (Array.isArray(v)) return []
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = resetLeafValues(val)
    }
    return out
  }
  return ''
}

/** 트리에서 leaf 만 평탄화 (편집 draft 초기화용). */
export function flattenLeaves(nodes: FieldNode[]): FieldNode[] {
  const out: FieldNode[] = []
  const walk = (list: FieldNode[]) => {
    for (const n of list) {
      if (n.kind === 'leaf') out.push(n)
      else if (n.children) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

/** value 타입으로 위젯 추론 (slot 컴포넌트에서 공유). */
export function inferWidgetFromValue(
  value: unknown,
): 'input' | 'textarea' | 'number' | 'switch' | 'json' {
  if (typeof value === 'boolean') return 'switch'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'object' && value !== null) return 'json'
  if (typeof value === 'string' && value.length > 60) return 'textarea'
  return 'input'
}

export function parseArgValue(original: unknown, input: string): unknown {
  const trimmed = input.trim()
  if (typeof original === 'number') {
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : original
  }
  if (typeof original === 'boolean') {
    const low = trimmed.toLowerCase()
    if (['예', 'true', 'yes', 'y', '1'].includes(low)) return true
    if (['아니오', 'false', 'no', 'n', '0'].includes(low)) return false
    return original
  }
  if (original !== null && typeof original === 'object') {
    try {
      return JSON.parse(input)
    } catch {
      return original
    }
  }
  return input
}

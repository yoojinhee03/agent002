/**
 * JSON Schema → leaf dot-path 후보 추출.
 *
 * PR1 `walkArgs` (값 기반) 와 동일한 dot-path 컨벤션:
 * - object.properties.X    → 'X' (또는 'parent.X')
 * - array.items.properties → 'parent[*].X'
 * - leaf = type 이 string/number/boolean/integer (없으면 leaf 로 간주하지 않음)
 *
 * HITL 카드 라벨 사전의 path 후보 자동 시드용.
 */

type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
}

const LEAF_TYPES = new Set(['string', 'number', 'integer', 'boolean'])

function isLeaf(schema: JsonSchema): boolean {
  const t = schema.type
  if (typeof t === 'string') return LEAF_TYPES.has(t)
  if (Array.isArray(t)) return t.some((x) => LEAF_TYPES.has(x))
  return false
}

function walk(schema: JsonSchema | undefined, prefix: string, out: string[]): void {
  if (!schema || typeof schema !== 'object') return
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, child] of Object.entries(schema.properties)) {
      const childPath = prefix ? `${prefix}.${key}` : key
      if (isLeaf(child)) {
        out.push(childPath)
      } else if (child && typeof child === 'object') {
        const childType = Array.isArray(child.type) ? child.type[0] : child.type
        if (childType === 'array' && child.items) {
          walk(child.items, `${childPath}[*]`, out)
        } else {
          walk(child, childPath, out)
        }
      }
    }
  }
}

export function extractLeafPaths(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return []
  const out: string[] = []
  walk(schema as JsonSchema, '', out)
  return out
}

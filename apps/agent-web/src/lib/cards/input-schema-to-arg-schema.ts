/**
 * 도구의 inputSchema (JSON Schema 형태) → 카드 정의의 argSchema (HitlArgFieldSchema[]) 변환.
 *
 * HitlArgFieldSchema (`components/dynamic-cards/ac-react/hitl-slots.ts:41`) 형태:
 *   { key, label?, widget?, helper?, required?, default?, choices? }
 *
 * dot-path 컨벤션은 PR1 `walkArgs` / PR4 `extractLeafPaths` 와 동일:
 *   - object.properties.foo → 'foo'
 *   - object.properties.parent.properties.child → 'parent.child'
 *   - array.items.object.properties.field → 'parent[*].field'
 */

import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-slots'

type JsonSchemaNode = {
  type?: string | string[]
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
  items?: JsonSchemaNode
}

const LEAF_TYPES = new Set(['string', 'integer', 'number', 'boolean'])

function toWidget(node: JsonSchemaNode): HitlArgFieldSchema['widget'] | undefined {
  if (Array.isArray(node.enum) && node.enum.length > 0) return 'select'
  const t = Array.isArray(node.type) ? node.type[0] : node.type
  if (t === 'boolean') return 'switch'
  if (t === 'integer' || t === 'number') return 'number'
  return undefined
}

function toChoices(node: JsonSchemaNode): HitlArgFieldSchema['choices'] | undefined {
  if (!Array.isArray(node.enum)) return undefined
  return node.enum.map((v) => ({ title: String(v), value: String(v) }))
}

function walk(
  node: JsonSchemaNode | undefined,
  path: string,
  required: boolean,
  out: HitlArgFieldSchema[],
): void {
  if (!node || typeof node !== 'object') return
  const t = Array.isArray(node.type) ? node.type[0] : node.type

  if (t === 'object' && node.properties) {
    const req = new Set(node.required ?? [])
    for (const [key, child] of Object.entries(node.properties)) {
      const childPath = path ? `${path}.${key}` : key
      walk(child, childPath, req.has(key), out)
    }
    return
  }

  if (t === 'array' && node.items) {
    const childPath = `${path}[*]`
    const itemT = Array.isArray(node.items.type) ? node.items.type[0] : node.items.type
    if (itemT === 'object' && node.items.properties) {
      walk(node.items, childPath, false, out)
    } else if (itemT && LEAF_TYPES.has(itemT)) {
      out.push(buildField(childPath, node.items, false))
    }
    return
  }

  if (t && LEAF_TYPES.has(t)) {
    out.push(buildField(path, node, required))
  }
}

function buildField(
  path: string,
  node: JsonSchemaNode,
  required: boolean,
): HitlArgFieldSchema {
  return {
    key: path,
    label: typeof node.title === 'string' ? node.title : undefined,
    helper: typeof node.description === 'string' ? node.description : undefined,
    widget: toWidget(node),
    required: required || undefined,
    default: node.default,
    choices: toChoices(node),
  }
}

export function inputSchemaToArgSchema(schema: unknown): HitlArgFieldSchema[] | null {
  if (!schema || typeof schema !== 'object') return null
  const root = schema as JsonSchemaNode
  if (!root.properties) return null
  const out: HitlArgFieldSchema[] = []
  walk(root, '', false, out)
  return out.length > 0 ? out : null
}

function sampleValue(node: JsonSchemaNode, key: string): unknown {
  if (node.default !== undefined) return node.default
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0]
  const t = Array.isArray(node.type) ? node.type[0] : node.type
  if (t === 'string') return `샘플 ${key}`
  if (t === 'integer' || t === 'number') return 0
  if (t === 'boolean') return false
  if (t === 'array') {
    const items = node.items
    if (items) {
      const itemT = Array.isArray(items.type) ? items.type[0] : items.type
      if (itemT === 'object' && items.properties) {
        return [buildSampleArgs(items) ?? {}]
      }
      if (itemT && LEAF_TYPES.has(itemT)) {
        return [sampleValue(items, key)]
      }
    }
    return [`샘플 ${key}`]
  }
  if (t === 'object') return buildSampleArgs(node) ?? {}
  return `샘플 ${key}`
}

/**
 * inputSchema 의 top-level properties 만 사용해 sampleData.toolArgs 형태의 객체 생성.
 * 슬롯이 walkArgs(toolArgs) 로 트리를 그리므로 key 만 맞으면 라벨이 반영된다.
 */
export function buildSampleArgs(schema: unknown): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object') return null
  const root = schema as JsonSchemaNode
  if (!root.properties) return null
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(root.properties)) {
    out[key] = sampleValue(child, key)
  }
  return Object.keys(out).length > 0 ? out : null
}

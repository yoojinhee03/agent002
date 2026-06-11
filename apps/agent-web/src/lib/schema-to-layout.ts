/**
 * JSON Schema → 동적 카드 layout 변환기.
 * schema(object) 의 properties 를 순회해 BlockNode 목록(body)을 생성한다.
 * 재귀 호출 깊이는 MAX_DEPTH 로 제한한다.
 */

const MAX_DEPTH = 8

export interface JSONSchema {
  type?: string | string[]
  title?: string
  description?: string
  enum?: unknown[]
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  multipleOf?: number
  [key: string]: unknown
}

export interface BlockNode {
  type: string
  [key: string]: unknown
}

export interface ActionNode {
  id: string
  label: string
  style: string
  handler: Record<string, unknown>
  input?: Record<string, unknown>
}

export interface SchemaToLayoutOptions {
  schema: JSONSchema
  args?: Record<string, unknown>
  mode: 'approval' | 'input'
  baseTemplate?: {
    header?: Record<string, unknown>
    footer?: ActionNode[]
  }
}

export interface LayoutResult {
  header: Record<string, unknown>
  body: BlockNode[]
  footer: ActionNode[]
}

function primaryType(schema: JSONSchema): string {
  if (Array.isArray(schema.type)) {
    const nonNull = schema.type.filter((t) => t !== 'null')
    return nonNull[0] ?? 'string'
  }
  return schema.type ?? 'string'
}

function schemaToBlock(
  propName: string,
  schema: JSONSchema,
  defaultValue: unknown,
  depth: number,
): BlockNode | null {
  if (depth > MAX_DEPTH) return null

  const label = schema.title ?? propName
  const description = schema.description

  if (schema.enum && schema.enum.length > 0) {
    return {
      type: 'choice_chip_input',
      label,
      description,
      fieldKey: propName,
      defaultValue,
      chips: schema.enum.map((v) => ({
        label: String(v),
        value: String(v),
      })),
    }
  }

  const t = primaryType(schema)

  if (t === 'object' && schema.properties) {
    const childProperties: Record<string, BlockNode> = {}
    for (const [childKey, childSchema] of Object.entries(schema.properties)) {
      const childDefault =
        defaultValue !== null &&
        typeof defaultValue === 'object' &&
        !Array.isArray(defaultValue)
          ? (defaultValue as Record<string, unknown>)[childKey]
          : undefined
      const childBlock = schemaToBlock(childKey, childSchema, childDefault, depth + 1)
      if (childBlock) {
        childProperties[childKey] = childBlock
      }
    }
    return {
      type: 'object_input',
      label,
      description,
      fieldKey: propName,
      properties: childProperties,
      defaultValue,
    }
  }

  if (t === 'array') {
    const itemSchema = schema.items ?? { type: 'string' }
    const rawDefaults = Array.isArray(defaultValue) ? defaultValue : []
    const itemBlock = schemaToBlock(`${propName}[item]`, itemSchema, rawDefaults[0], depth + 1)
    if (!itemBlock) return null
    return {
      type: 'array_input',
      label,
      description,
      fieldKey: propName,
      itemBlock,
      defaultValue: rawDefaults,
      minItems: schema.minItems,
      maxItems: schema.maxItems,
    }
  }

  if (t === 'number' || t === 'integer') {
    return {
      type: 'number_input',
      label,
      description,
      fieldKey: propName,
      defaultValue,
      min: schema.minimum,
      max: schema.maximum,
      step: schema.multipleOf ?? (t === 'integer' ? 1 : undefined),
    }
  }

  if (t === 'boolean') {
    return {
      type: 'boolean_input',
      label,
      description,
      fieldKey: propName,
      defaultValue,
    }
  }

  // string (fallback)
  return {
    type: 'string_input',
    label,
    description,
    fieldKey: propName,
    defaultValue,
    placeholder: description ? `${description}` : `${label} 입력...`,
    multiline: false,
  }
}

function defaultFooter(mode: 'approval' | 'input'): ActionNode[] {
  if (mode === 'approval') {
    // deepagents 4 decision (approve/reject/edit/respond) 매핑.
    //  - 승인: approve
    //  - 거부: reject
    //  - 수정 요청 (NL): preview_edit → 백엔드가 LLM 으로 args 재작성 → pseudo 카드 push
    //  - 직접 수정 적용: edit + editedAction = {name: primaryToolName, args: formState}
    return [
      {
        id: 'approve',
        label: '승인',
        style: 'primary',
        handler: {
          type: 'hitl_respond',
          decision: 'approve',
          interactionId: '{{data.interactionId}}',
        },
      },
      {
        id: 'reject',
        label: '거부',
        style: 'danger',
        handler: {
          type: 'hitl_respond',
          decision: 'reject',
          interactionId: '{{data.interactionId}}',
        },
      },
      {
        id: 'preview_edit',
        label: '수정 요청',
        style: 'secondary',
        input: { type: 'textarea', placeholder: '어떻게 수정할지 입력...' },
        handler: {
          type: 'preview_edit',
          interactionId: '{{data.interactionId}}',
          editPrompt: '{{input}}',
        },
      },
      {
        id: 'apply_edit',
        label: '직접 수정 적용',
        style: 'secondary',
        handler: {
          type: 'hitl_respond',
          decision: 'edit',
          interactionId: '{{data.interactionId}}',
          editedAction: {
            name: '{{data.primaryToolName}}',
            args: '{{formState}}',
          },
        },
      },
    ]
  }
  return [
    {
      id: 'submit',
      label: '제출',
      style: 'primary',
      handler: {
        type: 'hitl_respond',
        decision: 'respond',
        value: '{{input}}',
        interactionId: '{{data.interactionId}}',
      },
    },
    {
      id: 'cancel',
      label: '취소',
      style: 'secondary',
      handler: {
        type: 'hitl_respond',
        decision: 'cancel',
        interactionId: '{{data.interactionId}}',
      },
    },
  ]
}

export function schemaToLayout(opts: SchemaToLayoutOptions): LayoutResult {
  const { schema, args = {}, mode, baseTemplate } = opts

  const body: BlockNode[] = []

  if (schema.type === 'object' && schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const block = schemaToBlock(propName, propSchema, args[propName], 0)
      if (block) body.push(block)
    }
  }

  const header: Record<string, unknown> = baseTemplate?.header ?? {
    title: mode === 'approval' ? '도구 실행 승인 요청' : '입력이 필요합니다',
  }

  const footer: ActionNode[] = baseTemplate?.footer ?? defaultFooter(mode)

  return { header, body, footer }
}

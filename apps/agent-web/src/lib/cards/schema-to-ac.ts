/**
 * JSON Schema → Adaptive Card Input.* element 변환.
 *
 * 지원 타입: string / number / integer / boolean / enum / string[].
 * 미지원/복합 타입(object 중첩, anyOf 등)은 Input.Text (멀티라인) 로 fallback.
 */

interface JsonSchemaProp {
  type?: string | string[]
  title?: string
  description?: string
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  format?: string
}

interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

export interface SchemaToAcResult {
  /** body 에 push 할 element 들 */
  inputs: Array<Record<string, unknown>>
  /** Action.Submit data 에 들어가야 하는 sample 키 — sampleData 자동 채움용 */
  fieldIds: string[]
}

export function schemaToAcInputs(schema: unknown): SchemaToAcResult {
  const result: SchemaToAcResult = { inputs: [], fieldIds: [] }
  if (!schema || typeof schema !== 'object') return result
  const s = schema as JsonSchema
  if (s.type !== 'object' || !s.properties) return result
  const required = new Set(s.required ?? [])
  for (const [name, propRaw] of Object.entries(s.properties)) {
    const prop = propRaw ?? {}
    const isReq = required.has(name)
    result.fieldIds.push(name)
    const label = prop.title ?? name
    const types = Array.isArray(prop.type) ? prop.type : [prop.type ?? 'string']
    const t = types[0]

    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      result.inputs.push({
        type: 'Input.ChoiceSet',
        id: name,
        label,
        isRequired: isReq,
        style: 'compact',
        value: prop.default != null ? String(prop.default) : undefined,
        choices: prop.enum.map((v) => ({ title: String(v), value: String(v) })),
      })
      continue
    }

    if (t === 'boolean') {
      result.inputs.push({
        type: 'Input.Toggle',
        id: name,
        title: label,
        valueOn: 'true',
        valueOff: 'false',
        value: prop.default === true ? 'true' : 'false',
      })
      continue
    }

    if (t === 'number' || t === 'integer') {
      result.inputs.push({
        type: 'Input.Number',
        id: name,
        label,
        isRequired: isReq,
        placeholder: prop.description,
        min: prop.minimum,
        max: prop.maximum,
        value: typeof prop.default === 'number' ? prop.default : undefined,
      })
      continue
    }

    if (prop.format === 'date') {
      result.inputs.push({ type: 'Input.Date', id: name, label, isRequired: isReq })
      continue
    }

    // string / 기타 → Input.Text
    const isLong =
      typeof prop.description === 'string' && prop.description.length > 60
    result.inputs.push({
      type: 'Input.Text',
      id: name,
      label,
      isRequired: isReq,
      placeholder: prop.description,
      isMultiline: isLong || prop.format === 'textarea',
      value: typeof prop.default === 'string' ? prop.default : undefined,
    })
  }
  return result
}

/**
 * 생성된 Input 들을 Action.Submit data 에 매핑 — 모든 field 가 그대로 data 로 들어간다.
 * (AC 의 Action.Submit 은 카드 안의 모든 Input value 를 자동으로 data 에 머지하므로
 *  별도 매핑 없이 핸들러 메타만 추가하면 된다.)
 */
export function buildSubmitAction(
  handler: string,
  title: string,
  extraData: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'Action.Submit',
    title,
    style: 'positive',
    data: { __handler: handler, ...extraData },
  }
}

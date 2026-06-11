import type { StructuredOutputFormat } from "@/types/prompt"

/* ─── JSON Schema Validation ─── */

export function validateJsonSchema(schemaStr: string): {
  valid: boolean
  error?: string
} {
  if (!schemaStr.trim()) return { valid: false, error: "스키마가 비어있습니다" }

  let parsed: unknown
  try {
    parsed = JSON.parse(schemaStr)
  } catch (e) {
    return { valid: false, error: `JSON 파싱 오류: ${(e as Error).message}` }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "스키마는 JSON 객체여야 합니다" }
  }

  const obj = parsed as Record<string, unknown>
  if (!obj.type) {
    return { valid: false, error: '"type" 필드가 필요합니다' }
  }

  const validTypes = ["object", "array", "string", "number", "integer", "boolean"]
  if (!validTypes.includes(obj.type as string)) {
    return {
      valid: false,
      error: `유효하지 않은 type: "${obj.type}". 허용: ${validTypes.join(", ")}`,
    }
  }

  if (obj.type === "object" && !obj.properties) {
    return { valid: false, error: 'type이 "object"이면 "properties"가 필요합니다' }
  }

  return { valid: true }
}

/* ─── Mock Data Generation from Schema ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateMockFromSchema(schema: Record<string, any>): unknown {
  const type = schema.type as string

  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[Math.floor(Math.random() * schema.enum.length)]
  }

  switch (type) {
    case "object": {
      const result: Record<string, unknown> = {}
      const props = (schema.properties ?? {}) as Record<string, unknown>
      const required = (schema.required ?? Object.keys(props)) as string[]

      for (const key of required) {
        if (props[key]) {
          result[key] = generateMockFromSchema(props[key] as Record<string, unknown>)
        }
      }
      return result
    }

    case "array": {
      const itemSchema = schema.items as Record<string, unknown> | undefined
      if (itemSchema) {
        return [generateMockFromSchema(itemSchema)]
      }
      return ["sample_item"]
    }

    case "string": {
      if (schema.enum) return schema.enum[0]
      return "sample_value"
    }

    case "number":
    case "integer":
      return 42

    case "boolean":
      return true

    default:
      return null
  }
}

/* ─── Structured Output Support Check ─── */

export function isStructuredOutputSupported(capabilities: string[]): boolean {
  return capabilities.includes("structured-output")
}

/* ─── Default Format by Provider ─── */

export function getDefaultFormat(providerSlug: string): StructuredOutputFormat {
  switch (providerSlug) {
    case "openai":
      return "json_schema"
    case "anthropic":
      return "tool_use"
    case "google":
      return "response_schema"
    default:
      return "custom"
  }
}

/* ─── Default Schema Template ─── */

export function getDefaultSchema(): string {
  return JSON.stringify(
    {
      type: "object",
      properties: {
        result: { type: "string", description: "응답 결과" },
      },
      required: ["result"],
    },
    null,
    2,
  )
}

/* ─── Default Config ─── */

export function getDefaultStructuredOutputConfig() {
  return {
    enabled: false,
    schemaName: "response_schema",
    schema: getDefaultSchema(),
    strict: true,
  }
}

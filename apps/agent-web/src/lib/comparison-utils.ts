import type { Variable } from "@/types/prompt"
import { DEFAULT_VARIABLE_COLORS } from "@/lib/constants"

export interface MergedVariables {
  shared: Variable[]
  onlyA: Variable[]
  onlyB: Variable[]
}

/**
 * Merge two variable lists by name.
 * Shared = same name in both (uses A's Variable object).
 * onlyA / onlyB = exclusive to that side.
 */
export function mergeVariables(
  varsA: Variable[],
  varsB: Variable[]
): MergedVariables {
  const namesB = new Set(varsB.map((v) => v.name))
  const namesA = new Set(varsA.map((v) => v.name))

  const shared: Variable[] = []
  const onlyA: Variable[] = []

  for (const v of varsA) {
    if (namesB.has(v.name)) {
      shared.push(v)
    } else {
      onlyA.push(v)
    }
  }

  const onlyB = varsB.filter((v) => !namesA.has(v.name))

  return { shared, onlyA, onlyB }
}

/**
 * Extract variable names from raw text via {{variable_name}} pattern.
 * Returns synthetic Variable objects with type "string".
 */
export function extractVariablesFromText(text: string): Variable[] {
  const regex = /\{\{(.+?)\}\}/g
  const seen = new Set<string>()
  const vars: Variable[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim()
    if (!name || seen.has(name)) continue
    seen.add(name)

    const colorIdx = vars.length % DEFAULT_VARIABLE_COLORS.length
    const colors = DEFAULT_VARIABLE_COLORS[colorIdx]

    vars.push({
      id: `manual-var-${name}`,
      name,
      type: "string",
      defaultValue: "",
      description: "",
      color: colors.color,
      bgColor: colors.bg,
      required: false,
    })
  }

  return vars
}

/**
 * Build a variable map from variables + overrides for prompt rendering.
 * If an override value exists, use it; otherwise use defaultValue.
 */
export function buildVariableMap(
  variables: Variable[],
  overrides: Record<string, string>
): Record<string, unknown> {
  const map: Record<string, unknown> = {}
  for (const v of variables) {
    const override = overrides[v.name]
    const rawValue =
      override !== undefined && override !== "" ? override : v.defaultValue
    if (v.type === "array" || v.type === "object") {
      try {
        map[v.name] = JSON.parse(rawValue)
      } catch {
        map[v.name] = rawValue
      }
    } else {
      map[v.name] = rawValue
    }
  }
  return map
}

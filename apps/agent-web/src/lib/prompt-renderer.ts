import type {
  PromptBlock,
  TextBlock,
  ConditionBlock,
  LoopBlock,
  VariableMap,
} from "@/types/prompt"

/**
 * Renders a list of prompt blocks into a final string by substituting
 * variables, evaluating conditions, and expanding loops.
 */
export function renderPrompt(
  blocks: PromptBlock[],
  variables: VariableMap
): string {
  return blocks.map((block) => renderBlock(block, variables)).join("")
}

function renderBlock(block: PromptBlock, variables: VariableMap): string {
  switch (block.type) {
    case "text":
      return renderTextBlock(block, variables)
    case "condition":
      return renderConditionBlock(block, variables)
    case "loop":
      return renderLoopBlock(block, variables)
    default:
      return ""
  }
}

/**
 * Replaces all {{variable_name}} placeholders with their values.
 */
function renderTextBlock(block: TextBlock, variables: VariableMap): string {
  return interpolate(block.content, variables)
}

/**
 * Evaluates IF / ELSE IF / ELSE branches and renders the matching branch.
 */
function renderConditionBlock(
  block: ConditionBlock,
  variables: VariableMap
): string {
  for (const branch of block.branches) {
    if (branch.type === "else") {
      return renderPrompt(branch.blocks, variables)
    }

    const { variable, operator, value } = branch.condition
    const resolved = resolveVariable(variable, variables)

    if (evaluateCondition(resolved, operator, value)) {
      return renderPrompt(branch.blocks, variables)
    }
  }

  return ""
}

/**
 * Iterates over an array variable and renders the template once per item,
 * making each item's properties available as {{loop_var.property}}.
 */
function renderLoopBlock(block: LoopBlock, variables: VariableMap): string {
  const items = variables[block.variable]

  if (!Array.isArray(items)) {
    return ""
  }

  return items
    .map((item, index) => {
      const scopedVariables: VariableMap = {
        ...variables,
        [`${block.itemAlias}`]: item,
        [`${block.itemAlias}_index`]: index,
      }

      // If the item is an object, also expose its properties as
      // {{alias.property}} for convenience.
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        for (const [key, val] of Object.entries(item)) {
          scopedVariables[`${block.itemAlias}.${key}`] = val
        }
      }

      return renderPrompt(block.blocks, scopedVariables)
    })
    .join("")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replaces every {{key}} token in a template string with the corresponding
 * variable value. Nested dot-notation keys (e.g. {{item.name}}) are resolved.
 */
function interpolate(template: string, variables: VariableMap): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_match, key: string) => {
    const trimmedKey = key.trim()
    const value = resolveVariable(trimmedKey, variables)
    if (value === undefined || value === null) {
      return `{{${trimmedKey}}}`
    }
    return String(value)
  })
}

/**
 * Resolves a variable key that may contain dot-notation
 * (e.g. "item.name" looks up variables["item.name"] first,
 *  then tries variables["item"]["name"]).
 */
function resolveVariable(
  key: string,
  variables: VariableMap
): unknown {
  // Direct lookup first
  if (key in variables) {
    return variables[key]
  }

  // Dot-notation traversal
  const parts = key.split(".")
  let current: unknown = variables

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Evaluates a condition using the given operator.
 */
function evaluateCondition(
  resolved: unknown,
  operator: string,
  value: string
): boolean {
  const stringValue = resolved !== undefined && resolved !== null
    ? String(resolved)
    : ""

  switch (operator) {
    case "equals":
      return stringValue === value
    case "not_equals":
      return stringValue !== value
    case "contains":
      return stringValue.includes(value)
    case "not_contains":
      return !stringValue.includes(value)
    case "starts_with":
      return stringValue.startsWith(value)
    case "ends_with":
      return stringValue.endsWith(value)
    case "is_empty":
      return stringValue === ""
    case "is_not_empty":
      return stringValue !== ""
    default:
      return false
  }
}

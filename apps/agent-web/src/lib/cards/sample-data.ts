import { extractTokens } from './ac-validate'

function inferValue(key: string): unknown {
  const lower = key.toLowerCase()
  if (lower === 'interactionid' || lower.endsWith('id')) return `preview-${key}`
  if (lower.includes('json')) return '{\n  "example": true\n}'
  if (lower.includes('count') || lower.includes('num')) return 0
  if (lower.includes('enabled') || lower.startsWith('is') || lower.startsWith('has')) return true
  if (lower.includes('list') || lower.includes('items') || lower.includes('choices')) {
    return [
      { title: '옵션 1', value: 'opt-1' },
      { title: '옵션 2', value: 'opt-2' },
    ]
  }
  return `${key} 값`
}

export function generateSampleFromPayload(
  payload: unknown,
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const tokens = extractTokens(payload)
  const next: Record<string, unknown> = { ...existing }
  for (const key of tokens) {
    if (!(key in next)) next[key] = inferValue(key)
  }
  return next
}

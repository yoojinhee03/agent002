import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateText(value: string, maxLen: number) {
  if (value.length <= maxLen) return value
  return value.slice(0, maxLen) + `… (truncated ${value.length - maxLen} chars)`
}

export function safeJsonStringify(
  value: unknown,
  opts?: {
    maxStringLength?: number
    maxArrayLength?: number
    maxObjectKeys?: number
    maxOutputLength?: number
    space?: number
  },
) {
  const maxStringLength = opts?.maxStringLength ?? 2000
  const maxArrayLength = opts?.maxArrayLength ?? 50
  const maxObjectKeys = opts?.maxObjectKeys ?? 50
  const maxOutputLength = opts?.maxOutputLength ?? 20000
  const space = opts?.space ?? 2

  const seen = new WeakSet<object>()

  const normalize = (v: unknown): unknown => {
    if (typeof v === 'string') return truncateText(v, maxStringLength)
    if (typeof v !== 'object' || v === null) return v

    if (seen.has(v)) return '[Circular]'
    seen.add(v)

    if (Array.isArray(v)) {
      if (v.length <= maxArrayLength) return v.map(normalize)
      const head = v.slice(0, maxArrayLength).map(normalize)
      return [...head, { __truncated__: true, originalLength: v.length }]
    }

    const rec = v as Record<string, unknown>
    const keys = Object.keys(rec)
    const limitedKeys = keys.slice(0, maxObjectKeys)
    const out: Record<string, unknown> = {}
    for (const k of limitedKeys) out[k] = normalize(rec[k])
    if (keys.length > maxObjectKeys) {
      out.__truncated__ = true
      out.__originalKeys__ = keys.length
    }
    return out
  }

  try {
    const normalized = normalize(value)
    const str = JSON.stringify(normalized, null, space)
    return str.length > maxOutputLength ? truncateText(str, maxOutputLength) : str
  } catch {
    try {
      const str = String(value)
      return str.length > maxOutputLength ? truncateText(str, maxOutputLength) : str
    } catch {
      return '[Unserializable]'
    }
  }
}

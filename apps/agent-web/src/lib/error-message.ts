import { ApiError } from './api-client'

export function extractErrorMessage(err: unknown, fallback = '요청에 실패했습니다.'): string {
  if (!err) return fallback
  if (err instanceof ApiError) {
    if (err.body && typeof err.body === 'object') {
      const body = err.body as { message?: unknown; error?: unknown }
      const m = body.message
      if (typeof m === 'string' && m.trim()) return m
      if (Array.isArray(m) && m.length && typeof m[0] === 'string') return m.join(', ')
      if (typeof body.error === 'string' && body.error.trim()) return body.error
    }
    if (err.message && err.message.trim()) return err.message
    return `${fallback} (HTTP ${err.statusCode})`
  }
  if (err instanceof Error) return err.message || fallback
  if (typeof err === 'string') return err
  if (typeof err === 'object' && err && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return fallback
}

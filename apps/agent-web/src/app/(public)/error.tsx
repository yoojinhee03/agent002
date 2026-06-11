"use client"

import { useEffect } from "react"

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Public Error]", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
      <p className="text-sm text-[var(--color-fg-muted)]">페이지를 불러오는 중 오류가 발생했습니다.</p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-[#3b82f6] px-4 py-2 text-sm text-white hover:bg-[#2563eb]"
        >
          다시 시도
        </button>
        <button
          onClick={() => window.history.back()}
          className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
        >
          뒤로 가기
        </button>
      </div>
    </div>
  )
}

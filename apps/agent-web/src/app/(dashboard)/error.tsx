"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[Dashboard Error]", error)
  }, [error])

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg">
      <p className="text-sm font-mono text-red-400 max-w-lg text-center">{error.message}</p>
      <p className="text-xs text-[var(--color-fg-subtle)] max-w-lg text-center font-mono">{error.stack?.split('\n').slice(0,3).join(' | ')}</p>
      <button
        onClick={reset}
        className="rounded bg-[#3b82f6] px-4 py-2 text-sm text-white hover:bg-[#2563eb]"
      >
        다시 시도
      </button>
    </div>
  )
}

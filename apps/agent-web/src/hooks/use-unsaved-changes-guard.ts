"use client"

import { useEffect, useCallback, useRef } from "react"
import { usePromptStore } from "@/stores/use-prompt-store"

/**
 * isDirty 상태일 때 브라우저 탈출 및 앱 내 네비게이션을 가드합니다.
 * - beforeunload: 탭 닫기/새로고침 시 브라우저 기본 경고
 * - 앱 내 <a> 클릭: 커스텀 확인 콜백
 * - popstate: 뒤로/앞으로 버튼
 */
export function useUnsavedChangesGuard(onNavigateAttempt: (href: string, proceed: () => void) => void) {
  const pendingHref = useRef<string | null>(null)

  // beforeunload — 탭 닫기/새로고침
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const isDirty = usePromptStore.getState().isDirty
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [])

  // 앱 내 <a> 클릭 인터셉트
  const handleClick = useCallback((e: MouseEvent) => {
    const isDirty = usePromptStore.getState().isDirty
    if (!isDirty) return

    const target = (e.target as HTMLElement).closest("a")
    if (!target) return
    const href = target.getAttribute("href")
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
    // 외부 링크는 beforeunload가 처리
    if (target.target === "_blank" || href.startsWith("http")) return

    e.preventDefault()
    e.stopPropagation()
    pendingHref.current = href

    onNavigateAttempt(href, () => {
      usePromptStore.setState({ isDirty: false })
      window.location.href = href
    })
  }, [onNavigateAttempt])

  useEffect(() => {
    document.addEventListener("click", handleClick, true)
    return () => document.removeEventListener("click", handleClick, true)
  }, [handleClick])

  // popstate — 뒤로/앞으로 버튼
  useEffect(() => {
    const handler = () => {
      const isDirty = usePromptStore.getState().isDirty
      if (isDirty) {
        // 뒤로가기를 원래대로 되돌리고 확인 모달 표시
        window.history.pushState(null, "", window.location.href)
        onNavigateAttempt("", () => {
          usePromptStore.setState({ isDirty: false })
          window.history.back()
        })
      }
    }
    window.addEventListener("popstate", handler)
    return () => window.removeEventListener("popstate", handler)
  }, [onNavigateAttempt])
}

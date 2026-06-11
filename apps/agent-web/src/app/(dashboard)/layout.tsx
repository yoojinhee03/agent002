"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useUserStore } from "@/stores/use-user-store"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { Topbar } from "@/components/layout/topbar"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, currentUser, loadCurrentUser } = useUserStore()
  const [checking, setChecking] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number>(220)

  // localStorage 영속화
  useEffect(() => {
    if (typeof window === "undefined") return
    const w = window.localStorage.getItem("layout.sidebar-width")
    if (w) setSidebarWidth(Math.max(160, Math.min(420, Number(w) || 220)))
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("layout.sidebar-width", String(sidebarWidth))
  }, [sidebarWidth])

  const handleSidebarResize = useCallback((delta: number) => {
    // 사이드바는 좌측에 있고 우측 가장자리를 드래그 → 마우스가 오른쪽(양수 delta) 가면 폭 증가.
    setSidebarWidth((w) => Math.max(160, Math.min(420, w + delta)))
  }, [])

  useEffect(() => {
    async function check() {
      if (!isAuthenticated && !currentUser) {
        await loadCurrentUser()
      }
      setChecking(false)
    }
    check()
  }, [isAuthenticated, currentUser, loadCurrentUser])

  useEffect(() => {
    if (!checking && !isAuthenticated) {
      router.replace("/login")
    }
  }, [checking, isAuthenticated, router])

  // admin role 전용 라우트 — Users 관리만 admin 전용.
  // Usage/Monitoring/Providers 는 모든 인증 사용자 접근 가능 (본인 데이터만 노출은 Phase 4).
  const ADMIN_ROUTES = useMemo(() => ['/settings/users'], [])
  useEffect(() => {
    if (!checking && isAuthenticated && currentUser) {
      const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r))
      const isActuallyAdmin = currentUser.role === 'admin'

      if (isAdminRoute && !isActuallyAdmin) {
        router.replace('/dashboard')
      }
    }
  }, [checking, isAuthenticated, currentUser, pathname, router, ADMIN_ROUTES])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false)
  }, [pathname])

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-sm text-fg-subtle">로딩 중...</div>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <AppSidebar
          onClose={() => setSidebarOpen(false)}
          width={sidebarWidth}
          onResize={handleSidebarResize}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-auto bg-bg">{children}</main>
      </div>
    </div>
  )
}

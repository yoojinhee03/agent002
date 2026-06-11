"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Search, Bell, ChevronRight, Menu, ExternalLink } from "lucide-react"
import { ThemeToggle } from "./theme-toggle"

interface TopbarProps {
  onMenuToggle?: () => void
}

export function Topbar({ onMenuToggle }: TopbarProps) {
  const pathname = usePathname()

  const crumbs = buildBreadcrumbs(pathname)

  return (
    <div className="flex h-12 shrink-0 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 md:px-4">
      {/* 햄버거 메뉴 (모바일 전용) */}
      <button
        onClick={onMenuToggle}
        className="btn-icon mr-2 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)] md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* 브레드크럼 */}
      <div className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((crumb, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <ChevronRight className="h-3 w-3 shrink-0 text-[var(--color-fg-subtle)]" />
            )}
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="hidden truncate text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] sm:block"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-[var(--color-fg)]">
                {crumb.label}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 우측 영역 */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* 검색 — 준비 중 */}
        <div className="relative hidden sm:block" title="준비 중">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-border-strong)]" />
          <input
            type="text"
            placeholder="Search..."
            disabled
            className="h-9 w-[140px] cursor-not-allowed rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] pl-8 pr-14 text-sm text-[var(--color-fg-subtle)] opacity-60 placeholder:text-[var(--color-border-strong)] lg:w-[200px]"
          />
          <span className="section-title pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5">
            준비 중
          </span>
        </div>

        {/* Client UI 진입 */}
        <Link
          href="/client/agents"
          target="_blank"
          rel="noopener noreferrer"
          title="Client UI — 배포된 에이전트와 대화 (새 탭)"
          className="btn flex h-9 items-center gap-1.5 border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:border-blue-500/40 hover:text-blue-300"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Client</span>
        </Link>

        {/* 테마 토글 */}
        <ThemeToggle />

        {/* 알림 — 준비 중 */}
        <button
          disabled
          title="준비 중"
          className="btn-icon cursor-not-allowed border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-fg-subtle)] opacity-60"
        >
          <Bell className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

interface Crumb {
  label: string
  href?: string
}

function buildBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }]

  if (segments.length === 0) return crumbs

  let currentPath = ""
  segments.forEach((segment, i) => {
    currentPath += `/${segment}`
    const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")

    const isLast = i === segments.length - 1
    crumbs.push({
      label,
      href: isLast ? undefined : currentPath
    })
  })

  return crumbs
}

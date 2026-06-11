"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useUserStore } from "@/stores/use-user-store"
import { UserProfileModal } from "./user-profile-modal"
import {
  Cpu,
  Key,
  Settings,
  Users,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  FileText,
  LayoutDashboard,
  BarChart3,
  Bot,
  BookOpen,
  FlaskConical,
  Sparkles,
  Activity,
  Slack,
  HelpCircle,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ResizeHandle } from "@/components/agents/flow/ResizeHandle"
import { BrandLogo } from "@/components/shared/brand-logo"

type NavItem = {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  disabled?: boolean
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard",  href: "/dashboard",  icon: LayoutDashboard },
  { label: "Agents",     href: "/agents",     icon: Bot },
  { label: "Workflows",  href: "/workflows",  icon: Cpu, disabled: true },
  { label: "Tools",      href: "/tools",      icon: FileText },
  { label: "Skills",     href: "/skills",     icon: Sparkles },
  { label: "Knowledge",  href: "/knowledge",  icon: BookOpen, disabled: true },
  { label: "Evaluation", href: "/evaluation", icon: FlaskConical, disabled: true },
]

interface AppSidebarProps {
  onClose?: () => void
  width?: number
  onResize?: (deltaPx: number) => void
}

export function AppSidebar({ onClose, width, onResize }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { currentUser, loadCurrentUser, logout } = useUserStore()
  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (!currentUser) loadCurrentUser()
  }, [currentUser, loadCurrentUser])

  return (
    <aside
      className={cn(
        "relative flex h-full flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]",
        collapsed && "transition-[width] duration-200",
      )}
      style={{ width: collapsed ? 56 : (width ?? 220) }}
    >
      {!collapsed && onResize && (
        <ResizeHandle direction="horizontal" edge="right" onResize={onResize} />
      )}
      {/* 로고 */}
      <div className="flex h-12 items-center gap-2.5 border-b border-[var(--color-border)] px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg">
          <BrandLogo />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold text-[var(--color-fg)]">
              AGENT<span className="italic text-[#C8102E]">002</span>
            </span>
            <span className="text-xs text-[var(--color-fg-subtle)]">v1.0.0</span>
          </div>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto p-2 pt-3">
        {!collapsed && (
          <div className="section-title mb-2 px-2.5">
            Main
          </div>
        )}

        {/* 주 메뉴 항목 */}
        <div className="space-y-0.5">
          {mainNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            const Icon = item.icon
            if (item.disabled) {
              return (
                <div
                  key={item.href}
                  title="준비 중"
                  className="group flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-[var(--color-fg-subtle)] opacity-60"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0 text-[var(--color-fg-subtle)]" />
                  {!collapsed && (
                    <>
                      <span>{item.label}</span>
                      <span className="section-title ml-auto rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5">
                        준비 중
                      </span>
                    </>
                  )}
                </div>
              )
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-blue-500/10 text-blue-400"
                    : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
                )}
              >
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    isActive
                      ? "text-blue-400"
                      : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                )}
              </Link>
            )
          })}
        </div>

        {/* Usage */}
        <Link
          href="/usage"
          className={cn(
            "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
            pathname.startsWith("/usage")
              ? "bg-blue-500/10 text-blue-400"
              : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          )}
        >
          <BarChart3
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pathname.startsWith("/usage")
                ? "text-blue-400"
                : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
            )}
          />
          {!collapsed && <span>Usage</span>}
        </Link>

        {/* Monitoring */}
        <Link
          href="/monitoring"
          className={cn(
            "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
            pathname.startsWith("/monitoring")
              ? "bg-blue-500/10 text-blue-400"
              : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          )}
        >
          <Activity
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pathname.startsWith("/monitoring")
                ? "text-blue-400"
                : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
            )}
          />
          {!collapsed && <span>Monitoring</span>}
        </Link>

        {/* Providers */}
        <Link
          href="/settings/providers"
          className={cn(
            "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
            pathname.startsWith("/settings/providers")
              ? "bg-blue-500/10 text-blue-400"
              : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          )}
        >
          <Key
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pathname.startsWith("/settings/providers")
                ? "text-blue-400"
                : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
            )}
          />
          {!collapsed && <span>Providers</span>}
        </Link>

        {/* Settings (프로필) */}
        <Link
          href="/settings/profile"
          className={cn(
            "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
            pathname.startsWith("/settings/profile")
              ? "bg-blue-500/10 text-blue-400"
              : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          )}
        >
          <Settings
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              pathname.startsWith("/settings/profile")
                ? "text-blue-400"
                : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
            )}
          />
          {!collapsed && <span>Settings</span>}
        </Link>

        {/* Help 섹션 */}
        {!collapsed && (
          <div className="section-title mb-2 mt-6 px-2.5">
            Help
          </div>
        )}
        <a
          href="/docs/AGENT002_퀵스타트_가이드.html"
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          title="퀵스타트 가이드"
        >
          <HelpCircle className="h-[18px] w-[18px] shrink-0 text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]" />
          {!collapsed && <span>퀵스타트 가이드</span>}
        </a>
        <a
          href="/docs/AGENT002_사용자_메뉴얼.html"
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-[var(--color-fg-muted)] transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          title="사용자 메뉴얼"
        >
          <BookOpen className="h-[18px] w-[18px] shrink-0 text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]" />
          {!collapsed && <span>사용자 메뉴얼</span>}
        </a>

        {/* Admin 섹션 */}
        {isAdmin && !collapsed && (
          <div className="section-title mb-2 mt-6 px-2.5">
            Admin
          </div>
        )}

        {/* Users - admin 전용 */}
        {isAdmin && (
          <Link
            href="/settings/users"
            className={cn(
              "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/settings/users")
                ? "bg-blue-500/10 text-blue-400"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            )}
          >
            <Users
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                pathname.startsWith("/settings/users")
                  ? "text-blue-400"
                  : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
              )}
            />
            {!collapsed && <span>Users</span>}
          </Link>
        )}

        {/* Cards - admin 전용 (동적 카드 정의 빌더) */}
        {isAdmin && (
          <Link
            href="/cards"
            className={cn(
              "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/cards")
                ? "bg-blue-500/10 text-blue-400"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            )}
          >
            <Layers
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                pathname.startsWith("/cards")
                  ? "text-blue-400"
                  : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
              )}
            />
            {!collapsed && <span>Cards</span>}
          </Link>
        )}

        {/* Slack - admin 전용 */}
        {isAdmin && (
          <Link
            href="/integrations/slack"
            className={cn(
              "group mt-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-all",
              pathname.startsWith("/integrations/slack")
                ? "bg-blue-500/10 text-blue-400"
                : "text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            )}
          >
            <Slack
              className={cn(
                "h-[18px] w-[18px] shrink-0 transition-colors",
                pathname.startsWith("/integrations/slack")
                  ? "text-blue-400"
                  : "text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]"
              )}
            />
            {!collapsed && <span>Slack</span>}
          </Link>
        )}

      </nav>

      {/* 하단 섹션 */}
      <div className="border-t border-[var(--color-border)] p-2">
        <button
          onClick={() => setProfileOpen(true)}
          className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
          title="프로필 보기 / 수정"
        >
          <div className="relative shrink-0">
            <div className="h-8 w-8 overflow-hidden rounded-full">
              {currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white">
                  {currentUser?.name?.charAt(0) ?? "U"}
                </div>
              )}
            </div>
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-medium text-[var(--color-fg)]">
                {currentUser?.name ?? "User"}
              </span>
              <span className="truncate text-xs text-[var(--color-fg-subtle)]">
                {currentUser?.email ?? "user@email.com"}
              </span>
            </div>
          )}
        </button>

        {profileOpen && (
          <UserProfileModal onClose={() => setProfileOpen(false)} />
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex flex-1 items-center justify-center rounded-lg py-2 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={async () => { await logout(); router.push("/login") }}
            className="flex items-center justify-center rounded-lg px-2 py-2 text-[var(--color-fg-subtle)] transition-colors hover:bg-red-500/10 hover:text-red-400"
            title="로그아웃"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}

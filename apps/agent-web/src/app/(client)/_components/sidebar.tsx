'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Bot, History, KeyRound, Loader2, LogOut, MessageSquare, Search, Trash2, type LucideIcon } from 'lucide-react'
import { BrandLogo } from '@/components/shared/brand-logo'
import { toast } from 'sonner'
import type { Thread } from '@agent-studio/shared'
import { apiClient } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

interface ThreadRow extends Thread {
  agent?: { id: string; name: string; slug: string } | null
}

const NAV: NavItem[] = [
  { label: '에이전트', href: '/client/agents', icon: Bot },
  { label: '도구 관리', href: '/client/tools', icon: KeyRound },
  { label: '채팅 히스토리', href: '/client/history', icon: History },
]

function formatDate(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function ClientSidebar() {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const search = useSearchParams()
  const { activeProjectId: projectId, currentUser, logout, initProject } = useUserStore()

  // 이미 로그인된 세션에서 새로고침/이동 시 activeProjectId 가 null 인 상태로 mount 되어
  // history sidebar 가 비어 보이던 회귀 차단 — currentUser 가 있는데 projectId 가 없으면
  // 한 번 더 initProject() 를 호출해 사용자가 속한 첫 project 를 자동 set.
  useEffect(() => {
    if (currentUser && !projectId) {
      void initProject()
    }
  }, [currentUser, projectId, initProject])
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; threadId: string } | null>(null)

  const onHistory = pathname.startsWith('/client/history')
  const selectedThreadId = onHistory ? (search?.get('threadId') ?? null) : null

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const id = setTimeout(() => {
      window.addEventListener('click', close)
      window.addEventListener('contextmenu', close)
      window.addEventListener('scroll', close, true)
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const handleDelete = async (threadId: string) => {
    setMenu(null)
    try {
      await apiClient.threads.archive(threadId)
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      if (selectedThreadId === threadId) {
        router.replace('/client/history')
      }
      toast.success('대화가 삭제되었습니다.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(msg)
    }
  }

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    apiClient.threads
      .list(projectId, 'active')
      .then((rows) => setThreads(Array.isArray(rows) ? (rows as ThreadRow[]) : []))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '이력 로드 실패'
        toast.error(msg)
      })
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ thread: ThreadRow }>
      const detail = ce.detail
      const incoming = detail?.thread
      if (!incoming?.id) return
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === incoming.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = { ...prev[idx], ...incoming }
          return next
        }
        return [incoming, ...prev]
      })
    }
    window.addEventListener('thread-upserted', handler)
    return () => window.removeEventListener('thread-upserted', handler)
  }, [])

  const filtered = useMemo(() => {
    // 빈 thread 숨김: title 이 placeholder("{에이전트명} 대화") 인 채로 남아있는 항목은
    // 첫 사용자 메시지가 아직 없어 invoke 가 발생하지 않은 thread 로 간주한다.
    // (handleSend 가 첫 메시지 전송 시 title 을 첫 40자로 자동 갱신하므로 placeholder 가 곧 빈 대화 신호)
    const visible = threads.filter((t) => {
      if ((t.metadata as { source?: string } | null)?.source === 'admin-debug') return false
      const placeholder = t.agent?.name ? `${t.agent.name} 대화` : null
      return !placeholder || t.title !== placeholder
    })
    const q = query.trim().toLowerCase()
    if (!q) return visible
    return visible.filter((t) => {
      const title = (t.title || '').toLowerCase()
      const agentName = (t.agent?.name || '').toLowerCase()
      return title.includes(q) || agentName.includes(q)
    })
  }, [threads, query])

  const selectThread = (id: string) => {
    router.replace(`/client/history?threadId=${id}`)
  }

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      router.replace('/client/login')
    }
  }

  return (
    <aside
      className="flex h-full w-[308px] shrink-0 flex-col border-r"
      style={{ borderColor: 'var(--client-border)', background: 'var(--client-panel)' }}
    >
      <div
        className="flex h-14 items-center gap-2.5 px-4 text-[15px] font-semibold tracking-tight"
        style={{ color: 'var(--client-text)' }}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-[#0A0A0A]/15">
          <BrandLogo />
        </span>
        <span className="flex items-baseline gap-1">
          <span style={{ color: '#0A0A0A' }}>AGENT</span>
          <span style={{ color: '#C8102E' }}>002</span>
          <span className="ml-1 text-sm font-medium" style={{ color: 'var(--client-muted)' }}>
            Client
          </span>
        </span>
      </div>

      <nav className="space-y-0.5 px-2 py-1">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'text-[var(--client-primary)]'
                  : 'text-[var(--client-muted)] hover:bg-[var(--client-panel-2)] hover:text-[var(--client-text)]',
              )}
              style={active ? { background: `color-mix(in srgb, var(--client-primary) 10%, transparent)` } : {}}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}

      </nav>

      <div className="px-3 pt-2">
            <div
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
              style={{ borderColor: 'var(--client-border)', background: 'var(--client-bg)' }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--client-muted-2)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색"
                className="w-full bg-transparent text-xs outline-none"
                style={{ color: 'var(--client-text)' }}
              />
            </div>
          </div>

      <div className="mt-2 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--client-muted)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs" style={{ color: 'var(--client-muted)' }}>
              {threads.length === 0 ? '아직 대화 이력이 없습니다.' : '검색 결과가 없습니다.'}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((t) => {
              const active = t.id === selectedThreadId
              return (
                <li key={t.id}>
                  <button
                    onClick={() => selectThread(t.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setMenu({ x: e.clientX, y: e.clientY, threadId: t.id })
                    }}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                      active
                        ? 'bg-[color:var(--client-panel-2)]'
                        : 'hover:bg-[color:var(--client-panel-2)]',
                    )}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{
                        background: 'var(--client-bg)',
                        color: 'var(--client-primary)',
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-[12.5px] font-medium leading-tight"
                        style={{
                          color: active ? 'var(--client-primary)' : 'var(--client-text)',
                        }}
                      >
                        {t.title || '제목 없음'}
                      </p>
                      <p
                        className="mt-0.5 truncate text-[10.5px]"
                        style={{ color: 'var(--client-muted-2)' }}
                      >
                        {t.agent?.name ?? 'Agent 없음'} · {formatDate(t.updatedAt)}
                      </p>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 푸터 — 사용자 정보(클릭 시 프로필) + 로그아웃 */}
      <div
        className="border-t px-3 py-3"
        style={{ borderColor: 'var(--client-border)' }}
      >
        <div className="flex items-center gap-2">
          <Link
            href="/client/settings/profile"
            title="내 프로필 / 비밀번호 변경"
            className="min-w-0 flex-1 rounded-md px-1.5 py-1 transition-colors hover:bg-[var(--client-panel-2)]"
          >
            <p
              className="truncate text-xs font-medium"
              style={{ color: 'var(--client-text)' }}
            >
              {currentUser?.name ?? '사용자'}
            </p>
            <p
              className="truncate text-[10.5px]"
              style={{ color: 'var(--client-muted-2)' }}
            >
              {currentUser?.email ?? ''}
            </p>
          </Link>
          <button
            onClick={() => void handleLogout()}
            title="로그아웃"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--client-panel-2)]"
            style={{ color: 'var(--client-muted)' }}
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-[140px] overflow-hidden rounded-lg border shadow-lg"
          style={{
            top: menu.y,
            left: menu.x,
            background: 'var(--client-panel)',
            borderColor: 'var(--client-border)',
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          <button
            onClick={() => void handleDelete(menu.threadId)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-red-500 transition-colors hover:bg-[var(--client-panel-2)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>
        </div>
      )}
    </aside>
  )
}

'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/stores/use-user-store'
import { apiClient } from '@/lib/api-client'
import { ClientSidebar } from './_components/sidebar'

export default function ClientLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, loadCurrentUser } = useUserStore()
  const [checking, setChecking] = useState(true)
  const [hasClientToken, setHasClientToken] = useState(false)

  // 가드 기준: 'client' scope 의 토큰이 실제 localStorage 에 있는지.
  // store.isAuthenticated 는 admin/client 공통이라 admin 로그인 만으로 통과되면 안 됨.
  useEffect(() => {
    async function check() {
      const token = apiClient.getAccessToken('client')
      if (!token) {
        setHasClientToken(false)
        setChecking(false)
        return
      }
      // client 토큰이 있으면 user 정보 다시 로드 (store 가 admin user 로 오염됐을 수 있음).
      await loadCurrentUser()
      setHasClientToken(true)
      setChecking(false)
    }
    check()
  }, [isAuthenticated, loadCurrentUser])

  useEffect(() => {
    if (!checking && !hasClientToken) {
      router.replace('/client/login')
    }
  }, [checking, hasClientToken, router])

  if (checking) {
    return (
      <div className="client-app flex h-screen items-center justify-center">
        <div className="text-sm" style={{ color: 'var(--client-muted)' }}>
          로딩 중...
        </div>
      </div>
    )
  }

  if (!hasClientToken) return null

  return (
    <div className="client-app flex h-screen w-screen overflow-hidden">
      <ClientSidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}

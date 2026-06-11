'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api-client'
import { useUserStore } from '@/stores/use-user-store'

export default function GoogleOAuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { activeProjectId: projectId } = useUserStore()
  const setActiveProjectId = useUserStore((s) => s.setActiveProjectId)

  const fallbackUrl = '/tools?tab=builtin'

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState<string>('연동 처리 중...')
  // OAuth authorization code 는 1회용 — StrictMode/리렌더로 effect 가 두 번 돌면
  // 동일 code 로 교환을 재시도해 Google 이 invalid_grant(bad request) 를 반환한다.
  // ref 가드로 코드 교환을 정확히 한 번만 수행한다.
  const exchangeStarted = useRef(false)

  useEffect(() => {
    if (status === 'loading') return
    const timer = setTimeout(() => {
      router.replace(fallbackUrl)
    }, 3000)
    return () => clearTimeout(timer)
  }, [status, router, fallbackUrl])

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    const decodeState = (raw: string): { projectId?: string; userId?: string; scope?: string } | null => {
      try {
        const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
        const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
        const json = atob(padded)
        return JSON.parse(json)
      } catch {
        return null
      }
    }

    if (!code || !state) {
      setStatus('error')
      setMessage('OAuth 파라미터가 올바르지 않습니다.')
      return
    }

    const decoded = decodeState(state)

    if (decoded?.scope === 'client-tool') {
      setStatus('error')
      setMessage(
        'Client 사용자 Gmail OAuth는 /client/oauth/google/callback 으로 redirect URI 를 변경해 주세요. ' +
          '(도구 관리 → Gmail OAuth 앱 설정에서 redirect URI 수정)',
      )
      return
    }

    const stateProjectId = decoded?.projectId ?? null
    const resolvedProjectId = stateProjectId || projectId

    if (!resolvedProjectId) {
      setStatus('error')
      setMessage('프로젝트 정보를 찾을 수 없습니다.')
      return
    }

    if (exchangeStarted.current) return
    exchangeStarted.current = true

    apiClient.tools.gmailCallback(resolvedProjectId, code, state)
      .then(async () => {
        if (stateProjectId) {
          setActiveProjectId(stateProjectId)
        }
        let toggleError: string | null = null
        try {
          await apiClient.tools.toggleBuiltin(resolvedProjectId, 'gmail_connect', true)
        } catch (e: unknown) {
          toggleError = e instanceof Error ? e.message : String(e)
        }

        try {
          const groups = await apiClient.tools.getBuiltin(resolvedProjectId)
          const gmail = groups.flatMap((g) => g.tools).find((t) => t.id === 'gmail_connect')

          if (!gmail) {
            setStatus('error')
            setMessage('Built-in 목록에서 gmail_connect를 찾지 못했습니다.')
            return
          }

          if (!gmail.configured) {
            setStatus('error')
            setMessage('Gmail 연동은 완료됐지만 refresh_token 저장이 확인되지 않습니다. (configured=false)')
            return
          }

          if (!gmail.enabled) {
            setStatus('error')
            setMessage(`Gmail 연동은 완료됐지만 활성화에 실패했습니다. ${toggleError ? `(toggle error: ${toggleError})` : ''}`)
            return
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          setStatus('error')
          setMessage(`연동 상태 확인 중 오류가 발생했습니다: ${msg}`)
          return
        }

        setStatus('success')
        setMessage('Gmail 연동이 완료되었습니다.')
      })
      .catch((e: unknown) => {
        setStatus('error')
        const msg = e instanceof Error ? e.message : String(e)
        setMessage(`Gmail 연동에 실패했습니다: ${msg}`)
      })
  }, [projectId, router, searchParams, setActiveProjectId])

  return (
    <div className="p-6 space-y-2">
      <h1 className="text-lg font-bold">Google OAuth Callback</h1>
      <p className="text-sm text-muted-foreground">
        {message}
      </p>
      {status !== 'loading' && (
        <>
          <p className="text-xs text-muted-foreground">3초 후 도구 화면으로 자동 이동합니다.</p>
          <button
            onClick={() => router.replace(fallbackUrl)}
            className="mt-4 rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white"
          >
            도구 화면으로 이동
          </button>
        </>
      )}
    </div>
  )
}

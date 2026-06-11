'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { apiClient } from '@/lib/api-client'

type Status = 'pending' | 'success' | 'error'

export default function ClientGoogleOAuthCallbackPage() {
  const router = useRouter()
  const params = useSearchParams()
  const code = params?.get('code') ?? null
  const state = params?.get('state') ?? null
  const errorParam = params?.get('error') ?? null

  const [status, setStatus] = useState<Status>('pending')
  const [message, setMessage] = useState('Google 인증을 처리하는 중입니다...')
  // authorization code 1회용 — StrictMode/리렌더 중복 실행 시 invalid_grant 방지 가드.
  const exchangeStarted = useRef(false)

  useEffect(() => {
    if (errorParam) {
      setStatus('error')
      setMessage(`Google OAuth 거부 또는 오류: ${errorParam}`)
      return
    }
    if (!code || !state) {
      setStatus('error')
      setMessage('필수 파라미터(code/state)가 누락되었습니다.')
      return
    }
    if (exchangeStarted.current) return
    exchangeStarted.current = true

    apiClient.meCredentials.gmail
      .exchangeCode({ code, state })
      .then((res) => {
        if (res.connected) {
          setStatus('success')
          setMessage('Gmail 연동이 완료되었습니다. 잠시 후 도구 관리로 이동합니다.')
          setTimeout(() => router.replace('/client/tools'), 1200)
        } else {
          setStatus('error')
          setMessage('연동에 실패했습니다.')
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : '연동 처리 중 오류가 발생했습니다.'
        setStatus('error')
        setMessage(msg)
      })
  }, [code, state, errorParam, router])

  return (
    <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-6">
      <div className="client-panel w-full max-w-md p-6 text-center">
        {status === 'pending' && (
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" style={{ color: 'var(--client-muted)' }} />
        )}
        {status === 'success' && <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-300" />}
        {status === 'error' && <XCircle className="mx-auto mb-3 h-8 w-8 text-red-300" />}
        <p className="mb-4 text-sm" style={{ color: 'var(--client-text)' }}>
          {message}
        </p>
        {status !== 'pending' && (
          <button
            onClick={() => router.replace('/client/tools')}
            className="rounded-md border px-3 py-1.5 text-xs hover:border-blue-400/50"
            style={{ borderColor: 'var(--client-border-2)', color: 'var(--client-text)' }}
          >
            도구 관리로 이동
          </button>
        )}
      </div>
    </div>
  )
}

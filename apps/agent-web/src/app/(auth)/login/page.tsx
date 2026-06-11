"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useUserStore } from "@/stores/use-user-store"
import {
  Mail, ArrowLeft, Check, RefreshCw, Eye, EyeOff, KeyRound, Send,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/shared/brand-logo"

type Mode = "login" | "forgot" | "reset"

function PasswordInput({
  value, onChange, placeholder, autoFocus, onKeyDown,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string
  autoFocus?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoFocus={autoFocus} onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2.5 pr-10 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
      />
      <button type="button" onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]" tabIndex={-1}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const { login, forgotPassword, resetPassword, loadCurrentUser, isAuthenticated } = useUserStore()

  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Forgot / Reset
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotSent, setForgotSent] = useState(false)
  const [resetPw, setResetPw] = useState("")
  const [resetPwConfirm, setResetPwConfirm] = useState("")
  const [resetDone, setResetDone] = useState(false)

  // ── Auto login on mount ──────────────────────────────
  useEffect(() => {
    async function check() {
      if (!isAuthenticated) {
        await loadCurrentUser()
        // If it succeeded, redirect to /dashboard
        if (useUserStore.getState().isAuthenticated) {
          router.replace("/dashboard")
        }
      } else {
        router.replace("/dashboard")
      }
    }
    check()
  }, [isAuthenticated, loadCurrentUser, router])

  // ── Login ──────────────────────────────────────────────
  const handleLogin = useCallback(async () => {
    setError("")
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.")
      return
    }
    setLoading(true)
    try {
      const user = await login(email.trim(), password)
      if (!user) {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.")
        return
      }
      router.push("/dashboard")
    } catch {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.")
    } finally {
      setLoading(false)
    }
  }, [email, password, login, router])

  // ── Forgot password ────────────────────────────────────
  const handleForgot = useCallback(async () => {
    setError("")
    if (!forgotEmail.trim()) {
      setError("이메일을 입력해주세요.")
      return
    }
    setLoading(true)
    try {
      const ok = await forgotPassword(forgotEmail.trim())
      if (!ok) {
        setError("등록되지 않은 이메일입니다.")
        return
      }
      setForgotSent(true)
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }, [forgotEmail, forgotPassword])

  // ── Reset password ─────────────────────────────────────
  const handleReset = useCallback(async () => {
    setError("")
    if (!resetPw) { setError("새 비밀번호를 입력해주세요."); return }
    if (resetPw.length < 6) { setError("비밀번호는 6자 이상이어야 합니다."); return }
    if (resetPw !== resetPwConfirm) { setError("비밀번호가 일치하지 않습니다."); return }
    setLoading(true)
    try {
      const ok = await resetPassword(forgotEmail.trim(), resetPw)
      if (!ok) { setError("비밀번호 변경에 실패했습니다."); return }
      setResetDone(true)
    } catch {
      setError("비밀번호 변경에 실패했습니다.")
    } finally {
      setLoading(false)
    }
  }, [forgotEmail, resetPw, resetPwConfirm, resetPassword])

  const goToLogin = () => {
    setMode("login"); setError(""); setForgotSent(false); setResetDone(false)
    setResetPw(""); setResetPwConfirm("")
  }

  return (
    <div className="w-full max-w-sm px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-bg shadow-lg shadow-black/40">
          <BrandLogo />
        </div>
        <h1 className="text-xl font-bold text-foreground">AGENT<span className="italic text-[#C8102E]">002</span></h1>
      </div>

      <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
        {/* ── Login Mode ─────────────────────────── */}
        {mode === "login" && (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground">로그인</h2>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">이메일과 비밀번호를 입력해주세요.</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">이메일</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleLogin() }}
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2.5 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">비밀번호</label>
                <PasswordInput value={password} onChange={setPassword} placeholder="비밀번호 입력"
                  onKeyDown={(e) => { if (e.key === "Enter") handleLogin() }} />
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

            <button onClick={handleLogin} disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
              로그인
            </button>

            <button onClick={() => { setMode("forgot"); setError(""); setForgotEmail(email); setForgotSent(false) }}
              className="w-full text-center text-xs text-[var(--color-fg-subtle)] hover:text-blue-400 transition-colors">
              비밀번호를 잊으셨나요?
            </button>
          </div>
        )}

        {/* ── Forgot Password Mode ───────────────── */}
        {mode === "forgot" && (
          <div className="p-6 space-y-5">
            <button onClick={goToLogin} className="flex items-center gap-1 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
              <ArrowLeft className="h-3.5 w-3.5" /> 로그인으로 돌아가기
            </button>

            <div className="text-center">
              <Mail className="mx-auto mb-2 h-8 w-8 text-blue-400" />
              <h2 className="text-lg font-semibold text-foreground">비밀번호 찾기</h2>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">가입한 이메일로 재설정 링크를 보내드립니다.</p>
            </div>

            {!forgotSent ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">이메일</label>
                  <input
                    type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="user@example.com" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleForgot() }}
                    className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2.5 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
                  />
                </div>
                {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
                <button onClick={handleForgot} disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  메일 전송
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-500/10 p-4 text-center">
                  <Check className="mx-auto mb-1.5 h-6 w-6 text-green-400" />
                  <p className="text-sm font-medium text-green-400">메일이 전송되었습니다</p>
                  <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{forgotEmail}으로 재설정 링크를 보냈습니다.</p>
                </div>
                <button onClick={() => { setMode("reset"); setError(""); setResetDone(false) }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
                  <KeyRound className="h-4 w-4" /> 비밀번호 재설정
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Reset Password Mode ────────────────── */}
        {mode === "reset" && (
          <div className="p-6 space-y-5">
            <button onClick={goToLogin} className="flex items-center gap-1 text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
              <ArrowLeft className="h-3.5 w-3.5" /> 로그인으로 돌아가기
            </button>

            <div className="text-center">
              <KeyRound className="mx-auto mb-2 h-8 w-8 text-purple-400" />
              <h2 className="text-lg font-semibold text-foreground">비밀번호 재설정</h2>
              <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">{forgotEmail}</p>
            </div>

            {!resetDone ? (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">새 비밀번호</label>
                    <PasswordInput value={resetPw} onChange={setResetPw} placeholder="6자 이상 입력" autoFocus />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">비밀번호 확인</label>
                    <PasswordInput value={resetPwConfirm} onChange={setResetPwConfirm} placeholder="비밀번호 재입력"
                      onKeyDown={(e) => { if (e.key === "Enter") handleReset() }} />
                    {resetPwConfirm && resetPw !== resetPwConfirm && (
                      <p className="mt-1 text-xs text-red-400">비밀번호가 일치하지 않습니다.</p>
                    )}
                    {resetPwConfirm && resetPw === resetPwConfirm && resetPw.length >= 6 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
                        <Check className="h-3 w-3" /> 일치합니다
                      </p>
                    )}
                  </div>
                </div>
                {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
                <button onClick={handleReset} disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  비밀번호 변경
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-500/10 p-4 text-center">
                  <Check className="mx-auto mb-1.5 h-6 w-6 text-green-400" />
                  <p className="text-sm font-medium text-green-400">비밀번호가 변경되었습니다</p>
                  <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">새 비밀번호로 로그인해주세요.</p>
                </div>
                <button onClick={goToLogin}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500">
                  로그인으로 이동
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <p className="mt-4 text-center text-xs text-[var(--color-fg-subtle)]">
        테스트: admin@example.com / password
      </p>

      <div className="mt-3 flex items-center justify-center gap-3 text-xs text-[var(--color-fg-subtle)]">
        <a
          href="/docs/AGENT002_퀵스타트_가이드.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 transition-colors"
        >
          퀵스타트 가이드
        </a>
        <span className="text-[var(--color-border-strong)]">·</span>
        <a
          href="/docs/AGENT002_사용자_메뉴얼.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-blue-400 transition-colors"
        >
          사용자 메뉴얼
        </a>
      </div>
    </div>
  )
}

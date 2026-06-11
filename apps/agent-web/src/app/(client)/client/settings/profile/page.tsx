"use client"

import { useState, useCallback, useEffect } from "react"
import { toast } from "sonner"
import { Eye, EyeOff, KeyRound, RefreshCw, User as UserIcon } from "lucide-react"
import { useUserStore } from "@/stores/use-user-store"
import { apiClient } from "@/lib/api-client"

function PasswordInput({
  value,
  onChange,
  placeholder,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm outline-none"
        style={{
          background: "var(--client-bg)",
          color: "var(--client-text)",
          border: "1px solid var(--client-border)",
        }}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: "var(--client-muted)" }}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function ClientProfilePage() {
  const { currentUser, loadCurrentUser } = useUserStore()
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!currentUser) loadCurrentUser()
  }, [currentUser, loadCurrentUser])

  const reset = () => {
    setCurrentPw("")
    setNewPw("")
    setConfirmPw("")
    setError("")
  }

  const handleSubmit = useCallback(async () => {
    setError("")
    if (!currentPw) {
      setError("현재 비밀번호를 입력해주세요.")
      return
    }
    if (!newPw) {
      setError("새 비밀번호를 입력해주세요.")
      return
    }
    if (newPw.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.")
      return
    }
    if (newPw !== confirmPw) {
      setError("새 비밀번호가 일치하지 않습니다.")
      return
    }
    setSaving(true)
    try {
      const ok = await apiClient.users.changeMyPassword(currentPw, newPw)
      if (!ok) {
        setError("비밀번호 변경에 실패했습니다.")
        return
      }
      toast.success("비밀번호가 변경되었습니다")
      reset()
    } catch (e) {
      const msg = e instanceof Error ? e.message : "변경에 실패했습니다."
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [currentPw, newPw, confirmPw])

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "var(--client-text)" }}>
          Settings
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--client-muted)" }}>
          본인 프로필과 비밀번호를 관리합니다.
        </p>
      </div>

      {/* 본인 정보 */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--client-panel)",
          border: "1px solid var(--client-border)",
        }}
      >
        <div
          className="mb-4 flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--client-text)" }}
        >
          <UserIcon className="h-4 w-4" style={{ color: "var(--client-muted)" }} />
          내 정보
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--client-muted)" }}>이름</span>
            <span style={{ color: "var(--client-text)" }}>{currentUser?.name ?? "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--client-muted)" }}>이메일</span>
            <span style={{ color: "var(--client-text)" }}>{currentUser?.email ?? "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--client-muted)" }}>역할</span>
            <span style={{ color: "var(--client-text)" }}>
              {currentUser?.role === "admin" ? "관리자" : "사용자"}
            </span>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div
        className="rounded-xl p-5"
        style={{
          background: "var(--client-panel)",
          border: "1px solid var(--client-border)",
        }}
      >
        <div
          className="mb-4 flex items-center gap-2 text-sm font-semibold"
          style={{ color: "var(--client-text)" }}
        >
          <KeyRound className="h-4 w-4" style={{ color: "var(--client-muted)" }} />
          비밀번호 변경
        </div>
        <div className="space-y-3">
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--client-muted)" }}
            >
              현재 비밀번호
            </label>
            <PasswordInput
              value={currentPw}
              onChange={setCurrentPw}
              placeholder="현재 비밀번호"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--client-muted)" }}
            >
              새 비밀번호
            </label>
            <PasswordInput value={newPw} onChange={setNewPw} placeholder="6자 이상 입력" />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-medium"
              style={{ color: "var(--client-muted)" }}
            >
              새 비밀번호 확인
            </label>
            <PasswordInput
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="새 비밀번호 재입력"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit()
              }}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-40"
              style={{ background: "var(--client-primary)" }}
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              변경
            </button>
            <button
              onClick={reset}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-40"
              style={{
                color: "var(--client-muted)",
                border: "1px solid var(--client-border)",
              }}
            >
              초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { useUserStore } from "@/stores/use-user-store"
import { X, Camera, Check, RefreshCw, Eye, EyeOff, KeyRound, User } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Password field ────────────────────────────────────────────────────────────
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
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
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 pr-9 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = "profile" | "password"

interface UserProfileModalProps {
  onClose: () => void
}

// ── Main component ────────────────────────────────────────────────────────────
export function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { currentUser, updateUser, changePassword } = useUserStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<Tab>("profile")

  // Profile fields
  const [name, setName] = useState(currentUser?.name ?? "")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Password fields
  const [pwNew, setPwNew] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwError, setPwError] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)

  // Sync name from store when modal first opens
  useEffect(() => {
    if (currentUser) setName(currentUser.name)
  }, [currentUser?.id])

  // ── Avatar file selection ────────────────────────────────────────
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setAvatarPreview(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be selected again
    e.target.value = ""
  }, [])

  // ── Save profile ─────────────────────────────────────────────────
  const handleSaveProfile = useCallback(async () => {
    if (!currentUser) return
    setProfileSaving(true)
    const data: { name?: string; avatarUrl?: string } = {}
    if (name.trim() && name.trim() !== currentUser.name) data.name = name.trim()
    if (avatarPreview) data.avatarUrl = avatarPreview
    if (Object.keys(data).length > 0) {
      await updateUser(currentUser.id, data)
    }
    setProfileSaving(false)
    setAvatarFile(null)
    setAvatarPreview(null)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }, [currentUser, name, avatarPreview, updateUser])

  // ── Change password ──────────────────────────────────────────────
  const handleChangePassword = useCallback(async () => {
    setPwError("")
    if (!pwNew) { setPwError("새 비밀번호를 입력해주세요."); return }
    if (pwNew.length < 6) { setPwError("비밀번호는 6자 이상이어야 합니다."); return }
    if (pwNew !== pwConfirm) { setPwError("비밀번호가 일치하지 않습니다."); return }
    if (!currentUser) return

    setPwSaving(true)
    const ok = await changePassword(currentUser.id, pwNew)
    setPwSaving(false)

    if (!ok) { setPwError("변경에 실패했습니다."); return }
    setPwNew(""); setPwConfirm("")
    setPwSaved(true)
    setTimeout(() => setPwSaved(false), 2000)
  }, [currentUser, pwNew, pwConfirm, changePassword])

  const currentAvatar = avatarPreview ?? currentUser?.avatarUrl
  const profileChanged =
    (name.trim() && name.trim() !== currentUser?.name) || !!avatarPreview

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-blue-400" />
              <h2 className="text-base font-semibold text-foreground">내 프로필</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[var(--color-border-strong)]">
            {(["profile", "password"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex flex-1 items-center justify-center py-2.5 text-sm font-medium transition-colors",
                  tab === t
                    ? "border-b-2 border-blue-500 text-blue-400"
                    : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
                )}
              >
                {t === "profile" ? "프로필" : "비밀번호"}
              </button>
            ))}
          </div>

          {/* ── Profile tab ─────────────────────────────────── */}
          {tab === "profile" && (
            <div className="p-5 space-y-5">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-[var(--color-border-strong)]">
                    {currentAvatar ? (
                      <img
                        src={currentAvatar}
                        alt={currentUser?.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-500 to-fuchsia-500 text-2xl font-bold text-white">
                        {currentUser?.name?.charAt(0) ?? "U"}
                      </div>
                    )}
                  </div>
                  {/* Upload overlay */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100"
                    title="프로필 이미지 변경"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-[var(--color-fg-subtle)] underline-offset-2 hover:text-blue-400 hover:underline transition-colors"
                >
                  이미지 변경
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {avatarFile && (
                  <span className="text-xs text-[var(--color-fg-subtle)]">{avatarFile.name}</span>
                )}
              </div>

              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  이름
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveProfile() }}
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
                />
              </div>

              {/* Email (read-only) */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  이메일
                </label>
                <div className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg/50 px-3 py-2 text-sm text-[var(--color-fg-subtle)] select-text">
                  {currentUser?.email}
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSaveProfile}
                disabled={profileSaving || !profileChanged}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors",
                  profileSaved
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40"
                )}
              >
                {profileSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : profileSaved ? (
                  <><Check className="h-4 w-4" /> 저장됨</>
                ) : (
                  "저장"
                )}
              </button>
            </div>
          )}

          {/* ── Password tab ─────────────────────────────────── */}
          {tab === "password" && (
            <div className="p-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  새 비밀번호 <span className="text-red-400">*</span>
                </label>
                <PasswordInput
                  value={pwNew}
                  onChange={setPwNew}
                  placeholder="6자 이상 입력"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  비밀번호 확인 <span className="text-red-400">*</span>
                </label>
                <PasswordInput
                  value={pwConfirm}
                  onChange={setPwConfirm}
                  placeholder="비밀번호 재입력"
                  onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword() }}
                />
                {pwConfirm && pwNew !== pwConfirm && (
                  <p className="mt-1 text-xs text-red-400">비밀번호가 일치하지 않습니다.</p>
                )}
                {pwConfirm && pwNew === pwConfirm && pwNew.length >= 6 && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
                    <Check className="h-3 w-3" /> 일치합니다
                  </p>
                )}
              </div>

              {pwError && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{pwError}</p>
              )}

              <button
                onClick={handleChangePassword}
                disabled={!pwNew || !pwConfirm || pwSaving}
                className={cn(
                  "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-colors",
                  pwSaved
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40"
                )}
              >
                {pwSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : pwSaved ? (
                  <><Check className="h-4 w-4" /> 변경됨</>
                ) : (
                  <><KeyRound className="h-4 w-4" /> 변경</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}

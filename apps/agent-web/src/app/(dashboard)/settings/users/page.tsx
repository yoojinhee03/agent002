"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useUserStore } from "@/stores/use-user-store"
import { useApiMutation } from "@/lib/use-api-mutation"
import { MSG } from "@/lib/messages/mutation"
import {
  Users,
  Plus,
  Mail,
  UserPlus,
  Search,
  Check,
  Clock,
  Pencil,
  X,
  Send,
  UserCheck,
  KeyRound,
  Eye,
  EyeOff,
  Camera,
  Shield,
  RotateCcw,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { User } from "@/types/user"

type AddMode = "invite" | "direct"

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

export default function UsersPage() {
  const {
    users, loading, loadUsers,
    inviteByEmail, registerDirect, activateUser,
    updateUser, changePassword, resendInvite,
    updateUserRole, currentUser, setUserActive,
  } = useUserStore()

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addMode, setAddMode] = useState<AddMode>("invite")
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("")
  const [addError, setAddError] = useState("")

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploadId, setAvatarUploadId] = useState<string | null>(null)

  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const [pwUserId, setPwUserId] = useState<string | null>(null)
  const [pwNew, setPwNew] = useState("")
  const [pwConfirm, setPwConfirm] = useState("")
  const [pwError, setPwError] = useState("")

  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "pending">("all")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => { loadUsers() }, [loadUsers])

  const DEFAULT_PASSWORD = "test1234!"

  const resetAddForm = () => {
    setNewName("")
    setNewEmail("")
    setNewPassword(DEFAULT_PASSWORD)
    setNewPasswordConfirm(DEFAULT_PASSWORD)
    setAddError("")
  }

  const activateMutation = useApiMutation({
    mutationFn: (id: string) => activateUser(id),
    successMessage: MSG.user.activated,
    onSuccess: (_, id) => setUserActive(id, true),
  })

  const resendMutation = useApiMutation({
    mutationFn: (id: string) => resendInvite(id),
    successMessage: "초대가 재전송되었습니다.",
  })

  const updateNameMutation = useApiMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateUser(id, { name }),
    successMessage: "이름이 변경되었습니다.",
    onSuccess: (_, { id }) => {
      setEditingUser(null)
      void id
    },
  })

  const updateRoleMutation = useApiMutation({
    mutationFn: ({ id, role }: { id: string; role: 'admin' | 'user' }) => updateUserRole(id, role),
    successMessage: (_result, { role }) =>
      role === "admin" ? "관리자로 변경되었습니다." : "일반 사용자로 변경되었습니다.",
  })

  const changePasswordMutation = useApiMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => changePassword(id, password),
    successMessage: "비밀번호가 변경되었습니다.",
    onSuccess: () => {
      setPwUserId(null)
      setPwNew("")
      setPwConfirm("")
    },
  })

  const resetPasswordMutation = useApiMutation({
    mutationFn: (id: string) => changePassword(id, DEFAULT_PASSWORD),
    successMessage: `비밀번호가 기본값(${DEFAULT_PASSWORD})으로 초기화되었습니다.`,
    onSuccess: () => {
      setPwUserId(null)
      setPwNew("")
      setPwConfirm("")
    },
  })

  const avatarMutation = useApiMutation({
    mutationFn: ({ id, avatarUrl }: { id: string; avatarUrl: string }) => updateUser(id, { avatarUrl }),
    successMessage: "프로필 이미지가 변경되었습니다.",
  })

  const handleAvatarClick = useCallback((userId: string) => {
    setAvatarUploadId(userId)
    avatarInputRef.current?.click()
  }, [])

  const handleAvatarFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !avatarUploadId) return
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string
        await avatarMutation.mutate({ id: avatarUploadId, avatarUrl: dataUrl })
      }
      reader.readAsDataURL(file)
      e.target.value = ""
      setAvatarUploadId(null)
    },
    [avatarUploadId, avatarMutation]
  )

  const handleAdd = useCallback(async () => {
    setAddError("")
    if (!newName.trim() || !newEmail.trim()) return

    if (addMode === "direct") {
      if (!newPassword) { setAddError("비밀번호를 입력해주세요."); return }
      if (newPassword !== newPasswordConfirm) { setAddError("비밀번호가 일치하지 않습니다."); return }
      if (newPassword.length < 6) { setAddError("비밀번호는 6자 이상이어야 합니다."); return }
    }

    const result =
      addMode === "invite"
        ? await inviteByEmail({ name: newName.trim(), email: newEmail.trim() })
        : await registerDirect({ name: newName.trim(), email: newEmail.trim(), password: newPassword })

    if (!result) { setAddError("이미 등록된 이메일입니다."); return }
    setShowAddDialog(false)
    resetAddForm()
  }, [addMode, newName, newEmail, newPassword, newPasswordConfirm, inviteByEmail, registerDirect])

  const handleSaveEdit = useCallback(
    async (id: string) => {
      if (!editName.trim()) return
      await updateNameMutation.mutate({ id, name: editName.trim() })
    },
    [editName, updateNameMutation]
  )

  const handleResetToDefault = useCallback(async () => {
    if (!pwUserId) return
    setPwError("")
    const ok = await resetPasswordMutation.mutate(pwUserId)
    if (!ok) setPwError("리셋에 실패했습니다.")
  }, [pwUserId, resetPasswordMutation])

  const handleChangePassword = useCallback(async () => {
    setPwError("")
    if (!pwNew) { setPwError("새 비밀번호를 입력해주세요."); return }
    if (pwNew.length < 6) { setPwError("비밀번호는 6자 이상이어야 합니다."); return }
    if (pwNew !== pwConfirm) { setPwError("비밀번호가 일치하지 않습니다."); return }
    if (!pwUserId) return

    const ok = await changePasswordMutation.mutate({ id: pwUserId, password: pwNew })
    if (!ok) setPwError("변경에 실패했습니다.")
  }, [pwUserId, pwNew, pwConfirm, changePasswordMutation])

  const filteredUsers = users
    .filter((u) => filterStatus === "all" || u.status === filterStatus)
    .filter(
      (u) =>
        !searchQuery.trim() ||
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    )

  const activeCount = users.filter((u) => u.status === "active").length
  const pendingCount = users.filter((u) => u.status === "pending").length

  const pwTargetUser = pwUserId ? users.find((u) => u.id === pwUserId) : null

  const pwSaving = changePasswordMutation.isPending || resetPasswordMutation.isPending

  return (
    <div className="p-8">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarFileChange}
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-[#3b82f6]" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">사용자 관리</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              사용자를 등록하고 관리합니다. 등록된 사용자만 프로젝트에 초대할 수 있습니다.
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowAddDialog(true); setAddMode("invite"); resetAddForm() }}
          className="flex items-center gap-2 rounded-lg bg-[#3b82f6] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2563eb]"
        >
          <Plus className="h-4 w-4" />
          사용자 추가
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {([
            { key: "all", label: "전체", count: users.length },
            { key: "active", label: "활성", count: activeCount },
            { key: "pending", label: "대기", count: pendingCount },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterStatus(f.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filterStatus === f.key
                  ? "bg-[var(--color-surface-2)] text-[var(--color-fg)]"
                  : "text-[var(--color-fg-subtle)] hover:bg-bg hover:text-[var(--color-fg-muted)]"
              )}
            >
              {f.label}
              <span className={cn(
                "rounded-full px-1.5 py-0.5 text-xs",
                filterStatus === f.key ? "bg-[#3b82f6]/20 text-[#3b82f6]" : "bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]"
              )}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이름 또는 이메일 검색..."
            className="rounded-lg border border-[var(--color-border-strong)] bg-bg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--color-border-strong)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
              <th className="px-4 py-3">사용자</th>
              <th className="px-4 py-3">이메일</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">역할</th>
              <th className="px-4 py-3">등록일</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-fg-subtle)]">로딩 중...</td>
              </tr>
            )}
            {!loading && filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--color-fg-subtle)]">
                  {searchQuery ? "검색 결과가 없습니다." : "등록된 사용자가 없습니다."}
                </td>
              </tr>
            )}
            {!loading && filteredUsers.map((user: User) => (
              <tr
                key={user.id}
                className="border-b border-[var(--color-border-strong)]/50 transition-colors last:border-b-0 hover:bg-bg/50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <button
                      className="group relative h-8 w-8 shrink-0"
                      onClick={() => handleAvatarClick(user.id)}
                      title="프로필 이미지 변경"
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white">
                          {user.name.charAt(0)}
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition-all group-hover:bg-black/50 group-hover:opacity-100">
                        <Camera className="h-3.5 w-3.5 text-white" />
                      </div>
                    </button>
                    {editingUser === user.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(user.id)
                            if (e.key === "Escape") setEditingUser(null)
                          }}
                          className="w-32 rounded border border-[var(--color-border-strong)] bg-bg px-2 py-1 text-sm text-foreground outline-none focus:border-[#3b82f6]"
                        />
                        <button
                          onClick={() => handleSaveEdit(user.id)}
                          disabled={updateNameMutation.isPending}
                          className="rounded p-1 text-green-400 hover:bg-green-500/10 disabled:opacity-40"
                        >
                          {updateNameMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button onClick={() => setEditingUser(null)} className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)]">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-medium text-foreground">{user.name}</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-[var(--color-fg-muted)]">{user.email}</td>
                <td className="px-4 py-3">
                  {user.status === "active" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                      <Check className="h-3 w-3" />활성
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                      <Clock className="h-3 w-3" />초대 대기
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                      <Shield className="h-3 w-3" />Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-subtle)]">
                      User
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-fg-subtle)]">
                  {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {user.status === "pending" && (
                      <>
                        <button
                          onClick={() => resendMutation.mutate(user.id)}
                          disabled={resendMutation.isPending}
                          className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)] disabled:opacity-40"
                          title="초대 메일 재전송"
                        >
                          {resendMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => activateMutation.mutate(user.id)}
                          disabled={activateMutation.isPending}
                          className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-green-500/10 hover:text-green-400 disabled:opacity-40"
                          title="바로 활성화"
                        >
                          {activateMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </>
                    )}
                    {user.status === "active" && (
                      <button
                        onClick={() => { setPwUserId(user.id); setPwNew(""); setPwConfirm(""); setPwError("") }}
                        className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)]"
                        title="비밀번호 변경"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingUser(user.id); setEditName(user.name) }}
                      className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg-muted)]"
                      title="이름 수정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {currentUser?.id !== user.id && (
                      <button
                        onClick={() => {
                          const newRole = user.role === "admin" ? "user" : "admin"
                          updateRoleMutation.mutate({ id: user.id, role: newRole })
                        }}
                        disabled={updateRoleMutation.isPending}
                        className="rounded p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-border-strong)] hover:text-blue-400 disabled:opacity-40"
                        title={user.role === "admin" ? "일반 사용자로 변경" : "관리자로 변경"}
                      >
                        {updateRoleMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Shield className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddDialog(false)}>
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
              <h2 className="text-lg font-semibold text-foreground">사용자 추가</h2>
              <button onClick={() => setShowAddDialog(false)} className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex border-b border-[var(--color-border-strong)]">
              {([
                { key: "invite", label: "이메일 초대", icon: Mail },
                { key: "direct", label: "직접 등록", icon: UserPlus },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setAddMode(key); setAddError("") }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                    addMode === key
                      ? "border-b-2 border-[#3b82f6] text-[#3b82f6]"
                      : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-4 p-5">
              <p className="text-xs text-[var(--color-fg-subtle)]">
                {addMode === "invite"
                  ? "이메일로 초대 링크를 보냅니다. 사용자가 링크를 통해 가입을 완료합니다."
                  : "관리자가 사용자를 바로 등록합니다. 즉시 활성 상태가 됩니다."}
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  이름 <span className="text-red-400">*</span>
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  이메일 <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
                />
              </div>

              {addMode === "direct" && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      비밀번호 <span className="text-red-400">*</span>
                    </label>
                    <PasswordInput
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder="6자 이상 입력"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      비밀번호 확인 <span className="text-red-400">*</span>
                    </label>
                    <PasswordInput
                      value={newPasswordConfirm}
                      onChange={setNewPasswordConfirm}
                      placeholder="비밀번호 재입력"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
                    />
                    {newPasswordConfirm && newPassword !== newPasswordConfirm && (
                      <p className="mt-1 text-xs text-red-400">비밀번호가 일치하지 않습니다.</p>
                    )}
                    {newPasswordConfirm && newPassword === newPasswordConfirm && newPassword.length >= 6 && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-400">
                        <Check className="h-3 w-3" /> 일치합니다
                      </p>
                    )}
                  </div>
                </>
              )}

              {addError && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{addError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newEmail.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563eb] disabled:opacity-40"
                >
                  {addMode === "invite" ? (
                    <Mail className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {addMode === "invite" ? "초대 메일 보내기" : "바로 등록"}
                </button>
                <button
                  onClick={() => setShowAddDialog(false)}
                  className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-bg"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pwUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPwUserId(null)}>
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">비밀번호 변경</h2>
                {pwTargetUser && (
                  <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{pwTargetUser.name} · {pwTargetUser.email}</p>
                )}
              </div>
              <button onClick={() => setPwUserId(null)} className="rounded p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-border-strong)] hover:text-[var(--color-fg)]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
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
                onClick={handleResetToDefault}
                disabled={pwSaving}
                title={`비밀번호를 기본값(${DEFAULT_PASSWORD}) 으로 초기화`}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
              >
                {resetPasswordMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                기본값({DEFAULT_PASSWORD}) 으로 초기화
              </button>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={handleChangePassword}
                  disabled={!pwNew || !pwConfirm || pwSaving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#3b82f6] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2563eb] disabled:opacity-40"
                >
                  {changePasswordMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  변경
                </button>
                <button
                  onClick={() => setPwUserId(null)}
                  className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2.5 text-sm text-[var(--color-fg-muted)] transition-colors hover:bg-bg"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

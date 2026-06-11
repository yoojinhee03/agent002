export type CredentialKind = "provider" | "tool" | "mcp"

export type CredentialStatus = "active" | "invalid" | "expired"

export interface UserCredential {
  id: string
  userId: string
  kind: CredentialKind
  targetId: string
  label: string
  metadata?: Record<string, unknown> | null
  status: CredentialStatus
  lastVerifiedAt?: string | null
  createdAt: string
  updatedAt: string

  /** 마스킹된 표시값 (xxxx****yyyy) — valueEnc 평문은 절대 노출되지 않는다 */
  maskedValue: string
  /** 평문 끝 4자 (UI 보조) */
  lastFour: string
}

export interface CreateUserCredentialRequest {
  kind: CredentialKind
  targetId: string
  label?: string
  value: string
  metadata?: Record<string, unknown>
}

export interface UpdateUserCredentialRequest {
  label?: string
  value?: string
  metadata?: Record<string, unknown>
}

export interface VerifyUserCredentialResponse {
  ok: boolean
  status: CredentialStatus
  message?: string
}

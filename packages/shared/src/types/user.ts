export type UserStatus = "active" | "pending"

export type UserRole = "admin" | "user"

export interface User {
  id: string
  name: string
  email: string
  status: UserStatus
  role: UserRole
  avatarUrl?: string
  createdAt: string
  activatedAt?: string
}

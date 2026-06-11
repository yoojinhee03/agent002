export type Role = "admin" | "editor" | "viewer"

export type MemberStatus = "active" | "invited" | "declined" | "expired" | "cancelled"

export type ProjectVisibility = "private" | "public"

export interface Member {
  id: string
  name: string
  email: string
  role: Role
  avatarUrl?: string
  status: MemberStatus
  joinedAt: string
  invitedAt?: string
  invitedBy?: string
  expiresAt?: string
  message?: string
  declinedAt?: string
  cancelledAt?: string
}

export type ActivityAction =
  | "invited"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "resent"
  | "removed"
  | "role_changed"

export interface ProjectActivityLog {
  id: string
  projectId: string
  action: ActivityAction
  memberName: string
  memberEmail: string
  performedBy: string
  role?: Role
  message?: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  description: string
  slug: string
  visibility: ProjectVisibility
  publicDocsEnabled: boolean
  members: Member[]
  promptCount: number
  allowAllModels: boolean       // true = use all globally enabled models
  allowedModelIds: string[]     // used when allowAllModels is false
  defaultModelId?: string       // default model for new prompts
  isFavorite?: boolean
  createdAt: string
  updatedAt: string
}

import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { mockApi } from "@/lib/api-client"
import type { User } from "@/types/user"

interface UserState {
  users: User[]
  currentUser: User | null
  isAuthenticated: boolean
  loading: boolean
  activeProjectId: string | null

  setActiveProjectId: (projectId: string | null) => void

  // Auth
  login: (email: string, password: string) => Promise<User | null>
  logout: () => Promise<void>
  forgotPassword: (email: string) => Promise<boolean>
  resetPassword: (email: string, newPassword: string) => Promise<boolean>

  // Users management
  loadUsers: () => Promise<void>
  loadCurrentUser: () => Promise<void>
  searchUsers: (query: string) => Promise<User[]>
  inviteByEmail: (data: { name: string; email: string }) => Promise<User | null>
  registerDirect: (data: { name: string; email: string; password: string }) => Promise<User | null>
  activateUser: (id: string) => Promise<boolean>
  setUserActive: (id: string, active: boolean) => void
  updateUser: (id: string, data: { name?: string; avatarUrl?: string }) => Promise<boolean>
  changePassword: (id: string, newPassword: string) => Promise<boolean>
  resendInvite: (id: string) => Promise<boolean>
  updateUserRole: (id: string, role: 'admin' | 'user') => Promise<boolean>
  
  // Project management
  initProject: () => Promise<void>
}

export const useUserStore = create<UserState>()(
  immer((set) => ({
    users: [],
    currentUser: null,
    isAuthenticated: false,
    loading: false,
    activeProjectId: null,

    setActiveProjectId(projectId) {
      set((s) => {
        s.activeProjectId = projectId
      })
    },

    // ── Auth ─────────────────────────────────────────────────
    async login(email, password) {
      const user = await mockApi.auth.login(email, password)
      if (user) {
        set((s) => {
          s.currentUser = user
          s.isAuthenticated = true
        })
        await useUserStore.getState().initProject()
      }
      return user
    },

    async logout() {
      await mockApi.auth.logout()
      set((s) => {
        s.currentUser = null
        s.isAuthenticated = false
        s.users = []
        s.activeProjectId = null
      })
    },

    async forgotPassword(email) {
      return mockApi.auth.forgotPassword(email)
    },

    async resetPassword(email, newPassword) {
      return mockApi.auth.resetPassword(email, newPassword)
    },

    // ── Users management ─────────────────────────────────────
    async loadUsers() {
      set((s) => { s.loading = true })
      const users = await mockApi.users.list()
      set((s) => { s.users = users; s.loading = false })
    },

    async loadCurrentUser() {
      const { loading } = useUserStore.getState()
      if (loading) return
      
      set((s) => { s.loading = true })

      try {
        const user = await mockApi.users.getCurrentUser()
        if (user) {
          set((s) => {
            s.currentUser = user
            s.isAuthenticated = true
            s.loading = false
          })
          await useUserStore.getState().initProject()
          return
        }
      } catch (e) {
        // Not logged in or token expired
      }

      set((s) => {
        s.currentUser = null
        s.isAuthenticated = false
        s.loading = false
      })
      return
    },

    async searchUsers(query) {
      return mockApi.users.search(query)
    },

    async inviteByEmail(data) {
      const user = await mockApi.users.invite(data)
      if (user) {
        set((s) => { s.users.push(user) })
      }
      return user
    },

    async registerDirect(data) {
      const user = await mockApi.users.registerDirect(data)
      if (user) {
        set((s) => { s.users.push(user) })
      }
      return user
    },

    async activateUser(id) {
      const ok = await mockApi.users.activate(id)
      if (ok) {
        set((s) => {
          const idx = s.users.findIndex((u) => u.id === id)
          if (idx !== -1) s.users[idx] = { ...s.users[idx], status: 'active' }
        })
      }
      return ok
    },

    setUserActive(id, active) {
      set((s) => {
        const idx = s.users.findIndex((u) => u.id === id)
        if (idx !== -1) s.users[idx] = { ...s.users[idx], status: active ? 'active' : 'pending' }
      })
    },

    async updateUser(id, data) {
      const ok = await mockApi.users.update(id, data)
      if (ok) {
        set((s) => {
          const idx = s.users.findIndex((u) => u.id === id)
          if (idx !== -1) s.users[idx] = { ...s.users[idx], ...data }
        })
        const { currentUser } = useUserStore.getState()
        if (currentUser?.id === id) {
          const updated = await mockApi.users.getById(id)
          if (updated) set((s) => { s.currentUser = updated })
        }
      }
      return ok
    },

    async changePassword(id, newPassword) {
      return mockApi.users.changePassword(id, newPassword)
    },

    async resendInvite(id) {
      return mockApi.users.resendInvite(id)
    },

    async updateUserRole(id, role) {
      const ok = await mockApi.users.updateRole(id, role)
      if (ok) {
        set((s) => {
          const idx = s.users.findIndex((u) => u.id === id)
          if (idx !== -1) s.users[idx] = { ...s.users[idx], role }
        })
      }
      return ok
    },

    // ── Project management ─────────────────────────────────────
    async initProject() {
      try {
        // membersOnly=true — 사용자가 멤버인 project 만 가져온다. 인자 없이 호출하면 백엔드가
        // OR: [public, member] 로 public project 까지 섞어 반환해서 사용자 본인 workspace 보다
        // 다른 project 가 [0] 으로 잡혀 history 가 빈 결과로 보이던 회귀 차단.
        const projects = await mockApi.projects.list(true)
        if (projects && projects.length > 0) {
          set((s) => { s.activeProjectId = projects[0].id })
          return
        }
        // 사용자가 어떤 Project 의 멤버도 아니면 본인 워크스페이스 자동 생성.
        // slug 는 user id 기반 unique 값(전역 slug unique 제약 회피).
        const { currentUser } = useUserStore.getState()
        const userTag = currentUser?.id?.slice(0, 8) || Date.now().toString(36)
        const displayName = currentUser?.name || '사용자'
        const defaultProject = await mockApi.projects.create({
          name: `${displayName} Workspace`,
          slug: `workspace-${userTag}`,
          description: '자동 생성된 기본 프로젝트',
        })
        set((s) => { s.activeProjectId = defaultProject.id })
      } catch (e) {
        console.error('Failed to initialize active project:', e)
      }
    }
  }))
)

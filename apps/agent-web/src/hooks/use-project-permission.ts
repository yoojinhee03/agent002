"use client"

import { useState, useEffect } from "react"
import { useUserStore } from "@/stores/use-user-store"
import { mockApi } from "@/lib/api-client"
import type { Role, Project } from "@/types/project"

interface ProjectPermission {
  role: Role | null
  isMember: boolean
  isPublicViewer: boolean
  canEdit: boolean
  canManage: boolean
  loading: boolean
  project: Project | null
}

export function useProjectPermission(projectId: string): ProjectPermission {
  const { currentUser } = useUserStore()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(!!projectId)

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    mockApi.projects.getById(projectId).then((p) => {
      if (!cancelled) {
        setProject((Array.isArray(p) ? null : p) ?? null)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [projectId])

  if (loading || !project) {
    return {
      role: null,
      isMember: false,
      isPublicViewer: false,
      canEdit: false,
      canManage: false,
      loading,
      project: null,
    }
  }

  const member = currentUser
    ? project.members.find(
        (m) => m.email === currentUser.email && m.status === "active"
      )
    : undefined

  const role = member?.role ?? null
  const isMember = !!member
  const isPublicViewer = project.visibility === "public" && !isMember
  const canEdit = role === "admin" || role === "editor"
  const canManage = role === "admin"

  return { role, isMember, isPublicViewer, canEdit, canManage, loading, project }
}

'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function McpRedirectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const router = useRouter()

  useEffect(() => {
    router.replace(`/projects/${projectId}/tools?tab=mcp`)
  }, [projectId, router])

  return null
}

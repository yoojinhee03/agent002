'use client'

import { useParams, useSearchParams } from 'next/navigation'
import { ClientChatView } from '@/components/client/ClientChatView'

export default function ClientChatPage() {
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const slug = params?.slug ?? ''
  const initialThreadId = search?.get('threadId') ?? null

  return (
    <div className="h-screen">
      <ClientChatView slug={slug} threadId={initialThreadId} showHeader />
    </div>
  )
}

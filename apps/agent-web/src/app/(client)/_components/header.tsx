'use client'

import { Bell, Search } from 'lucide-react'

interface ClientHeaderProps {
  title: string
  subtitle?: string
}

export function ClientHeader({ title, subtitle }: ClientHeaderProps) {
  return (
    <header
      className="flex h-14 items-center justify-between border-b px-5"
      style={{
        borderColor: 'var(--client-border)',
        background: 'var(--client-bg)',
      }}
    >
      <div>
        <h1
          className="text-[15px] font-semibold leading-tight"
          style={{ color: 'var(--client-text)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs" style={{ color: 'var(--client-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          aria-label="검색"
          className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--client-panel-2)]"
          style={{ borderColor: 'var(--client-border)', color: 'var(--client-muted)' }}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          aria-label="알림"
          className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--client-panel-2)]"
          style={{ borderColor: 'var(--client-border)', color: 'var(--client-muted)' }}
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

const THEME_KEY = 'agent-studio-theme'

type Theme = 'dark' | 'light'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.remove('dark', 'light')
  root.classList.add(theme)
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null
    const initial: Theme = saved === 'light' ? 'light' : 'dark'
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
    localStorage.setItem(THEME_KEY, next)
  }

  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={cn(
        'btn-icon border transition-colors',
        'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-fg-muted)]',
        'hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)]',
      )}
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  )
}

'use client'

import Editor, { type EditorProps, loader } from '@monaco-editor/react'
import { defineMonacoTheme, MONACO_EDIT_OPTIONS } from '@/lib/monaco-theme'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// Initialize monaco
loader.init().then((monaco) => {
  defineMonacoTheme(monaco)
})

interface Props extends Omit<EditorProps, 'theme'> {
  height?: string | number
  language?: string
  value?: string
  onChange?: (value: string | undefined) => void
  readOnly?: boolean
  variant?: 'default' | 'panel'
}

export function MonacoEditor({
  height = '300px',
  language = 'javascript',
  value = '',
  onChange,
  readOnly = false,
  options,
  variant = 'default',
  ...props
}: Props) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return <div style={{ height }} className="bg-muted animate-pulse rounded-md" />

  const darkTheme = variant === 'panel' ? 'agentstudio-dark-panel' : 'agentstudio-dark'
  const wrapperBg = variant === 'panel' ? 'bg-[var(--color-surface)]' : ''

  return (
    <div className={`border border-[var(--color-border-strong)] rounded-lg overflow-hidden ${wrapperBg}`}>
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={onChange}
        theme={resolvedTheme === 'light' ? 'vs-light' : darkTheme}
        options={{
          ...MONACO_EDIT_OPTIONS,
          readOnly,
          ...options,
        }}
        {...props}
      />
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type * as MonacoType from 'monaco-editor'
import { defineMonacoTheme, resolveMonacoThemeBase, resolveThemeColors } from '@/lib/monaco-theme'
import { renderMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/utils'
import { Pencil, Eye, Columns2, Maximize2, Minimize2 } from 'lucide-react'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Props {
  value: string
  onChange: (v: string) => void
  height?: number
}

export function SkillInstructionsEditor({ value, onChange, height = 320 }: Props) {
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit')
  const [sizeMode, setSizeMode] = useState<'fixed' | 'full'>('fixed')
  const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef<'editor' | 'preview' | null>(null)

  useEffect(() => {
    if (viewMode !== 'split') return
    const editor = editorRef.current
    const preview = previewRef.current
    if (!editor || !preview) return

    const ratio = (top: number, max: number) => (max > 0 ? top / max : 0)

    const onEditorScroll = editor.onDidScrollChange((e) => {
      if (syncingRef.current === 'preview') return
      const maxEditor = e.scrollHeight - editor.getLayoutInfo().height
      const r = ratio(e.scrollTop, maxEditor)
      syncingRef.current = 'editor'
      preview.scrollTop = r * (preview.scrollHeight - preview.clientHeight)
      requestAnimationFrame(() => { syncingRef.current = null })
    })

    const onPreviewScroll = () => {
      if (syncingRef.current === 'editor') return
      const r = ratio(preview.scrollTop, preview.scrollHeight - preview.clientHeight)
      const editorScrollHeight = editor.getScrollHeight()
      const editorLayoutHeight = editor.getLayoutInfo().height
      syncingRef.current = 'preview'
      editor.setScrollTop(r * (editorScrollHeight - editorLayoutHeight))
      requestAnimationFrame(() => { syncingRef.current = null })
    }

    preview.addEventListener('scroll', onPreviewScroll)
    return () => {
      onEditorScroll.dispose()
      preview.removeEventListener('scroll', onPreviewScroll)
    }
  }, [viewMode, sizeMode, value])

  useEffect(() => {
    if (sizeMode !== 'full') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSizeMode('fixed')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sizeMode])

  const tokenCount = Math.ceil(value.length / 4)

  const editorElement = (
    <Editor
      height="100%"
      language="markdown"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={(editor) => { editorRef.current = editor }}
      beforeMount={(monaco) => {
        defineMonacoTheme(monaco)
        const c = resolveThemeColors()
        monaco.editor.defineTheme('agent-studio-seamless', {
          base: resolveMonacoThemeBase(),
          inherit: true,
          rules: [],
          colors: {
            'editor.background': c.bg,
            'editor.lineNumbersBackground': c.bg,
          },
        })
      }}
      theme="agent-studio-seamless"
      options={{
        fontSize: 13,
        lineHeight: 20,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 4 },
        lineNumbers: 'off',
        glyphMargin: false,
        folding: false,
        lineDecorationsWidth: 12,
        lineNumbersMinChars: 0,
        automaticLayout: true,
      }}
    />
  )

  const previewElement = (
    <div
      ref={previewRef}
      className="prose-invert-custom max-w-none px-4 py-3 text-sm overflow-y-auto h-full bg-[var(--color-bg)] text-[var(--color-fg)]"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }}
    />
  )

  const toggleSizeMode = () => setSizeMode((p) => (p === 'fixed' ? 'full' : 'fixed'))

  const containerClass = sizeMode === 'full'
    ? 'fixed inset-0 z-50 flex flex-col rounded-none border-none bg-[var(--color-bg)] overflow-hidden'
    : 'flex flex-col rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg)] overflow-hidden'

  const bodyStyle = sizeMode === 'full'
    ? undefined
    : { height: `${height}px` }

  const bodyClass = sizeMode === 'full'
    ? 'flex-1 min-h-0 relative overflow-hidden'
    : 'relative min-h-0 overflow-hidden'

  const viewModeOptions: Array<{ value: 'edit' | 'preview' | 'split'; icon: React.ReactNode; label: string }> = [
    { value: 'edit', icon: <Pencil className="h-3.5 w-3.5" />, label: 'Edit' },
    { value: 'preview', icon: <Eye className="h-3.5 w-3.5" />, label: 'Preview' },
    { value: 'split', icon: <Columns2 className="h-3.5 w-3.5" />, label: 'Split' },
  ]

  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5 bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
            SKILL.md Instructions
          </span>
          <span className="text-xs text-[var(--color-fg-subtle)]">{tokenCount} 토큰 (예상)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
            {viewModeOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setViewMode(opt.value)}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={viewMode === opt.value}
                className={cn(
                  'flex h-6 w-7 items-center justify-center rounded transition-colors',
                  viewMode === opt.value
                    ? 'bg-blue-500/20 text-blue-300'
                    : 'text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
                )}
              >
                {opt.icon}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleSizeMode}
            className="flex h-6 w-7 items-center justify-center rounded text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
            title={sizeMode === 'full' ? '축소' : '전체화면'}
            aria-label={sizeMode === 'full' ? '축소' : '전체화면'}
          >
            {sizeMode === 'full' ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className={bodyClass} style={bodyStyle}>
        {viewMode === 'edit' && <div className="absolute inset-0">{editorElement}</div>}
        {viewMode === 'preview' && <div className="absolute inset-0">{previewElement}</div>}
        {viewMode === 'split' && (
          <div className="absolute inset-0 grid grid-cols-2 divide-x divide-[var(--color-border)]">
            <div className="relative min-h-0 min-w-0 overflow-hidden">
              <div className="absolute inset-0">{editorElement}</div>
            </div>
            <div className="relative min-h-0 min-w-0 overflow-hidden">
              <div className="absolute inset-0">{previewElement}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

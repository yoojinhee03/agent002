'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { Agent, UpdateAgentRequest } from '@agent-studio/shared'
import { defineMonacoTheme, resolveMonacoThemeBase, resolveThemeColors } from '@/lib/monaco-theme'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, FileCode } from 'lucide-react'

const Editor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface Props {
  agent: Agent
  onChange: (changes: UpdateAgentRequest) => void
}

const TEMPLATES = [
  {
    label: '자유 텍스트',
    value: null,
  },
  {
    label: '분류 결과',
    value: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '분류 카테고리' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
      },
      required: ['category', 'confidence'],
    },
  },
  {
    label: '구조화된 리포트',
    value: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'keyPoints'],
    },
  },
]

type Format = 'none' | 'json_schema'

export function OutputSchemaTab({ agent, onChange }: Props) {
  const hasSchema = !!agent.outputSchema
  const [format, setFormat] = useState<Format>(hasSchema ? 'json_schema' : 'none')
  const [schemaStr, setSchemaStr] = useState(
    agent.outputSchema ? JSON.stringify(agent.outputSchema, null, 2) : JSON.stringify(TEMPLATES[1].value, null, 2)
  )
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  const handleSchemaChange = (val: string | undefined) => {
    const v = val ?? ''
    setSchemaStr(v)
    try {
      const parsed = JSON.parse(v)
      setJsonError(null)
      onChange({ outputSchema: parsed })
    } catch {
      setJsonError('Invalid JSON')
    }
  }

  const handleFormatChange = (f: Format) => {
    setFormat(f)
    if (f === 'none') onChange({ outputSchema: undefined })
    else {
      try {
        onChange({ outputSchema: JSON.parse(schemaStr) })
      } catch {}
    }
  }

  const applyTemplate = (tpl: typeof TEMPLATES[number]) => {
    if (!tpl.value) {
      handleFormatChange('none')
      setShowTemplates(false)
      return
    }
    const str = JSON.stringify(tpl.value, null, 2)
    setSchemaStr(str)
    setJsonError(null)
    onChange({ outputSchema: tpl.value })
    setShowTemplates(false)
  }

  return (
    <div className="space-y-4 px-6 pt-2">
      {/* Format selector */}
      <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2">
        {([['none', 'Plain Text'], ['json_schema', 'JSON Schema']] as const).map(([val, label]) => (
          <button key={val}
            onClick={() => handleFormatChange(val)}
            className={cn('flex items-center gap-1.5 text-xs font-bold',
              format === val ? 'text-blue-400' : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]'
            )}
          >
            <div className={cn('h-3 w-3 rounded-full border-2 transition-colors', format === val ? 'border-blue-500 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-[var(--color-border-strong)]')} />
            {label}
          </button>
        ))}
      </div>

      {format === 'json_schema' && (
        <>
          {/* Templates Toggle */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex w-full items-center justify-between px-4 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-3 w-3 text-[var(--color-fg-subtle)]" />
                <span className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">Templates</span>
              </div>
              {showTemplates ? <ChevronUp className="h-3 w-3 text-[var(--color-fg-subtle)]" /> : <ChevronDown className="h-3 w-3 text-[var(--color-fg-subtle)]" />}
            </button>
            {showTemplates && (
              <div className="grid grid-cols-1 gap-1 border-t border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
                {TEMPLATES.filter(t => t.value).map(tpl => (
                  <button key={tpl.label}
                    onClick={() => applyTemplate(tpl)}
                    className="w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-left text-xs text-[var(--color-fg-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-fg)] transition-colors"
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Editor */}
          <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-1.5 bg-[var(--color-surface)]">
              <span className="text-xs font-bold uppercase text-[var(--color-fg-subtle)]">Schema Editor</span>
              {jsonError && <span className="text-xs text-red-400 font-bold">{jsonError}</span>}
            </div>
            <div className="h-[250px]">
              <Editor
                height="100%"
                language="json"
                value={schemaStr}
                onChange={handleSchemaChange}
                beforeMount={(monaco) => {
                  defineMonacoTheme(monaco);
                  const c = resolveThemeColors();
                  monaco.editor.defineTheme("agent-studio-json", {
                    base: resolveMonacoThemeBase(),
                    inherit: true,
                    rules: [],
                    colors: {
                      "editor.background": c.bg,
                      "editor.lineNumbersBackground": c.bg,
                    },
                  });
                }}
                theme="agent-studio-json"
                options={{
                  fontSize: 12,
                  lineHeight: 18,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 12, bottom: 12 },
                  renderLineHighlight: 'none',
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  scrollbar: { verticalScrollbarSize: 4 },
                }}
              />
            </div>
          </div>
        </>
      )}

      {format === 'none' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-8 text-center">
          <p className="text-xs text-[var(--color-fg-subtle)]">에이전트가 자유로운 텍스트 형식으로 답변합니다</p>
        </div>
      )}
    </div>
  )
}

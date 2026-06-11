'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { X, Play, Clock, Terminal } from 'lucide-react'
import type { Tool } from '@agent-studio/shared'

interface Props {
  tool: Tool
  onClose: () => void
}

export function ToolTestPanel({ tool, onClose }: Props) {
  // Parse tool schema and config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = (tool.inputSchema as any) || {}
  const properties = schema.properties || {}
  const requiredFields = (schema.required as string[]) || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = (tool.config as any) || {}

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{
    success: boolean
    statusCode?: number
    output: unknown
    latency: number
    error?: string
    curlCommand?: string
    logs?: string
  } | null>(null)

  const handleRun = async () => {
    setRunning(true)
    setResult(null)
    try {
      const res = await apiClient.tools.testById(tool.id, inputs)
      setResult(res)
    } catch (err) {
      setResult({ success: false, output: null, latency: 0, error: String(err) })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-[480px] h-full bg-[var(--color-bg)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-fg)]">{tool.name}</h3>
              <span className="text-xs text-[var(--color-fg-subtle)] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-2)]">{tool.slug}</span>
            </div>
            <p className="text-xs text-[var(--color-fg-subtle)]">도구 테스트</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Description */}
          {tool.description && (
            <div className="rounded-lg border border-[var(--color-border)] bg-bg/30 p-3">
              <p className="text-xs text-[var(--color-fg-muted)] leading-relaxed whitespace-pre-wrap">
                {tool.description}
              </p>
            </div>
          )}

          {/* Spec Info */}
          {tool.type === 'http' && (
            <div className="rounded-lg border border-[var(--color-border)] bg-bg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-fg)] flex items-center gap-1.5">
                등록된 스펙 정보
              </h4>
              <div className="text-xs text-[var(--color-fg-muted)] space-y-1">
                <p><strong className="text-blue-400">{config.method || 'GET'}</strong> {config.url}</p>
                {config.headers && Object.keys(config.headers).length > 0 && (
                  <div className="mt-1">
                    <p className="font-semibold text-[var(--color-fg-subtle)]">Headers:</p>
                    <ul className="pl-2">
                      {Object.entries(config.headers).map(([k, v]) => (
                        <li key={k}>{k}: {String(v)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {config.auth && (
                  <p className="mt-1"><span className="font-semibold text-[var(--color-fg-subtle)]">Auth:</span> {config.auth.type}</p>
                )}
              </div>
            </div>
          )}

          {tool.type === 'code' && (
            <div className="rounded-lg border border-[var(--color-border)] bg-bg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-[var(--color-fg)] flex items-center gap-1.5">
                코드 설정 정보
              </h4>
              <div className="text-xs text-[var(--color-fg-muted)] space-y-1">
                <p><span className="font-semibold text-[var(--color-fg-subtle)]">Language:</span> <span className="text-blue-400 uppercase font-bold">{(config.language || 'javascript')}</span></p>
                <div className="mt-2">
                  <p className="font-semibold text-[var(--color-fg-subtle)] mb-1">Source Code:</p>
                  <pre className="text-xs text-[var(--color-fg-muted)] bg-bg p-2 rounded border border-[var(--color-border)] font-mono max-h-32 overflow-y-auto whitespace-pre">
                    {config.code}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Input Form */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--color-fg)] mb-3">입력 파라미터</h4>
            {Object.keys(properties).length === 0 ? (
              <p className="text-xs text-[var(--color-fg-subtle)]">입력 스키마에 정의된 파라미터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {Object.entries(properties).map(([key, prop]: [string, any]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-[var(--color-fg-muted)] mb-1">
                      {key} {requiredFields.includes(key) && <span className="text-red-400">*</span>}
                    </label>
                    {prop.description && (
                      <p className="text-xs text-[var(--color-fg-subtle)] mb-1.5">{prop.description}</p>
                    )}
                    <input
                      type="text"
                      value={inputs[key] || ''}
                      onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="w-full rounded-lg border border-[var(--color-border)] bg-bg px-3 py-2 text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-subtle)] focus:border-blue-500 focus:outline-none"
                      placeholder={prop.type === 'string' ? '문자열 입력' : '값 입력'}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div className={cn('rounded-lg border p-3 space-y-3', result.success ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded-full', result.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400')}>
                    {result.success ? '성공' : '실패'}
                  </span>
                  {result.statusCode && (
                    <span className="text-xs text-[var(--color-fg-subtle)]">HTTP {result.statusCode}</span>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs text-[var(--color-fg-subtle)]">
                  <Clock className="h-3 w-3" />
                  {result.latency}ms
                </span>
              </div>

              {result.error && (
                <p className="text-xs text-red-400 font-mono">{result.error}</p>
              )}

              {result.curlCommand && (
                <div>
                  <p className="text-xs text-[var(--color-fg-subtle)] mb-1 flex items-center gap-1">
                    <Terminal className="h-3 w-3" />
                    요청 cURL
                  </p>
                  <pre className="text-xs text-[#a5b4fc] bg-bg p-2 rounded border border-[var(--color-border)] font-mono whitespace-pre-wrap break-all overflow-x-auto">
                    {result.curlCommand}
                  </pre>
                </div>
              )}

              {result.logs && (
                <div>
                  <p className="text-xs text-[var(--color-fg-subtle)] mb-1 flex items-center gap-1">
                    <Terminal className="h-3 w-3" />
                    실행 로그 (Logs)
                  </p>
                  <pre className="text-xs text-amber-200/80 bg-bg p-2 rounded border border-[var(--color-border)] font-mono whitespace-pre-wrap break-all overflow-x-auto">
                    {result.logs}
                  </pre>
                </div>
              )}

              <div>
                <p className="text-xs text-[var(--color-fg-subtle)] mb-1">Response</p>
                <pre className="text-xs text-[var(--color-fg)] bg-bg p-2 rounded border border-[var(--color-border)] font-mono whitespace-pre-wrap break-all overflow-x-auto">
                  {typeof result.output === 'string'
                    ? result.output
                    : JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            {running ? '실행 중...' : '실행'}
          </button>
        </div>
      </div>
    </div>
  )
}

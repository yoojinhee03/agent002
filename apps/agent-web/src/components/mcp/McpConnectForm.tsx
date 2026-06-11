'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import type { McpTransport, CreateMcpServerRequest } from '@agent-studio/shared'
import { X, Plus, Trash2, Loader2, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  projectId: string
  onSuccess: () => void
  onClose: () => void
}

const TRANSPORT_OPTIONS: { value: McpTransport; label: string; desc: string }[] = [
  { value: 'stdio',           label: 'stdio',            desc: '로컬 프로세스 실행 (npx, python 등)' },
  { value: 'sse',             label: 'SSE',              desc: '원격 서버 — Server-Sent Events' },
  { value: 'streamable_http', label: 'Streamable HTTP',  desc: '원격 서버 — HTTP 스트리밍' },
]

export function McpConnectForm({ projectId, onSuccess, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [transport, setTransport] = useState<McpTransport>('stdio')
  // stdio
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState<string[]>([''])
  const [envPairs, setEnvPairs] = useState<{ key: string; value: string }[]>([])
  // sse / http
  const [url, setUrl] = useState('')
  const [headerPairs, setHeaderPairs] = useState<{ key: string; value: string }[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('서버 이름을 입력하세요'); return }

    const config: CreateMcpServerRequest['config'] = transport === 'stdio'
      ? {
          command: command.trim(),
          args: args.filter(a => a.trim()),
          env: Object.fromEntries(envPairs.filter(p => p.key).map(p => [p.key, p.value])),
        }
      : {
          url: url.trim(),
          headers: Object.fromEntries(headerPairs.filter(p => p.key).map(p => [p.key, p.value])),
        }

    if (transport === 'stdio' && !config.command) { setError('커맨드를 입력하세요'); return }
    if (transport !== 'stdio' && !config.url)     { setError('URL을 입력하세요'); return }

    setSaving(true)
    setError(null)
    try {
      await apiClient.mcp.create(projectId, { name: name.trim(), description: description.trim() || undefined, transport, config })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-[var(--color-fg)]">MCP Server 추가</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
          {/* 인기 MCP(Tavily / Context7 등)는 Tools → MCP 탭의 "추천 MCP" 영역에서 토글
              한 번으로 활성화할 수 있다. 이 form 은 카탈로그에 없는 임의의 MCP 서버를
              command·args·env 까지 직접 입력해 등록할 때 사용한다. */}

          {/* 이름 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--color-fg-muted)]">서버 이름 <span className="text-red-400">*</span></label>
            <input className="input-dark w-full" placeholder="Filesystem Server" value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* 설명 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--color-fg-muted)]">설명</label>
            <input className="input-dark w-full" placeholder="파일 시스템 접근용 MCP 서버" value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {/* Transport */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Transport</label>
            <div className="grid grid-cols-3 gap-2">
              {TRANSPORT_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setTransport(opt.value)}
                  className={cn('rounded-lg border p-2.5 text-left transition-colors',
                    transport === opt.value
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-border-strong'
                  )}>
                  <div className="text-xs font-semibold text-[var(--color-fg)]">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* stdio 설정 */}
          {transport === 'stdio' && (
            <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">커맨드 <span className="text-red-400">*</span></label>
                <input className="input-dark w-full font-mono text-xs"
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                  value={command} onChange={e => setCommand(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Args</label>
                  <button onClick={() => setArgs([...args, ''])} className="text-xs text-blue-400 hover:text-blue-300">+ 추가</button>
                </div>
                {args.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input-dark flex-1 font-mono text-xs" placeholder="/path/to/dir"
                      value={a} onChange={e => setArgs(args.map((x, j) => j === i ? e.target.value : x))} />
                    <button onClick={() => setArgs(args.filter((_, j) => j !== i))} className="text-[var(--color-fg-subtle)] hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-fg-muted)]">환경 변수</label>
                  <button onClick={() => setEnvPairs([...envPairs, { key: '', value: '' }])} className="text-xs text-blue-400 hover:text-blue-300">+ 추가</button>
                </div>
                {envPairs.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input-dark w-32 font-mono text-xs" placeholder="KEY"
                      value={p.key} onChange={e => setEnvPairs(envPairs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                    <input className="input-dark flex-1 font-mono text-xs" placeholder="value"
                      value={p.value} onChange={e => setEnvPairs(envPairs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                    <button onClick={() => setEnvPairs(envPairs.filter((_, j) => j !== i))} className="text-[var(--color-fg-subtle)] hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SSE / HTTP 설정 */}
          {transport !== 'stdio' && (
            <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">URL <span className="text-red-400">*</span></label>
                <input className="input-dark w-full font-mono text-xs"
                  placeholder="https://mcp.example.com/sse"
                  value={url} onChange={e => setUrl(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Headers</label>
                  <button onClick={() => setHeaderPairs([...headerPairs, { key: '', value: '' }])} className="text-xs text-blue-400 hover:text-blue-300">+ 추가</button>
                </div>
                {headerPairs.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input-dark w-40 font-mono text-xs" placeholder="Authorization"
                      value={p.key} onChange={e => setHeaderPairs(headerPairs.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                    <input className="input-dark flex-1 font-mono text-xs" placeholder="Bearer ..."
                      value={p.value} onChange={e => setHeaderPairs(headerPairs.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                    <button onClick={() => setHeaderPairs(headerPairs.filter((_, j) => j !== i))} className="text-[var(--color-fg-subtle)] hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button onClick={onClose} className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]">
            취소
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40 hover:bg-blue-500">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            서버 추가
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { MSG } from '@/lib/messages/mutation'
import type {
  McpTransport,
  McpCredentialMode,
  RequiredUserField,
  McpServer,
  CreateMcpServerRequest,
  UpdateMcpServerRequest,
} from '@agent-studio/shared'
import { X, Plus, Trash2, Loader2, Plug } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { MonacoEditor } from '@/components/shared/monaco-editor'

// ============================================================
// 내부 타입
// ============================================================
interface EnvPair { key: string; value: string }

interface FormState {
  name: string
  description: string
  transport: McpTransport
  // stdio
  command: string
  args: string[]
  envPairs: EnvPair[]
  // sse / http
  url: string
  headerPairs: EnvPair[]
  // 인증
  credentialMode: McpCredentialMode
  requiredUserFields: RequiredUserField[]
}

interface Props {
  projectId: string
  /** 편집 모드 진입 시 기존 서버 정보. 없으면 등록 모드. */
  initialValue?: McpServer
  onSuccess: (server: McpServer) => void
  onClose: () => void
}

// ============================================================
// 상수
// ============================================================
const TRANSPORT_OPTIONS: { value: McpTransport; label: string; desc: string }[] = [
  { value: 'stdio',           label: 'stdio',           desc: '로컬 프로세스 (npx, python 등)' },
  { value: 'sse',             label: 'SSE',             desc: '원격 서버 — Server-Sent Events' },
  { value: 'streamable_http', label: 'Streamable HTTP', desc: '원격 서버 — HTTP 스트리밍' },
]

// ============================================================
// 유틸
// ============================================================
function pairsToRecord(pairs: EnvPair[]): Record<string, string> {
  return Object.fromEntries(pairs.filter(p => p.key).map(p => [p.key, p.value]))
}

function recordToPairs(rec?: Record<string, string>): EnvPair[] {
  if (!rec) return []
  return Object.entries(rec).map(([key, value]) => ({ key, value }))
}

function buildPayload(form: FormState): CreateMcpServerRequest {
  const config: CreateMcpServerRequest['config'] =
    form.transport === 'stdio'
      ? {
          command: form.command.trim(),
          args: form.args.filter(a => a.trim()),
          env: pairsToRecord(form.envPairs),
        }
      : {
          url: form.url.trim(),
          headers: pairsToRecord(form.headerPairs),
        }

  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    transport: form.transport,
    config,
    credentialMode: form.credentialMode,
    requiredUserFields: form.credentialMode === 'per_user' ? form.requiredUserFields : [],
  }
}

function serverToFormState(server: McpServer): FormState {
  const isStdio = server.transport === 'stdio'
  return {
    name: server.name,
    description: server.description ?? '',
    transport: server.transport,
    command: isStdio ? (server.config.command ?? '') : '',
    args: isStdio ? (server.config.args ?? []) : [],
    envPairs: isStdio ? recordToPairs(server.config.env) : [],
    url: !isStdio ? (server.config.url ?? '') : '',
    headerPairs: !isStdio ? recordToPairs(server.config.headers) : [],
    credentialMode: server.credentialMode ?? 'shared',
    requiredUserFields: server.requiredUserFields ?? [],
  }
}

function defaultFormState(): FormState {
  return {
    name: '',
    description: '',
    transport: 'stdio',
    command: '',
    args: [''],
    envPairs: [],
    url: '',
    headerPairs: [],
    credentialMode: 'shared',
    requiredUserFields: [],
  }
}

// ============================================================
// 서브 컴포넌트 — RequiredUserFields 편집기
// ============================================================
interface FieldEditorProps {
  fields: RequiredUserField[]
  onChange: (fields: RequiredUserField[]) => void
}

function RequiredFieldsEditor({ fields, onChange }: FieldEditorProps) {
  const addRow = () =>
    onChange([...fields, { key: '', label: '', secret: false, placeholder: '', required: true }])

  const updateRow = (index: number, patch: Partial<RequiredUserField>) =>
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)))

  const removeRow = (index: number) =>
    onChange(fields.filter((_, i) => i !== index))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-[var(--color-fg-muted)]">사용자 필수 입력 필드</label>
        <button
          type="button"
          onClick={addRow}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          + 필드 추가
        </button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-[var(--color-fg-subtle)]">
          사용자가 입력해야 할 자격증명 필드를 추가하세요.
        </p>
      )}

      {fields.map((f, i) => (
        <div key={i} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-[var(--color-fg-subtle)]">Key (환경변수명)</label>
              <input
                className="input-dark w-full font-mono text-xs"
                placeholder="TAVILY_API_KEY"
                value={f.key}
                onChange={e => updateRow(i, { key: e.target.value })}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs text-[var(--color-fg-subtle)]">Label (사용자 표시명)</label>
              <input
                className="input-dark w-full text-xs"
                placeholder="API Key"
                value={f.label}
                onChange={e => updateRow(i, { label: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-4 text-[var(--color-fg-subtle)] hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-[var(--color-fg-subtle)]">Placeholder</label>
              <input
                className="input-dark w-full text-xs"
                placeholder="tvly-..."
                value={f.placeholder ?? ''}
                onChange={e => updateRow(i, { placeholder: e.target.value })}
              />
            </div>
            <div className="flex items-end gap-4 pb-0.5">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-blue-500"
                  checked={!!f.secret}
                  onChange={e => updateRow(i, { secret: e.target.checked })}
                />
                <span className="text-xs text-[var(--color-fg-muted)]">비밀값</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-3 w-3 accent-blue-500"
                  checked={f.required !== false}
                  onChange={e => updateRow(i, { required: e.target.checked })}
                />
                <span className="text-xs text-[var(--color-fg-muted)]">필수</span>
              </label>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// 메인 컴포넌트
// ============================================================
export function McpServerDialog({ projectId, initialValue, onSuccess, onClose }: Props) {
  const isEdit = !!initialValue
  const [activeTab, setActiveTab] = useState<'form' | 'json'>('form')
  const [form, setForm] = useState<FormState>(
    initialValue ? serverToFormState(initialValue) : defaultFormState(),
  )
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(buildPayload(initialValue ? serverToFormState(initialValue) : defaultFormState()), null, 2),
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const setFormField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const saveMutation = useApiMutation<CreateMcpServerRequest, McpServer>({
    mutationFn: (payload) => {
      if (isEdit && initialValue) {
        return apiClient.mcp.update(initialValue.id, payload as UpdateMcpServerRequest)
      }
      return apiClient.mcp.create(projectId, payload)
    },
    successMessage: isEdit ? MSG.mcpServer.updated : MSG.mcpServer.created,
    onSuccess: (saved) => onSuccess(saved),
  })

  // Form → JSON 탭 전환: 현재 form 상태를 stringify
  const switchToJson = () => {
    setJsonText(JSON.stringify(buildPayload(form), null, 2))
    setActiveTab('json')
  }

  // JSON → Form 탭 전환: parse 후 form 에 반영, 실패 시 전환 막기
  const switchToForm = () => {
    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>
      const transport = (parsed.transport as McpTransport) ?? 'stdio'
      const config = (parsed.config ?? {}) as Record<string, unknown>
      const credentialMode = (parsed.credentialMode as McpCredentialMode) ?? 'shared'
      const requiredUserFields = (parsed.requiredUserFields as RequiredUserField[]) ?? []
      const isStdio = transport === 'stdio'

      setForm({
        name: String(parsed.name ?? ''),
        description: String(parsed.description ?? ''),
        transport,
        command: isStdio ? String(config.command ?? '') : '',
        args: isStdio ? ((config.args as string[]) ?? []) : [],
        envPairs: isStdio ? recordToPairs(config.env as Record<string, string>) : [],
        url: !isStdio ? String(config.url ?? '') : '',
        headerPairs: !isStdio ? recordToPairs(config.headers as Record<string, string>) : [],
        credentialMode,
        requiredUserFields,
      })
      setActiveTab('form')
    } catch {
      toast.error('JSON 파싱 오류 — 형식을 확인하세요')
    }
  }

  const handleTabClick = (tab: 'form' | 'json') => {
    if (tab === activeTab) return
    if (tab === 'json') switchToJson()
    else switchToForm()
  }

  const validate = (): string | null => {
    if (!form.name.trim()) return '서버 이름을 입력하세요'
    if (form.transport === 'stdio' && !form.command.trim()) return '커맨드를 입력하세요'
    if (form.transport !== 'stdio' && !form.url.trim()) return 'URL을 입력하세요'
    return null
  }

  const handleSubmit = () => {
    let payload: CreateMcpServerRequest
    if (activeTab === 'json') {
      try {
        payload = JSON.parse(jsonText) as CreateMcpServerRequest
      } catch {
        setValidationError('JSON 파싱 오류 — 형식을 확인하세요')
        return
      }
      if (!payload.name?.trim()) { setValidationError('서버 이름을 입력하세요'); return }
      if (payload.transport === 'stdio' && !(payload.config as { command?: string })?.command?.trim()) {
        setValidationError('커맨드를 입력하세요'); return
      }
      if (payload.transport !== 'stdio' && !(payload.config as { url?: string })?.url?.trim()) {
        setValidationError('URL을 입력하세요'); return
      }
    } else {
      const err = validate()
      if (err) { setValidationError(err); return }
      payload = buildPayload(form)
    }
    setValidationError(null)
    saveMutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-[var(--color-fg)]">
              {isEdit ? 'MCP Server 수정' : 'MCP Server 추가'}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-[var(--color-border)]">
          {(['form', 'json'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={cn(
                'px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]',
              )}
            >
              {tab === 'form' ? '폼 입력' : 'JSON 직접'}
            </button>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {/* ── Form 탭 ── */}
          {activeTab === 'form' && (
            <div className="space-y-5">
              {/* 이름 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">
                  서버 이름 <span className="text-red-400">*</span>
                </label>
                <input
                  className="input-dark w-full"
                  placeholder="Filesystem Server"
                  value={form.name}
                  onChange={e => setFormField('name', e.target.value)}
                />
              </div>

              {/* 설명 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">설명</label>
                <input
                  className="input-dark w-full"
                  placeholder="파일 시스템 접근용 MCP 서버"
                  value={form.description}
                  onChange={e => setFormField('description', e.target.value)}
                />
              </div>

              {/* 인증 모드 */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">인증 모드</label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        value: 'shared' as McpCredentialMode,
                        label: '공유 (Shared)',
                        desc: '빌더가 등록한 자격증명을 모든 사용자가 공유합니다.',
                      },
                      {
                        value: 'per_user' as McpCredentialMode,
                        label: '개인별 (Per User)',
                        desc: '각 사용자가 자신의 자격증명을 별도로 입력해야 합니다.',
                      },
                    ] as const
                  ).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormField('credentialMode', opt.value)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        form.credentialMode === opt.value
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-border-strong',
                      )}
                    >
                      <div className="text-xs font-semibold text-[var(--color-fg)]">{opt.label}</div>
                      <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* per_user 시 requiredUserFields 편집기 */}
              {form.credentialMode === 'per_user' && (
                <RequiredFieldsEditor
                  fields={form.requiredUserFields}
                  onChange={fields => setFormField('requiredUserFields', fields)}
                />
              )}

              {/* Transport */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Transport</label>
                <div className="grid grid-cols-3 gap-2">
                  {TRANSPORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormField('transport', opt.value)}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition-colors',
                        form.transport === opt.value
                          ? 'border-blue-500/50 bg-blue-500/10'
                          : 'border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-border-strong',
                      )}
                    >
                      <div className="text-xs font-semibold text-[var(--color-fg)]">{opt.label}</div>
                      <div className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* stdio 설정 */}
              {form.transport === 'stdio' && (
                <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-fg-muted)]">
                      커맨드 <span className="text-red-400">*</span>
                    </label>
                    <input
                      className="input-dark w-full font-mono text-xs"
                      placeholder="npx -y @modelcontextprotocol/server-filesystem"
                      value={form.command}
                      onChange={e => setFormField('command', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Args</label>
                      <button
                        type="button"
                        onClick={() => setFormField('args', [...form.args, ''])}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + 추가
                      </button>
                    </div>
                    {form.args.map((a, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="input-dark flex-1 font-mono text-xs"
                          placeholder="/path/to/dir"
                          value={a}
                          onChange={e =>
                            setFormField('args', form.args.map((x, j) => (j === i ? e.target.value : x)))
                          }
                        />
                        <button
                          type="button"
                          onClick={() => setFormField('args', form.args.filter((_, j) => j !== i))}
                          className="text-[var(--color-fg-subtle)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--color-fg-muted)]">환경 변수</label>
                      <button
                        type="button"
                        onClick={() => setFormField('envPairs', [...form.envPairs, { key: '', value: '' }])}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + 추가
                      </button>
                    </div>
                    {form.envPairs.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="input-dark w-32 font-mono text-xs"
                          placeholder="KEY"
                          value={p.key}
                          onChange={e =>
                            setFormField(
                              'envPairs',
                              form.envPairs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                            )
                          }
                        />
                        <input
                          className="input-dark flex-1 font-mono text-xs"
                          placeholder="value"
                          value={p.value}
                          onChange={e =>
                            setFormField(
                              'envPairs',
                              form.envPairs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormField('envPairs', form.envPairs.filter((_, j) => j !== i))
                          }
                          className="text-[var(--color-fg-subtle)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SSE / HTTP 설정 */}
              {form.transport !== 'stdio' && (
                <div className="space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--color-fg-muted)]">
                      URL <span className="text-red-400">*</span>
                    </label>
                    <input
                      className="input-dark w-full font-mono text-xs"
                      placeholder="https://mcp.example.com/sse"
                      value={form.url}
                      onChange={e => setFormField('url', e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--color-fg-muted)]">Headers</label>
                      <button
                        type="button"
                        onClick={() => setFormField('headerPairs', [...form.headerPairs, { key: '', value: '' }])}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        + 추가
                      </button>
                    </div>
                    {form.headerPairs.map((p, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className="input-dark w-40 font-mono text-xs"
                          placeholder="Authorization"
                          value={p.key}
                          onChange={e =>
                            setFormField(
                              'headerPairs',
                              form.headerPairs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                            )
                          }
                        />
                        <input
                          className="input-dark flex-1 font-mono text-xs"
                          placeholder="Bearer ..."
                          value={p.value}
                          onChange={e =>
                            setFormField(
                              'headerPairs',
                              form.headerPairs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setFormField('headerPairs', form.headerPairs.filter((_, j) => j !== i))
                          }
                          className="text-[var(--color-fg-subtle)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── JSON 탭 ── */}
          {activeTab === 'json' && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-fg-subtle)]">
                전체 페이로드를 JSON 으로 편집합니다. 폼 탭으로 돌아갈 때 파싱이 실패하면 탭이 전환되지 않습니다.
              </p>
              <MonacoEditor
                height="360px"
                language="json"
                variant="panel"
                value={jsonText}
                onChange={(v) => setJsonText(v ?? '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  lineNumbers: 'on',
                  folding: true,
                  scrollBeyondLastLine: false,
                  formatOnPaste: true,
                  formatOnType: true,
                  tabSize: 2,
                }}
              />
            </div>
          )}

          {validationError && <p className="mt-3 text-xs text-red-400">{validationError}</p>}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-40 hover:bg-blue-500"
          >
            {saveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {isEdit ? '저장' : '서버 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

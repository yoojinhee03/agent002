
'use client'

import { useState, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { apiClient, type ToolTestResult } from '@/lib/api-client'
import type { Tool, ToolGroupType } from '@agent-studio/shared'
import { MonacoEditor } from '@/components/shared/monaco-editor'
import { SchemaBuilder } from './SchemaBuilder'
import { toast } from 'sonner'
import { extractLeafPaths } from '@/lib/json-schema-paths'
import { Plus, Trash2 } from 'lucide-react'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

type ToolType = 'http' | 'code' | 'search'
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type AuthType = 'none' | 'bearer' | 'api_key' | 'basic'

interface KV { key: string; value: string }

interface WizardState {
  // Step 1
  name: string
  slug: string
  description: string
  type: ToolType
  // Detail Step — HTTP
  url: string
  method: HttpMethod
  headers: KV[]
  queryParams: KV[]
  bodyTemplate: string
  // Detail Step — Code
  code: string
  language: 'javascript' | 'python'
  // Detail Step — Search
  searchProvider: 'serper' | 'brave'
  searchApiKey: string
  maxResults: number
  // Detail Step — Auth (HTTP only)
  authType: AuthType
  authValue: string
  authHeaderName: string
  // Detail Step — Schema
  inputSchemaText: string
  outputSchemaText: string
  // Detail Step — HITL 라벨 사전
  labels: Array<{ path: string; label: string }>
  // Test Step
  testInput: string
  testResult: ToolTestResult | null
  testLoading: boolean
  aiLoading: Record<string, boolean>
}

const DEFAULT_INPUT_SCHEMA = JSON.stringify({ type: 'object', properties: {} }, null, 2)
const DEFAULT_OUTPUT_SCHEMA = JSON.stringify({ type: 'object', properties: {} }, null, 2)

const DEFAULT_JS_CODE = `/**
 * @param {Record<string, unknown>} input
 * @returns {Promise<unknown>}
 */
async function execute(input) {
  console.log("Input:", input);
  return { result: "Success", data: input };
}`

const DEFAULT_PY_CODE = `# Input is available as 'input' variable
# Result should be stored in 'result' variable

print(f"Input received: {input}")
result = {
    "status": "success",
    "received": input
}`

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40)
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function Label({ children, required, aiAction, loading }: { children: React.ReactNode; required?: boolean; aiAction?: () => void; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-1">
      <label className="block text-sm font-medium text-foreground">
        {children}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {aiAction && (
        <button
          type="button"
          onClick={aiAction}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50 transition-colors font-bold uppercase tracking-tighter"
        >
          {loading ? (
            <span className="w-2.5 h-2.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>✨ AI 생성</span>
          )}
        </button>
      )}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  className,
  type = 'text',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full px-3 py-2 text-sm border border-input rounded-md bg-background',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        className,
      )}
    />
  )
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 4,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  className?: string
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={cn(
        'w-full px-3 py-2 text-sm border border-input rounded-md bg-background font-mono',
        'focus:outline-none focus:ring-2 focus:ring-ring resize-none',
        className,
      )}
    />
  )
}

function KVEditor({ rows, onChange }: { rows: KV[]; onChange: (rows: KV[]) => void }) {
  const add = () => onChange([...rows, { key: '', value: '' }])
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const update = (i: number, field: 'key' | 'value', v: string) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, [field]: v } : r))
    onChange(next)
  }

  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2 items-center">
          <input
            value={row.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            placeholder="키"
            className="flex-1 px-2 py-1.5 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={row.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            placeholder="값"
            className="flex-1 px-2 py-1.5 text-xs border border-input rounded bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-muted-foreground hover:text-destructive text-xs px-1"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs text-primary hover:underline"
      >
        + 행 추가
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────
// Steps
// ──────────────────────────────────────────────

function Step1({ s, set, groupType, onAi }: { s: WizardState; set: (patch: Partial<WizardState>) => void; groupType?: ToolGroupType; onAi: (target: 'description') => void }) {
  const availableTypes: { type: ToolType; label: string; icon: string }[] = []
  
  if (groupType === 'rest') {
    availableTypes.push({ type: 'http', label: 'REST API', icon: '🌐' })
  } else if (groupType === 'code') {
    availableTypes.push({ type: 'code', label: 'Code', icon: '💻' })
  } else {
    availableTypes.push({ type: 'http', label: 'REST API', icon: '🌐' })
    availableTypes.push({ type: 'code', label: 'Code', icon: '💻' })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label required>도구 이름</Label>
        <Input
          value={s.name}
          onChange={(v) => set({ name: v, slug: slugify(v) })}
          placeholder="날씨 조회 API"
        />
      </div>
      <div>
        <Label required>슬러그 (영문/숫자/_)</Label>
        <Input
          value={s.slug}
          onChange={(v) => set({ slug: v })}
          placeholder="weather_api"
        />
        <p className="text-xs text-muted-foreground mt-1">에이전트가 도구를 호출할 때 사용하는 식별자</p>
      </div>
      <div>
        <Label 
          aiAction={() => onAi('description')} 
          loading={s.aiLoading['description']}
        >설명</Label>
        <Textarea
          value={s.description}
          onChange={(v) => set({ description: v })}
          placeholder="현재 날씨 정보를 조회합니다."
          rows={2}
        />
      </div>
      <div>
        <Label required>도구 타입</Label>
        <div className={cn(
          "grid gap-2 mt-1",
          availableTypes.length > 1 ? "grid-cols-2" : "grid-cols-1"
        )}>
          {availableTypes.map(({ type, label, icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => set({ type })}
              className={cn(
                'flex flex-col items-center gap-1 p-3 rounded-lg border-2 text-sm transition-colors',
                s.type === type
                  ? 'border-primary bg-primary/5 text-primary font-semibold'
                  : 'border-border hover:border-muted-foreground',
              )}
            >
              <span className="text-xl">{icon}</span>
              <span className="capitalize">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function StepDetail({ s, set, onAi }: { s: WizardState; set: (patch: Partial<WizardState>) => void; onAi: (target: any) => void }) {
  return (
    <div className="space-y-8 divide-y divide-border">
      {/* 1. Configuration */}
      <div className="space-y-4 pt-2">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-3 bg-primary rounded-full" />
          도구 설정
        </h4>
        
        {s.type === 'http' && (
          <div className="space-y-4">
            <div>
              <Label required>URL</Label>
              <Input
                value={s.url}
                onChange={(v) => set({ url: v })}
                placeholder="https://api.example.com/weather?city={{city}}"
              />
              <p className="text-xs text-muted-foreground mt-1">{'{{변수명}} 으로 입력 파라미터 참조 가능 (스키마 자동 반영)'}</p>
            </div>
            <div>
              <Label required>HTTP Method</Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as HttpMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set({ method: m })}
                    className={cn(
                      'px-3 py-1 rounded text-xs font-mono font-semibold border transition-colors',
                      s.method === m
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:border-muted-foreground',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>요청 헤더</Label>
              <KVEditor rows={s.headers} onChange={(v) => set({ headers: v })} />
            </div>
            {s.method !== 'GET' && (
              <div>
                <Label 
                  aiAction={() => onAi('bodyTemplate')}
                  loading={s.aiLoading['bodyTemplate']}
                >Request Body (JSON 템플릿)</Label>
                <div className="mb-1">
                  <p className="text-xs text-muted-foreground">JSON 형식으로 작성하세요. {'{{변수명}}'} 사용 가능.</p>
                </div>
                <MonacoEditor
                  language="json"
                  value={s.bodyTemplate}
                  onChange={(v) => set({ bodyTemplate: v ?? '' })}
                  height="140px"
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {s.type === 'code' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {s.language === 'javascript' 
                  ? 'JS 함수를 작성하세요. input 객체로 파라미터를 받고 결과를 return합니다.'
                  : 'Python 코드를 작성하세요. input 변수로 파라미터를 받고 result 변수에 할당하세요.'}
              </p>
              <div className="flex bg-muted p-0.5 rounded-md gap-0.5">
                {(['javascript', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => set({ 
                      language: lang,
                      code: s.code === DEFAULT_JS_CODE || s.code === DEFAULT_PY_CODE 
                        ? (lang === 'javascript' ? DEFAULT_JS_CODE : DEFAULT_PY_CODE) 
                        : s.code
                    })}
                    className={cn(
                      'px-2 py-0.5 text-xs uppercase font-bold rounded transition-colors',
                      s.language === lang ? 'bg-background shadow-sm' : 'text-muted-foreground'
                    )}
                  >
                    {lang === 'javascript' ? 'JS' : 'PY'}
                  </button>
                ))}
              </div>
            </div>
            <MonacoEditor
              language={s.language}
              value={s.code}
              onChange={(v) => set({ code: v ?? '' })}
              height="240px"
            />
          </div>
        )}

        {s.type === 'search' && (
          <div className="space-y-4">
            <div>
              <Label required>검색 공급자</Label>
              <div className="flex gap-2 mt-1">
                {(['serper', 'brave'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set({ searchProvider: p })}
                    className={cn(
                      'px-4 py-2 rounded border text-sm capitalize transition-colors',
                      s.searchProvider === p ? 'border-primary bg-primary/5 text-primary' : 'border-border',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label required>API Key</Label>
              <Input value={s.searchApiKey} onChange={(v) => set({ searchApiKey: v })} placeholder="sk-..." type="password" />
            </div>
          </div>
        )}
      </div>

      {/* 2. Authentication (HTTP Only) */}
      {s.type === 'http' && (
        <div className="space-y-4 pt-6">
          <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
            <span className="w-1 h-3 bg-primary rounded-full" />
            인증 설정
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 'none' as AuthType, label: '없음', icon: '🔓' },
              { v: 'bearer' as AuthType, label: 'Bearer', icon: '🪙' },
              { v: 'api_key' as AuthType, label: 'API Key', icon: '🔑' },
              { v: 'basic' as AuthType, label: 'Basic', icon: '👤' },
            ]).map(({ v, label, icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => set({ authType: v })}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors text-left',
                  s.authType === v ? 'border-primary bg-primary/5 text-primary' : 'border-border',
                )}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {s.authType !== 'none' && (
            <div className="pt-1">
              {s.authType === 'api_key' && (
                <div className="mb-2">
                  <Label required>헤더 이름</Label>
                  <Input value={s.authHeaderName} onChange={(v) => set({ authHeaderName: v })} placeholder="X-API-Key" />
                </div>
              )}
              <Label required>{s.authType === 'basic' ? 'username:password' : '값 (Value)'}</Label>
              <Input value={s.authValue} onChange={(v) => set({ authValue: v })} placeholder="..." type="password" />
            </div>
          )}
        </div>
      )}

      {/* 3. Schema */}
      <div className="space-y-4 pt-6 pb-2">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-3 bg-primary rounded-full" />
          데이터 스키마
        </h4>
        <div className="grid grid-cols-1 gap-6">
          <div className="space-y-1">
            <Label 
              aiAction={() => onAi('inputSchema')}
              loading={s.aiLoading['inputSchema']}
            >입력 스키마</Label>
            <SchemaBuilder
              value={s.inputSchemaText}
              onChange={(v) => set({ inputSchemaText: v })}
            />
          </div>
          <div className="space-y-1">
            <Label
              aiAction={() => onAi('outputSchema')}
              loading={s.aiLoading['outputSchema']}
            >출력 스키마</Label>
            <SchemaBuilder
              value={s.outputSchemaText}
              onChange={(v) => set({ outputSchemaText: v })}
            />
          </div>
        </div>
      </div>

      {/* 4. HITL 라벨 사전 */}
      <div className="space-y-3 pt-6 pb-2">
        <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
          <span className="w-1 h-3 bg-primary rounded-full" />
          라벨 사전 (HITL 카드)
        </h4>
        <p className="text-xs text-muted-foreground">
          dot-path → 한국어 라벨. 예: <code className="px-1 bg-muted rounded">q</code>,{' '}
          <code className="px-1 bg-muted rounded">filters[*].field</code>
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              let schema: unknown
              try {
                schema = JSON.parse(s.inputSchemaText)
              } catch {
                toast.error('입력 스키마 JSON 이 유효하지 않습니다.')
                return
              }
              const candidates = extractLeafPaths(schema)
              const existing = new Set(s.labels.map((l) => l.path))
              const next = [...s.labels]
              let added = 0
              for (const p of candidates) {
                if (!existing.has(p)) {
                  next.push({ path: p, label: '' })
                  added++
                }
              }
              if (added > 0) {
                set({ labels: next })
                toast.success(`${added}개 경로를 추가했습니다.`)
              } else {
                toast.info('추가할 새 경로가 없습니다.')
              }
            }}
            className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-accent"
          >
            스키마에서 추출
          </button>
          <button
            type="button"
            onClick={() => set({ labels: [...s.labels, { path: '', label: '' }] })}
            className="text-xs px-3 py-1.5 rounded-md border border-input hover:bg-accent flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            행 추가
          </button>
        </div>

        {s.labels.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">등록된 라벨이 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {s.labels.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  value={row.path}
                  onChange={(v) => {
                    const next = [...s.labels]
                    next[i] = { ...next[i], path: v }
                    set({ labels: next })
                  }}
                  placeholder="path (예: q)"
                  className="flex-1 font-mono text-xs"
                />
                <Input
                  value={row.label}
                  onChange={(v) => {
                    const next = [...s.labels]
                    next[i] = { ...next[i], label: v }
                    set({ labels: next })
                  }}
                  placeholder="한국어 라벨"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => set({ labels: s.labels.filter((_, idx) => idx !== i) })}
                  className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function buildConfig(s: WizardState): Record<string, unknown> {
  if (s.type === 'http') {
    const headers: Record<string, string> = {}
    s.headers.forEach(({ key, value }) => { if (key) headers[key] = value })

    const auth =
      s.authType === 'none'
        ? { type: 'none' }
        : s.authType === 'bearer'
          ? { type: 'bearer', value: s.authValue }
          : s.authType === 'api_key'
            ? { type: 'api_key', headerName: s.authHeaderName, value: s.authValue }
            : { type: 'basic', value: s.authValue }

    return {
      url: s.url,
      method: s.method,
      headers,
      auth,
      ...(s.bodyTemplate ? { bodyTemplate: s.bodyTemplate } : {}),
    }
  }
  if (s.type === 'code') {
    return { code: s.code, language: s.language }
  }
  return { provider: s.searchProvider, apiKey: s.searchApiKey, maxResults: s.maxResults }
}

function StepTest({
  s,
  set,
  projectId,
  existingId,
}: {
  s: WizardState
  set: (patch: Partial<WizardState>) => void
  projectId: string
  existingId?: string
}) {
  const runTest = async () => {
    set({ testLoading: true, testResult: null })
    try {
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(s.testInput || '{}')
      } catch {
        input = {}
      }

      let result: ToolTestResult
      if (existingId) {
        result = await apiClient.tools.testById(existingId, input)
      } else {
        // inline test using built config
        const config = buildConfig(s)
        result = await apiClient.tools.testInline(projectId, s.type, config, input)
      }
      set({ testResult: result })
    } catch (err) {
      set({ testResult: { success: false, output: null, latency: 0, error: String(err) } })
    } finally {
      set({ testLoading: false })
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 mb-2">
        <h4 className="text-xs font-semibold text-foreground mb-1">{s.name}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {s.description || '설명이 없습니다.'}
        </p>
      </div>

      <div>
        <Label>테스트 입력 (JSON)</Label>
        <MonacoEditor
          language="json"
          value={s.testInput}
          onChange={(v) => set({ testInput: v ?? '' })}
          height="120px"
          options={{
            minimap: { enabled: false },
            lineNumbers: 'off',
            scrollBeyondLastLine: false,
          }}
        />
      </div>

      <button
        type="button"
        onClick={runTest}
        disabled={s.testLoading}
        className="w-full py-2 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {s.testLoading ? '실행 중...' : '▶ 실행'}
      </button>

      {s.testResult && (
        <div
          className={cn(
            'rounded-lg border p-3 space-y-2 text-xs',
            s.testResult.success ? 'border-green-500/20 bg-green-500/5' : 'border-destructive/20 bg-destructive/5',
          )}
        >
          <div className="flex items-center justify-between">
            <span className={cn('font-semibold', s.testResult.success ? 'text-green-600' : 'text-destructive')}>
              {s.testResult.success ? '✅ 성공' : '❌ 실패'}
              {s.testResult.statusCode && ` (HTTP ${s.testResult.statusCode})`}
            </span>
            <span className="text-muted-foreground">{s.testResult.latency}ms</span>
          </div>
          {s.testResult.error && (
            <p className="text-destructive font-mono">{s.testResult.error}</p>
          )}
          <div>
            <p className="text-muted-foreground mb-1">결과:</p>
            <pre className="bg-background rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap break-all border border-border">
              {JSON.stringify(s.testResult.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Main Wizard
// ──────────────────────────────────────────────

const STEPS = [
  { n: 1, label: '기본 정보' },
  { n: 2, label: '상세 설정' },
  { n: 3, label: '테스트' },
]

interface Props {
  projectId: string
  groupId?: string
  groupType?: ToolGroupType
  tool?: Tool
  onClose: () => void
  onSaved: (tool: Tool) => void
}

export function ToolBuilderWizard({ projectId, groupId, groupType, tool, onClose, onSaved }: Props) {
  const isEdit = !!tool

  const initConfig = useCallback((): Partial<WizardState> => {
    if (!tool) return {}
    const cfg = (tool.config ?? {}) as Record<string, unknown>
    const t = tool.type as ToolType

    if (t === 'http') {
      const httpCfg = cfg as {
        url?: string; method?: string; headers?: Record<string, string>
        auth?: { type: string; value?: string; headerName?: string }
        bodyTemplate?: string
      }
      const headers = Object.entries(httpCfg.headers ?? {}).map(([key, value]) => ({ key, value }))
      return {
        type: 'http',
        url: httpCfg.url ?? '',
        method: (httpCfg.method as HttpMethod) ?? 'GET',
        headers,
        bodyTemplate: httpCfg.bodyTemplate ?? '',
        authType: (httpCfg.auth?.type as AuthType) ?? 'none',
        authValue: httpCfg.auth?.value ?? '',
        authHeaderName: httpCfg.auth?.headerName ?? 'X-API-Key',
      }
    }
    if (t === 'code') {
      return { 
        type: 'code', 
        code: (cfg.code as string) ?? DEFAULT_JS_CODE,
        language: (cfg.language as 'javascript' | 'python') ?? 'javascript'
      }
    }
    if (t === 'search') {
      return {
        type: 'search',
        searchProvider: (cfg.provider as 'serper' | 'brave') ?? 'serper',
        searchApiKey: (cfg.apiKey as string) ?? '',
        maxResults: (cfg.maxResults as number) ?? 5,
      }
    }
    return {}
  }, [tool])

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [s, setS] = useState<WizardState>({
    name: tool?.name ?? '',
    slug: tool?.slug ?? '',
    description: tool?.description ?? '',
    type: (tool?.type as ToolType) ?? (groupType === 'code' ? 'code' : 'http'),
    url: '',
    method: 'GET',
    headers: [],
    queryParams: [],
    bodyTemplate: '',
    code: DEFAULT_JS_CODE,
    language: 'javascript',
    searchProvider: 'serper',
    searchApiKey: '',
    maxResults: 5,
    authType: 'none',
    authValue: '',
    authHeaderName: 'X-API-Key',
    inputSchemaText: tool?.inputSchema
      ? JSON.stringify(tool.inputSchema, null, 2)
      : DEFAULT_INPUT_SCHEMA,
    outputSchemaText: tool?.outputSchema
      ? JSON.stringify(tool.outputSchema, null, 2)
      : DEFAULT_OUTPUT_SCHEMA,
    labels: tool?.labels
      ? Object.entries(tool.labels).map(([path, label]) => ({ path, label }))
      : [],
    testInput: '{}',
    testResult: null,
    testLoading: false,
    aiLoading: {},
    ...initConfig(),
  })

  const set = useCallback((patch: Partial<WizardState>) => {
    setS((prev) => ({ ...prev, ...patch }))
  }, [])

  // Auto-extract variables from URL and Body Template to Input Schema
  useEffect(() => {
    if (s.type !== 'http') return

    const urlVars = Array.from(s.url.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1])
    const bodyVars = Array.from(s.bodyTemplate.matchAll(/\{\{(\w+)\}\}/g)).map(m => m[1])
    const allVars = Array.from(new Set([...urlVars, ...bodyVars]))

    if (allVars.length === 0) return

    try {
      const currentSchema = JSON.parse(s.inputSchemaText)
      const properties = { ...(currentSchema.properties || {}) }
      const required = Array.isArray(currentSchema.required) ? [...currentSchema.required] : []
      let changed = false

      allVars.forEach(v => {
        if (!properties[v]) {
          properties[v] = { type: 'string', description: v }
          if (!required.includes(v)) required.push(v)
          changed = true
        }
      })

      if (changed) {
        const nextSchema = {
          ...currentSchema,
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined
        }
        if (!nextSchema.required) delete nextSchema.required
        set({ inputSchemaText: JSON.stringify(nextSchema, null, 2) })
      }
    } catch {
      // If current schema is invalid, don't auto-update to avoid losing data
    }
  }, [s.url, s.bodyTemplate, s.type, s.inputSchemaText, set])

  const handleAiGenerate = async (target: keyof WizardState['aiLoading'] | 'schemaFromTemplate') => {
    set({ aiLoading: { ...s.aiLoading, [target]: true } })
    try {
      const { result } = await apiClient.tools.aiGenerate({
        target: target as any,
        name: s.name,
        type: s.type,
        description: s.description,
        inputSchema: s.inputSchemaText ? JSON.parse(s.inputSchemaText) : undefined,
        bodyTemplate: s.bodyTemplate,
      })

      if (target === 'description') {
        set({ description: result as string })
      } else if (target === 'inputSchema' || target === 'schemaFromTemplate') {
        set({ inputSchemaText: JSON.stringify(result, null, 2) })
      } else if (target === 'outputSchema') {
        set({ outputSchemaText: JSON.stringify(result, null, 2) })
      } else if (target === 'bodyTemplate') {
        set({ bodyTemplate: JSON.stringify(result, null, 2) })
      }
      toast.success('AI 생성이 완료되었습니다.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI 생성 중 오류가 발생했습니다.')
    } finally {
      set({ aiLoading: { ...s.aiLoading, [target]: false } })
    }
  }

  const canNext = () => {
    if (step === 1) return s.name.trim() !== '' && s.slug.trim() !== ''
    if (step === 2) {
      if (s.type === 'http' && s.url.trim() === '') return false
      try {
        JSON.parse(s.inputSchemaText)
        JSON.parse(s.outputSchemaText)
      } catch {
        return false
      }
      if (s.type === 'http' && s.authType !== 'none' && s.authValue.trim() === '') return false
      return true
    }
    return true
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      let inputSchema: Record<string, unknown>
      let outputSchema: Record<string, unknown>
      try {
        inputSchema = JSON.parse(s.inputSchemaText)
        outputSchema = JSON.parse(s.outputSchemaText)
      } catch {
        setError('스키마 JSON이 유효하지 않습니다.')
        return
      }

      const labelsRecord: Record<string, string> = {}
      for (const { path, label } of s.labels) {
        if (path.trim() && label.trim()) labelsRecord[path.trim()] = label.trim()
      }

      const payload = {
        name: s.name,
        slug: s.slug,
        description: s.description,
        type: s.type,
        config: buildConfig(s),
        inputSchema,
        outputSchema,
        labels: Object.keys(labelsRecord).length > 0 ? labelsRecord : null,
      }

      const saved = isEdit && tool
        ? await apiClient.tools.update(tool.id, payload)
        : groupId
          ? await apiClient.toolGroups.addTool(groupId, payload)
          : await apiClient.tools.create(projectId, payload)

      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">
            {isEdit ? '도구 수정' : '새 도구 추가'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-4 shrink-0">
          <div className="flex items-center gap-1">
            {STEPS.map((st, idx) => (
              <div key={st.n} className="flex items-center gap-1 flex-1">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                    step === st.n
                      ? 'bg-primary text-primary-foreground'
                      : step > st.n
                        ? 'bg-primary/20 text-primary'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {step > st.n ? '✓' : st.n}
                </div>
                <span
                  className={cn(
                    'text-xs hidden sm:block',
                    step === st.n ? 'text-foreground font-medium' : 'text-muted-foreground',
                  )}
                >
                  {st.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <div className={cn('flex-1 h-px', step > st.n ? 'bg-primary/40' : 'bg-border')} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
          {step === 1 && <Step1 s={s} set={set} groupType={groupType} onAi={handleAiGenerate} />}
          {step === 2 && <StepDetail s={s} set={set} onAi={handleAiGenerate} />}
          {step === 3 && <StepTest s={s} set={set} projectId={projectId} existingId={tool?.id} />}
        </div>

        {/* Footer */}
        {error && (
          <p className="px-5 text-xs text-destructive shrink-0">{error}</p>
        )}
        <div className="flex items-center justify-between px-5 py-4 border-t shrink-0 gap-3">
          <button
            type="button"
            onClick={() => {
              if (step > 1) setStep(step - 1)
              else onClose()
            }}
            className="px-4 py-2 text-sm rounded-md border border-input hover:bg-muted transition-colors"
          >
            {step === 1 ? '취소' : '이전'}
          </button>

          <div className="flex gap-2">
            {step < 3 && (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                다음
              </button>
            )}
            {step === 3 && (
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? '저장 중...' : isEdit ? '수정 완료' : '도구 저장'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { OnMount } from '@monaco-editor/react'
import type * as MonacoNS from 'monaco-editor'
import { ArrowLeft, Save, RotateCcw, Eye, Wand2, Sparkles, Download, Upload, Link2, Layers, X, MousePointerSquareDashed } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { CardDefinition } from '@/lib/api-client'
import { useApiMutation } from '@/lib/use-api-mutation'
import { useCardDefinitionsStore } from '@/stores/use-card-definitions-store'
import { HitlCardRenderer } from '@/components/dynamic-cards/HitlCardRenderer'
import { HITL_LAYOUTS } from '@/components/dynamic-cards/ac-react/hitl-layouts'
import { cn } from '@/lib/utils'
import { getPreset, type CardPresetId } from '@/lib/cards/payload-presets'
import { SnippetPalette, type Snippet } from '@/components/cards-builder/SnippetPalette'
import { isAllSupported as puckIsAllSupported } from '@/components/cards-builder/puck/adapter'
import { PresetPicker } from '@/components/cards-builder/PresetPicker'
import { ValidationPanel } from '@/components/cards-builder/ValidationPanel'
import { ToolMappingWizard } from '@/components/cards-builder/ToolMappingWizard'
import { TargetToolsPicker } from '@/components/cards-builder/TargetToolsPicker'
import { PayloadTreeOutliner } from '@/components/cards-builder/PayloadTreeOutliner'
import { validatePayload, sampleDataKeys } from '@/lib/cards/ac-validate'
import { generateSampleFromPayload } from '@/lib/cards/sample-data'
import { useUserStore } from '@/stores/use-user-store'
import type { HitlArgFieldSchema } from '@/components/dynamic-cards/ac-react/hitl-slots'
import { injectToolFieldsIntoPayload } from '@/lib/cards/inject-tool-fields'
import { buildSampleArgs } from '@/lib/cards/input-schema-to-arg-schema'
import { seedArgsFromSchema } from '@/lib/cards/seed-args-from-schema'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })
const PuckCardBuilder = dynamic(
  () => import('@/components/cards-builder/puck/PuckCardBuilder').then((m) => m.PuckCardBuilder),
  { ssr: false },
)

const MONACO_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 11,
  tabSize: 2,
  scrollbar: {
    verticalScrollbarSize: 6,
    horizontalScrollbarSize: 6,
    useShadows: false,
    verticalSliderSize: 6,
    horizontalSliderSize: 6,
  },
  smoothScrolling: true,
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  scrollBeyondLastLine: false,
} as const

interface BuilderState {
  cardId: string
  name: string
  layout: string
  targetTools: string[]
  argSchema: HitlArgFieldSchema[] | null
  payloadText: string
  sampleText: string
}

function safeParse(text: string): { value: Record<string, unknown> | null; error: string | null } {
  try {
    const v = JSON.parse(text)
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { value: null, error: 'JSON 객체여야 합니다' }
    }
    return { value: v as Record<string, unknown>, error: null }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'JSON 파싱 실패' }
  }
}

function stateFromPreset(presetId: CardPresetId): BuilderState {
  const preset = getPreset(presetId)
  return {
    cardId: '',
    name: '',
    layout: 'sky-standard',
    targetTools: [],
    argSchema: null,
    payloadText: JSON.stringify(preset.payload, null, 2),
    sampleText: JSON.stringify(preset.sampleData, null, 2),
  }
}

export default function CardBuilderPage({
  params,
}: {
  params: Promise<{ cardId: string }>
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = useUserStore((s) => s.activeProjectId)
  const { cardId: routeCardId } = use(params)
  const isNew = routeCardId === 'new'
  const cloneFrom = isNew ? searchParams.get('cloneFrom') : null
  const cloneVersionParam = isNew ? searchParams.get('cloneVersion') : null
  const newCardIdParam = isNew ? searchParams.get('newCardId') : null
  const presetParam = isNew ? (searchParams.get('preset') as CardPresetId | null) : null
  const fromToolParam = isNew ? searchParams.get('fromTool') : null

  const [showPresetPicker, setShowPresetPicker] = useState(
    isNew && !cloneFrom && !presetParam && !fromToolParam,
  )
  const [showWizard, setShowWizard] = useState(false)
  const [puckMode, setPuckMode] = useState(false)
  const [usages, setUsages] = useState<{
    hitlRefs: Array<{ agentId: string; agentName: string; projectId: string; toolId: string }>
  } | null>(null)
  const [showUsages, setShowUsages] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [state, setState] = useState<BuilderState>(() => {
    if (presetParam) return stateFromPreset(presetParam)
    return stateFromPreset('hitl-approve')
  })

  const [existing, setExisting] = useState<CardDefinition | null>(null)
  const [loading, setLoading] = useState(!isNew || Boolean(cloneFrom))
  const invalidateCardDef = useCardDefinitionsStore((s) => s.invalidate)

  const payloadEditorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof MonacoNS | null>(null)
  const completionDisposerRef = useRef<MonacoNS.IDisposable | null>(null)

  useEffect(() => {
    if (isNew && !cloneFrom) return
    let cancelled = false
    ;(async () => {
      try {
        if (isNew && cloneFrom) {
          const ver = cloneVersionParam ? parseInt(cloneVersionParam, 10) : NaN
          const row = Number.isFinite(ver)
            ? await apiClient.cards.get(cloneFrom, ver)
            : await apiClient.cards.getLatest(cloneFrom)
          if (cancelled) return
          const cloneTargetTools = ((row as { targetTools?: string[] }).targetTools ?? [])
          setState({
            cardId: newCardIdParam ?? `${row.cardId}-copy`,
            name: `${row.name} 복제`,
            layout: (row as { layout?: string }).layout ?? 'sky-standard',
            targetTools: cloneTargetTools,
            argSchema: Array.isArray(row.argSchema)
              ? (row.argSchema as HitlArgFieldSchema[])
              : null,
            payloadText: JSON.stringify(row.payload, null, 2),
            sampleText: JSON.stringify(row.sampleData ?? {}, null, 2),
          })
          toast.success(`${row.cardId}@v${row.version} 을 복제했습니다`)
          return
        }
        const decoded = decodeURIComponent(routeCardId)
        const row = await apiClient.cards.getLatest(decoded)
        if (cancelled) return
        setExisting(row)
        const existingTargetTools = ((row as { targetTools?: string[] }).targetTools ?? [])
        setState({
          cardId: row.cardId,
          name: row.name,
          layout: (row as { layout?: string }).layout ?? 'sky-standard',
          targetTools: existingTargetTools,
          argSchema: Array.isArray(row.argSchema)
            ? (row.argSchema as HitlArgFieldSchema[])
            : null,
          payloadText: JSON.stringify(row.payload, null, 2),
          sampleText: JSON.stringify(row.sampleData ?? {}, null, 2),
        })
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '카드 정의 조회 실패')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNew, routeCardId, cloneFrom, cloneVersionParam, newCardIdParam])

  /**
   * `?fromTool=<key>` — 새 카드 생성 시 도구 자동 매핑.
   * preset(hitl-approve) 기반 payload 에 inputSchema 변환 결과를 주입하고 targetTools 에 추가.
   * catalog 가 로드된 직후 1회만 실행.
   */
  const fromToolAppliedRef = useRef(false)
  useEffect(() => {
    if (!isNew || cloneFrom || !fromToolParam || fromToolAppliedRef.current) return
    if (!projectId) return
    let cancelled = false
    ;(async () => {
      try {
        const [userTools, builtinGroups, mcpGroups] = await Promise.all([
          apiClient.tools.list(projectId),
          apiClient.tools.getBuiltin(projectId),
          apiClient.mcp.listAllTools(projectId),
        ])
        if (cancelled) return
        let inputSchema: unknown = null
        for (const t of userTools) {
          if (t.name === fromToolParam) {
            inputSchema = (t as { inputSchema?: unknown }).inputSchema ?? null
            break
          }
        }
        if (!inputSchema) {
          for (const g of builtinGroups) {
            const hit = g.tools.find((t) => t.id === fromToolParam)
            if (hit) {
              inputSchema = (hit as { inputSchema?: unknown }).inputSchema ?? null
              break
            }
          }
        }
        if (!inputSchema) {
          for (const g of mcpGroups) {
            const hit = g.tools.find((t) => t.name === fromToolParam)
            if (hit) {
              inputSchema = (hit as { inputSchema?: unknown }).inputSchema ?? null
              break
            }
          }
        }
        fromToolAppliedRef.current = true
        if (!inputSchema) {
          toast.error(`도구 ${fromToolParam} 의 inputSchema 를 찾을 수 없습니다`)
          setState((s) => ({
            ...s,
            targetTools: s.targetTools.includes(fromToolParam)
              ? s.targetTools
              : [...s.targetTools, fromToolParam],
          }))
          return
        }
        setState((s) => {
          const { value: parsed } = safeParse(s.payloadText)
          const result = injectToolFieldsIntoPayload(parsed, inputSchema)
          if (!result) return s
          const sample = buildSampleArgs(inputSchema) ?? {}
          const { value: parsedSample } = safeParse(s.sampleText)
          const baseSample = parsedSample ?? {}
          return {
            ...s,
            payloadText: JSON.stringify(result.payload, null, 2),
            sampleText: JSON.stringify(
              { ...baseSample, toolName: fromToolParam, toolArgs: sample },
              null,
              2,
            ),
            argSchema: result.argSchema,
            targetTools: s.targetTools.includes(fromToolParam)
              ? s.targetTools
              : [...s.targetTools, fromToolParam],
          }
        })
        toast.success(`${fromToolParam} 의 입력 스키마를 적용했습니다`)
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : '도구 정보 조회 실패')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isNew, cloneFrom, fromToolParam, projectId])

  const { value: payload, error: payloadError } = useMemo(
    () => safeParse(state.payloadText),
    [state.payloadText],
  )
  const sampleData = useMemo(() => {
    const { value } = safeParse(state.sampleText)
    return value ?? {}
  }, [state.sampleText])

  /**
   * 슬롯이 lookup 할 argSchema — payload 루트의 argSchema 가 있으면 우선 (사용자가 Monaco 에서
   * 편집한 값 즉시 반영). 없으면 state.argSchema (도구 선택 직후 또는 로드 시 채워진 값) 사용.
   */
  const effectiveArgSchema = useMemo(() => {
    if (payload && Array.isArray(payload.argSchema)) {
      return payload.argSchema as HitlArgFieldSchema[]
    }
    return state.argSchema
  }, [payload, state.argSchema])

  /**
   * 미리보기 전용 — 도구 선택이 있으면 toolName/toolArgs 를 argSchema 기반으로 강제 합성.
   */
  const previewSampleData = useMemo(() => {
    const selected = state.targetTools[0]
    const baseArgs =
      (sampleData.toolArgs as Record<string, unknown> | undefined) ?? {}
    const args = seedArgsFromSchema(baseArgs, effectiveArgSchema)
    if (!selected) return { ...sampleData, toolArgs: args }
    return { ...sampleData, toolName: selected, toolArgs: args }
  }, [sampleData, state.targetTools, effectiveArgSchema])

  const puckSupport = useMemo(() => puckIsAllSupported(payload), [payload])

  useEffect(() => {
    if (puckMode && !puckSupport.ok) {
      setPuckMode(false)
      toast.error(`시각 빌더 미지원: ${puckSupport.reason}`)
    }
  }, [puckMode, puckSupport])

  const validation = useMemo(
    () => validatePayload(payload, sampleData),
    [payload, sampleData],
  )

  const sampleKeys = useMemo(() => sampleDataKeys(sampleData), [sampleData])

  useEffect(() => {
    if (!monacoRef.current) return
    completionDisposerRef.current?.dispose()
    const monaco = monacoRef.current
    completionDisposerRef.current = monaco.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['{', '$'],
      provideCompletionItems: (model, position) => {
        const lineUntil = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        const m = lineUntil.match(/\$\{([\w.]*)$/)
        if (!m) return { suggestions: [] }
        const word = model.getWordUntilPosition(position)
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        }
        return {
          suggestions: sampleKeys.map((key) => ({
            label: key,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: key,
            range,
            detail: '샘플 데이터 키',
          })),
        }
      },
    })
    return () => {
      completionDisposerRef.current?.dispose()
      completionDisposerRef.current = null
    }
  }, [sampleKeys])

  const onPayloadMount: OnMount = (editor, monaco) => {
    payloadEditorRef.current = editor
    monacoRef.current = monaco
  }

  const insertSnippet = useCallback((snippet: Snippet) => {
    const { value: p } = safeParse(state.payloadText)
    if (!p) {
      toast.error('payload JSON 이 유효하지 않아 삽입할 수 없습니다')
      return
    }
    const next = { ...p } as Record<string, unknown>
    if (snippet.target === 'body') {
      const body = Array.isArray(next.body) ? [...(next.body as unknown[])] : []
      body.push(snippet.payload)
      next.body = body
    } else if (snippet.target === 'actions') {
      const actions = Array.isArray(next.actions) ? [...(next.actions as unknown[])] : []
      actions.push(snippet.payload)
      next.actions = actions
    } else {
      Object.assign(next, snippet.payload)
    }
    setState((s) => ({ ...s, payloadText: JSON.stringify(next, null, 2) }))
    toast.success(`${snippet.label} 삽입`)
  }, [state.payloadText])

  const handleAutoFillSample = useCallback((missing: string[]) => {
    if (!payload) return
    const { value: existingSample } = safeParse(state.sampleText)
    const next = generateSampleFromPayload(payload, (existingSample as Record<string, unknown>) ?? {})
    setState((s) => ({ ...s, sampleText: JSON.stringify(next, null, 2) }))
    toast.success(`샘플에 ${missing.length}개 키 추가`)
  }, [payload, state.sampleText])

  useEffect(() => {
    if (!existing) {
      setUsages(null)
      return
    }
    let cancelled = false
    apiClient.cards
      .findUsages(existing.cardId)
      .then((res) => {
        if (cancelled) return
        setUsages({ hitlRefs: res.hitlRefs })
      })
      .catch(() => {
        if (!cancelled) setUsages({ hitlRefs: [] })
      })
    return () => {
      cancelled = true
    }
  }, [existing])

  const usageCount = usages?.hitlRefs.length ?? 0

  const handleExport = useCallback(() => {
    if (!payload) {
      toast.error('payload JSON 이 유효하지 않습니다')
      return
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            cardId: state.cardId || 'new-card',
            name: state.name,
            payload,
            sampleData,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.cardId || 'new-card'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('JSON 내보내기 완료')
  }, [payload, sampleData, state.cardId, state.name])

  const handleImport = useCallback(async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as {
        cardId?: string
        name?: string
        payload?: unknown
        sampleData?: unknown
      }
      if (!parsed.payload || typeof parsed.payload !== 'object') {
        throw new Error('payload 필드가 없습니다')
      }
      setState((s) => ({
        ...s,
        cardId: isNew && typeof parsed.cardId === 'string' ? parsed.cardId : s.cardId,
        name: typeof parsed.name === 'string' ? parsed.name : s.name,
        payloadText: JSON.stringify(parsed.payload, null, 2),
        sampleText: JSON.stringify(parsed.sampleData ?? {}, null, 2),
      }))
      toast.success('JSON 가져오기 완료')
    } catch (err) {
      toast.error(err instanceof Error ? `JSON 가져오기 실패: ${err.message}` : 'JSON 가져오기 실패')
    }
  }, [isNew])

  const jumpToLine = useCallback((line: number, column: number) => {
    const editor = payloadEditorRef.current
    if (!editor) return
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column })
    editor.focus()
  }, [])

  const handleRegenerateSample = useCallback(() => {
    if (!payload) return
    const next = generateSampleFromPayload(payload, {})
    setState((s) => ({ ...s, sampleText: JSON.stringify(next, null, 2) }))
    toast.success('샘플 재생성')
  }, [payload])

  const publishMutation = useApiMutation({
    mutationFn: async () => {
      if (!state.cardId.trim()) throw new Error('cardId 를 입력하세요')
      if (!state.name.trim()) throw new Error('name 을 입력하세요')
      if (!payload || payloadError) throw new Error(payloadError ?? 'payload 가 유효하지 않습니다')
      if (validation.errors.length > 0) {
        throw new Error(validation.errors[0].message)
      }
      const nextVersion = existing ? existing.version + 1 : 1
      return apiClient.cards.create({
        cardId: state.cardId,
        version: nextVersion,
        tenantId: null,
        name: state.name,
        category: 'hitl',
        layout: state.layout,
        targetTools: state.targetTools,
        argSchema: effectiveArgSchema,
        payload,
        sampleData,
      })
    },
    successMessage: (result) => `v${result.version} 발행 완료`,
    onSuccess: (result) => {
      invalidateCardDef(result.cardId)
      setExisting(result)
      if (isNew) {
        router.replace(`/cards/builder/${encodeURIComponent(result.cardId)}`)
      }
    },
  })

  if (loading) {
    return <div className="flex h-full items-center justify-center text-fg-subtle">불러오는 중...</div>
  }

  return (
    <div className="flex h-full flex-col">
      <PresetPicker
        open={showPresetPicker}
        projectId={projectId}
        onSelect={(result) => {
          setShowPresetPicker(false)
          if (result.toolKey) {
            // 도구가 함께 선택된 경우 — 라우터로 다시 진입해 fromTool 효과 발동.
            const params = new URLSearchParams({ preset: result.preset.id, fromTool: result.toolKey })
            router.push(`/cards/builder/new?${params.toString()}`)
            return
          }
          setState({
            cardId: '',
            name: '',
            layout: 'sky-standard',
            targetTools: [],
            argSchema: null,
            payloadText: JSON.stringify(result.preset.payload, null, 2),
            sampleText: JSON.stringify(result.preset.sampleData, null, 2),
          })
          toast.success(`${result.preset.label} 템플릿으로 시작`)
        }}
        onClose={() => setShowPresetPicker(false)}
      />

      {showUsages && usages && existing && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setShowUsages(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-[var(--color-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <h2 className="text-sm font-semibold text-fg">
                {existing.cardId} — 사용처 {usages.hitlRefs.length}건
              </h2>
              <button
                type="button"
                onClick={() => setShowUsages(false)}
                className="rounded p-1 text-fg-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3 text-[12px]">
              {usages.hitlRefs.length === 0 && (
                <div className="text-fg-subtle">이 카드를 참조하는 에이전트가 없습니다.</div>
              )}
              {usages.hitlRefs.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-subtle">
                    HITL 도구 권한 (toolPermissions)
                  </div>
                  <ul className="space-y-1">
                    {usages.hitlRefs.map((r, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded border border-border bg-bg/40 px-2 py-1.5"
                      >
                        <a
                          href={`/agents/${r.agentId}`}
                          className="text-fg hover:text-blue-300"
                        >
                          {r.agentName}
                        </a>
                        <span className="font-mono text-[10px] text-fg-subtle">tool: {r.toolId}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ToolMappingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        currentPayload={payload}
        currentSampleData={sampleData}
        onApply={({ payload: nextPayload, argSchema, sampleData: nextSample, toolKey }) => {
          setState((s) => ({
            ...s,
            payloadText: JSON.stringify(nextPayload, null, 2),
            sampleText: JSON.stringify(nextSample, null, 2),
            argSchema,
            targetTools: s.targetTools.includes(toolKey)
              ? s.targetTools
              : [...s.targetTools, toolKey],
          }))
        }}
      />

      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/cards')}
            className="rounded p-1 text-fg-muted hover:bg-bg/40 hover:text-fg"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold text-fg">
            {isNew ? '새 카드 정의' : `${state.cardId} 편집`}
            {existing && (
              <span className="ml-2 text-[10px] text-fg-subtle">
                현재 latest: v{existing.version} → 다음 발행: v{existing.version + 1}
              </span>
            )}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          {isNew && (
            <button
              type="button"
              onClick={() => setShowPresetPicker(true)}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
              title="다른 시작 템플릿 선택"
            >
              <Wand2 className="h-3 w-3" />
              템플릿 변경
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
            title="도구의 inputSchema 로 입력 폼 자동 생성"
          >
            <Sparkles className="h-3 w-3" />
            도구로 입력 자동생성
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => setShowUsages(true)}
              className={cn(
                'inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px]',
                usageCount > 0
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15'
                  : 'border-border text-fg-muted hover:text-fg',
              )}
              title={`이 카드를 참조하는 에이전트 — ${usageCount}건`}
            >
              <Link2 className="h-3 w-3" />
              사용처 {usageCount}
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
            title="JSON 파일에서 카드 정의 불러오기"
          >
            <Upload className="h-3 w-3" />
            가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImport(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
            title="현재 빌더 상태를 JSON 파일로 다운로드"
          >
            <Download className="h-3 w-3" />
            내보내기
          </button>
          <button
            type="button"
            onClick={() => {
              if (!puckMode && !puckSupport.ok) {
                toast.error(`시각 빌더 미지원: ${puckSupport.reason}`)
                return
              }
              setPuckMode((v) => !v)
            }}
            disabled={!puckMode && !puckSupport.ok}
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px]',
              puckMode
                ? 'border-sky-500/50 bg-sky-500/10 text-sky-300'
                : 'border-border text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-fg-muted',
            )}
            title={
              puckMode
                ? 'JSON 빌더로 전환'
                : puckSupport.ok
                  ? '실제 렌더 위에서 드래그/속성 편집 (실험 PoC)'
                  : `시각 빌더 미지원: ${puckSupport.reason}`
            }
          >
            <MousePointerSquareDashed className="h-3 w-3" />
            {puckMode ? 'JSON 빌더로' : '시각 빌더 (실험)'}
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => {
                setState((s) => ({
                  ...s,
                  payloadText: JSON.stringify(existing.payload, null, 2),
                  sampleText: JSON.stringify(existing.sampleData ?? {}, null, 2),
                }))
              }}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] text-fg-muted hover:text-fg"
            >
              <RotateCcw className="h-3 w-3" />
              현재 latest 로 리셋
            </button>
          )}
          <button
            type="button"
            disabled={publishMutation.isPending || Boolean(payloadError) || validation.errors.length > 0}
            onClick={() => void publishMutation.mutate(undefined)}
            className="inline-flex items-center gap-1 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            title={
              validation.errors.length > 0
                ? validation.errors[0].message
                : '버전 발행'
            }
          >
            <Save className="h-3 w-3" />
            {publishMutation.isPending ? '발행 중...' : '버전 발행'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
        <input
          type="text"
          value={state.cardId}
          disabled={!isNew}
          onChange={(e) =>
            setState((s) => ({
              ...s,
              cardId: e.target.value
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '-')
                .replace(/-+/g, '-'),
            }))
          }
          placeholder="cardId (예: my-custom-card)"
          className="rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 font-mono text-xs text-blue-300 placeholder:text-fg-subtle outline-none focus:border-blue-400/60 disabled:opacity-60"
        />
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder="이름"
          className="flex-1 rounded border border-border bg-[var(--color-surface-2)] px-2 py-1 text-xs text-fg placeholder:text-fg-subtle outline-none focus:border-blue-400/60"
        />
        <TargetToolsPicker
          value={state.targetTools}
          projectId={projectId}
          placeholder="대상 도구 (검색 후 선택)"
          onChange={(next) => setState((s) => ({ ...s, targetTools: next }))}
        />
      </div>


      {puckMode ? (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_440px] overflow-hidden">
          <div className="min-h-0 overflow-hidden border-r border-border">
            {payload && !payloadError ? (
              <PuckCardBuilder
                payload={payload}
                sampleData={previewSampleData}
                argSchema={effectiveArgSchema}
                resetKey={state.targetTools[0] ?? '__none__'}
                onChange={(next) =>
                  setState((s) => ({ ...s, payloadText: JSON.stringify(next, null, 2) }))
                }
              />
            ) : (
              <div className="p-4 text-[11px] text-red-300">
                {payloadError ?? 'payload 가 없습니다'}
              </div>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-bg/40 px-3 py-1">
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle">
                <Eye className="h-3 w-3" /> 미리보기
              </span>
              <LayoutPillSelect
                selected={state.layout}
                onSelect={(layout) => setState((s) => ({ ...s, layout }))}
              />
            </div>
            <div
              className={cn(
                'min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)] px-4 py-4',
                payloadError && 'opacity-60',
              )}
            >
              {payload && !payloadError ? (
                <HitlCardRenderer
                  payload={payload}
                  sampleData={previewSampleData}
                  layout={state.layout}
                  argSchema={effectiveArgSchema}
                  mode="preview"
                />
              ) : (
                <div className="text-[11px] text-red-300">{payloadError}</div>
              )}
            </div>
            <ValidationPanel
              report={validation}
              payloadParseError={payloadError}
              onAutoFillSample={handleAutoFillSample}
            />
          </div>
        </div>
      ) : (
      <div className="grid min-h-0 flex-1 grid-cols-[200px_1fr_1fr] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-border">
          <div className="min-h-0 flex-1">
            <SectionLabel>요소 팔레트</SectionLabel>
            <div className="h-[calc(100%-26px)]">
              <SnippetPalette onInsert={insertSnippet} />
            </div>
          </div>
          <div className="flex max-h-[40%] min-h-[120px] flex-col border-t border-border">
            <SectionLabel>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" /> 구조
              </span>
            </SectionLabel>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <PayloadTreeOutliner payloadText={state.payloadText} onJump={jumpToLine} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-border">
          <SectionLabel>Adaptive Card payload (JSON · ${'{...}'} 바인딩)</SectionLabel>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MonacoEditor
              language="json"
              theme="vs-dark"
              value={state.payloadText}
              onChange={(v) => setState((s) => ({ ...s, payloadText: v ?? '' }))}
              options={MONACO_OPTIONS}
              onMount={onPayloadMount}
            />
          </div>
          <div className="flex items-center justify-between border-y border-border bg-bg/40 px-3 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">
            <span>샘플 데이터 (JSON · 미리보기/fallback)</span>
            <button
              type="button"
              onClick={handleRegenerateSample}
              className="inline-flex items-center gap-1 rounded border border-border bg-bg/60 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-fg-muted hover:text-fg"
              title="payload 의 ${} 토큰에서 샘플 데이터를 재생성"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              샘플 재생성
            </button>
          </div>
          <div className="h-[180px] shrink-0">
            <MonacoEditor
              language="json"
              theme="vs-dark"
              value={state.sampleText}
              onChange={(v) => setState((s) => ({ ...s, sampleText: v ?? '' }))}
              options={MONACO_OPTIONS}
            />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-bg/40 px-3 py-1">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-fg-subtle">
              <Eye className="h-3 w-3" /> 미리보기
            </span>
            <LayoutPillSelect
              selected={state.layout}
              onSelect={(layout) => setState((s) => ({ ...s, layout }))}
            />
          </div>
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)] px-4 py-4',
              payloadError && 'opacity-60',
            )}
          >
            {payload && !payloadError ? (
              <HitlCardRenderer
                payload={payload}
                sampleData={previewSampleData}
                layout={state.layout}
                argSchema={effectiveArgSchema}
                mode="preview"
              />
            ) : (
              <div className="text-[11px] text-red-300">{payloadError}</div>
            )}
          </div>
          <ValidationPanel
            report={validation}
            payloadParseError={payloadError}
            onAutoFillSample={handleAutoFillSample}
          />
        </div>
      </div>
      )}
    </div>
  )
}

function LayoutPillSelect({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  const current = HITL_LAYOUTS.find((l) => l.id === selected) ?? HITL_LAYOUTS[0]
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] normal-case tracking-normal text-fg-subtle">디자인</span>
      <select
        value={selected}
        onChange={(e) => onSelect(e.target.value)}
        title={current.description}
        className="rounded-md border border-border bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-fg outline-none hover:border-fg/30 focus:border-blue-400/60"
      >
        {HITL_LAYOUTS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border bg-bg/40 px-3 py-1 text-[10px] uppercase tracking-wider text-fg-subtle">
      {children}
    </div>
  )
}


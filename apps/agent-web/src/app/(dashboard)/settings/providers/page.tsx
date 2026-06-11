"use client"

import { useEffect, useState, useCallback } from "react"
import { useProviderStore } from "@/stores/use-provider-store"
import {
  Key, Cpu, Check, X, ChevronDown, ChevronRight,
  Eye, EyeOff, Trash2, Zap, RefreshCw, Plus, Search, HardDrive, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provider, Model, DiscoveredModel } from "@/types/provider"
import { useApiMutation } from "@/lib/use-api-mutation"
import { MSG } from "@/lib/messages/mutation"

// ── Capability badge colors ──────────────────────────────────────────
const capColors: Record<string, string> = {
  chat: "bg-blue-500/15 text-blue-400",
  vision: "bg-purple-500/15 text-purple-400",
  "function-calling": "bg-green-500/15 text-green-400",
  "json-mode": "bg-amber-500/15 text-amber-400",
  "extended-thinking": "bg-pink-500/15 text-pink-400",
  grounding: "bg-teal-500/15 text-teal-400",
  "code-execution": "bg-orange-500/15 text-orange-400",
}

const ALL_CAPABILITIES = [
  "chat",
  "vision",
  "function-calling",
  "json-mode",
  "extended-thinking",
  "grounding",
  "code-execution",
]

function formatContextWindow(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  return `${(n / 1_000).toFixed(0)}K`
}

function formatPrice(n: number) {
  if (n < 1) return `$${n}`
  return `$${n}`
}

// ── Add Custom Model Dialog ──────────────────────────────────────────
function AddCustomModelDialog({
  providerId,
  onClose,
  onSave,
}: {
  providerId: string
  onClose: () => void
  onSave: (model: Omit<Model, "providerId">) => Promise<void>
}) {
  const [modelId, setModelId] = useState("")
  const [name, setName] = useState("")
  const [contextWindow, setContextWindow] = useState("128000")
  const [inputPrice, setInputPrice] = useState("0")
  const [outputPrice, setOutputPrice] = useState("0")
  const [capabilities, setCapabilities] = useState<string[]>(["chat"])
  const [saving, setSaving] = useState(false)

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    )
  }

  const handleSave = async () => {
    if (!modelId.trim() || !name.trim()) return
    setSaving(true)
    await onSave({
      id: modelId.trim(),
      name: name.trim(),
      contextWindow: Number(contextWindow) || 128000,
      inputPrice: Number(inputPrice) || 0,
      outputPrice: Number(outputPrice) || 0,
      capabilities,
      enabled: true,
      isCustom: true,
    })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">커스텀 모델 추가</h3>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Model ID */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">
              Model ID <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder="예: gpt-4o-fine-tuned-v1"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">API 호출 시 사용되는 실제 모델 ID</p>
          </div>

          {/* Display Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">
              표시 이름 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: GPT-4o Fine-tuned"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
            />
          </div>

          {/* Context Window + Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">Context Window</label>
              <input
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">Input $/1M</label>
              <input
                type="number"
                step="0.01"
                value={inputPrice}
                onChange={(e) => setInputPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">Output $/1M</label>
              <input
                type="number"
                step="0.01"
                value={outputPrice}
                onChange={(e) => setOutputPrice(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Capabilities */}
          <div>
            <label className="mb-2 block text-xs font-medium text-[var(--color-fg-muted)]">Capabilities</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CAPABILITIES.map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => toggleCap(cap)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                    capabilities.includes(cap)
                      ? capColors[cap] ?? "bg-blue-500/15 text-blue-400"
                      : "bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]"
                  )}
                >
                  {cap}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--color-border-strong)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-border-strong hover:text-foreground"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!modelId.trim() || !name.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            저장
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Provider Card ────────────────────────────────────────────────────
function ProviderCard({ provider }: { provider: Provider }) {
  const { configureApiKey, removeApiKey, testConnection, toggleModel, addCustomModel, removeCustomModel } = useProviderStore()

  const [expanded, setExpanded] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const enabledCount = provider.models.filter((m) => m.enabled).length

  const saveKeyMutation = useApiMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => configureApiKey(id, key),
    successMessage: "API Key 검증 및 저장 완료",
    onSuccess: () => setApiKeyInput(""),
  })

  const removeKeyMutation = useApiMutation({
    mutationFn: (providerId: string) => removeApiKey(providerId),
    successMessage: MSG.provider.removed,
    onSuccess: () => setTestResult(null),
  })

  const handleSaveKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setTestResult(null)
    await saveKeyMutation.mutate({ id: provider.id, key: apiKeyInput.trim() })
  }, [provider.id, apiKeyInput, saveKeyMutation])

  const handleRemoveKey = useCallback(() => {
    removeKeyMutation.mutate(provider.id)
  }, [provider.id, removeKeyMutation])

  const handleTestConnection = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(provider.id)
    setTestResult(result)
    setTesting(false)
    setTimeout(() => setTestResult(null), 4000)
  }, [provider.id, testConnection])

  const toggleModelMutation = useApiMutation({
    mutationFn: ({ modelId, enabled }: { modelId: string; enabled: boolean }) =>
      toggleModel(provider.id, modelId, enabled),
    successMessage: (_, { enabled }) => enabled ? MSG.model.enabled : MSG.model.disabled,
  })

  const handleToggleModel = useCallback(
    (modelId: string, enabled: boolean) => {
      toggleModelMutation.mutate({ modelId, enabled })
    },
    [toggleModelMutation]
  )

  const addCustomModelMutation = useApiMutation({
    mutationFn: (model: Omit<Model, "providerId">) => addCustomModel(provider.id, model),
    successMessage: MSG.model.added,
    onSuccess: () => setShowAddDialog(false),
  })

  const handleAddCustomModel = useCallback(
    async (model: Omit<Model, "providerId">) => {
      await addCustomModelMutation.mutate(model)
    },
    [addCustomModelMutation]
  )

  const removeCustomModelMutation = useApiMutation({
    mutationFn: (modelId: string) => removeCustomModel(provider.id, modelId),
    successMessage: MSG.model.deleted,
  })

  const handleRemoveCustomModel = useCallback(
    (modelId: string) => {
      removeCustomModelMutation.mutate(modelId)
    },
    [removeCustomModelMutation]
  )

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] transition-colors">
        {/* Header — always visible */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 p-5 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg border border-[var(--color-border-strong)]">
            <Cpu className="h-5 w-5 text-[var(--color-fg-muted)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">{provider.name}</h3>
              {provider.apiKeyConfigured ? (
                <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                  <Check className="h-3 w-3" /> 연결됨
                </span>
              ) : (
                <span className="flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-subtle)]">
                  <X className="h-3 w-3" /> 미설정
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
              {provider.models.length}개 모델 · {enabledCount}개 활성
            </p>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
          )}
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-[var(--color-border-strong)]">
            {/* API Key Section */}
            <div className="p-5 pb-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                API Key
              </h4>

              {provider.apiKeyConfigured && provider.apiKey ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm font-mono text-[var(--color-fg-subtle)]">
                    {provider.apiKey}
                  </div>
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-40"
                  >
                    {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    테스트
                  </button>
                  <button
                    onClick={handleRemoveKey}
                    disabled={removeKeyMutation.isPending}
                    className="rounded-lg border border-[var(--color-border-strong)] p-2 text-[var(--color-fg-subtle)] transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-40"
                    title="API Key 삭제"
                  >
                    {removeKeyMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder="sk-..."
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveKey() }}
                      className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 pr-9 text-sm text-foreground font-mono placeholder-[var(--color-fg-subtle)] outline-none focus:border-[#3b82f6]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-subtle)]"
                      tabIndex={-1}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKeyInput.trim() || saveKeyMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#2563eb] disabled:opacity-40"
                  >
                    {saveKeyMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Check className="h-3.5 w-3.5" />
                    }
                    저장
                  </button>
                </div>
              )}

              {/* Test result feedback */}
              {testResult && (
                <div className={cn(
                  "mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  testResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {testResult.success ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {testResult.message}
                </div>
              )}
            </div>

            {/* Models Section */}
            <div className="border-t border-[var(--color-border-strong)] p-5 pt-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                모델
              </h4>
              <div className="space-y-2">
                {provider.models.map((model) => (
                  <ModelRow
                    key={model.id}
                    model={model}
                    providerConfigured={provider.apiKeyConfigured}
                    onToggle={handleToggleModel}
                    onDelete={handleRemoveCustomModel}
                    isTogglePending={toggleModelMutation.isPending}
                    isDeletePending={removeCustomModelMutation.isPending}
                  />
                ))}
              </div>

              {/* Add Custom Model Button */}
              <button
                onClick={() => setShowAddDialog(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border-strong)] py-2 text-xs font-medium text-[var(--color-fg-subtle)] transition-colors hover:border-blue-500/50 hover:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                커스텀 모델 추가
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddCustomModelDialog
          providerId={provider.id}
          onClose={() => setShowAddDialog(false)}
          onSave={handleAddCustomModel}
        />
      )}
    </>
  )
}

// ── Model Row ────────────────────────────────────────────────────────
function ModelRow({
  model,
  providerConfigured,
  onToggle,
  onDelete,
  isTogglePending,
  isDeletePending,
}: {
  model: Model
  providerConfigured: boolean
  onToggle: (modelId: string, enabled: boolean) => void
  onDelete: (modelId: string) => void
  isTogglePending?: boolean
  isDeletePending?: boolean
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg border border-[var(--color-border-strong)] px-3 py-2.5 transition-colors",
      model.enabled && providerConfigured ? "bg-bg" : "bg-bg/50 opacity-60"
    )}>
      {/* Toggle */}
      <button
        onClick={() => onToggle(model.id, !model.enabled)}
        disabled={isTogglePending}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40",
          model.enabled ? "bg-blue-500" : "bg-[var(--color-border-strong)]"
        )}
      >
        {isTogglePending
          ? <Loader2 className="absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white" />
          : (
            <div className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
              model.enabled ? "translate-x-4" : "translate-x-0.5"
            )} />
          )
        }
      </button>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{model.name}</span>
          {model.isCustom && (
            <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-subtle)]">
              Custom
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--color-fg-subtle)]">
            {formatContextWindow(model.contextWindow)} ctx
          </span>
          <span className="text-xs text-[var(--color-fg-subtle)]">·</span>
          <span className="text-xs text-[var(--color-fg-subtle)]">
            In {formatPrice(model.inputPrice)} / Out {formatPrice(model.outputPrice)}
          </span>
        </div>
      </div>

      {/* Capabilities */}
      <div className="hidden sm:flex flex-wrap justify-end gap-1">
        {model.capabilities.map((cap) => (
          <span
            key={cap}
            className={cn(
              "rounded-full px-1.5 py-0.5 text-xs font-medium",
              capColors[cap] ?? "bg-[var(--color-surface-2)] text-[var(--color-fg-subtle)]"
            )}
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Delete button (custom models only) */}
      {model.isCustom && (
        <button
          onClick={() => onDelete(model.id)}
          disabled={isDeletePending}
          className="shrink-0 rounded-md p-1 text-[var(--color-fg-subtle)] transition-colors hover:text-red-400 disabled:opacity-40"
          title="커스텀 모델 삭제"
        >
          {isDeletePending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Trash2 className="h-3.5 w-3.5" />
          }
        </button>
      )}
    </div>
  )
}

// ── Add Local Provider Dialog ─────────────────────────────────────────
const LOCAL_PRESETS = [
  { label: "Ollama", url: "http://localhost:11434" },
  { label: "LM Studio", url: "http://localhost:1234" },
  { label: "Jan", url: "http://localhost:1337" },
]

function AddLocalProviderDialog({ onClose, onSave }: {
  onClose: () => void
  onSave: (name: string, endpoint: string) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [saving, setSaving] = useState(false)

  const handlePreset = (preset: { label: string; url: string }) => {
    if (!name) setName(preset.label)
    setEndpoint(preset.url)
  }

  const handleSave = async () => {
    if (!name.trim() || !endpoint.trim()) return
    setSaving(true)
    await onSave(name.trim(), endpoint.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-bg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border-strong)] px-5 py-4">
          <h3 className="text-sm font-semibold text-foreground">로컬 서버 추가</h3>
          <button onClick={onClose} className="text-[var(--color-fg-subtle)] hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">
              서버 이름 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: My Ollama, LM Studio Dev"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--color-fg-muted)]">
              엔드포인트 <span className="text-red-400">*</span>
            </label>
            <div className="mb-2 flex gap-1.5">
              {LOCAL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    endpoint === p.url
                      ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                      : "border-[var(--color-border-strong)] text-[var(--color-fg-subtle)] hover:border-border-strong hover:text-[var(--color-fg-muted)]"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="http://localhost:11434"
              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm font-mono text-foreground placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border-strong)] px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-border-strong hover:text-foreground"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !endpoint.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            추가
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Local Provider Card ───────────────────────────────────────────────
function LocalProviderCard({ provider }: { provider: Provider }) {
  const { configureEndpoint, testConnection, addCustomModel, removeCustomModel, toggleModel, discoverLocalModels, deleteLocalProvider } = useProviderStore()

  const [expanded, setExpanded] = useState(false)
  const [endpointInput, setEndpointInput] = useState(provider.endpoint ?? "")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const enabledCount = provider.models.filter((m) => m.enabled).length
  const addedIds = new Set(provider.models.map((m) => m.id))

  const handlePreset = (url: string) => setEndpointInput(url)

  const connectMutation = useApiMutation({
    mutationFn: (endpoint: string) => configureEndpoint(provider.id, endpoint),
    successMessage: MSG.provider.connected,
  })

  const handleConnect = useCallback(async () => {
    if (!endpointInput.trim()) return
    await connectMutation.mutate(endpointInput.trim())
  }, [endpointInput, connectMutation])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(provider.id)
    setTestResult(result)
    setTesting(false)
    setTimeout(() => setTestResult(null), 4000)
  }, [provider.id, testConnection])

  const discoverMutation = useApiMutation({
    mutationFn: (id: string) => discoverLocalModels(id),
    successMessage: null,
    onSuccess: (models) => {
      setDiscovered(models)
    },
  })

  const handleDiscover = useCallback(() => {
    discoverMutation.mutate(provider.id)
  }, [provider.id, discoverMutation])

  const addDiscoveredMutation = useApiMutation({
    mutationFn: (m: DiscoveredModel) =>
      addCustomModel(provider.id, {
        id: m.id,
        name: m.name,
        contextWindow: m.contextWindow,
        inputPrice: 0,
        outputPrice: 0,
        capabilities: ["chat"],
        enabled: true,
        isCustom: true,
      }),
    successMessage: MSG.model.added,
  })

  const handleAddDiscovered = useCallback((m: DiscoveredModel) => {
    addDiscoveredMutation.mutate(m)
  }, [addDiscoveredMutation])

  const toggleModelMutation = useApiMutation({
    mutationFn: ({ modelId, enabled }: { modelId: string; enabled: boolean }) =>
      toggleModel(provider.id, modelId, enabled),
    successMessage: (_, { enabled }) => enabled ? MSG.model.enabled : MSG.model.disabled,
  })

  const handleToggle = useCallback((modelId: string, enabled: boolean) => {
    toggleModelMutation.mutate({ modelId, enabled })
  }, [toggleModelMutation])

  const deleteModelMutation = useApiMutation({
    mutationFn: (modelId: string) => removeCustomModel(provider.id, modelId),
    successMessage: MSG.model.deleted,
  })

  const handleDelete = useCallback((modelId: string) => {
    deleteModelMutation.mutate(modelId)
  }, [deleteModelMutation])

  const addCustomModelMutation = useApiMutation({
    mutationFn: (model: Omit<Model, "providerId">) => addCustomModel(provider.id, model),
    successMessage: MSG.model.added,
    onSuccess: () => setShowAddDialog(false),
  })

  const handleAddCustomModel = useCallback(async (model: Omit<Model, "providerId">) => {
    await addCustomModelMutation.mutate(model)
  }, [addCustomModelMutation])

  const deleteProviderMutation = useApiMutation({
    mutationFn: (id: string) => deleteLocalProvider(id),
    successMessage: MSG.provider.deleted,
  })

  const handleDeleteProvider = useCallback(() => {
    deleteProviderMutation.mutate(provider.id)
  }, [provider.id, deleteProviderMutation])

  return (
    <>
      <div className="rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] transition-colors">
        {/* Header */}
        <div className="flex w-full items-center gap-3 p-5">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded(!expanded)}
            onKeyDown={(e) => e.key === "Enter" && setExpanded(!expanded)}
            className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg border border-[var(--color-border-strong)]">
              <HardDrive className="h-5 w-5 text-[var(--color-fg-muted)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-foreground">{provider.name}</h3>
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                  Local
                </span>
                {provider.apiKeyConfigured ? (
                  <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                    <Check className="h-3 w-3" /> 연결됨
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-fg-subtle)]">
                    <X className="h-3 w-3" /> 미설정
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                {provider.endpoint ? provider.endpoint : "엔드포인트 미설정"} · {provider.models.length}개 모델 등록
              </p>
            </div>
            {expanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
            )}
          </div>
          {confirmDelete ? (
            <button
              onClick={handleDeleteProvider}
              disabled={deleteProviderMutation.isPending}
              className="shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/30 transition-colors hover:bg-red-500/20 disabled:opacity-40"
              title="삭제 확인"
            >
              {deleteProviderMutation.isPending
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : null
              }
              삭제 확인
            </button>
          ) : (
            <button
              onClick={() => {
                setConfirmDelete(true)
                setTimeout(() => setConfirmDelete(false), 3000)
              }}
              className="shrink-0 rounded-md p-1.5 text-[var(--color-fg-subtle)] transition-colors hover:text-red-400"
              title="로컬 서버 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {expanded && (
          <div className="border-t border-[var(--color-border-strong)]">
            {/* Endpoint Section */}
            <div className="p-5 pb-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                서버 엔드포인트
              </h4>

              {/* Presets */}
              <div className="mb-3 flex gap-1.5">
                {LOCAL_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePreset(preset.url)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      endpointInput === preset.url
                        ? "border-blue-500/50 bg-blue-500/10 text-blue-400"
                        : "border-[var(--color-border-strong)] text-[var(--color-fg-subtle)] hover:border-border-strong hover:text-[var(--color-fg-muted)]"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* URL Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={endpointInput}
                  onChange={(e) => setEndpointInput(e.target.value)}
                  placeholder="http://localhost:11434"
                  onKeyDown={(e) => { if (e.key === "Enter") handleConnect() }}
                  className="flex-1 rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-sm text-foreground font-mono placeholder-[var(--color-fg-subtle)] outline-none focus:border-blue-500"
                />
                {provider.apiKeyConfigured && (
                  <button
                    onClick={handleTest}
                    disabled={testing}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-2 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-40"
                  >
                    {testing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                    테스트
                  </button>
                )}
                <button
                  onClick={handleConnect}
                  disabled={!endpointInput.trim() || connectMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-40"
                >
                  {connectMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5" />
                  }
                  연결
                </button>
              </div>

              {testResult && (
                <div className={cn(
                  "mt-2 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                  testResult.success ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                )}>
                  {testResult.success ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {testResult.message}
                </div>
              )}
            </div>

            {/* Model Discovery Section */}
            {provider.apiKeyConfigured && (
              <div className="border-t border-[var(--color-border-strong)] p-5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                    모델 검색
                  </h4>
                  <button
                    onClick={handleDiscover}
                    disabled={discoverMutation.isPending}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-40"
                  >
                    {discoverMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Search className="h-3.5 w-3.5" />
                    }
                    {discoverMutation.isPending ? "검색 중..." : "모델 검색"}
                  </button>
                </div>

                {discovered.length > 0 && (
                  <div className="space-y-1.5">
                    {discovered.map((m) => {
                      const alreadyAdded = addedIds.has(m.id)
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">{m.name}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-[var(--color-fg-subtle)]">{formatContextWindow(m.contextWindow)} ctx</span>
                              {m.size && (
                                <>
                                  <span className="text-xs text-[var(--color-fg-subtle)]">·</span>
                                  <span className="text-xs text-[var(--color-fg-subtle)]">{m.size}</span>
                                </>
                              )}
                              <span className="text-xs text-[var(--color-fg-subtle)]">·</span>
                              <span className="text-xs font-mono text-[var(--color-fg-subtle)]">{m.id}</span>
                            </div>
                          </div>
                          {alreadyAdded ? (
                            <span className="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                              추가됨
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAddDiscovered(m)}
                              disabled={addDiscoveredMutation.isPending}
                              className="flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2.5 py-1 text-xs font-medium text-[var(--color-fg-muted)] transition-colors hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-40"
                            >
                              {addDiscoveredMutation.isPending
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Plus className="h-3 w-3" />
                              }
                              추가
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {!discoverMutation.isPending && discovered.length === 0 && (
                  <p className="text-xs text-[var(--color-fg-subtle)]">
                    모델 검색 버튼을 눌러 서버에서 사용 가능한 모델을 검색하세요.
                  </p>
                )}
              </div>
            )}

            {/* Registered Models Section */}
            <div className="border-t border-[var(--color-border-strong)] p-5 pt-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                등록된 모델 {provider.models.length > 0 && <span className="ml-1 font-normal normal-case">({enabledCount}개 활성)</span>}
              </h4>
              {provider.models.length > 0 ? (
                <div className="space-y-2">
                  {provider.models.map((model) => (
                    <ModelRow
                      key={model.id}
                      model={model}
                      providerConfigured={provider.apiKeyConfigured}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      isTogglePending={toggleModelMutation.isPending}
                      isDeletePending={deleteModelMutation.isPending}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-fg-subtle)]">
                  아직 등록된 모델이 없습니다. 모델 검색으로 추가하거나 수동으로 등록하세요.
                </p>
              )}

              <button
                onClick={() => setShowAddDialog(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border-strong)] py-2 text-xs font-medium text-[var(--color-fg-subtle)] transition-colors hover:border-blue-500/50 hover:text-blue-400"
              >
                <Plus className="h-3.5 w-3.5" />
                수동으로 모델 추가
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddDialog && (
        <AddCustomModelDialog
          providerId={provider.id}
          onClose={() => setShowAddDialog(false)}
          onSave={handleAddCustomModel}
        />
      )}
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────
export default function ProvidersPage() {
  const { providers, loading, loadProviders, addLocalProvider } = useProviderStore()
  const [showAddLocalDialog, setShowAddLocalDialog] = useState(false)

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const addLocalProviderMutation = useApiMutation({
    mutationFn: ({ name, endpoint }: { name: string; endpoint: string }) =>
      addLocalProvider(name, endpoint),
    successMessage: (_, { name }) => `"${name}" 로컬 서버가 추가되었습니다`,
    onSuccess: () => setShowAddLocalDialog(false),
  })

  const handleAddLocalProvider = useCallback(async (name: string, endpoint: string) => {
    await addLocalProviderMutation.mutate({ name, endpoint })
  }, [addLocalProviderMutation])

  return (
    <div className="p-8">
      <div className="mb-2 flex items-center gap-3">
        <Key className="h-6 w-6 text-[#3b82f6]" />
        <h1 className="text-2xl font-bold text-foreground">LLM Providers</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        API Key를 등록하고 사용할 모델을 관리합니다.
      </p>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[var(--color-border-strong)]" />
                <div className="flex-1">
                  <div className="mb-2 h-4 w-1/4 rounded bg-[var(--color-border-strong)]" />
                  <div className="h-3 w-1/3 rounded bg-[var(--color-border-strong)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {providers.length > 0 ? (
            <div className="space-y-4">
              {providers.map((provider) =>
                provider.type === "local"
                  ? <LocalProviderCard key={provider.id} provider={provider} />
                  : <ProviderCard key={provider.id} provider={provider} />
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)]/50 py-12 text-center">
              <Key className="mb-4 h-10 w-10 text-[var(--color-fg-subtle)]" />
              <h3 className="text-base font-semibold text-foreground">등록된 프로바이더가 없습니다</h3>
              <p className="mt-1 text-sm text-[var(--color-fg-subtle)]">
                데이터베이스에 기본 프로바이더 정보가 없거나 API 서버 연결에 문제가 있을 수 있습니다.
              </p>
            </div>
          )}

          {/* Add Local Server Button */}
          <button
            onClick={() => setShowAddLocalDialog(true)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] py-3 text-sm font-medium text-[var(--color-fg-subtle)] transition-colors hover:border-blue-500/50 hover:text-blue-400"
          >
            <HardDrive className="h-4 w-4" />
            로컬 서버 추가
          </button>
        </>
      )}

      {showAddLocalDialog && (
        <AddLocalProviderDialog
          onClose={() => setShowAddLocalDialog(false)}
          onSave={handleAddLocalProvider}
        />
      )}
    </div>
  )
}

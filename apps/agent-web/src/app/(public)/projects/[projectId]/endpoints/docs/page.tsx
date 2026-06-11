"use client"

import { use, useEffect, useState, useCallback, useMemo, useRef } from "react"
import {
  Globe,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Play,
  Loader2,
  Send,
  FileJson,
  Lock,
  Unlock,
  KeyRound,
  X,
  Terminal,
  Info,
  Layers,
  ListTree,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { renderPrompt } from "@/lib/prompt-renderer"
import { mockApi } from "@/lib/api-client"
import type { Endpoint } from "@/types/endpoint"
import type { PromptBlock } from "@/types/prompt"
import type { Project } from "@/types/project"
import Editor from "@monaco-editor/react"
import { defineMonacoTheme, MONACO_READ_OPTIONS, MONACO_EDIT_OPTIONS } from "@/lib/monaco-theme"

/* ─── Helpers ─── */
const ENV_BADGE: Record<string, { bg: string; text: string }> = {
  dev:     { bg: "bg-blue-500/15",    text: "text-blue-400" },
  staging: { bg: "bg-amber-500/15",   text: "text-amber-400" },
  prod:    { bg: "bg-emerald-500/15", text: "text-emerald-400" },
}
function getEnvBadge(env: string) {
  return ENV_BADGE[env] ?? { bg: "bg-purple-500/15", text: "text-purple-400" }
}

function buildVarMap(ep: Endpoint, values: Record<string, string>): Record<string, unknown> {
  const vm: Record<string, unknown> = {}
  for (const v of ep.variables) {
    const raw = values[v.name] ?? v.defaultValue
    if (v.type === "number") vm[v.name] = Number(raw) || 0
    else if (v.type === "array" || v.type === "object") { try { vm[v.name] = JSON.parse(raw) } catch { vm[v.name] = raw } }
    else vm[v.name] = raw
  }
  return vm
}

function buildRequestBodyJson(ep: Endpoint, values: Record<string, string>) {
  return JSON.stringify({ variables: buildVarMap(ep, values) }, null, 2)
}

function buildOasSpec(endpoints: Endpoint[]) {
  const paths: Record<string, unknown> = {}
  const tags = new Set<string>()
  for (const ep of endpoints) {
    tags.add(ep.promptName)
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const v of ep.variables) {
      properties[v.name] = { type: v.type === "number" ? "number" : v.type === "array" ? "array" : v.type === "object" ? "object" : "string", description: v.description || undefined, default: v.defaultValue }
      if (v.required) required.push(v.name)
    }

    const promptDesc = ep.prompt?.description || ep.description || ""
    const fullDesc = promptDesc 
      ? `${promptDesc}\n\nModel: ${ep.modelId} · Version: v${ep.versionNumber}`
      : `Model: ${ep.modelId} · Version: v${ep.versionNumber}`

    paths[ep.path] = {
      post: {
        tags: [ep.promptName], 
        summary: `${ep.promptName} (${ep.environment})`, 
        description: fullDesc, 
        operationId: ep.id,
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { variables: { type: "object", properties, required: required.length ? required : undefined } } } } } },
        responses: { "200": { description: "성공", content: { "application/json": { schema: { type: "object", properties: { id: { type: "string" }, rendered_prompt: { type: "string" }, model: { type: "string" }, version: { type: "string" }, environment: { type: "string" }, variables_used: { type: "object" }, latency: { type: "integer" } } } } } }, "401": { description: "인증 오류" }, "404": { description: "Endpoint 없음" } },
        security: [{ ApiKeyAuth: [] }],
      },
    }
  }
  return { openapi: "3.0.3", info: { title: "AgentStudio API", version: "1.0.0" }, servers: [{ url: "https://api.agentstudio.io", description: "Production" }], tags: Array.from(tags).map((t) => ({ name: t })), paths, components: { securitySchemes: { ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key" } } } }
}

/* ─── Authorize modal ─── */
function AuthorizeModal({
  apiKey,
  onSave,
  onClose,
}: {
  apiKey: string
  onSave: (key: string) => void
  onClose: () => void
}) {
  const [value, setValue] = useState(apiKey)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border-strong)] px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
            <KeyRound className="h-4 w-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--color-fg)]">Authorize</h3>
            <p className="text-xs text-[var(--color-fg-subtle)]">API Key Authentication</p>
          </div>
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <p className="text-xs font-semibold text-amber-400">X-API-Key</p>
            <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">Header: <code className="text-amber-300">X-API-Key: &lt;value&gt;</code></p>
          </div>

          <label className="mb-1 block text-xs font-medium text-[var(--color-fg-muted)]">Value</label>
          <input
            type="text"
            placeholder="sk-ps-YOUR_API_KEY"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2.5 font-mono text-sm text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:border-amber-500/40 focus:outline-none"
            autoFocus
          />
          <p className="mt-2 text-xs text-[var(--color-fg-subtle)]">입력한 API Key는 이 세션에서만 유지됩니다.</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border-strong)] px-5 py-4">
          {apiKey && (
            <button
              onClick={() => { onSave(""); onClose() }}
              className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] transition-colors hover:border-red-500/30 hover:text-red-400"
            >
              Logout
            </button>
          )}
          <button onClick={onClose} className="rounded-lg border border-[var(--color-border-strong)] px-4 py-2 text-xs text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]">
            Cancel
          </button>
          <button
            onClick={() => { onSave(value.trim()); onClose() }}
            disabled={!value.trim()}
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-amber-400 disabled:opacity-40"
          >
            Authorize
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── cURL Modal ─── */
function CurlModal({ curlCommand, onClose, onCopy, copied }: { curlCommand: string; onClose: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[var(--color-fg-subtle)]" />
            <span className="text-sm font-semibold text-[var(--color-fg)]">cURL Command</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onCopy} className="flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)]">
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "복사됨" : "복사"}
            </button>
            <button onClick={onClose} className="rounded-md p-1 text-[var(--color-fg-subtle)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-5">
          <pre className="overflow-x-auto rounded-lg bg-bg p-4 font-mono text-xs leading-relaxed text-[var(--color-fg-muted)]">
            {curlCommand}
          </pre>
        </div>
      </div>
    </div>
  )
}

/* ─── Response Status Codes ─── */
function ResponseStatusCodes() {
  const codes = [
    { code: "200", label: "Success", desc: "rendered_prompt, variables_used 포함", color: "text-emerald-400", bg: "bg-emerald-500/15" },
    { code: "401", label: "Unauthorized", desc: "API Key 누락 또는 잘못됨", color: "text-red-400", bg: "bg-red-500/15" },
    { code: "404", label: "Not Found", desc: "Endpoint 없음", color: "text-amber-400", bg: "bg-amber-500/15" },
  ]
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">RESPONSES</p>
      <div className="space-y-1">
        {codes.map((c) => (
          <div key={c.code} className="flex items-center gap-2 rounded-md bg-bg px-3 py-1.5">
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-bold", c.bg, c.color)}>{c.code}</span>
            <span className="text-xs font-medium text-[var(--color-fg)]">{c.label}</span>
            <span className="text-xs text-[var(--color-fg-subtle)]">— {c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Response Types Info ─── */
function ResponseTypesInfo() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-6 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-5 py-3 text-left">
        <Info className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-xs font-semibold text-[var(--color-fg)]">Response Types</span>
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-xs font-bold text-cyan-400">1 type</span>
        <div className="flex-1" />
        {open ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--color-fg-subtle)]" />}
      </button>
      {open && (
        <div className="border-t border-[var(--color-border)] px-5 py-4">
          <div className="rounded-lg border border-[var(--color-border)] bg-bg p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-xs font-bold text-cyan-400">PROMPT</span>
              <span className="text-xs text-[var(--color-fg-muted)]">프롬프트 렌더링 결과를 반환합니다</span>
            </div>
            <div className="overflow-hidden rounded-md border border-[var(--color-border)]" style={{ height: "320px" }}>
              <Editor
                height="100%"
                defaultLanguage="json"
                value={`{\n  "id": "exec-abc123",\n  "rendered_prompt": "Hello, John! How can I help you today?",\n  "model": "gpt-4o",\n  "version": "v1",\n  "environment": "production",\n  "variables_used": {\n    "name": "John"\n  },\n  "latency": 42\n}`}
                options={MONACO_READ_OPTIONS}
                beforeMount={defineMonacoTheme}
                theme="agentstudio-dark"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Main page ─── */
export default function PublicDocsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId: slug } = use(params)

  const [isPublic, setIsPublic] = useState<boolean | null>(null)
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [authOpen, setAuthOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeTabMap, setActiveTabMap] = useState<Record<string, "schema" | "tryit" | "blocks">>({})
  const [tryItValues, setTryItValues] = useState<Record<string, string>>({})
  const [tryItResponse, setTryItResponse] = useState<string | null>(null)
  const [tryItLoading, setTryItLoading] = useState(false)
  const [snapshotCache, setSnapshotCache] = useState<Record<string, PromptBlock[]>>({})
  const [fullSnapshotCache, setFullSnapshotCache] = useState<Record<string, Record<string, unknown>>>({})
  const [liveRendered, setLiveRendered] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [specCopied, setSpecCopied] = useState(false)

  // cURL modal
  const [curlModalOpen, setCurlModalOpen] = useState(false)
  const [curlModalEp, setCurlModalEp] = useState<Endpoint | null>(null)

  // Parameters / Request Body sub-tabs
  const [activeInputTab, setActiveInputTab] = useState<"parameters" | "requestBody">("parameters")
  const [requestBodyJson, setRequestBodyJson] = useState("")
  const [jsonValid, setJsonValid] = useState(true)
  const syncSourceRef = useRef<"params" | "json" | null>(null)

  useEffect(() => {
    mockApi.projects.getBySlug(slug).then(async (p) => {
      if (!p || !p.publicDocsEnabled) {
        setIsPublic(false)
        setIsLoading(false)
        return
      }
      
      setIsPublic(true)
      setProject(p)
      const eps = await mockApi.endpoints.list(p.id)
      setEndpoints(eps)
      setIsLoading(false)
    }).catch(() => {
      setIsPublic(false)
      setIsLoading(false)
    })
  }, [slug])

  const spec = useMemo(() => buildOasSpec(endpoints), [endpoints])
  const specJson = useMemo(() => JSON.stringify(spec, null, 2), [spec])

  const groupedByPrompt = useMemo(() => {
    const groups: Record<string, { name: string; endpoints: Endpoint[] }> = {}
    for (const ep of endpoints) {
      if (!groups[ep.promptId]) groups[ep.promptId] = { name: ep.promptName, endpoints: [] }
      groups[ep.promptId].endpoints.push(ep)
    }
    return groups
  }, [endpoints])

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  /* Expand: fetch snapshot once, render initial preview */
  const handleExpand = useCallback(async (ep: Endpoint) => {
    const isOpen = expanded.has(ep.id)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(ep.id)) next.delete(ep.id)
      else next.add(ep.id)
      return next
    })
    if (isOpen) return
    setTryItResponse(null)
    setActiveTabMap((prev) => ({ ...prev, [ep.id]: "schema" }))
    setActiveInputTab("parameters")
    setJsonValid(true)

    const initVals = Object.fromEntries(ep.variables.map((v) => [v.name, v.defaultValue]))
    setTryItValues((prev) => ({ ...prev, ...initVals }))
    setRequestBodyJson(buildRequestBodyJson(ep, initVals))

    if (!snapshotCache[ep.id]) {
      try {
        const versionData = await mockApi.versionSnapshots.getByVersionId(ep.versionId)
        if (versionData) {
          // API returns { id, number, snapshot: PromptSnapshot } — extract the actual snapshot
          const snapshot = (versionData as any).snapshot ?? versionData
          const blocks = snapshot.blocks as PromptBlock[]
          setSnapshotCache((prev) => ({ ...prev, [ep.id]: blocks }))
          setFullSnapshotCache((prev) => ({ ...prev, [ep.id]: snapshot }))
          try {
            setLiveRendered((prev) => ({ ...prev, [ep.id]: renderPrompt(blocks, buildVarMap(ep, initVals)) }))
          } catch { /* noop */ }

        }
      } catch { /* noop */ }
    }
  }, [expanded, snapshotCache])

  /* Variable change → instant sync render */
  const handleVarChange = useCallback((ep: Endpoint, name: string, value: string) => {
    const next = { ...tryItValues, [name]: value }
    setTryItValues(next)
    const blocks = snapshotCache[ep.id]
    if (blocks) {
      try { setLiveRendered((prev) => ({ ...prev, [ep.id]: renderPrompt(blocks, buildVarMap(ep, next)) })) } catch { /* noop */ }
    }
    // Sync to Request Body JSON
    if (syncSourceRef.current !== "json") {
      syncSourceRef.current = "params"
      setRequestBodyJson(buildRequestBodyJson(ep, next))
      setTimeout(() => { syncSourceRef.current = null }, 0)
    }
  }, [tryItValues, snapshotCache])

  /* JSON change → Parameters */
  const handleJsonChange = useCallback((ep: Endpoint, json: string) => {
    setRequestBodyJson(json)
    try {
      const parsed = JSON.parse(json)
      setJsonValid(true)
      const vars = parsed?.variables ?? {}
      const nextValues: Record<string, string> = {}
      for (const v of ep.variables) {
        const raw = vars[v.name]
        nextValues[v.name] = raw !== undefined
          ? (typeof raw === "object" ? JSON.stringify(raw) : String(raw))
          : (tryItValues[v.name] ?? v.defaultValue)
      }
      if (syncSourceRef.current !== "params") {
        syncSourceRef.current = "json"
        setTryItValues(nextValues)
        const blocks = snapshotCache[ep.id]
        if (blocks) {
          try { setLiveRendered((prev) => ({ ...prev, [ep.id]: renderPrompt(blocks, buildVarMap(ep, nextValues)) })) } catch { /* noop */ }
        }
        setTimeout(() => { syncSourceRef.current = null }, 0)
      }
    } catch {
      setJsonValid(false)
    }
  }, [tryItValues, snapshotCache])

  const handleExecute = useCallback(async (ep: Endpoint) => {
    if (!apiKey) { setAuthOpen(true); return }
    setTryItLoading(true)
    setTryItResponse(null)
    try {
      const apiServiceUrl = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4100"
      const response = await fetch(`${apiServiceUrl}${ep.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: requestBodyJson,
      })
      const data = await response.json()
      setTryItResponse(JSON.stringify(data, null, 2))
    } catch (err) {
      setTryItResponse(JSON.stringify({ error: String(err) }, null, 2))
    }
    setTryItLoading(false)
  }, [apiKey, requestBodyJson])

  const generateCurl = (ep: Endpoint) => {
    const key = apiKey || "sk-ps-YOUR_KEY"
    const vars = Object.fromEntries(ep.variables.map((v) => {
      const raw = tryItValues[v.name] ?? v.defaultValue
      if (v.type === "number") return [v.name, Number(raw) || 0]
      if (v.type === "array" || v.type === "object") { try { return [v.name, JSON.parse(raw)] } catch { return [v.name, raw] } }
      return [v.name, raw]
    }))
    return `curl -X POST https://api.agentstudio.io${ep.path} \\\n  -H "Content-Type: application/json" \\\n  -H "X-API-Key: ${key}" \\\n  -d '${JSON.stringify({ variables: vars }, null, 2)}'`
  }

  if (isPublic === false) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-bg px-4 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-surface)]">
          <Globe className="h-8 w-8 text-[var(--color-fg-subtle)]" />
        </div>
        <h2 className="mb-2 text-xl font-bold text-[var(--color-fg)]">Public Docs 비활성화</h2>
        <p className="text-sm text-[var(--color-fg-muted)]">
          이 프로젝트의 Public API Docs는 현재 비활성화되어 있습니다.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    )
  }

  return (
    <>
      {authOpen && (
        <AuthorizeModal
          apiKey={apiKey}
          onSave={setApiKey}
          onClose={() => setAuthOpen(false)}
        />
      )}

      {/* cURL Modal */}
      {curlModalOpen && curlModalEp && (
        <CurlModal
          curlCommand={generateCurl(curlModalEp)}
          onClose={() => setCurlModalOpen(false)}
          onCopy={() => copy(generateCurl(curlModalEp), `curl-modal-${curlModalEp.id}`)}
          copied={copiedId === `curl-modal-${curlModalEp.id}`}
        />
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-[var(--color-border-strong)] bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3 md:px-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-emerald-400" />
            <span className="text-sm font-bold text-[var(--color-fg)]">
              {project?.name ?? "AgentStudio"} API Docs
            </span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-bold text-emerald-400">OAS 3.0</span>
          </div>
          <div className="flex-1" />

          {/* OAS JSON copy */}
          <button
            onClick={() => { navigator.clipboard.writeText(specJson); setSpecCopied(true); setTimeout(() => setSpecCopied(false), 2000) }}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] px-3 py-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            {specCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
            OAS JSON
          </button>

          {/* Authorize button */}
          <button
            onClick={() => setAuthOpen(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              apiKey
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                : "border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:border-amber-500/30 hover:text-amber-400"
            )}
          >
            {apiKey ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {apiKey ? "Authorized" : "Authorize"}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
        {/* API Info card */}
        <div className="mb-8 overflow-hidden rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
          <div className="bg-gradient-to-r from-emerald-900/30 to-[var(--color-surface)] px-4 py-4 md:px-6 md:py-6">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 md:h-12 md:w-12">
                <Globe className="h-5 w-5 text-emerald-400 md:h-6 md:w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <h1 className="text-lg font-bold text-[var(--color-fg)] md:text-xl">
                    {project?.name ?? "AgentStudio"} API
                  </h1>
                  <span className="rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]">v1.0.0</span>
                  <span className="rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-fg-subtle)]">{endpoints.length} endpoints</span>
                </div>
                {project?.description && (
                  <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]">{project.description}</p>
                )}
                <p className="mt-1 text-xs text-[var(--color-fg-subtle)]">
                  Base URL: <code className="text-emerald-400">https://api.agentstudio.io</code>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 divide-[var(--color-border-strong)] border-t border-[var(--color-border-strong)] sm:grid-cols-2 sm:divide-x">
            {/* Auth info */}
            <div className="px-4 py-3 md:px-6 md:py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Authentication</p>
              <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-between md:gap-3">
                <div className="flex min-w-0 items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
                  <span className="font-semibold text-amber-400">API KEY</span>
                  <code className="truncate text-[var(--color-fg-muted)]">X-API-Key: {apiKey ? `${apiKey.slice(0, 12)}…` : "sk-ps-YOUR_KEY"}</code>
                </div>
                <button
                  onClick={() => setAuthOpen(true)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    apiKey
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      : "border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:border-amber-500/30 hover:text-amber-400"
                  )}
                >
                  {apiKey ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {apiKey ? "Change" : "Set Key"}
                </button>
              </div>
            </div>

            {/* Server info */}
            <div className="px-4 py-3 md:px-6 md:py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">Server</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <code className="text-xs text-[var(--color-fg-muted)]">https://api.agentstudio.io</code>
                <span className="text-xs text-[var(--color-fg-subtle)]">— Production</span>
              </div>
            </div>
          </div>
        </div>

        {/* Response Types */}
        <ResponseTypesInfo />

        {/* Endpoints grouped by prompt */}
        <div className="space-y-4">
          {Object.entries(groupedByPrompt).map(([promptId, group]) => (
            <div key={promptId} className="overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
              {/* Tag header */}
              <div className="flex items-center gap-2 border-b border-[var(--color-border-strong)] px-5 py-3">
                <FileJson className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-bold text-[var(--color-fg)]">{group.name}</span>
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)]">
                  {group.endpoints.length} endpoint{group.endpoints.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="divide-y divide-[var(--color-surface-2)]">
                {group.endpoints.map((ep) => {
                  const isOpen = expanded.has(ep.id)
                  const epTab = activeTabMap[ep.id] ?? "schema"
                  const badge = getEnvBadge(ep.environment)
                  const live = liveRendered[ep.id] ?? ""

                  return (
                    <div key={ep.id}>
                      <button
                        className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[#1a1d27]"
                        onClick={() => handleExpand(ep)}
                      >
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400">POST</span>
                        <code className="flex-1 font-mono text-sm text-[var(--color-fg)]">{ep.path}</code>
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold uppercase", badge.bg, badge.text)}>
                          {ep.environment}
                        </span>
                        <span className="hidden rounded bg-cyan-500/15 px-1.5 py-0.5 text-xs font-bold text-cyan-400 sm:inline">
                          {(ep.responseType || "prompt").toUpperCase()}
                        </span>
                        <span className="hidden text-xs text-[var(--color-fg-subtle)] sm:inline">v{ep.versionNumber} · {ep.modelId}</span>
                        {isOpen ? <ChevronDown className="h-4 w-4 text-[var(--color-fg-subtle)]" /> : <ChevronRight className="h-4 w-4 text-[var(--color-fg-subtle)]" />}
                      </button>

                      {isOpen && (
                        <div className="border-t border-[var(--color-border)] bg-bg">
                          {/* Endpoint description */}
                          {(ep.prompt?.description || ep.description) && (
                            <p className="border-b border-[var(--color-border)] border-l-2 border-l-cyan-500/30 px-5 py-2.5 text-xs text-[var(--color-fg-muted)]">
                              {ep.prompt?.description || ep.description}
                            </p>
                          )}

                          {/* Tab bar */}
                          <div className="flex items-center border-b border-[var(--color-border)]">
                            <button
                              onClick={() => setActiveTabMap((prev) => ({ ...prev, [ep.id]: "schema" }))}
                              className={cn("flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors",
                                epTab === "schema" ? "border-b-2 border-blue-400 text-blue-400" : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]")}
                            >
                              <ListTree className="h-3.5 w-3.5" />
                              Schema
                            </button>
                            <button
                              onClick={() => setActiveTabMap((prev) => ({ ...prev, [ep.id]: "tryit" }))}
                              className={cn("flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors",
                                epTab === "tryit" ? "border-b-2 border-blue-400 text-blue-400" : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]")}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Try It Out
                            </button>
                            <button
                              onClick={() => setActiveTabMap((prev) => ({ ...prev, [ep.id]: "blocks" }))}
                              className={cn("flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium transition-colors",
                                epTab === "blocks" ? "border-b-2 border-blue-400 text-blue-400" : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]")}
                            >
                              <Layers className="h-3.5 w-3.5" />
                              Blocks
                            </button>
                            {/* cURL button — rightmost */}
                            <button
                              onClick={() => { setCurlModalEp(ep); setCurlModalOpen(true) }}
                              className="ml-auto mr-3 flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] px-2.5 py-1 text-xs text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg-muted)]"
                            >
                              <Terminal className="h-3 w-3" />
                              cURL
                            </button>
                          </div>

                          {epTab === "schema" ? (
                            /* ─── Schema ─── */
                            <div className="p-5">
                              <div className="flex flex-col gap-5 lg:flex-row">
                                {/* Left column — Variables table */}
                                <div className="min-w-0 flex-1">
                                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
                                    Request Body · <span className="font-normal text-[var(--color-fg-subtle)]">application/json</span>
                                  </p>
                                  {ep.variables.length > 0 ? (
                                    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                                      <table className="w-full">
                                        <thead>
                                          <tr className="border-b border-[var(--color-border)] bg-bg">
                                            {["Name", "Type", "Required", "Default", "Description"].map((h) => (
                                              <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {ep.variables.map((v, i) => (
                                            <tr key={v.name} className={cn("border-b border-[var(--color-border)] last:border-0", i % 2 === 0 ? "bg-bg" : "bg-bg")}>
                                              <td className="px-4 py-2.5"><code className="text-xs font-semibold text-[var(--color-fg)]">{v.name}</code></td>
                                              <td className="px-4 py-2.5"><span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400">{v.type}</span></td>
                                              <td className="px-4 py-2.5">{v.required ? <span className="text-xs font-semibold text-red-400">required</span> : <span className="text-xs text-[var(--color-fg-subtle)]">optional</span>}</td>
                                              <td className="max-w-[80px] px-4 py-2.5 sm:max-w-[160px]"><code className="truncate text-xs text-[var(--color-fg-subtle)]">{v.defaultValue.length > 35 ? v.defaultValue.slice(0, 35) + "…" : v.defaultValue}</code></td>
                                              <td className="px-4 py-2.5 text-xs text-[var(--color-fg-subtle)]">{v.description || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : <p className="text-sm text-[var(--color-fg-subtle)]">변수 없음</p>}
                                </div>

                                {/* Right column — Example Request */}
                                <div className="flex w-full flex-shrink-0 flex-col lg:w-[340px]">
                                  <p className="mb-1.5 text-xs font-semibold text-[var(--color-fg-subtle)]">EXAMPLE REQUEST</p>
                                  <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
                                    <Editor
                                      height="220px"
                                      defaultLanguage="json"
                                      value={JSON.stringify({ variables: Object.fromEntries(ep.variables.map((v) => [v.name, v.type === "number" ? Number(v.defaultValue) || 0 : v.type === "array" ? (() => { try { return JSON.parse(v.defaultValue || "[]") } catch { return v.defaultValue } })() : v.defaultValue])) }, null, 2)}
                                      options={MONACO_READ_OPTIONS}
                                      beforeMount={defineMonacoTheme}
                                      theme="agentstudio-dark"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Responses — full width bottom */}
                              <div className="mt-4">
                                <ResponseStatusCodes />
                              </div>
                            </div>
                          ) : epTab === "blocks" ? (
                            /* ─── Blocks view ─── */
                            <div className="p-5">
                              <div className="p-4 text-xs text-[var(--color-fg-subtle)]">블록 뷰어는 지원되지 않습니다.</div>
                            </div>
                          ) : (
                            /* ─── Try It Out ─── */
                            <div className="p-5">
                              {/* Auth warning if no key */}
                              {!apiKey && (
                                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5">
                                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                                  <span className="flex-1 text-xs text-[var(--color-fg-muted)]">
                                    API Key가 없습니다. Execute 시 인증이 필요합니다.
                                  </span>
                                  <button
                                    onClick={() => setAuthOpen(true)}
                                    className="text-xs font-medium text-amber-400 hover:text-amber-300"
                                  >
                                    Authorize →
                                  </button>
                                </div>
                              )}

                              <div className="flex flex-col gap-5 lg:flex-row">
                                {/* Left: Parameters / Request Body */}
                                <div className="min-w-0 flex-1">
                                  {/* Inner sub-tabs */}
                                  <div className="mb-3 flex items-center gap-1">
                                    <button
                                      onClick={() => setActiveInputTab("parameters")}
                                      className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                        activeInputTab === "parameters"
                                          ? "bg-blue-500/15 text-blue-400"
                                          : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]")}
                                    >
                                      Parameters
                                    </button>
                                    <button
                                      onClick={() => setActiveInputTab("requestBody")}
                                      className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                        activeInputTab === "requestBody"
                                          ? "bg-blue-500/15 text-blue-400"
                                          : "text-[var(--color-fg-subtle)] hover:text-[var(--color-fg-muted)]")}
                                    >
                                      Request Body
                                    </button>
                                  </div>

                                  {activeInputTab === "parameters" ? (
                                    /* Parameters sub-tab */
                                    <div className="space-y-3">
                                      {ep.variables.map((v) => (
                                        <div key={v.name}>
                                          <div className="mb-1 flex items-center gap-2">
                                            <label className="text-xs font-medium text-[var(--color-fg)]">{v.name}</label>
                                            <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-xs text-purple-400">{v.type}</span>
                                            {v.required && <span className="text-xs text-red-400">*required</span>}
                                          </div>
                                          {v.type === "array" || v.type === "object" ? (
                                            <textarea
                                              value={tryItValues[v.name] ?? v.defaultValue}
                                              onChange={(e) => handleVarChange(ep, v.name, e.target.value)}
                                              rows={3}
                                              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 font-mono text-xs text-[var(--color-fg)] focus:border-blue-500/40 focus:outline-none"
                                            />
                                          ) : (
                                            <input
                                              type={v.type === "number" ? "number" : "text"}
                                              value={tryItValues[v.name] ?? v.defaultValue}
                                              onChange={(e) => handleVarChange(ep, v.name, e.target.value)}
                                              className="w-full rounded-lg border border-[var(--color-border-strong)] bg-bg px-3 py-2 text-xs text-[var(--color-fg)] focus:border-blue-500/40 focus:outline-none"
                                            />
                                          )}
                                        </div>
                                      ))}
                                      {ep.variables.length === 0 && (
                                        <p className="text-xs text-[var(--color-fg-subtle)]">이 엔드포인트는 변수가 없습니다</p>
                                      )}
                                    </div>
                                  ) : (
                                    /* Request Body sub-tab */
                                    <div>
                                      <div
                                        className={`overflow-hidden rounded-lg border ${jsonValid ? "border-[var(--color-border-strong)]" : "border-red-500/50"}`}
                                        style={{ height: `${Math.max(200, ep.variables.length * 30 + 80)}px` }}
                                      >
                                        <Editor
                                          height="100%"
                                          defaultLanguage="json"
                                          value={requestBodyJson}
                                          onChange={(v) => handleJsonChange(ep, v || "")}
                                          options={MONACO_EDIT_OPTIONS}
                                          beforeMount={defineMonacoTheme}
                                          theme="agentstudio-dark"
                                        />
                                      </div>
                                      {!jsonValid && (
                                        <p className="mt-1 text-xs text-red-400">Invalid JSON format</p>
                                      )}
                                    </div>
                                  )}

                                  <button
                                    onClick={() => handleExecute(ep)}
                                    disabled={tryItLoading}
                                    className="mt-4 flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                                  >
                                    {tryItLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    Execute
                                  </button>
                                </div>

                                {/* Live Preview */}
                                <div className="min-w-0 flex-1">
                                  <pre className="h-full overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-bg p-3 font-mono text-xs leading-relaxed text-[var(--color-fg)]">
                                    {live}
                                  </pre>
                                </div>
                              </div>

                              {/* Response */}
                              {tryItResponse && (
                                <div className="mt-5 border-t border-[var(--color-border)] pt-5">
                                  <div className="mb-2 flex items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">RESPONSE</span>
                                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-bold text-emerald-400">200 OK</span>
                                  </div>
                                  <div className="overflow-hidden rounded-lg border border-[var(--color-border)]" style={{ height: "300px" }}>
                                    <Editor
                                      height="100%"
                                      defaultLanguage="json"
                                      value={tryItResponse}
                                      options={MONACO_READ_OPTIONS}
                                      beforeMount={defineMonacoTheme}
                                      theme="agentstudio-dark"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {endpoints.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Globe className="mb-3 h-12 w-12 text-[var(--color-border-strong)]" />
              <p className="text-sm text-[var(--color-fg-subtle)]">배포된 Endpoint가 없습니다</p>
            </div>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-[var(--color-border-strong)]">
          Powered by AgentStudio · OAS 3.0
        </p>
      </div>
    </>
  )
}

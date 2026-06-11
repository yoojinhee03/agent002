"use client"

import { useCallback, useState } from "react"
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react"
import { safeJsonStringify, truncateText } from "@/lib/utils"

/* ──────────────────────────────────────────────
   JsonViewer  — read-only, collapsible
────────────────────────────────────────────── */
interface JsonViewerProps {
  /** Pre-parsed data or a JSON string to display */
  data: unknown
  maxHeight?: string
  copyable?: boolean
  label?: string
}

export function JsonViewer({ data, maxHeight = "max-h-80", copyable = true, label }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)

  const stringified = useCallback(() => {
    return safeJsonStringify(data)
  }, [data])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(stringified())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [stringified])

  const parsed = (() => {
    if (typeof data === "string") {
      try { return JSON.parse(data) } catch { return data }
    }
    return data
  })()

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        {label && (
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {label}
          </span>
        )}
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
          >
            {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
            {copied ? "복사됨" : "복사"}
          </button>
        )}
      </div>
      <div className={`overflow-auto rounded-md border border-[var(--color-border-strong)] bg-bg p-3 font-mono text-xs leading-relaxed ${maxHeight}`}>
        <JsonNode data={parsed} depth={0} />
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   JsonEditor  — editable textarea with copy btn
────────────────────────────────────────────── */
interface JsonEditorProps {
  value: string
  onChange: (v: string) => void
  label?: string
  rows?: number
  isValid?: boolean
}

export function JsonEditor({ value, onChange, label, rows = 10, isValid = true }: JsonEditorProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [value])

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        {label && (
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {label}
          </span>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[var(--color-fg-subtle)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]"
        >
          {copied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        spellCheck={false}
        className={`w-full resize-y rounded-md border bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-[var(--color-fg)] outline-none transition-colors ${
          isValid
            ? "border-[var(--color-border-strong)] focus:border-blue-500/40"
            : "border-red-500/50 focus:border-red-500/70"
        }`}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────
   Internal: collapsible node renderer
────────────────────────────────────────────── */
function JsonNode({ data, depth }: { data: unknown; depth: number }) {
  const [open, setOpen] = useState(true)
  const indent = "  ".repeat(depth)
  const innerIndent = "  ".repeat(depth + 1)

  if (data === null) return <span className="text-[var(--color-fg-subtle)]">null</span>
  if (typeof data === "boolean") return <span className="text-purple-400">{String(data)}</span>
  if (typeof data === "number") return <span className="text-amber-400">{data}</span>
  if (typeof data === "string") return <span className="text-green-400">&quot;{truncateText(data, 2000)}&quot;</span>

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-[var(--color-fg)]">[]</span>
    return (
      <span>
        <ToggleBtn open={open} onToggle={() => setOpen(!open)} />
        <span className="text-[var(--color-fg)]">[</span>
        {open ? (
          <>
            {"\n"}
            {data.map((item, i) => (
              <span key={i}>
                <span>{innerIndent}</span>
                <JsonNode data={item} depth={depth + 1} />
                {i < data.length - 1 ? <span className="text-[var(--color-fg-subtle)]">,</span> : null}
                {"\n"}
              </span>
            ))}
            <span>{indent}</span>
          </>
        ) : (
          <span className="text-[var(--color-fg-subtle)] text-xs"> … {data.length} items </span>
        )}
        <span className="text-[var(--color-fg)]">]</span>
      </span>
    )
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-[var(--color-fg)]">{"{}"}</span>
    return (
      <span>
        <ToggleBtn open={open} onToggle={() => setOpen(!open)} />
        <span className="text-[var(--color-fg)]">{"{"}</span>
        {open ? (
          <>
            {"\n"}
            {entries.map(([k, v], i) => (
              <span key={k}>
                <span>{innerIndent}</span>
                <span className="text-blue-400">&quot;{k}&quot;</span>
                <span className="text-[var(--color-fg-subtle)]">: </span>
                <JsonNode data={v} depth={depth + 1} />
                {i < entries.length - 1 ? <span className="text-[var(--color-fg-subtle)]">,</span> : null}
                {"\n"}
              </span>
            ))}
            <span>{indent}</span>
          </>
        ) : (
          <span className="text-[var(--color-fg-subtle)] text-xs"> … {entries.length} keys </span>
        )}
        <span className="text-[var(--color-fg)]">{"}"}</span>
      </span>
    )
  }

  return <span className="text-[var(--color-fg)]">{String(data)}</span>
}

function ToggleBtn({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mr-0.5 inline-flex items-center rounded hover:bg-[var(--color-surface-2)]"
      style={{ width: 13, height: 13, verticalAlign: "middle" }}
    >
      {open
        ? <ChevronDown className="h-3 w-3 text-[var(--color-fg-subtle)]" />
        : <ChevronRight className="h-3 w-3 text-[var(--color-fg-subtle)]" />
      }
    </button>
  )
}

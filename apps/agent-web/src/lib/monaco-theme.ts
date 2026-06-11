import type { Monaco } from "@monaco-editor/react"

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? (v.startsWith("#") ? v : `#${v.replace(/^#/, "")}`) : fallback
}

export function resolveMonacoThemeBase(): "vs" | "vs-dark" {
  if (typeof window === "undefined") return "vs-dark"
  return document.documentElement.classList.contains("light") ? "vs" : "vs-dark"
}

export function resolveThemeColors() {
  const isLight = resolveMonacoThemeBase() === "vs"
  return {
    bg: readVar("--color-bg", isLight ? "#f4f6fa" : "#14161f"),
    surface: readVar("--color-surface", isLight ? "#ffffff" : "#1a1d28"),
    fg: readVar("--color-fg", isLight ? "#14182a" : "#eef0f5"),
    fgMuted: readVar("--color-fg-muted", isLight ? "#4a5168" : "#a8aec0"),
    fgSubtle: readVar("--color-fg-subtle", isLight ? "#7a8197" : "#6b7180"),
    border: readVar("--color-border", isLight ? "#d6dce8" : "#2e3242"),
    borderStrong: readVar("--color-border-strong", isLight ? "#b4bccd" : "#3d4256"),
  }
}

/** Registers and returns the shared Monaco themes (theme-aware) */
export function defineMonacoTheme(monaco: Monaco) {
  const sharedRules = [
    { token: "string", foreground: "22d3ee" },
    { token: "number", foreground: "a78bfa" },
    { token: "key", foreground: "f472b6" },
    { token: "true", foreground: "34d399" },
    { token: "false", foreground: "f87171" },
  ]
  const c = resolveThemeColors()
  const base = resolveMonacoThemeBase()

  monaco.editor.defineTheme("agentstudio-dark", {
    base,
    inherit: true,
    rules: sharedRules,
    colors: {
      "editor.background": c.bg,
      "editor.foreground": c.fg,
      "editor.lineNumbersBackground": c.bg,
      "editorLineNumber.foreground": c.fgSubtle,
      "editorLineNumber.activeForeground": c.fgMuted,
      "editor.selectionBackground": "#1e40af40",
      "editor.lineHighlightBackground": c.surface,
      "editorCursor.foreground": "#60a5fa",
    },
  })

  monaco.editor.defineTheme("agentstudio-dark-panel", {
    base,
    inherit: true,
    rules: sharedRules,
    colors: {
      "editor.background": c.surface,
      "editor.foreground": c.fg,
      "editorGutter.background": c.surface,
      "editorLineNumber.foreground": c.fgSubtle,
      "editorLineNumber.activeForeground": c.fgMuted,
      "editor.selectionBackground": "#1e40af40",
      "editor.lineHighlightBackground": c.bg,
      "editorCursor.foreground": "#60a5fa",
      "editorIndentGuide.background1": c.border,
      "editorIndentGuide.activeBackground1": c.borderStrong,
    },
  })
}

export const MONACO_READ_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 10,
  lineNumbersMinChars: 2,
  scrollBeyondLastLine: false,
  padding: { top: 8, bottom: 8 },
  lineHeight: 18,
  wordWrap: "on" as const,
} as const

export const MONACO_EDIT_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 10,
  lineNumbersMinChars: 2,
  scrollBeyondLastLine: false,
  padding: { top: 8, bottom: 8 },
  lineHeight: 18,
  formatOnPaste: true,
  formatOnType: true,
} as const

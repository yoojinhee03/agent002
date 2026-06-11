import { marked } from "marked"

// Configure marked for safe inline rendering
marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * Parse markdown text to HTML string.
 * Also handles {{variable}} badges by preserving them through markdown parsing.
 */
export function renderMarkdown(text: string): string {
  if (!text) return ""
  return marked.parse(text, { async: false }) as string
}

/**
 * Parse markdown inline only (no block elements like <p>).
 * Useful for single-line contexts.
 */
export function renderMarkdownInline(text: string): string {
  if (!text) return ""
  return marked.parseInline(text, { async: false }) as string
}

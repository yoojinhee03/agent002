"use client"

/**
 * Shared hook for all contenteditable editors.
 *
 * Provides:
 *  - Variable badge rendering / extraction
 *  - Cursor management (save, restore, move-to-text-node)
 *  - Slash command menu state & keyboard navigation
 *  - Markdown formatting (applyFormat)
 *  - Variable insertion (insertVariable)
 *  - Drag-and-drop handling
 *  - Bubble toolbar (selection-based)
 *
 * Consumers only need to render the `<div contentEditable>` and wire up the
 * returned handlers + UI state.
 */

import { useRef, useCallback, useEffect, useMemo, useState } from "react"
import type { Variable } from "@/types/prompt"
import { saveEditorSelection } from "@/lib/editor-selection"
import {
  toHTML as toHTMLUtil,
  extractContent,
  makeBadge as makeBadgeUtil,
  moveCursorToTextNode,
  insertBR,
  applyBadges as applyBadgesUtil,
  getCursorCharOffset,
  getCharOffsetOfPoint,
  setCursorAtCharOffset,
  type BadgeVariable,
} from "@/lib/editor-utils"

// ── Types ──────────────────────────────────────────────────────────────────

export type FormatType = "bold" | "italic" | "strike" | "code" | "codeblock" | "hr" | "h1" | "h2" | "h3" | "ul" | "ol" | "quote"

export const FORMAT_COMMANDS: { type: FormatType; label: string; icon?: string; aliases: string[] }[] = []

export interface ExtraVariable {
  name: string
  type: string
  color: string
  bgColor: string
}

export interface UseContentEditableOptions {
  /** Current text value (plain text with `{{var}}` patterns). */
  value: string
  /** Callback when the content changes. */
  onChange: (value: string) => void
  /** Variables from the prompt store. */
  variables: Variable[]
  /** Extra loop-scoped variables (e.g. item, item.key). */
  extraVariables?: ExtraVariable[]
  /** Optional: push to undo history (debounced internally). */
  onHistoryPush?: () => void
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useContentEditable({
  value,
  onChange,
  variables,
  extraVariables = [],
  onHistoryPush,
}: UseContentEditableOptions) {
  const elRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  const lastValueRef = useRef(value)
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Slash menu state ──
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const showSlashMenuRef = useRef(false) // mirror for stale-closure-safe reads
  const [slashFilter, setSlashFilter] = useState("")
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedIndexRef = useRef(0)
  const savedRangeRef = useRef<Range | null>(null)

  // Keep refs in sync with state for stale-closure-safe reads
  const setSlashMenuOpen = useCallback((open: boolean) => {
    showSlashMenuRef.current = open
    setShowSlashMenu(open)
  }, [])
  const setSelectedIdx = useCallback((v: number | ((prev: number) => number)) => {
    setSelectedIndex((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      selectedIndexRef.current = next
      return next
    })
  }, [])

  // ── Drag state ──
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Toolbar state ──
  const [showToolbar, setShowToolbar] = useState(false)
  const [isFloating, setIsFloating] = useState(true)
  const [showBubble, setShowBubble] = useState(false)
  const [bubblePosition, setBubblePosition] = useState({ top: 0, left: 0 })

  // ── Derived variable lists ──

  const allVariablesForBadge: BadgeVariable[] = useMemo(
    () => [
      ...variables,
      ...extraVariables.map((ev) => ({ name: ev.name, color: ev.color, bgColor: ev.bgColor })),
    ],
    [variables, extraVariables],
  )

  const allSearchableVariables: Variable[] = useMemo(() => {
    const extras: Variable[] = extraVariables.map((ev, i) => ({
      id: `extra-${i}`,
      name: ev.name,
      type: ev.type as Variable["type"],
      defaultValue: "",
      color: ev.color,
      bgColor: ev.bgColor,
      required: false,
    }))
    return [...variables, ...extras]
  }, [variables, extraVariables])

  const filteredVariables = useMemo(
    () => allSearchableVariables.filter((v) => v.name.toLowerCase().includes(slashFilter.toLowerCase())),
    [allSearchableVariables, slashFilter],
  )

  const filteredFormats = useMemo(
    () =>
      FORMAT_COMMANDS.filter(
        (c) =>
          c.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
          c.aliases.some((a) => a.includes(slashFilter.toLowerCase())),
      ),
    [slashFilter],
  )

  const paletteItemCount = filteredFormats.length + filteredVariables.length

  // ── toHTML (memoised) ──

  const toHTML = useCallback(
    (text: string) => toHTMLUtil(text, allVariablesForBadge),
    [allVariablesForBadge],
  )

  // Ref so effects can call latest version without re-firing
  const toHTMLRef = useRef(toHTML)
  useEffect(() => { toHTMLRef.current = toHTML }, [toHTML])

  // ── makeBadge ──

  const makeBadge = useCallback(
    (varName: string) => makeBadgeUtil(varName, allVariablesForBadge),
    [allVariablesForBadge],
  )

  // ── Initial render ──

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    el.innerHTML = toHTMLRef.current(value.replace(/\n/g, "<br>")) || ""
    lastValueRef.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync from external value changes (undo/redo, etc.)
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    if (lastValueRef.current === value) return
    lastValueRef.current = value
    el.innerHTML = toHTMLRef.current(value.replace(/\n/g, "<br>")) || ""
  }, [value])

  // Re-render badges when extraVariables content changes
  const prevExtraKeyRef = useRef("")
  useEffect(() => {
    const key = extraVariables.map((v) => `${v.name}:${v.color}`).join("|")
    if (key === prevExtraKeyRef.current) return
    prevExtraKeyRef.current = key
    const el = elRef.current
    if (!el) return
    const current = extractContent(el)
    el.innerHTML = toHTMLRef.current(current.replace(/\n/g, "<br>")) || ""
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraVariables])

  // ── Bubble toolbar ──

  const updateBubble = useCallback(() => {
    const sel = window.getSelection()
    const el = elRef.current
    if (!sel || sel.isCollapsed || !el) { setShowBubble(false); return }
    if (!sel.rangeCount) { setShowBubble(false); return }
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) { setShowBubble(false); return }
    if (range.toString().trim().length === 0) { setShowBubble(false); return }
    const rect = range.getBoundingClientRect()
    setShowBubble(true)
    setBubblePosition({ top: rect.top - 42, left: rect.left + rect.width / 2 })
  }, [])

  // ── Caret position for slash menu ──

  const getCaretPosition = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return { top: 0, left: 0 }
    const range = sel.getRangeAt(0)
    const rects = range.getClientRects()
    if (rects.length > 0) return { top: rects[0].bottom + 4, left: rects[0].left }
    return { top: 0, left: 0 }
  }, [])

  // ── Helper: place cursor after a badge ──

  const placeCursorAfterBadge = useCallback((badge: HTMLSpanElement) => {
    const sel = window.getSelection()
    if (!sel) return
    // Find an existing text node right after the badge, or create an empty one
    let afterNode = badge.nextSibling
    if (afterNode && afterNode.nodeType === Node.TEXT_NODE) {
      // Existing text node — place cursor at its start
      const newRange = document.createRange()
      newRange.setStart(afterNode, 0)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    } else {
      // No text node after badge — create empty one (no space!)
      const textNode = document.createTextNode("")
      badge.parentNode!.insertBefore(textNode, badge.nextSibling)
      const newRange = document.createRange()
      newRange.setStart(textNode, 0)
      newRange.collapse(true)
      sel.removeAllRanges()
      sel.addRange(newRange)
    }
  }, [])

  // ── Insert variable ──

  const insertVariable = useCallback(
    (varName: string) => {
      const el = elRef.current
      if (!el) return
      el.focus()

      const sel = window.getSelection()
      if (!sel) return

      // Restore saved range if we had one (from slash menu)
      if (savedRangeRef.current) {
        try {
          sel.removeAllRanges()
          sel.addRange(savedRangeRef.current)
        } catch { /* noop */ }
        savedRangeRef.current = null
      }

      if (!sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const badge = makeBadge(varName)

      if (range.startContainer.nodeType === Node.TEXT_NODE) {
        const textNode = range.startContainer
        const text = textNode.textContent || ""
        const offset = range.startOffset
        const slashIdx = text.lastIndexOf("/", offset - 1)

        if (slashIdx !== -1) {
          const before = text.substring(0, slashIdx)
          const after = text.substring(offset)
          const afterNode = document.createTextNode(after)
          textNode.textContent = before
          const parent = textNode.parentNode!
          parent.insertBefore(badge, textNode.nextSibling)
          parent.insertBefore(afterNode, badge.nextSibling)
          const newRange = document.createRange()
          newRange.setStart(afterNode, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
        } else {
          // No slash found (already removed by handleKeyDown, or direct insert).
          // Avoid range.insertNode which creates empty text nodes at offset 0/end.
          range.deleteContents()
          const container = range.startContainer
          const off = range.startOffset
          if (container.nodeType === Node.TEXT_NODE) {
            const tn = container as Text
            const txt = tn.textContent || ""
            const parent = tn.parentNode!
            if (off === 0) {
              // Beginning of text node — insert badge before it (no empty node)
              parent.insertBefore(badge, tn)
            } else if (off >= txt.length) {
              // End of text node — insert badge after it
              parent.insertBefore(badge, tn.nextSibling)
            } else {
              // Middle — split manually
              const afterText = txt.substring(off)
              tn.textContent = txt.substring(0, off)
              const afterNode = document.createTextNode(afterText)
              parent.insertBefore(badge, tn.nextSibling)
              parent.insertBefore(afterNode, badge.nextSibling)
            }
          } else {
            // Element-level cursor
            const refNode = container.childNodes[off] ?? null
            if (refNode) container.insertBefore(badge, refNode)
            else container.appendChild(badge)
          }
          placeCursorAfterBadge(badge)
        }
      } else {
        // Element-level cursor — insert at child offset, not at end
        const off = range.startOffset
        const refNode = el.childNodes[off] ?? null
        if (refNode) el.insertBefore(badge, refNode)
        else el.appendChild(badge)
        placeCursorAfterBadge(badge)
      }

      el.focus()
      const newContent = extractContent(el)
      lastValueRef.current = newContent
      onChange(newContent)
      setShowSlashMenu(false)
      setSlashFilter("")
    },
    [makeBadge, onChange, placeCursorAfterBadge],
  )

  // ── Markdown formatting ──

  const applyFormat = useCallback(
    (type: FormatType) => {
      const el = elRef.current
      if (!el) return
      el.focus()

      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const selectedText = range.toString()

      const WRAP: Partial<Record<FormatType, [string, string]>> = {
        bold: ["**", "**"],
        italic: ["_", "_"],
        strike: ["~~", "~~"],
        code: ["`", "`"],
        codeblock: ["```\n", "\n```"],
      }

      const LINE_PREFIX: Partial<Record<FormatType, string>> = {
        h1: "# ", h2: "## ", h3: "### ", ul: "- ", ol: "1. ", quote: "> ",
      }

      if (type === "hr") {
        document.execCommand("insertText", false, "\n---\n")
        return
      }

      const wrap = WRAP[type]
      if (wrap) {
        const [pre, suf] = wrap
        if (selectedText) {
          const content = extractContent(el)
          // Use actual DOM selection offsets instead of indexOf (which matches first occurrence)
          const selStart = getCharOffsetOfPoint(el, range.startContainer, range.startOffset)
          const selEnd = getCharOffsetOfPoint(el, range.endContainer, range.endOffset)
          const before = content.substring(0, selStart)
          const after = content.substring(selEnd)
          const selected = content.substring(selStart, selEnd)
          const formatted = `${pre}${selected}${suf}`
          const newContent = before + formatted + after

          el.innerHTML = toHTML(newContent.replace(/\n/g, "<br>"))
          lastValueRef.current = newContent
          onChange(newContent)

          // Restore cursor after formatting
          setCursorAtCharOffset(el, before.length + formatted.length)
        } else {
          document.execCommand("insertText", false, `${pre}${suf}`)
          // Move cursor back by suffix length
          const newSel = window.getSelection()
          if (newSel && newSel.rangeCount) {
            const r = newSel.getRangeAt(0)
            const node = r.startContainer
            if (node.nodeType === Node.TEXT_NODE && r.startOffset >= suf.length) {
              r.setStart(node, r.startOffset - suf.length)
              r.collapse(true)
              newSel.removeAllRanges()
              newSel.addRange(r)
            }
          }
        }
        return
      }

      const prefix = LINE_PREFIX[type]
      if (prefix) {
        if (selectedText) {
          // Multi-line selection: prefix each selected line
          const lines = selectedText.split("\n")
          const formatted = lines.map((l) => `${prefix}${l}`).join("\n")
          document.execCommand("insertText", false, formatted)
        } else {
          // No selection: move cursor to start of current line, then insert prefix
          const content = extractContent(el)
          const cursorOffset = getCursorCharOffset(el)
          // Find start of current line (character after last \n before cursor)
          const lineStart = content.lastIndexOf("\n", cursorOffset - 1) + 1
          setCursorAtCharOffset(el, lineStart)
          document.execCommand("insertText", false, prefix)
        }
      }
    },
    [toHTML, onChange],
  )

  // ── handleInput ──

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return // Never interfere during IME composition

    const el = elRef.current
    if (!el) return

    // Apply badges for raw {{var}} patterns
    applyBadgesUtil(el, allVariablesForBadge, toHTMLRef.current)

    // Extract content and notify
    const content = extractContent(el)

    // If content is empty but browser left a placeholder <br>, remove it
    // so the CSS :empty placeholder shows correctly.
    if (content === "" && el.innerHTML !== "") {
      el.innerHTML = ""
    }

    lastValueRef.current = content
    onChange(content)

    // Debounced history push
    if (onHistoryPush) {
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
      historyTimerRef.current = setTimeout(() => onHistoryPush(), 300)
    }

    // Check for slash command
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      setSlashMenuOpen(false)
      return
    }
    const text = range.startContainer.textContent || ""
    const offset = range.startOffset
    const before = text.substring(0, offset)
    const slashMatch = before.match(/\/(\w*\.?\w*)$/)
    if (slashMatch) {
      savedRangeRef.current = range.cloneRange()
      setSlashFilter(slashMatch[1])
      setSelectedIdx(0)
      setSlashPosition(getCaretPosition())
      setSlashMenuOpen(true)
    } else {
      setSlashMenuOpen(false)
    }
  }, [allVariablesForBadge, onChange, onHistoryPush, getCaretPosition, setSlashMenuOpen, setSelectedIdx])

  // ── handleKeyDown ──

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing || isComposingRef.current) return

      // ── Slash menu navigation ──
      if (showSlashMenuRef.current) {
        if (e.key === "ArrowDown") {
          e.preventDefault()
          setSelectedIdx((p) => (p < paletteItemCount - 1 ? p + 1 : 0))
          return
        }
        if (e.key === "ArrowUp") {
          e.preventDefault()
          setSelectedIdx((p) => (p > 0 ? p - 1 : paletteItemCount - 1))
          return
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault()
          const idx = selectedIndexRef.current
          const slashEl = elRef.current
          const slashSel = window.getSelection()

          // Step 1: Remove "/" + typed filter from editor first.
          // After this, cursor is at exactly the position where "/" was typed —
          // that's the correct insertion point for both variables and formats.
          if (slashEl && slashSel && slashSel.rangeCount) {
            const range = slashSel.getRangeAt(0)
            if (range.startContainer.nodeType === Node.TEXT_NODE) {
              const text = range.startContainer.textContent || ""
              const slashIdx = text.lastIndexOf("/", range.startOffset - 1)
              if (slashIdx !== -1) {
                range.startContainer.textContent =
                  text.substring(0, slashIdx) + text.substring(range.startOffset)
                range.setStart(range.startContainer, slashIdx)
                range.collapse(true)
                slashSel.removeAllRanges()
                slashSel.addRange(range)
              }
            }
          }

          // Clear savedRangeRef so insertVariable uses the current cursor
          // (the position after "/" removal), not the stale saved range.
          savedRangeRef.current = null

          // Variables shown first, formats after
          if (idx < filteredVariables.length) {
            insertVariable(filteredVariables[idx].name)
          } else {
            const formatIdx = idx - filteredVariables.length
            if (filteredFormats[formatIdx]) applyFormat(filteredFormats[formatIdx].type)
          }

          setSlashMenuOpen(false)
          setSlashFilter("")
          return
        }
        if (e.key === "Escape") { e.preventDefault(); setSlashMenuOpen(false); return }
      }

      const el = elRef.current

      // ── Enter → manual BR insertion ──
      if (e.key === "Enter" && !e.shiftKey && !showSlashMenuRef.current) {
        e.preventDefault()
        if (el) {
          insertBR(el)
          const content = extractContent(el)
          lastValueRef.current = content
          onChange(content)
        }
        return
      }

      // ── Backspace / Delete → handle badge deletion ──
      if (e.key === "Backspace" || e.key === "Delete") {
        const sel = window.getSelection()
        if (el && sel && sel.rangeCount) {
          const range = sel.getRangeAt(0)
          if (range.collapsed) {
            let targetBadge: HTMLElement | null = null

            if (e.key === "Backspace") {
              // Check if the node right before cursor is a badge (skip empty text nodes)
              if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                // Cursor at start of text node — walk previous siblings skipping empty text nodes
                let prev: Node | null = range.startContainer.previousSibling
                while (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent || "").length === 0) {
                  prev = prev.previousSibling
                }
                if (prev instanceof HTMLElement && prev.dataset.var) targetBadge = prev
              } else if (range.startContainer === el || range.startContainer.nodeType !== Node.TEXT_NODE) {
                // Cursor at element level
                const offset = range.startOffset
                if (offset > 0) {
                  let prev: ChildNode | null = range.startContainer.childNodes[offset - 1]
                  while (prev && prev.nodeType === Node.TEXT_NODE && (prev.textContent || "").length === 0) {
                    prev = prev.previousSibling
                  }
                  if (prev instanceof HTMLElement && prev.dataset.var) targetBadge = prev
                }
              }
            } else {
              // Delete key — check if node right after cursor is a badge (skip empty text nodes)
              if (range.startContainer.nodeType === Node.TEXT_NODE) {
                const text = range.startContainer.textContent || ""
                if (range.startOffset === text.length) {
                  let next: Node | null = range.startContainer.nextSibling
                  while (next && next.nodeType === Node.TEXT_NODE && (next.textContent || "").length === 0) {
                    next = next.nextSibling
                  }
                  if (next instanceof HTMLElement && next.dataset.var) targetBadge = next
                }
              } else {
                const offset = range.startOffset
                let next: ChildNode | null = range.startContainer.childNodes[offset] ?? null
                while (next && next.nodeType === Node.TEXT_NODE && (next.textContent || "").length === 0) {
                  next = next.nextSibling
                }
                if (next instanceof HTMLElement && next.dataset.var) targetBadge = next
              }
            }

            if (targetBadge) {
              e.preventDefault()
              const parent = targetBadge.parentNode!
              const prevSib = targetBadge.previousSibling
              const nextSib = targetBadge.nextSibling
              targetBadge.remove()

              // Clean up empty text nodes left around the badge
              if (prevSib && prevSib.nodeType === Node.TEXT_NODE && (prevSib.textContent || "").length === 0) {
                prevSib.remove()
              }

              // Find the best text node to place cursor in (skip empty ones)
              const newRange = document.createRange()
              // Look for non-empty text node before badge position
              let cursorNode: Node | null = null
              let cursorPos = 0

              // Walk backward from nextSib to find a real text node
              let checkPrev: Node | null = nextSib ? nextSib.previousSibling : parent.lastChild
              while (checkPrev && checkPrev.nodeType === Node.TEXT_NODE && (checkPrev.textContent || "").length === 0) {
                const toRemove = checkPrev
                checkPrev = checkPrev.previousSibling
                toRemove.parentNode?.removeChild(toRemove)
              }

              if (checkPrev && checkPrev.nodeType === Node.TEXT_NODE) {
                cursorNode = checkPrev
                cursorPos = (checkPrev as Text).length
              } else if (nextSib && nextSib.nodeType === Node.TEXT_NODE && (nextSib.textContent || "").length > 0) {
                cursorNode = nextSib
                cursorPos = 0
              } else {
                // Find any text node after badge position
                let checkNext: Node | null = nextSib
                while (checkNext) {
                  if (checkNext.nodeType === Node.TEXT_NODE && (checkNext.textContent || "").length > 0) {
                    cursorNode = checkNext
                    cursorPos = 0
                    break
                  }
                  checkNext = checkNext.nextSibling
                }
              }

              if (!cursorNode) {
                // No text node found — create one
                const tn = document.createTextNode("")
                if (nextSib) parent.insertBefore(tn, nextSib)
                else parent.appendChild(tn)
                cursorNode = tn
                cursorPos = 0
              }

              newRange.setStart(cursorNode, cursorPos)
              newRange.collapse(true)
              sel.removeAllRanges()
              sel.addRange(newRange)

              const content = extractContent(el)
              lastValueRef.current = content
              onChange(content)
              return
            }
          }

          // No badge to delete — ensure cursor is in text node for normal behavior
          moveCursorToTextNode(el)
        }
      }

      // ── Cmd+ArrowLeft / Cmd+ArrowRight (Mac Home/End) ──
      // On Mac, Cmd+Left/Right = line start/end. Treat them like Home/End.
      const isMacHome = e.key === "ArrowLeft" && e.metaKey && !e.shiftKey
      const isMacEnd = e.key === "ArrowRight" && e.metaKey && !e.shiftKey
      if ((isMacHome || isMacEnd) && el) {
        e.preventDefault()
        const content = extractContent(el)
        const cursorOffset = getCursorCharOffset(el)
        if (isMacHome) {
          const lineStart = content.lastIndexOf("\n", cursorOffset - 1) + 1
          setCursorAtCharOffset(el, lineStart)
        } else {
          let lineEnd = content.indexOf("\n", cursorOffset)
          if (lineEnd === -1) lineEnd = content.length
          setCursorAtCharOffset(el, lineEnd)
        }
        return
      }

      // ── ArrowLeft / ArrowRight near badges ──
      // Use character-offset approach (same as Home/End) to reliably hop over badges.
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && !e.ctrlKey && !e.metaKey && el) {
        const content = extractContent(el)
        const cursorOffset = getCursorCharOffset(el)

        if (e.key === "ArrowLeft" && cursorOffset > 0) {
          // Check if text right before cursor ends with a {{var}} pattern
          const before = content.substring(0, cursorOffset)
          const match = before.match(/\{\{(\w+(?:\.\w+)*)\}\}$/)
          if (match) {
            e.preventDefault()
            setCursorAtCharOffset(el, cursorOffset - match[0].length)
            return
          }
        } else if (e.key === "ArrowRight" && cursorOffset < content.length) {
          // Check if text right after cursor starts with a {{var}} pattern
          const after = content.substring(cursorOffset)
          const match = after.match(/^\{\{(\w+(?:\.\w+)*)\}\}/)
          if (match) {
            e.preventDefault()
            setCursorAtCharOffset(el, cursorOffset + match[0].length)
            return
          }
        }
      }

      // ── End / Home keys: ensure cursor lands in a text node near badges ──
      if ((e.key === "End" || e.key === "Home") && !e.shiftKey && el) {
        e.preventDefault()
        // Manually compute line start/end using extractContent and character offsets
        const content = extractContent(el)
        const cursorOffset = getCursorCharOffset(el)

        if (e.key === "Home") {
          // Find start of current line
          const lineStart = content.lastIndexOf("\n", cursorOffset - 1) + 1
          setCursorAtCharOffset(el, lineStart)
        } else {
          // Find end of current line
          let lineEnd = content.indexOf("\n", cursorOffset)
          if (lineEnd === -1) lineEnd = content.length
          setCursorAtCharOffset(el, lineEnd)
        }
      }
    },
    [paletteItemCount, filteredFormats, filteredVariables, insertVariable, applyFormat, onChange, setSlashMenuOpen, setSelectedIdx],
  )

  // ── onKeyUp / onMouseUp / onBlur ──

  const handleKeyUp = useCallback(() => {
    if (isComposingRef.current) return // Don't interfere during IME
    saveEditorSelection(elRef.current)
    updateBubble()
  }, [updateBubble])

  const handleMouseUp = useCallback(() => {
    saveEditorSelection(elRef.current)
    updateBubble()
  }, [updateBubble])

  const handleBlur = useCallback(() => {
    saveEditorSelection(elRef.current)
    setShowBubble(false)
  }, [])

  const handleCompositionStart = useCallback(() => { isComposingRef.current = true }, [])
  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    // Composition is finished — extract content and notify so live preview updates.
    // Do NOT touch the DOM (no applyBadges, no innerHTML reset) to avoid
    // disrupting any immediately-following composition.
    const el = elRef.current
    if (!el) return
    const content = extractContent(el)
    lastValueRef.current = content
    onChange(content)
  }, [onChange])

  // ── Drag-and-drop ──

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("application/x-prompt-variable")) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "copy"
        if (!isDragOver) setIsDragOver(true)
      }
    },
    [isDragOver],
  )

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const variableName = e.dataTransfer.getData("application/x-prompt-variable")
      if (!variableName) return

      const el = elRef.current
      if (!el) return
      const badge = makeBadge(variableName)

      // Find drop position
      let dropRange: Range | null = null
      if (document.caretRangeFromPoint) {
        dropRange = document.caretRangeFromPoint(e.clientX, e.clientY)
      }

      const sel = window.getSelection()
      if (dropRange && sel) {
        sel.removeAllRanges()
        sel.addRange(dropRange)
        dropRange.deleteContents()
        dropRange.insertNode(badge)
      } else {
        el.appendChild(badge)
      }

      placeCursorAfterBadge(badge)

      el.focus()
      const newContent = extractContent(el)
      lastValueRef.current = newContent
      onChange(newContent)
      if (onHistoryPush) onHistoryPush()
    },
    [makeBadge, onChange, onHistoryPush, placeCursorAfterBadge],
  )

  // ── Slash menu callbacks (for CommandPalette onSelectFormat / onSelectVariable) ──

  const handleSelectFormat = useCallback(
    (type: FormatType) => {
      applyFormat(type)
      setSlashMenuOpen(false)
      setSlashFilter("")
      // Remove slash from editor
      const el = elRef.current
      const sel = window.getSelection()
      if (el && sel && sel.rangeCount) {
        const range = sel.getRangeAt(0)
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          const text = range.startContainer.textContent || ""
          const slashIdx = text.lastIndexOf("/", range.startOffset - 1)
          if (slashIdx !== -1) {
            range.startContainer.textContent =
              text.substring(0, slashIdx) + text.substring(range.startOffset)
            range.setStart(range.startContainer, slashIdx)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        }
      }
    },
    [applyFormat, setSlashMenuOpen],
  )

  const handleSelectVariable = useCallback(
    (variable: Variable) => {
      insertVariable(variable.name)
    },
    [insertVariable],
  )

  // ── Return ──

  return {
    elRef,
    // Content helpers
    toHTML,
    extractContent,
    makeBadge,
    // Handlers for the contenteditable div
    handleInput,
    handleKeyDown,
    handleKeyUp,
    handleMouseUp,
    handleBlur,
    handleCompositionStart,
    handleCompositionEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    // Formatting
    applyFormat,
    insertVariable,
    // Slash menu
    showSlashMenu,
    slashFilter,
    slashPosition,
    selectedIndex,
    setSelectedIndex,
    filteredFormats,
    filteredVariables,
    allSearchableVariables,
    paletteItemCount,
    handleSelectFormat,
    handleSelectVariable,
    // Toolbar
    showToolbar,
    setShowToolbar,
    isFloating,
    setIsFloating,
    showBubble,
    bubblePosition,
    // Drag
    isDragOver,
  }
}

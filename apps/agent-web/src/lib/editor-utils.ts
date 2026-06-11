/**
 * Shared utilities for all contenteditable editors (text-block, variable-textarea, message-editor).
 *
 * Centralises badge rendering, content extraction, and cursor management
 * so every editor behaves identically.
 */

// ── Badge styling ──────────────────────────────────────────────────────────

export const BADGE_CSS =
  "display:inline-flex;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;font-family:ui-monospace,monospace;user-select:all;cursor:default;margin:0 1px;vertical-align:baseline;line-height:1.6"

// ── Variable lookup helper ─────────────────────────────────────────────────

export interface BadgeVariable {
  name: string
  color?: string
  bgColor?: string
}

function findVariable(name: string, vars: BadgeVariable[]): BadgeVariable | undefined {
  return vars.find((v) => v.name === name) ?? vars.find((v) => v.name === name.split(".")[0])
}

// ── toHTML ──────────────────────────────────────────────────────────────────

/** Convert plain text (with `{{var}}` patterns) to innerHTML with coloured badge spans. */
export function toHTML(text: string, variables: BadgeVariable[]): string {
  return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, name: string) => {
    const matched = findVariable(name, variables)
    const color = matched?.color || "#9ca3af"
    const bg = matched?.bgColor || "#9ca3af20"
    return `<span contenteditable="false" data-var="${name}" style="${BADGE_CSS};background:${bg};color:${color}">{{${name}}}</span>`
  })
}

// ── extractContent ─────────────────────────────────────────────────────────

/** Walk the DOM tree and convert back to plain text (`{{var}}` for badges, `\n` for `<br>`). */
export function extractContent(el: HTMLElement): string {
  let result = ""
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || ""
    } else if (node instanceof HTMLElement) {
      if (node.dataset.var) result += `{{${node.dataset.var}}}`
      else if (node.tagName === "BR" && !node.hasAttribute("data-sentinel")) result += "\n"
      else if (node.tagName !== "BR") result += extractContent(node)
    }
  })
  // Browser leaves a single <br> as placeholder in empty contenteditable.
  // Treat it as empty rather than "\n".
  if (result === "\n" && el.childNodes.length === 1 &&
      el.firstChild instanceof HTMLElement && el.firstChild.tagName === "BR") {
    return ""
  }
  return result
}

// ── makeBadge ──────────────────────────────────────────────────────────────

/** Create a badge `<span>` DOM element for a variable. */
export function makeBadge(varName: string, variables: BadgeVariable[]): HTMLSpanElement {
  const matched = findVariable(varName, variables)
  const color = matched?.color || "#9ca3af"
  const bg = matched?.bgColor || "#9ca3af20"
  const badge = document.createElement("span")
  badge.contentEditable = "false"
  badge.dataset.var = varName
  badge.style.cssText = `${BADGE_CSS};background:${bg};color:${color}`
  badge.textContent = `{{${varName}}}`
  return badge
}

// ── Cursor utilities ───────────────────────────────────────────────────────

/**
 * Get the cursor's character offset inside a contenteditable element.
 * Badges count as their `{{name}}` text length.
 */
export function getCursorCharOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const range = sel.getRangeAt(0)
  let cursorOffset = 0

  const walk = (node: Node): boolean => {
    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        cursorOffset += range.startOffset
      } else {
        for (let i = 0; i < range.startOffset && i < node.childNodes.length; i++) {
          const child = node.childNodes[i]
          if (child.nodeType === Node.TEXT_NODE) {
            cursorOffset += child.textContent?.length || 0
          } else if (child instanceof HTMLElement && child.dataset.var) {
            cursorOffset += `{{${child.dataset.var}}}`.length
          } else if (child instanceof HTMLElement && child.tagName === "BR") {
            cursorOffset += 1
          }
        }
      }
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      cursorOffset += node.textContent?.length || 0
    } else if (node instanceof HTMLElement && node.dataset.var) {
      cursorOffset += `{{${node.dataset.var}}}`.length
    } else if (node instanceof HTMLElement && node.tagName === "BR") {
      cursorOffset += 1
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true
      }
    }
    return false
  }
  walk(el)
  return cursorOffset
}

/**
 * Calculate the character offset (in extractContent terms) of a specific
 * DOM point (container + offset). Used to map a Selection anchor/focus to
 * the plain-text character position.
 */
export function getCharOffsetOfPoint(el: HTMLElement, targetContainer: Node, targetOffset: number): number {
  let charOffset = 0

  const walk = (node: Node): boolean => {
    if (node === targetContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        charOffset += targetOffset
      } else {
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          const child = node.childNodes[i]
          if (child.nodeType === Node.TEXT_NODE) {
            charOffset += child.textContent?.length || 0
          } else if (child instanceof HTMLElement && child.dataset.var) {
            charOffset += `{{${child.dataset.var}}}`.length
          } else if (child instanceof HTMLElement && child.tagName === "BR") {
            charOffset += 1
          }
        }
      }
      return true
    }
    if (node.nodeType === Node.TEXT_NODE) {
      charOffset += node.textContent?.length || 0
    } else if (node instanceof HTMLElement && node.dataset.var) {
      charOffset += `{{${node.dataset.var}}}`.length
    } else if (node instanceof HTMLElement && node.tagName === "BR") {
      charOffset += 1
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true
      }
    }
    return false
  }
  walk(el)
  return charOffset
}

/**
 * Set the cursor at a character offset inside a contenteditable element.
 * Automatically places the cursor after badges when the offset falls within one.
 */
export function setCursorAtCharOffset(el: HTMLElement, targetOffset: number): void {
  const sel = window.getSelection()
  if (!sel) return
  const newRange = document.createRange()
  let charCount = 0
  let found = false

  const walk = (node: Node): boolean => {
    if (found) return true

    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLen = node.textContent?.length || 0
      if (charCount + nodeLen >= targetOffset) {
        const offset = Math.min(targetOffset - charCount, nodeLen)
        newRange.setStart(node, offset)
        newRange.collapse(true)
        found = true
        return true
      }
      charCount += nodeLen
    } else if (node instanceof HTMLElement && node.dataset.var) {
      const varLen = `{{${node.dataset.var}}}`.length
      if (charCount + varLen >= targetOffset) {
        // Place cursor right after the badge
        let next = node.nextSibling
        if (!next || next.nodeType !== Node.TEXT_NODE) {
          next = document.createTextNode("")
          node.parentNode!.insertBefore(next, node.nextSibling)
        }
        newRange.setStart(next, 0)
        newRange.collapse(true)
        found = true
        return true
      }
      charCount += varLen
    } else if (node instanceof HTMLElement && node.tagName === "BR") {
      if (charCount + 1 >= targetOffset) {
        const next = node.nextSibling
        if (next && next.nodeType === Node.TEXT_NODE) {
          newRange.setStart(next, 0)
        } else {
          newRange.setStartAfter(node)
        }
        newRange.collapse(true)
        found = true
        return true
      }
      charCount += 1
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true
      }
    }
    return false
  }

  if (!walk(el)) {
    // targetOffset is at or past the end — place cursor at the very end
    const lastChild = el.lastChild
    if (lastChild && lastChild.nodeType === Node.TEXT_NODE) {
      newRange.setStart(lastChild, (lastChild as Text).length)
    } else if (lastChild instanceof HTMLElement && lastChild.dataset.var) {
      // Last node is a badge — ensure text node after it
      let tn = lastChild.nextSibling
      if (!tn || tn.nodeType !== Node.TEXT_NODE) {
        tn = document.createTextNode("")
        el.appendChild(tn)
      }
      newRange.setStart(tn, 0)
    } else {
      // Fallback: create text node at end
      const tn = document.createTextNode("")
      el.appendChild(tn)
      newRange.setStart(tn, 0)
    }
    newRange.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(newRange)
}

// ── moveCursorToTextNode ──────────────────────────────────────────────────

/**
 * When the browser leaves the cursor at an element-level position (not inside
 * any text node), key presses like Enter / Space / Backspace silently fail.
 *
 * This function nudges the cursor into a neighbouring text node — or creates
 * an empty one — so the next key press works.
 *
 * IMPORTANT: Only call this synchronously right before an action that needs it
 * (Enter, manual BR insertion). Do NOT call during IME composition or in
 * handleInput / handleKeyUp, as that breaks Korean / CJK input.
 */
export function moveCursorToTextNode(el: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return
  // Already in a text node — nothing to do
  if (range.startContainer.nodeType === Node.TEXT_NODE) return

  const container = range.startContainer as HTMLElement
  if (!el.contains(container) && container !== el) return

  const offset = range.startOffset
  const nodeAfter = container.childNodes[offset] ?? null
  const nodeBefore = offset > 0 ? container.childNodes[offset - 1] : null

  // Prefer finding an existing text node to avoid polluting the DOM
  let textNode: Text | null = null
  let pos: number = 0

  if (nodeBefore?.nodeType === Node.TEXT_NODE) {
    textNode = nodeBefore as Text
    pos = textNode.length
  } else if (nodeBefore && nodeBefore.nextSibling?.nodeType === Node.TEXT_NODE) {
    textNode = nodeBefore.nextSibling as Text
    pos = 0
  } else if (nodeAfter?.nodeType === Node.TEXT_NODE) {
    textNode = nodeAfter as Text
    pos = 0
  } else {
    // Must create an empty text node
    textNode = document.createTextNode("")
    if (nodeAfter) {
      container.insertBefore(textNode, nodeAfter)
    } else {
      container.appendChild(textNode)
    }
    pos = 0
  }

  const fixed = document.createRange()
  fixed.setStart(textNode, pos)
  fixed.collapse(true)
  sel.removeAllRanges()
  sel.addRange(fixed)
}

// ── insertBR ──────────────────────────────────────────────────────────────

/**
 * Manually insert a `<br>` at the current cursor position and move the cursor
 * right after it. This replaces `document.execCommand("insertLineBreak")`
 * which behaves inconsistently across browsers, especially near non-editable
 * badge elements.
 */
export function insertBR(el: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return

  // Remove any existing sentinel BRs first
  el.querySelectorAll("br[data-sentinel]").forEach((s) => s.remove())

  // First ensure we're in a text node
  moveCursorToTextNode(el)

  const range = sel.getRangeAt(0)
  range.deleteContents()

  const br = document.createElement("br")

  // Helper: check if a node and everything after it is invisible (empty text only)
  const hasVisibleContentAfter = (node: Node | null): boolean => {
    let n = node
    while (n) {
      if (n.nodeType === Node.TEXT_NODE && (n.textContent || "").length > 0) return true
      if (n instanceof HTMLElement && (n.dataset.var || n.tagName !== "BR")) return true
      n = n.nextSibling
    }
    return false
  }

  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer as Text
    const offset = range.startOffset
    const text = textNode.textContent || ""

    // Split text node at cursor position
    const before = text.substring(0, offset)
    const after = text.substring(offset)

    textNode.textContent = before
    const parent = textNode.parentNode!

    // Insert BR after the text node
    parent.insertBefore(br, textNode.nextSibling)

    // Create text node for text after cursor (even if empty, for cursor placement)
    const afterNode = document.createTextNode(after)
    parent.insertBefore(afterNode, br.nextSibling)

    // If nothing visible after the BR, add a sentinel BR so the line break is visible.
    // (Browsers swallow a trailing <br> with no visible content after it.)
    if (!hasVisibleContentAfter(afterNode)) {
      const sentinel = document.createElement("br")
      sentinel.setAttribute("data-sentinel", "true")
      parent.insertBefore(sentinel, afterNode.nextSibling)
    }

    // Place cursor at start of afterNode
    const newRange = document.createRange()
    newRange.setStart(afterNode, 0)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    // Element-level cursor — insert BR at child offset
    const container = range.startContainer
    const refNode = container.childNodes[range.startOffset] ?? null
    container.insertBefore(br, refNode)

    // Create a text node after BR for cursor
    const afterNode = document.createTextNode("")
    container.insertBefore(afterNode, br.nextSibling)

    // Sentinel if needed
    if (!hasVisibleContentAfter(afterNode)) {
      const sentinel = document.createElement("br")
      sentinel.setAttribute("data-sentinel", "true")
      container.insertBefore(sentinel, afterNode.nextSibling)
    }

    const newRange = document.createRange()
    newRange.setStart(afterNode, 0)
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  }
}

// ── applyBadges ────────────────────────────────────────────────────────────

/**
 * Detect raw `{{variable}}` text typed by the user (NOT already-rendered
 * badges) and convert to coloured badge spans, preserving cursor position.
 *
 * Only triggers when a TEXT NODE contains a raw `{{var}}` pattern. Already
 * rendered `<span data-var>` elements are ignored, so this does NOT
 * rebuild the DOM on every keystroke.
 */
export function applyBadges(
  el: HTMLElement,
  _variables: BadgeVariable[],
  toHTMLFn: (text: string) => string,
): void {
  // Walk only TEXT nodes that are NOT inside a badge span (contenteditable=false data-var).
  // Badge spans contain "{{name}}" as their display text — we must not treat that as
  // a raw user-typed pattern, or we'd rebuild innerHTML every time a badge exists.
  let hasRaw = false
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    // Skip text nodes that live inside a badge span
    let parent = n.parentNode
    let insideBadge = false
    while (parent && parent !== el) {
      if (parent instanceof HTMLElement && parent.dataset.var) { insideBadge = true; break }
      parent = parent.parentNode
    }
    if (insideBadge) continue
    if (/\{\{\w+(?:\.\w+)*\}\}/.test(n.textContent || "")) {
      hasRaw = true
      break
    }
  }
  if (!hasRaw) return

  const content = extractContent(el)

  // Save cursor as character offset
  const cursorOffset = getCursorCharOffset(el)

  // Re-render with badges
  el.innerHTML = toHTMLFn(content.replace(/\n/g, "<br>")) || ""
  el.focus()

  // Restore cursor
  setCursorAtCharOffset(el, cursorOffset)
}

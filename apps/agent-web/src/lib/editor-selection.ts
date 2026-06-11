/**
 * Global selection store for contenteditable editors.
 *
 * Editors call saveEditorSelection() on blur / mouseup / keyup so we always
 * have the latest caret position.  Variable panels call insertVariableAtCursor()
 * on click — no need to prevent mousedown on the chip (which would break drag).
 */

const BADGE_CSS = [
  "display:inline-flex",
  "padding:1px 8px",
  "border-radius:6px",
  "font-size:12px",
  "font-weight:600",
  "font-family:ui-monospace,monospace",
  "letter-spacing:0.3px",
  "user-select:all",
  "cursor:default",
  "margin:0 2px",
  "vertical-align:baseline",
  "line-height:1.7",
].join(";")

interface SavedSel {
  el: HTMLElement
  range: Range
}

let _saved: SavedSel | null = null

/** Call this in onBlur / onMouseUp / onKeyUp of any contenteditable editor */
export function saveEditorSelection(el: HTMLElement | null): void {
  if (!el) return
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  if (el.contains(range.startContainer)) {
    _saved = { el, range: range.cloneRange() }
  }
}

/**
 * Insert a variable badge at the last saved cursor position.
 * Returns true when insertion succeeded.
 * After inserting, focus is returned to the editor.
 */
export function insertVariableAtCursor(
  variableName: string,
  color: string,
  bgColor: string
): boolean {
  if (!_saved) return false
  const { el, range } = _saved

  // Editor may have been unmounted
  if (!document.body.contains(el)) {
    _saved = null
    return false
  }

  // Return focus to the editor and restore the saved caret
  el.focus()
  const sel = window.getSelection()
  if (sel) {
    sel.removeAllRanges()
    try {
      sel.addRange(range)
    } catch {
      _saved = null
      return false
    }
  }

  // Build badge span
  const badge = document.createElement("span")
  badge.contentEditable = "false"
  badge.dataset.var = variableName
  badge.style.cssText = `${BADGE_CSS};background:${bgColor};color:${color}`
  badge.textContent = `{{${variableName}}}`

  // Replace selected text (if any) and insert badge
  try {
    range.deleteContents()
    range.insertNode(badge)
  } catch {
    _saved = null
    return false
  }

  // Move caret to just after the badge
  const newRange = document.createRange()
  newRange.setStartAfter(badge)
  newRange.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(newRange)

  // Update saved position so consecutive inserts work
  _saved.range = newRange.cloneRange()

  // Notify the React onInput handler so the store gets updated
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }))

  // Re-apply focus after React finishes its re-render.
  // React 18 batches state updates; the re-render runs after the current
  // call stack, so we need a rAF to ensure focus survives the reconcile.
  const targetEl = el
  const focusRange = newRange.cloneRange()
  requestAnimationFrame(() => {
    if (!document.body.contains(targetEl)) return
    targetEl.focus()
    const s = window.getSelection()
    if (s) {
      s.removeAllRanges()
      try { s.addRange(focusRange) } catch { /* stale range is OK */ }
    }
  })

  return true
}

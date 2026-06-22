export type DoubleShiftOptions = {
  windowMs: number
  now?: () => number
  isFocusExempt?: (target: EventTarget | null) => boolean
}

export function createDoubleShiftHandler(
  callback: () => void,
  options: DoubleShiftOptions,
): (e: KeyboardEvent) => void {
  const now = options.now ?? Date.now
  let lastShiftAt = 0
  return (e) => {
    if (e.key !== 'Shift') {
      lastShiftAt = 0
      return
    }
    if (e.repeat) return
    if (options.isFocusExempt?.(e.target)) return
    const ts = now()
    if (lastShiftAt !== 0 && ts - lastShiftAt <= options.windowMs) {
      lastShiftAt = 0
      callback()
    } else {
      lastShiftAt = ts
    }
  }
}

export function handleEscapeKey(
  e: KeyboardEvent,
  root: ShadowRoot,
  onClose: () => void,
  editorRoot?: ShadowRoot | Document,
): void {
  if (e.key !== 'Escape') return
  if (editorRoot?.querySelector('.gm-sp-editor-dialog')) return
  if (isEditableTarget(e.target)) return
  const active = root.activeElement
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
  e.stopPropagation()
  onClose()
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target) return false
  const t = target as { tagName?: unknown; getAttribute?: (n: string) => string | null }
  const tag = typeof t.tagName === 'string' ? t.tagName : null
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (typeof t.getAttribute === 'function') {
    const ce = t.getAttribute('contenteditable')
    if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true
  }
  return false
}

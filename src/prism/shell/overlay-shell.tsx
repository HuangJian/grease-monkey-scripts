import { useLayoutEffect } from 'preact/hooks'
import { handleEscapeKey } from '../shortcut'

export type OverlayShellProps = {
  root: ShadowRoot
  document: Document
  onClose: () => void
}

export function OverlayShell({ root, document: doc, onClose }: OverlayShellProps) {
  useLayoutEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      handleEscapeKey(e, root, onClose, root)
    }
    const stopKeyboardLeak = (e: Event) => {
      const target = e.target as Element | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') e.stopPropagation()
    }
    doc.addEventListener('keydown', onKeydown, { capture: true })
    root.addEventListener('keydown', stopKeyboardLeak)
    root.addEventListener('keyup', stopKeyboardLeak)
    return () => {
      doc.removeEventListener('keydown', onKeydown, { capture: true })
      root.removeEventListener('keydown', stopKeyboardLeak)
      root.removeEventListener('keyup', stopKeyboardLeak)
    }
  }, [root, doc, onClose])
  return null
}

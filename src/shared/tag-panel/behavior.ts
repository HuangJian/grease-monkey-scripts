import type { Runtime } from '../../runtime'

let closePanelHandler: (() => void) | null = null

export function closeTagPanel(runtime: Runtime): void {
  closePanelHandler?.()
  closePanelHandler = null
  runtime.document.querySelector('.gm-tag-panel')?.remove()
}

export function registerOutsideClick(
  runtime: Runtime,
  panel: HTMLElement,
  btnSelector: string,
): void {
  const handler = (e: MouseEvent) => {
    if ((e.target as Element).closest(`.${btnSelector}`)) return
    if (!panel.contains(e.target as Node)) {
      closeTagPanel(runtime)
    }
  }
  closePanelHandler = () => {
    runtime.document.removeEventListener('mousedown', handler)
  }
  setTimeout(() => {
    if (!closePanelHandler) return
    runtime.document.addEventListener('mousedown', handler)
  }, 0)
}

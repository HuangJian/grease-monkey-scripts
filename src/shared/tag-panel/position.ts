import type { Runtime } from '../../runtime'

export function positionPanel(runtime: Runtime, panel: HTMLElement, triggerBtn: Element): void {
  const rect = triggerBtn.getBoundingClientRect()
  panel.style.position = 'fixed'
  panel.style.top = `${rect.bottom + 4}px`
  panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`
}

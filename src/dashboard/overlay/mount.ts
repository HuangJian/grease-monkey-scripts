import { OVERLAY_CSS } from './styles'

export type OverlayHandle = {
  root: ShadowRoot
  backdrop: HTMLElement
  modal: HTMLElement
  cards: HTMLElement
  unmount: () => void
}

// closed Shadow DOM blocks host.shadowRoot in real browsers. We keep a
// side-table so tests can still assert on rendered content; production code
// uses the root reference returned by mountOverlay() and never reads this.
const roots = new WeakMap<HTMLElement, ShadowRoot>()

export function getMountedRoot(host: HTMLElement): ShadowRoot | null {
  return roots.get(host) ?? null
}

export function mountOverlay(document: Document): OverlayHandle {
  const host = document.createElement('div')
  host.id = 'gm-dashboard'
  const root = host.attachShadow({ mode: 'closed' })
  roots.set(host, root)
  const style = document.createElement('style')
  style.textContent = OVERLAY_CSS
  root.appendChild(style)
  const backdrop = document.createElement('div')
  backdrop.className = 'gm-sp-backdrop'
  const modal = document.createElement('div')
  modal.className = 'gm-sp-modal'
  const cards = document.createElement('div')
  cards.className = 'gm-sp-cards'
  modal.appendChild(cards)
  backdrop.appendChild(modal)
  root.appendChild(backdrop)
  document.body.appendChild(host)
  return {
    root,
    backdrop,
    modal,
    cards,
    unmount: () => host.remove(),
  }
}

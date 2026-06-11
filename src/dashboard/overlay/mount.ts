import { OVERLAY_CSS } from './styles'

export type OverlayHandle = {
  root: ShadowRoot
  backdrop: HTMLElement
  modal: HTMLElement
  closeBtn: HTMLElement
  mainCards: HTMLElement
  sideCards: HTMLElement
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
  root.innerHTML = `<style>${OVERLAY_CSS}</style>
    <div class="gm-sp-backdrop">
      <div class="gm-sp-modal">
        <button type="button" class="gm-sp-corner-close" aria-label="close">×</button>
        <div class="gm-sp-cards">
          <div class="gm-sp-cards-main"></div>
          <div class="gm-sp-cards-side"></div>
        </div>
      </div>
    </div>`
  const backdrop = root.querySelector('.gm-sp-backdrop')!
  const modal = root.querySelector('.gm-sp-modal')!
  const closeBtn = root.querySelector('.gm-sp-corner-close')!
  const mainCards = root.querySelector('.gm-sp-cards-main')!
  const sideCards = root.querySelector('.gm-sp-cards-side')!
  document.body.appendChild(host)
  return {
    root,
    backdrop: backdrop as HTMLElement,
    modal: modal as HTMLElement,
    closeBtn: closeBtn as HTMLElement,
    mainCards: mainCards as HTMLElement,
    sideCards: sideCards as HTMLElement,
    unmount: () => host.remove(),
  }
}

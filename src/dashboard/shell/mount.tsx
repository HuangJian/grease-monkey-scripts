import { useLayoutEffect, useRef } from 'preact/hooks'
import { OVERLAY_CSS } from '../overlay/styles'
import { render } from 'preact'
import { OverlayShell } from './overlay-shell'

export type OverlayHandle = {
  root: ShadowRoot
  backdrop: HTMLElement
  modal: HTMLElement
  closeBtn: HTMLElement
  mainCards: HTMLElement
  sideCards: HTMLElement
  unmount: () => void
}

const roots = new WeakMap<HTMLElement, ShadowRoot>()

export function getMountedRoot(host: HTMLElement): ShadowRoot | null {
  return roots.get(host) ?? null
}

type OverlayHandleRef = { current: OverlayHandle | null }

type OverlayMountProps = {
  host: HTMLDivElement
  handleRef: OverlayHandleRef
  root: ShadowRoot
  onClose?: () => void
}

function OverlayMount({ host, handleRef, root, onClose }: OverlayMountProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const mainCardsRef = useRef<HTMLDivElement>(null)
  const sideCardsRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    roots.set(host, root)
    handleRef.current = {
      root,
      backdrop: backdropRef.current!,
      modal: modalRef.current!,
      closeBtn: closeBtnRef.current!,
      mainCards: mainCardsRef.current!,
      sideCards: sideCardsRef.current!,
      unmount: () => host.remove(),
    }
  }, [])

  return (
    <div ref={containerRef}>
      {onClose && <OverlayShell root={root} document={host.ownerDocument} onClose={onClose} />}
      <style>{OVERLAY_CSS}</style>
      <div class="gm-sp-backdrop" ref={backdropRef}>
        <div class="gm-sp-modal" ref={modalRef}>
          <button type="button" class="gm-sp-corner-close" ref={closeBtnRef} aria-label="close">
            ×
          </button>
          <div class="gm-sp-cards">
            <div class="gm-sp-cards-main" ref={mainCardsRef}></div>
            <div class="gm-sp-cards-side" ref={sideCardsRef}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function mountOverlay(document: Document, onClose?: () => void): OverlayHandle {
  const host = document.createElement('div')
  host.id = 'gm-dashboard'
  const root = host.attachShadow({ mode: 'closed' })
  const handleRef: OverlayHandleRef = { current: null }
  render(<OverlayMount host={host} handleRef={handleRef} root={root} onClose={onClose} />, root)
  document.body.appendChild(host)
  return handleRef.current!
}

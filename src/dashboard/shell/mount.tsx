import { useLayoutEffect, useRef } from 'preact/hooks'
import { render } from 'preact'
import type { Runtime } from '../../runtime'
import { OverlayShell } from './overlay-shell'
import {
  buildExportData,
  downloadJson,
  readImportFile,
  validateImportData,
  applyImportData,
  formatExportFilename,
} from '../export-import'

export const CSS_TO_BE_INJECTED = '/* overlay css placeholder */'

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
  runtime: Runtime
  onClose?: () => void
}

function OverlayMount({ host, handleRef, root, runtime, onClose }: OverlayMountProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const mainCardsRef = useRef<HTMLDivElement>(null)
  const sideCardsRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleExport = (): void => {
    void buildExportData(runtime).then((data) => {
      downloadJson(data, formatExportFilename())
    })
  }

  const handleImport = (): void => {
    const input = fileInputRef.current
    if (!input) return
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      void readImportFile(file)
        .then((raw) => {
          const validation = validateImportData(raw)
          if (!validation.ok) {
            window.alert(validation.error)
            return
          }
          return applyImportData(runtime, raw as Record<string, unknown>)
        })
        .then(() => {
          window.alert('导入成功，刷新页面后生效。')
        })
        .catch((e: Error) => {
          window.alert('导入失败：' + (e.message ?? String(e)))
        })
      input.value = ''
    }
    input.click()
  }

  return (
    <div ref={containerRef}>
      {onClose && <OverlayShell root={root} document={host.ownerDocument} onClose={onClose} />}
      <style>{CSS_TO_BE_INJECTED}</style>
      <div class="gm-sp-backdrop" ref={backdropRef}>
        <div class="gm-sp-modal" ref={modalRef}>
          <div class="gm-sp-corner-actions">
            <div class="gm-sp-corner-kebab" aria-label="menu">
              <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                <circle cx="8" cy="4" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="8" cy="12" r="1.5" />
              </svg>
            </div>
            <div class="gm-sp-corner-actions-group">
              <button
                type="button"
                class="gm-sp-corner-btn gm-sp-corner-btn-close"
                ref={closeBtnRef}
                aria-label="close"
                onClick={() => onClose?.()}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  width="12"
                  height="12"
                >
                  <line x1="4" y1="4" x2="12" y2="12" />
                  <line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
              <button
                type="button"
                class="gm-sp-corner-btn gm-sp-corner-btn-action"
                aria-label="export"
                onClick={handleExport}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="12"
                  height="12"
                >
                  <path d="M8 2v8M4 7l4 4 4-4M3 12h10" />
                </svg>
              </button>
              <button
                type="button"
                class="gm-sp-corner-btn gm-sp-corner-btn-action"
                aria-label="import"
                onClick={handleImport}
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  width="12"
                  height="12"
                >
                  <path d="M8 10V2M4 7l4-4 4 4M3 12h10" />
                </svg>
              </button>
            </div>
          </div>
          <input type="file" accept=".json" ref={fileInputRef} style="display:none" />
          <div class="gm-sp-cards">
            <div class="gm-sp-cards-main" ref={mainCardsRef}></div>
            <div class="gm-sp-cards-side" ref={sideCardsRef}></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function mountOverlay(
  document: Document,
  runtime: Runtime,
  onClose?: () => void,
): OverlayHandle {
  const host = document.createElement('div')
  host.id = 'gm-dashboard'
  const root = host.attachShadow({ mode: 'closed' })
  const handleRef: OverlayHandleRef = { current: null }
  render(
    <OverlayMount
      host={host}
      handleRef={handleRef}
      root={root}
      runtime={runtime}
      onClose={onClose}
    />,
    root,
  )
  document.body.appendChild(host)
  return handleRef.current!
}

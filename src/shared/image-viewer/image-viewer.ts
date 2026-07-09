import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'

const OVERLAY_ID = 'gm-img-viewer'
const OPEN_TAB_KEY = 'Enter'

/** Known image-hosting domains. */
const IMAGE_HOST_RE =
  /(?:preview|i|external-preview)\.redd\.it|redditmedia\.com|i\.imgur\.com|imgur\.com/i

/** Common image file extensions. */
const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|bmp|svg|avif|ico)(?:\?|#|$)/i

/**
 * Default predicate: true if the URL points to a known image host or has an
 * image file extension.
 */
export function isImageUrl(href: string): boolean {
  return IMAGE_HOST_RE.test(href) || IMAGE_EXT_RE.test(href)
}

/**
 * Find the image-link ancestor of a click target.
 * Returns the `<a>` if it wraps an `<img>` and the href looks like an image.
 */
export function findImageLink(
  target: EventTarget | null,
  shouldIntercept: (href: string) => boolean = isImageUrl,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null
  const anchor = target.closest('a')
  if (!anchor) return null
  if (!anchor.querySelector('img')) return null
  const href = anchor.getAttribute('href') || ''
  if (!shouldIntercept(href)) return null
  return anchor as HTMLAnchorElement
}

export type ImageViewerOptions = {
  /**
   * Predicate to decide whether a clicked link's href should trigger the
   * viewer. Defaults to {@link isImageUrl}.
   */
  shouldIntercept?: (href: string) => boolean
}

/**
 * Set up the image popup viewer: intercepts clicks on image thumbnails and
 * shows a full-size overlay. Press `Enter` to open in a new tab, `Esc` to
 * close. Opening a new tab auto-closes the overlay.
 *
 * Returns a cleanup function that removes all listeners and the overlay.
 */
export function setupImageViewer(runtime: Runtime, options: ImageViewerOptions = {}): () => void {
  const shouldIntercept = options.shouldIntercept ?? isImageUrl
  let overlay: HTMLElement | null = null
  let currentUrl = ''

  function close(): void {
    overlay?.remove()
    overlay = null
    currentUrl = ''
    runtime.document.removeEventListener('keydown', onKeyDown)
  }

  function open(url: string): void {
    close()
    currentUrl = url
    runtime.document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="${OVERLAY_ID}" class="gm-img-overlay" role="dialog" aria-label="图片预览">
         <img class="gm-img-overlay__img" src="${escapeHtml(url)}" alt="">
         <div class="gm-img-overlay__hint">
           <span class="gm-img-overlay__action" data-action="open-tab" role="button" tabindex="0">新 tab 查看</span>
           <span class="gm-img-overlay__sep">·</span>
           <span><kbd>Enter</kbd> 新 tab</span>
           <span class="gm-img-overlay__sep">·</span>
           <span><kbd>Esc</kbd> 关闭</span>
         </div>
       </div>`,
    )
    overlay = runtime.document.getElementById(OVERLAY_ID)
    if (!overlay) return
    overlay.addEventListener('click', onOverlayClick)
    runtime.document.addEventListener('keydown', onKeyDown)
  }

  function onOverlayClick(e: MouseEvent): void {
    const el = e.target as HTMLElement
    // Click on backdrop (the overlay itself) closes
    if (e.target === e.currentTarget) {
      close()
      return
    }
    // Click on "open tab" action
    if (el.closest('[data-action="open-tab"]')) {
      runtime.openTab(currentUrl)
      close()
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === OPEN_TAB_KEY) {
      e.preventDefault()
      runtime.openTab(currentUrl)
      close()
    }
  }

  function onDocumentClick(e: MouseEvent): void {
    const anchor = findImageLink(e.target, shouldIntercept)
    if (!anchor) return
    const url = anchor.href
    if (!url) return
    e.preventDefault()
    e.stopPropagation()
    open(url)
  }

  // Capture phase: intercept before site's own handlers
  runtime.document.addEventListener('click', onDocumentClick, true)

  return () => {
    runtime.document.removeEventListener('click', onDocumentClick, true)
    close()
  }
}

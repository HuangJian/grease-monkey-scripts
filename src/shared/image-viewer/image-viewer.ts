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

/**
 * Find a bare `<img>` element from a click target (no `<a>` wrapper).
 * Returns the img if it matches the predicate.
 */
export function findBareImage(
  target: EventTarget | null,
  shouldInterceptImage: (img: HTMLImageElement) => boolean,
): HTMLImageElement | null {
  if (!(target instanceof Element)) return null
  if (target.tagName !== 'IMG') return null
  const img = target as HTMLImageElement
  if (!shouldInterceptImage(img)) return null
  return img
}

export type ImageViewerOptions = {
  /**
   * Predicate to decide whether a clicked link's href should trigger the
   * viewer. Defaults to {@link isImageUrl}.
   */
  shouldIntercept?: (href: string) => boolean
  /**
   * Predicate to decide whether a clicked bare `<img>` (not inside an `<a>`)
   * should trigger the viewer. When undefined, bare images are not intercepted.
   */
  shouldInterceptImage?: (img: HTMLImageElement) => boolean
  /**
   * Resolve the URL to display in the viewer for a bare `<img>` click.
   * Defaults to `img.currentSrc || img.src`.
   *
   * Useful when the thumbnail src differs from the full-size URL
   * (e.g. GIF static preview vs animated original).
   */
  resolveImageUrl?: (img: HTMLImageElement) => string
}

type ImageEntry = { element: Element; url: string }

/**
 * Set up the image popup viewer: intercepts clicks on image thumbnails and
 * shows a full-size overlay. Press `Enter` to open in a new tab, `Esc` to
 * close, `←`/`→` to navigate between images on the page. Opening a new tab
 * auto-closes the overlay.
 *
 * Returns a cleanup function that removes all listeners and the overlay.
 */
export function setupImageViewer(runtime: Runtime, options: ImageViewerOptions = {}): () => void {
  const shouldIntercept = options.shouldIntercept ?? isImageUrl
  const shouldInterceptImage = options.shouldInterceptImage
  const resolveImageUrl = options.resolveImageUrl ?? ((img) => img.currentSrc || img.src)
  let overlay: HTMLElement | null = null
  let currentUrl = ''
  let imageList: ImageEntry[] = []
  let currentIndex = -1

  /** Collect all eligible images on the page for gallery navigation. */
  function collectImages(): ImageEntry[] {
    const images: ImageEntry[] = []
    const seen = new Set<string>()

    runtime.document.querySelectorAll('a').forEach((el) => {
      const anchor = el as HTMLAnchorElement
      if (!anchor.querySelector('img')) return
      const href = anchor.getAttribute('href') || ''
      if (!shouldIntercept(href)) return
      const url = anchor.href
      if (!url || seen.has(url)) return
      seen.add(url)
      images.push({ element: anchor, url })
    })

    if (shouldInterceptImage) {
      runtime.document.querySelectorAll('img').forEach((el) => {
        const img = el as HTMLImageElement
        if (img.closest('a')) return
        if (!shouldInterceptImage(img)) return
        const url = resolveImageUrl(img)
        if (!url || seen.has(url)) return
        seen.add(url)
        images.push({ element: img, url })
      })
    }

    return images
  }

  function close(): void {
    overlay?.remove()
    overlay = null
    currentUrl = ''
    imageList = []
    currentIndex = -1
    runtime.document.removeEventListener('keydown', onKeyDown)
  }

  function showImage(index: number): void {
    if (index < 0 || index >= imageList.length) return
    currentIndex = index
    const entry = imageList[index]
    currentUrl = entry.url
    const imgEl = overlay?.querySelector('.gm-img-overlay__img') as HTMLImageElement | null
    if (imgEl) imgEl.src = entry.url
    updateNavState()
  }

  function navigate(delta: number): void {
    if (currentIndex < 0) return
    showImage(currentIndex + delta)
  }

  function updateNavState(): void {
    if (!overlay) return
    const prev = overlay.querySelector('[data-action="prev"]')
    const next = overlay.querySelector('[data-action="next"]')
    const counter = overlay.querySelector('.gm-img-overlay__counter')
    const hasNav = imageList.length > 1 && currentIndex >= 0
    prev?.classList.toggle('gm-img-overlay__nav--disabled', !hasNav || currentIndex <= 0)
    next?.classList.toggle(
      'gm-img-overlay__nav--disabled',
      !hasNav || currentIndex >= imageList.length - 1,
    )
    if (counter) {
      counter.textContent = hasNav ? `${currentIndex + 1} / ${imageList.length}` : ''
    }
  }

  function open(url: string, sourceElement?: Element): void {
    close()
    currentUrl = url

    imageList = collectImages()
    if (sourceElement) {
      currentIndex = imageList.findIndex((entry) => entry.element === sourceElement)
    }
    if (currentIndex === -1) {
      currentIndex = imageList.findIndex((entry) => entry.url === url)
    }

    const hasNav = imageList.length > 1 && currentIndex >= 0
    const hasPrev = hasNav && currentIndex > 0
    const hasNext = hasNav && currentIndex < imageList.length - 1

    const navHtml = hasNav
      ? `<div class="gm-img-overlay__nav gm-img-overlay__nav--prev${hasPrev ? '' : ' gm-img-overlay__nav--disabled'}" data-action="prev" role="button" tabindex="0">‹</div>
         <div class="gm-img-overlay__nav gm-img-overlay__nav--next${hasNext ? '' : ' gm-img-overlay__nav--disabled'}" data-action="next" role="button" tabindex="0">›</div>`
      : ''

    const navHint = hasNav
      ? `<span class="gm-img-overlay__sep">·</span>
         <span><kbd>←</kbd> <kbd>→</kbd> 切换</span>
         <span class="gm-img-overlay__sep">·</span>
         <span class="gm-img-overlay__counter">${currentIndex + 1} / ${imageList.length}</span>`
      : ''

    runtime.document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="${OVERLAY_ID}" class="gm-img-overlay" role="dialog" aria-label="图片预览">
         ${navHtml}
         <img class="gm-img-overlay__img" src="${escapeHtml(url)}" alt="">
         <div class="gm-img-overlay__hint">
           <span class="gm-img-overlay__action" data-action="open-tab" role="button" tabindex="0">新 tab 查看</span>
           <span class="gm-img-overlay__sep">·</span>
           <span><kbd>Enter</kbd> 新 tab</span>
           <span class="gm-img-overlay__sep">·</span>
           <span><kbd>Esc</kbd> 关闭</span>
           ${navHint}
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
      return
    }
    if (el.closest('[data-action="prev"]')) {
      navigate(-1)
      return
    }
    if (el.closest('[data-action="next"]')) {
      navigate(1)
      return
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
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      navigate(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      navigate(1)
    }
  }

  function onDocumentClick(e: MouseEvent): void {
    // 1. Check for <a>-wrapped images (reddit, v2ex)
    const anchor = findImageLink(e.target, shouldIntercept)
    if (anchor) {
      const url = anchor.href
      if (!url) return
      e.preventDefault()
      e.stopPropagation()
      open(url, anchor)
      return
    }
    // 2. Check for bare <img> elements (hupu)
    if (shouldInterceptImage) {
      const img = findBareImage(e.target, shouldInterceptImage)
      if (img) {
        const url = resolveImageUrl(img)
        if (!url) return
        e.preventDefault()
        e.stopPropagation()
        open(url, img)
      }
    }
  }

  // Capture phase: intercept before site's own handlers
  runtime.document.addEventListener('click', onDocumentClick, true)

  return () => {
    runtime.document.removeEventListener('click', onDocumentClick, true)
    close()
  }
}

const GIF_PROCESSED_ATTR = 'data-gm-hupu-gif-processed'
const GIF_THUMB_CLASS = 'gm-hupu-gif-thumb'

type GifUrls = {
  animatedUrl: string
  previewUrl: string
}

function isGifUrl(src: string): boolean {
  try {
    const url = new URL(src, location.href)
    return url.pathname.toLowerCase().includes('.gif')
  } catch {
    return src.toLowerCase().includes('.gif')
  }
}

function deriveGifUrls(src: string): GifUrls | null {
  let url: URL
  try {
    url = new URL(src, location.href)
  } catch {
    return null
  }

  if (!url.pathname.toLowerCase().includes('.gif')) return null

  const animatedUrl = src

  const search = url.search
  const ossProcessEncoded = search.match(/[?&]x-oss-process=([^&]*)/)?.[1] ?? ''
  const ossProcess = ossProcessEncoded ? decodeURIComponent(ossProcessEncoded) : ''

  if (ossProcess) {
    const segments = ossProcess.split('/')
    const filtered: string[] = []
    let hasFormat = false

    for (const seg of segments) {
      if (seg.startsWith('format,')) {
        hasFormat = true
        filtered.push('format,jpg')
      } else if (seg.startsWith('image/')) {
        filtered.push(seg)
      } else if (
        seg.startsWith('resize,') ||
        seg.startsWith('crop,') ||
        seg.startsWith('rotate,')
      ) {
        filtered.push(seg)
      } else if (seg) {
        filtered.push(seg)
      }
    }

    if (!hasFormat) {
      if (filtered.length === 0 || !filtered[0].startsWith('image/')) {
        filtered.unshift('image')
      }
      filtered.push('format,jpg')
    }

    const newOssProcess = filtered.join('/')
    const newSearch = search.replace(/([?&]x-oss-process=)[^&]*/, '$1' + newOssProcess)
    const previewUrl = url.origin + url.pathname + newSearch
    return { animatedUrl, previewUrl }
  } else {
    const separator = search ? '&' : '?'
    const previewUrl =
      url.origin + url.pathname + search + separator + 'x-oss-process=image/format,jpg'
    return { animatedUrl, previewUrl }
  }
}

/**
 * Replace GIF src with a static JPG preview so the thumbnail is lightweight.
 * The original animated URL is stored in `data-gm-hupu-gif-src` for the
 * popup viewer to use. A `gm-hupu-gif-thumb` class is added to the image's
 * wrapper so CSS can show a "GIF" badge indicating click-to-play.
 */
function processGif(img: HTMLImageElement): void {
  if (img.getAttribute(GIF_PROCESSED_ATTR)) return

  const src = img.currentSrc || img.src
  if (!src || !isGifUrl(src)) return

  const urls = deriveGifUrls(src)
  if (!urls) return

  img.setAttribute(GIF_PROCESSED_ATTR, 'true')
  img.dataset.gmHupuGifSrc = urls.animatedUrl
  img.dataset.gmHupuGifPreviewSrc = urls.previewUrl

  if (img.hasAttribute('srcset')) {
    img.dataset.gmHupuGifSrcset = img.getAttribute('srcset')!
    img.removeAttribute('srcset')
  }

  img.src = urls.previewUrl

  // Mark wrapper for GIF badge — prefer .lazyload-wrapper (stable across
  // lazy-load src swaps), fall back to immediate parent.
  const wrapper = img.closest('.lazyload-wrapper') || img.parentElement
  wrapper?.classList.add(GIF_THUMB_CLASS)
}

function isThreadImg(el: Element): el is HTMLImageElement {
  return el.tagName === 'IMG' && el.classList.contains('thread-img')
}

/**
 * Process media in the given scope: convert GIF images to static previews
 * with click-to-play badges. Thumbnail sizing and inline layout are handled
 * entirely by CSS (targeting `img.thread-img`, `.image-wrapper`,
 * `.slate-image`) so they apply immediately regardless of lazy-load timing.
 */
export function processMedia(root: ParentNode): void {
  if (!root) return

  const scope: Element | Document = root instanceof Element ? root : (root as Document)

  const imgs = scope.querySelectorAll('img.thread-img')

  for (const img of imgs) {
    if (!isThreadImg(img)) continue
    processGif(img)
  }

  if (root instanceof Element && isThreadImg(root)) {
    processGif(root)
  }
}

const GIF_PROCESSED_ATTR = 'data-gm-hupu-gif-processed'
const IMAGE_GROUP_PROCESSED_ATTR = 'data-gm-hupu-image-group-processed'
const MIN_IMAGES_FOR_GROUP = 3

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

function findImageWrapper(img: Element): Element | null {
  return (
    img.closest('.lazyload-wrapper') ??
    img.closest('.img-wrapper-embedded') ??
    img.closest('.image-wrapper') ??
    img.parentElement
  )
}

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

  const imageWrapper = img.closest('.image-wrapper')
  const wrapper = findImageWrapper(img)
  if (!wrapper) return

  if (imageWrapper) imageWrapper.classList.add('gm-hupu-media')
  wrapper.classList.add('gm-hupu-gif')
  wrapper.setAttribute(
    'style',
    (wrapper.getAttribute('style') || '') + '; position: relative; display: inline-block;',
  )

  const playBtn = wrapper.ownerDocument.createElement('span')
  playBtn.className = 'gm-hupu-gif-play'
  playBtn.setAttribute('role', 'button')
  playBtn.setAttribute('tabindex', '0')
  playBtn.textContent = '▶'

  let playing = false
  let replayCounter = 0
  let stopTimer: ReturnType<typeof setTimeout> | null = null

  function stopGif(): void {
    const previewSrc = img.dataset.gmHupuGifPreviewSrc
    if (!previewSrc) return
    img.src = previewSrc
    wrapper!.classList.remove('gm-hupu-gif-playing')
    playBtn.textContent = '▶'
    playing = false
    if (stopTimer !== null) {
      clearTimeout(stopTimer)
      stopTimer = null
    }
  }

  function parseGifDuration(url: string): Promise<number> {
    let rawUrl = url
    try {
      const u = new URL(url)
      u.searchParams.delete('x-oss-process')
      rawUrl = u.href
    } catch {
      /* use original url */
    }
    return fetch(rawUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        const b = new Uint8Array(buf)
        // validate GIF header
        if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return 5000

        let pos = 6 // skip "GIF87a" / "GIF89a"
        // logical screen descriptor: 7 bytes
        const packed = b[10]
        const hasGct = (packed & 0x80) !== 0
        const gctEntries = hasGct ? 3 * (1 << ((packed & 0x07) + 1)) : 0
        pos += 7 + gctEntries

        let duration = 0
        while (pos < b.length - 1) {
          const intro = b[pos]

          if (intro === 0x3b) {
            // trailer — end of GIF
            break
          }

          if (intro === 0x21) {
            // extension
            const label = b[pos + 1]
            if (label === 0xf9) {
              // graphic control extension
              // block: 0x21, 0xf9, block_size(4), packed(1), delay_le(2), trans(1), term(0)
              const delay = ((b[pos + 5] << 8) | b[pos + 4]) * 10 // centiseconds → ms
              if (delay > 0) duration += delay
            }
            // skip extension: intro(1) + label(1) + sub-blocks
            pos += 2
            while (pos < b.length && b[pos] !== 0) {
              pos += b[pos] + 1
            }
            pos++ // block terminator (0x00)
            continue
          }

          if (intro === 0x2c) {
            // image descriptor: 10 bytes (including the intro byte)
            pos += 10
            if (pos < b.length) {
              const imgPacked = b[pos - 1]
              const hasLct = (imgPacked & 0x80) !== 0
              const lctEntries = hasLct ? 3 * (1 << ((imgPacked & 0x07) + 1)) : 0
              pos += lctEntries
            }
            // lzw minimum code size
            if (pos < b.length) pos++
            // skip image data sub-blocks
            while (pos < b.length && b[pos] !== 0) {
              pos += b[pos] + 1
            }
            pos++ // block terminator
            continue
          }

          // unknown block, skip one byte
          pos++
        }
        return duration || 5000
      })
      .catch(() => 5000)
  }

  playBtn.addEventListener('click', () => {
    if (playing) {
      stopGif()
      return
    }

    const animatedUrl = img.dataset.gmHupuGifSrc
    if (!animatedUrl) return
    replayCounter++
    let rawAnimatedUrl = animatedUrl
    try {
      const u = new URL(animatedUrl)
      u.searchParams.delete('x-oss-process')
      rawAnimatedUrl = u.href
    } catch {
      /* use original */
    }
    const replayUrl =
      rawAnimatedUrl +
      (rawAnimatedUrl.includes('?') ? '&' : '?') +
      'gmReplay=' +
      Date.now() +
      '_' +
      replayCounter
    img.src = replayUrl
    wrapper.classList.add('gm-hupu-gif-playing')
    playBtn.textContent = '⏸'
    playing = true

    parseGifDuration(rawAnimatedUrl).then((ms) => {
      if (!playing) return
      stopTimer = setTimeout(stopGif, ms)
    })
  })

  wrapper.appendChild(playBtn)
}

function processImageGroup(container: Element): void {
  if (container.getAttribute(IMAGE_GROUP_PROCESSED_ATTR)) return

  const imageWrappers = container.querySelectorAll(':scope > .image-wrapper')
  if (imageWrappers.length < MIN_IMAGES_FOR_GROUP) return

  container.setAttribute(IMAGE_GROUP_PROCESSED_ATTR, 'true')
  container.classList.add('gm-hupu-media')

  const hiddenCount = imageWrappers.length - 1

  const toggle = container.ownerDocument.createElement('span')
  toggle.className = 'gm-hupu-image-group-toggle'
  toggle.setAttribute('role', 'button')
  toggle.setAttribute('tabindex', '0')
  toggle.textContent = '折叠图片'

  const placeholder = container.ownerDocument.createElement('span')
  placeholder.className = 'gm-hupu-image-group-placeholder'
  placeholder.textContent = `已折叠 ${hiddenCount} 张图片`
  placeholder.style.display = 'none'

  let collapsed = false

  toggle.addEventListener('click', () => {
    collapsed = !collapsed
    if (collapsed) {
      container.classList.add('gm-hupu-image-group-collapsed')
      toggle.textContent = '展开图片'
      placeholder.style.display = ''
      for (let i = 1; i < imageWrappers.length; i++) {
        imageWrappers[i].classList.add('gm-hupu-image-hidden')
      }
    } else {
      container.classList.remove('gm-hupu-image-group-collapsed')
      toggle.textContent = '折叠图片'
      placeholder.remove()
      for (let i = 1; i < imageWrappers.length; i++) {
        imageWrappers[i].classList.remove('gm-hupu-image-hidden')
      }
    }
  })

  container.prepend(placeholder)
  container.prepend(toggle)
}

function isThreadImg(el: Element): el is HTMLImageElement {
  return el.tagName === 'IMG' && el.classList.contains('thread-img')
}

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

  const contentContainers = scope.querySelectorAll('.post-reply-list-content')
  for (const container of contentContainers) {
    if (container.getAttribute(IMAGE_GROUP_PROCESSED_ATTR)) continue
    processImageGroup(container)
  }
}

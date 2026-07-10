import { afterAll, describe, expect, test } from 'bun:test'

import {
  findBareImage,
  findImageLink,
  isImageUrl,
  setupImageViewer,
} from '../../src/shared/image-viewer'
import { closeAllWindows, createHappyDom, createRuntime } from '../runtime'

function redditImageHtml(): string {
  return `<body>
<figure class="rte-media">
  <a href="https://preview.redd.it/test-image.jpeg?width=1080&format=pjpg&auto=webp&s=abc123"
     target="_blank" class="w-fit">
    <img src="https://preview.redd.it/test-image.jpeg?width=1080&format=pjpg&auto=webp&s=abc123"
         alt="评论图像" class="non-lightboxed-content" width="240">
  </a>
</figure>
<a href="/user/alice" class="author">alice</a>
</body>`
}

function v2exImageHtml(): string {
  return `<body>
<div class="reply_content">
  <a target="_blank" href="https://i.imgur.com/jEck9s7.png" rel="nofollow noopener" draggable="true">
    <img src="https://i.imgur.com/jEck9s7.png" class="embedded_image" rel="noreferrer">
  </a>
</div>
<a href="/member/alice" class="node">alice</a>
</body>`
}

describe('isImageUrl', () => {
  test('matches Reddit preview host', () => {
    expect(isImageUrl('https://preview.redd.it/abc.jpeg?width=1080')).toBe(true)
  })

  test('matches i.redd.it host', () => {
    expect(isImageUrl('https://i.redd.it/abc.png')).toBe(true)
  })

  test('matches imgur host', () => {
    expect(isImageUrl('https://i.imgur.com/jEck9s7.png')).toBe(true)
  })

  test('matches bare image extension', () => {
    expect(isImageUrl('https://example.com/photo.jpg')).toBe(true)
    expect(isImageUrl('https://example.com/photo.png')).toBe(true)
    expect(isImageUrl('https://example.com/photo.webp')).toBe(true)
    expect(isImageUrl('https://example.com/photo.gif')).toBe(true)
  })

  test('matches image extension with query params', () => {
    expect(isImageUrl('https://example.com/photo.jpg?size=large')).toBe(true)
  })

  test('does not match non-image URL', () => {
    expect(isImageUrl('https://example.com/page')).toBe(false)
    expect(isImageUrl('/user/alice')).toBe(false)
  })
})

describe('findImageLink', () => {
  test('finds anchor wrapping an img on preview.redd.it', () => {
    const dom = createHappyDom(redditImageHtml())
    const img = dom.document.querySelector('figure img')! as unknown as Element
    const anchor = findImageLink(img)
    expect(anchor).not.toBeNull()
    expect(anchor!.tagName).toBe('A')
    expect(anchor!.href).toContain('preview.redd.it')
  })

  test('finds anchor wrapping an img on i.imgur.com (v2ex)', () => {
    const dom = createHappyDom(v2exImageHtml())
    const img = dom.document.querySelector('.embedded_image')! as unknown as Element
    const anchor = findImageLink(img)
    expect(anchor).not.toBeNull()
    expect(anchor!.tagName).toBe('A')
    expect(anchor!.href).toContain('i.imgur.com')
  })

  test('returns null for non-image anchor (author link)', () => {
    const dom = createHappyDom(redditImageHtml())
    const authorLink = dom.document.querySelector('a.author')! as unknown as Element
    expect(findImageLink(authorLink)).toBeNull()
  })

  test('returns null for anchor without img', () => {
    const dom = createHappyDom(
      '<body><a href="https://preview.redd.it/foo.jpeg">text link</a></body>',
    )
    const link = dom.document.querySelector('a')! as unknown as Element
    expect(findImageLink(link)).toBeNull()
  })

  test('returns null for img in non-image anchor', () => {
    const dom = createHappyDom(
      '<body><a href="https://example.com/page"><img src="https://example.com/img.png"></a></body>',
    )
    const img = dom.document.querySelector('img')! as unknown as Element
    expect(findImageLink(img)).toBeNull()
  })

  test('finds i.redd.it links', () => {
    const dom = createHappyDom(
      '<body><a href="https://i.redd.it/abc.png"><img src="https://i.redd.it/abc.png"></a></body>',
    )
    const img = dom.document.querySelector('img')! as unknown as Element
    expect(findImageLink(img)).not.toBeNull()
  })

  test('returns null for non-Element target', () => {
    expect(findImageLink(null)).toBeNull()
  })

  test('respects custom shouldIntercept predicate', () => {
    const dom = createHappyDom(v2exImageHtml())
    const img = dom.document.querySelector('.embedded_image')! as unknown as Element
    // Custom predicate that only matches reddit
    expect(findImageLink(img, (href) => /redd\.it/i.test(href))).toBeNull()
  })
})

describe('findBareImage', () => {
  test('finds a bare img matching predicate', () => {
    const dom = createHappyDom(
      '<body><img src="https://i3.hoopchina.com.cn/test.jpg" class="thread-img"></body>',
    )
    const img = dom.document.querySelector('img')! as unknown as Element
    const result = findBareImage(img, (el) => el.classList.contains('thread-img'))
    expect(result).not.toBeNull()
    expect(result!.tagName).toBe('IMG')
  })

  test('returns null for non-Element target', () => {
    expect(findBareImage(null, () => true)).toBeNull()
  })

  test('returns null for non-IMG element', () => {
    const dom = createHappyDom('<body><div class="thread-img"></div></body>')
    const div = dom.document.querySelector('div')! as unknown as Element
    expect(findBareImage(div, () => true)).toBeNull()
  })

  test('returns null when predicate returns false', () => {
    const dom = createHappyDom('<body><img src="test.jpg" class="other"></body>')
    const img = dom.document.querySelector('img')! as unknown as Element
    expect(findBareImage(img, (el) => el.classList.contains('thread-img'))).toBeNull()
  })
})

describe('setupImageViewer', () => {
  test('clicking Reddit image thumbnail opens overlay', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')
    expect(overlay).not.toBeNull()
    const overlayImg = overlay!.querySelector('img')
    expect(overlayImg).not.toBeNull()
    expect(overlayImg!.getAttribute('src')).toContain('preview.redd.it')

    cleanup()
  })

  test('clicking V2EX image thumbnail opens overlay', () => {
    const dom = createHappyDom(v2exImageHtml(), 'https://www.v2ex.com/t/123')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('.embedded_image')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')
    expect(overlay).not.toBeNull()
    const overlayImg = overlay!.querySelector('img')
    expect(overlayImg).not.toBeNull()
    expect(overlayImg!.getAttribute('src')).toContain('i.imgur.com')

    cleanup()
  })

  test('Escape closes the overlay', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()
    expect(dom.document.getElementById('gm-img-viewer')).not.toBeNull()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Escape' }))
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('Enter key opens image in new tab and closes overlay', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    let openedUrl = ''
    runtime.openTab = (url: string) => {
      openedUrl = url
    }
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Enter' }))
    expect(openedUrl).toContain('preview.redd.it')
    // Overlay auto-closes after opening new tab
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('clicking "open tab" action opens image in new tab and closes overlay', () => {
    const dom = createHappyDom(v2exImageHtml(), 'https://www.v2ex.com/t/123')
    const runtime = createRuntime(dom)
    let openedUrl = ''
    runtime.openTab = (url: string) => {
      openedUrl = url
    }
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('.embedded_image')! as unknown as HTMLElement
    img.click()

    const action = dom.document.querySelector('[data-action="open-tab"]')! as unknown as HTMLElement
    action.click()
    expect(openedUrl).toContain('i.imgur.com')
    // Overlay auto-closes after opening new tab
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('clicking non-image link does not open overlay', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const authorLink = dom.document.querySelector('a.author')! as unknown as HTMLElement
    authorLink.click()
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('backdrop click closes overlay', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()
    const overlay = dom.document.getElementById('gm-img-viewer')!
    expect(overlay).not.toBeNull()

    overlay.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }))
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('clicking bare hupu image opens overlay via shouldInterceptImage', () => {
    const dom = createHappyDom(
      '<body><p class="image-wrapper"><span class="img-wrapper-embedded"><div class="lazyload-wrapper"><img src="https://i3.hoopchina.com.cn/test_w_1440_h_3120.jpg?x-oss-process=image/resize,w_800/format,webp" class="thread-img"></div></span></p></body>',
      'https://bbs.hupu.com/100.html',
    )
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime, {
      shouldInterceptImage: (img) => img.classList.contains('thread-img'),
    })

    const img = dom.document.querySelector('img.thread-img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')
    expect(overlay).not.toBeNull()
    const overlayImg = overlay!.querySelector('img')
    expect(overlayImg).not.toBeNull()
    expect(overlayImg!.getAttribute('src')).toContain('hoopchina')

    cleanup()
  })

  test('bare image not matching shouldInterceptImage does not open overlay', () => {
    const dom = createHappyDom(
      '<body><img src="https://example.com/icon.png" class="avatar"></body>',
      'https://bbs.hupu.com/100.html',
    )
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime, {
      shouldInterceptImage: (img) => img.classList.contains('thread-img'),
    })

    const img = dom.document.querySelector('img')! as unknown as HTMLElement
    img.click()
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('cleanup removes click listener', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)
    cleanup()

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()
  })

  test('resolveImageUrl overrides the URL shown in the viewer', () => {
    const dom = createHappyDom(
      '<body><img src="https://example.com/preview.jpg" data-gm-hupu-gif-src="https://example.com/animated.gif" class="thread-img"></body>',
      'https://bbs.hupu.com/100.html',
    )
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime, {
      shouldInterceptImage: (img) => img.classList.contains('thread-img'),
      resolveImageUrl: (img) => img.dataset.gmHupuGifSrc || img.currentSrc || img.src,
    })

    const img = dom.document.querySelector('img.thread-img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')
    expect(overlay).not.toBeNull()
    const overlayImg = overlay!.querySelector('img')
    expect(overlayImg!.getAttribute('src')).toBe('https://example.com/animated.gif')

    cleanup()
  })
})

function multiImageHtml(): string {
  return `<body>
<figure class="rte-media">
  <a href="https://preview.redd.it/image1.jpeg" target="_blank">
    <img src="https://preview.redd.it/image1.jpeg" alt="1" width="240">
  </a>
</figure>
<figure class="rte-media">
  <a href="https://preview.redd.it/image2.png" target="_blank">
    <img src="https://preview.redd.it/image2.png" alt="2" width="240">
  </a>
</figure>
<figure class="rte-media">
  <a href="https://preview.redd.it/image3.jpg" target="_blank">
    <img src="https://preview.redd.it/image3.jpg" alt="3" width="240">
  </a>
</figure>
</body>`
}

describe('setupImageViewer — gallery navigation', () => {
  test('multiple images show nav arrows and counter', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')!
    expect(overlay.querySelector('[data-action="prev"]')).not.toBeNull()
    expect(overlay.querySelector('[data-action="next"]')).not.toBeNull()
    expect(overlay.querySelector('.gm-img-overlay__counter')?.textContent).toBe('1 / 3')

    cleanup()
  })

  test('single image does not show nav arrows', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')!
    expect(overlay.querySelector('[data-action="prev"]')).toBeNull()
    expect(overlay.querySelector('[data-action="next"]')).toBeNull()
    expect(overlay.querySelector('.gm-img-overlay__counter')).toBeNull()

    cleanup()
  })

  test('ArrowRight navigates to next image', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowRight' }))

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image2')
    expect(overlay.querySelector('.gm-img-overlay__counter')?.textContent).toBe('2 / 3')

    cleanup()
  })

  test('ArrowLeft navigates to previous image', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    // Click the second image
    const imgs = dom.document.querySelectorAll('figure img')!
    ;(imgs[1] as unknown as HTMLElement).click()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowLeft' }))

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image1')
    expect(overlay.querySelector('.gm-img-overlay__counter')?.textContent).toBe('1 / 3')

    cleanup()
  })

  test('ArrowLeft at first image does nothing', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowLeft' }))

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image1')
    // prev arrow should be disabled
    expect(
      overlay
        .querySelector('[data-action="prev"]')
        ?.classList.contains('gm-img-overlay__nav--disabled'),
    ).toBe(true)

    cleanup()
  })

  test('ArrowRight at last image does nothing', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    // Click the last image
    const imgs = dom.document.querySelectorAll('figure img')!
    ;(imgs[2] as unknown as HTMLElement).click()

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowRight' }))

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image3')
    expect(
      overlay
        .querySelector('[data-action="next"]')
        ?.classList.contains('gm-img-overlay__nav--disabled'),
    ).toBe(true)

    cleanup()
  })

  test('clicking next arrow navigates to next image', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    const nextBtn = dom.document.querySelector('[data-action="next"]')! as unknown as HTMLElement
    nextBtn.click()

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image2')

    cleanup()
  })

  test('clicking prev arrow navigates to previous image', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)

    // Click the second image
    const imgs = dom.document.querySelectorAll('figure img')!
    ;(imgs[1] as unknown as HTMLElement).click()

    const prevBtn = dom.document.querySelector('[data-action="prev"]')! as unknown as HTMLElement
    prevBtn.click()

    const overlay = dom.document.getElementById('gm-img-viewer')!
    const overlayImg = overlay.querySelector('img')!
    expect(overlayImg.getAttribute('src')).toContain('image1')

    cleanup()
  })

  test('Enter on navigated image opens correct URL in new tab', () => {
    const dom = createHappyDom(multiImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    let openedUrl = ''
    runtime.openTab = (url: string) => {
      openedUrl = url
    }
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    // Navigate to second image
    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowRight' }))

    // Press Enter — should open the second image's URL
    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Enter' }))
    expect(openedUrl).toContain('image2')
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()

    cleanup()
  })

  test('gallery navigation works with bare images (hupu)', () => {
    const dom = createHappyDom(
      `<body>
        <img src="https://i3.hoopchina.com.cn/img1.jpg" class="thread-img">
        <img src="https://i3.hoopchina.com.cn/img2.jpg" class="thread-img">
      </body>`,
      'https://bbs.hupu.com/100.html',
    )
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime, {
      shouldInterceptImage: (img) => img.classList.contains('thread-img'),
    })

    const img = dom.document.querySelector('img.thread-img')! as unknown as HTMLElement
    img.click()

    const overlay = dom.document.getElementById('gm-img-viewer')!
    expect(overlay.querySelector('[data-action="next"]')).not.toBeNull()
    expect(overlay.querySelector('.gm-img-overlay__counter')?.textContent).toBe('1 / 2')

    dom.document.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(overlay.querySelector('img')!.getAttribute('src')).toContain('img2')
    expect(overlay.querySelector('.gm-img-overlay__counter')?.textContent).toBe('2 / 2')

    cleanup()
  })
})

afterAll(() => closeAllWindows())

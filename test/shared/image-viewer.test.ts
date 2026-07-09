import { afterAll, describe, expect, test } from 'bun:test'

import { findImageLink, isImageUrl, setupImageViewer } from '../../src/shared/image-viewer'
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

  test('cleanup removes click listener', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    const cleanup = setupImageViewer(runtime)
    cleanup()

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()
    expect(dom.document.getElementById('gm-img-viewer')).toBeNull()
  })
})

afterAll(() => closeAllWindows())

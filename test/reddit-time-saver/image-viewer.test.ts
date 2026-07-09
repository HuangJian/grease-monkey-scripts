import { afterAll, describe, expect, test } from 'bun:test'

import { findImageLink, setupImageViewer } from '../../src/reddit-time-saver/app/image-viewer'
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

describe('findImageLink', () => {
  test('finds anchor wrapping an img on preview.redd.it', () => {
    const dom = createHappyDom(redditImageHtml())
    const img = dom.document.querySelector('figure img')! as unknown as Element
    const anchor = findImageLink(img)
    expect(anchor).not.toBeNull()
    expect(anchor!.tagName).toBe('A')
    expect(anchor!.href).toContain('preview.redd.it')
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

  test('returns null for img in non-reddit-image anchor', () => {
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
})

describe('setupImageViewer', () => {
  test('clicking image thumbnail opens overlay with full-size image', () => {
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

  test('clicking "open tab" action opens image in new tab', () => {
    const dom = createHappyDom(redditImageHtml(), 'https://www.reddit.com/r/test/comments/x/')
    const runtime = createRuntime(dom)
    let openedUrl = ''
    runtime.openTab = (url: string) => {
      openedUrl = url
    }
    const cleanup = setupImageViewer(runtime)

    const img = dom.document.querySelector('figure img')! as unknown as HTMLElement
    img.click()

    const action = dom.document.querySelector('[data-action="open-tab"]')! as unknown as HTMLElement
    action.click()
    expect(openedUrl).toContain('preview.redd.it')
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

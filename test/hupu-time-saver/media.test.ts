import { beforeEach, describe, expect, test, afterAll } from 'bun:test'
import { createDom, closeAllWindows } from '../runtime'
import { processMedia } from '../../src/hupu-time-saver/app/media'

const BASE_URL = 'https://bbs.hupu.com/100.html'

function gifUrl(suffix = '') {
  return `https://i5.hoopchina.com.cn/...29803.gif${suffix}`
}

function wrapImageHtml(src: string) {
  return `
    <p class="image-wrapper">
      <span class="img-wrapper-embedded">
        <div class="lazyload-wrapper">
          <img src="${src}" class="thread-img">
        </div>
      </span>
    </p>
  `
}

function replyHtml(content: string) {
  return `
    <div class="index_reply__GP3PX">
      <div class="post-reply-list-container">
        <div class="post-reply-list-user-info-top">
          <a href="https://my.hupu.com/222" class="post-reply-list-user-info-top-name">回复者A</a>
        </div>
        <div class="post-reply-list-content">${content}</div>
      </div>
    </div>
  `
}

describe('processMedia — GIF handling', () => {
  let dom: ReturnType<typeof createDom>

  beforeEach(() => {
    dom = createDom(`<!doctype html><html><head></head><body></body></html>`, BASE_URL)
  })

  test('GIF URL with Hupu query transform is detected and replaced with static preview', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.dataset.gmHupuGifSrc).toBe(gifSrc)
    expect(decodeURIComponent(img.dataset.gmHupuGifPreviewSrc!)).toContain('format,jpg')
    expect(decodeURIComponent(img.src)).toContain('format,jpg')
  })

  test('non-GIF images are not modified by GIF processing', () => {
    const imgSrc = 'https://i5.hoopchina.com.cn/photo.jpg?x-oss-process=image/resize,w_800'
    const html = replyHtml(wrapImageHtml(imgSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img.dataset.gmHupuGifSrc).toBeUndefined()
    expect(img.src).toBe(imgSrc)
  })

  test('GIF without x-oss-process gets format,jpg added', () => {
    const gifSrc = gifUrl()
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(decodeURIComponent(img.dataset.gmHupuGifPreviewSrc!)).toContain(
      'x-oss-process=image/format,jpg',
    )
  })

  test('srcset is preserved in data attribute when GIF is controlled', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(`
      <p class="image-wrapper">
        <span class="img-wrapper-embedded">
          <div class="lazyload-wrapper">
            <img src="${gifSrc}" srcset="${gifSrc} 2x" class="thread-img">
          </div>
        </span>
      </p>
    `)
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img.dataset.gmHupuGifSrcset).toBe(`${gifSrc} 2x`)
    expect(img.getAttribute('srcset')).toBeNull()
  })

  test('re-running processMedia does not re-process GIF images', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)
    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    // src should still be the preview URL (not re-swapped)
    expect(decodeURIComponent(img.src)).toContain('format,jpg')
    // No play button elements from old implementation
    expect(dom.document.querySelector('.gm-hupu-gif-play')).toBeNull()
  })

  test('GIF image does not get a play button (removed in favor of popup viewer)', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    expect(dom.document.querySelector('.gm-hupu-gif-play')).toBeNull()
    expect(dom.document.querySelector('.gm-hupu-gif')).toBeNull()
  })
})

describe('processMedia — GIF badge', () => {
  let dom: ReturnType<typeof createDom>

  beforeEach(() => {
    dom = createDom(`<!doctype html><html><head></head><body></body></html>`, BASE_URL)
  })

  test('GIF image wrapper gets gm-hupu-gif-thumb class for badge display', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const wrapper = dom.document.querySelector('.lazyload-wrapper')
    expect(wrapper?.classList.contains('gm-hupu-gif-thumb')).toBe(true)
  })

  test('non-GIF image wrapper does not get gm-hupu-gif-thumb class', () => {
    const imgSrc =
      'https://i3.hoopchina.com.cn/test_w_1440_h_3120.jpg?x-oss-process=image/resize,w_800/format,webp'
    const html = replyHtml(wrapImageHtml(imgSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const wrapper = dom.document.querySelector('.lazyload-wrapper')
    expect(wrapper?.classList.contains('gm-hupu-gif-thumb')).toBe(false)
  })

  test('multiple GIF images all get badge class on their wrappers', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(
      [wrapImageHtml(gifSrc), wrapImageHtml(gifSrc), wrapImageHtml(gifSrc)].join('\n'),
    )
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const wrappers = dom.document.querySelectorAll('.lazyload-wrapper')
    expect(wrappers.length).toBe(3)
    wrappers.forEach((w) => {
      expect(w.classList.contains('gm-hupu-gif-thumb')).toBe(true)
    })
  })

  test('GIF image without lazyload-wrapper gets badge class on parent element', () => {
    const gifSrc = gifUrl()
    const html = replyHtml(`
      <p class="image-wrapper">
        <img src="${gifSrc}" class="thread-img">
      </p>
    `)
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    const wrapper = img.parentElement
    expect(wrapper?.classList.contains('gm-hupu-gif-thumb')).toBe(true)
  })
})

afterAll(() => closeAllWindows())

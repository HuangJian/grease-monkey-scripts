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

describe('processMedia', () => {
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

  test('GIF image gets a play button overlay', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const imageWrapper = dom.document.querySelector('.image-wrapper')
    expect(imageWrapper?.classList.contains('gm-hupu-media')).toBe(true)

    const gifWrapper = dom.document.querySelector('.lazyload-wrapper')
    expect(gifWrapper?.classList.contains('gm-hupu-gif')).toBe(true)

    const playBtn = gifWrapper?.querySelector('.gm-hupu-gif-play')
    expect(playBtn).not.toBeNull()
    expect(playBtn?.getAttribute('role')).toBe('button')
  })

  test('clicking play restores the animated GIF URL with cache busting', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const playBtn = dom.document.querySelector('.gm-hupu-gif-play') as unknown as HTMLElement
    playBtn.click()

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img.src).toContain(gifUrl())
    expect(img.src).toContain('gmReplay=')
    expect(img.dataset.gmHupuGifSrc).toBe(gifSrc)
  })

  test('clicking play pauses and restores the static preview', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const playBtn = dom.document.querySelector('.gm-hupu-gif-play') as unknown as HTMLElement
    playBtn.click()

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img.src).toContain('gmReplay=')
    expect(decodeURIComponent(img.dataset.gmHupuGifPreviewSrc!)).toContain('format,jpg')

    playBtn.click()

    expect(decodeURIComponent(img.src)).toContain('format,jpg')
    expect(img.src).not.toContain('gmReplay=')
  })

  test('clicking pause then play again restarts the GIF with fresh cache busting', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const playBtn = dom.document.querySelector('.gm-hupu-gif-play') as unknown as HTMLElement
    playBtn.click()
    playBtn.click()

    playBtn.click()
    const thirdSrc = (dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement)
      .src

    expect(thirdSrc).toContain(gifUrl())
    expect(thirdSrc).toContain('gmReplay=')
  })

  test('re-running processMedia does not duplicate controls', () => {
    const gifSrc = gifUrl('?x-oss-process=image/resize,w_800/format,webp')
    const html = replyHtml(wrapImageHtml(gifSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)
    processMedia(dom.document.body as unknown as ParentNode)

    const playBtns = dom.document.querySelectorAll('.gm-hupu-gif-play')
    expect(playBtns.length).toBe(1)
  })

  test('non-GIF images are not modified', () => {
    const imgSrc = 'https://i5.hoopchina.com.cn/photo.jpg?x-oss-process=image/resize,w_800'
    const html = replyHtml(wrapImageHtml(imgSrc))
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const img = dom.document.querySelector('img.thread-img') as unknown as HTMLImageElement
    expect(img.dataset.gmHupuGifSrc).toBeUndefined()
    expect(img.src).toBe(imgSrc)
  })

  test('a reply with 3+ image wrappers gets one collapse/expand control', () => {
    const images = [
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
    ]
    const content = images.map((src) => wrapImageHtml(src)).join('\n')
    const html = replyHtml(content)
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const contentDiv = dom.document.querySelector('.post-reply-list-content')
    expect(contentDiv?.classList.contains('gm-hupu-media')).toBe(true)

    const toggle = dom.document.querySelector('.gm-hupu-image-group-toggle')
    expect(toggle).not.toBeNull()
    expect(toggle?.textContent).toContain('折叠图片')
  })

  test('collapsing hides all but the first image and expanding restores them', () => {
    const images = [
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
    ]
    const content = images.map((src) => wrapImageHtml(src)).join('\n')
    const html = replyHtml(content)
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const toggle = dom.document.querySelector(
      '.gm-hupu-image-group-toggle',
    ) as unknown as HTMLElement
    toggle.click()

    const contentDiv = dom.document.querySelector('.post-reply-list-content')
    expect(contentDiv?.classList.contains('gm-hupu-image-group-collapsed')).toBe(true)

    const hiddenWrappers = dom.document.querySelectorAll('.image-wrapper')
    expect(hiddenWrappers[0].classList.contains('gm-hupu-image-hidden')).toBe(false)
    expect(hiddenWrappers[1].classList.contains('gm-hupu-image-hidden')).toBe(true)
    expect(hiddenWrappers[2].classList.contains('gm-hupu-image-hidden')).toBe(true)

    const placeholder = dom.document.querySelector('.gm-hupu-image-group-placeholder')
    expect(placeholder).not.toBeNull()
    expect(placeholder?.textContent).toContain('2')

    toggle.click()

    expect(contentDiv?.classList.contains('gm-hupu-image-group-collapsed')).toBe(false)
    expect(hiddenWrappers[1].classList.contains('gm-hupu-image-hidden')).toBe(false)
    expect(hiddenWrappers[2].classList.contains('gm-hupu-image-hidden')).toBe(false)
    expect(dom.document.querySelector('.gm-hupu-image-group-placeholder')).toBeNull()
  })

  test('a reply with fewer than 3 images does not get a collapse control', () => {
    const images = [
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
      gifUrl('?x-oss-process=image/resize,w_800/format,webp'),
    ]
    const content = images.map((src) => wrapImageHtml(src)).join('\n')
    const html = replyHtml(content)
    dom.document.body.insertAdjacentHTML('beforeend', html)

    processMedia(dom.document.body as unknown as ParentNode)

    const toggle = dom.document.querySelector('.gm-hupu-image-group-toggle')
    expect(toggle).toBeNull()
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
})

afterAll(() => closeAllWindows())

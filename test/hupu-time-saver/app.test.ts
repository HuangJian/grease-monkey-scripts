import { beforeEach, describe, expect, test } from 'bun:test'
import { createDom, createRuntime } from '../runtime'
import { createHupuApp } from '../../src/hupu-time-saver/app'
import { BTN_CLASS, PROCESSED_CLASS } from '../../src/hupu-time-saver/app/tag-buttons'
import { STORAGE_KEY } from '../../src/hupu-time-saver/app/index'

function hupuHtml(tid = '100') {
  return `<!doctype html>
<html><head></head><body>
  <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        detail: {
          thread: {
            tid,
            author: {
              puid: '100',
              euid: '111',
              puname: '楼主昵称',
              url: 'https://my.hupu.com/111',
            },
          },
          replies: {
            count: 2,
            size: 20,
            current: 1,
            total: 1,
            list: [
              {
                pid: 'p1',
                author: {
                  puid: '200',
                  euid: '222',
                  puname: '回复者A',
                  url: 'https://my.hupu.com/222',
                },
              },
              {
                pid: 'p2',
                author: {
                  puid: '300',
                  euid: '333',
                  puname: '回复者B',
                  url: 'https://my.hupu.com/333',
                },
              },
            ],
          },
        },
      },
    },
  })}</script>
  <div class="post-wrapper_bbs-post-wrapper__UdhwQ">
    <div class="post-user_post-user-comp__3azJ2">
      <a href="https://my.hupu.com/111" class="post-user_post-user-comp-info-top-name__N3D4w" target="_blank">楼主昵称</a>
      <span class="post-user_post-user-comp-info-top-tip__3Av0L">楼主</span>
    </div>
  </div>
  <div class="index_reply__GP3PX">
    <span id="p1"></span>
    <div class="post-reply-list-container">
      <div class="post-reply-list-user-info-top">
        <a href="https://my.hupu.com/222" class="post-reply-list-user-info-top-name">回复者A</a>
      </div>
      <div class="post-reply-list-content"><p>回复内容A</p></div>
    </div>
  </div>
  <div class="index_reply__GP3PX">
    <span id="p2"></span>
    <div class="post-reply-list-container">
      <div class="post-reply-list-user-info-top">
        <a href="https://my.hupu.com/333" class="post-reply-list-user-info-top-name">回复者B</a>
      </div>
      <div class="post-reply-list-content"><p>回复内容B</p></div>
    </div>
  </div>
</body></html>`
}

describe('createHupuApp', () => {
  let dom: ReturnType<typeof createDom>

  beforeEach(() => {
    dom = createDom(hupuHtml(), 'https://bbs.hupu.com/100.html')
  })

  test('在楼主和回复作者链接旁插入标签按钮', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.start()

    const authorLinks =
      dom.window.document.querySelectorAll<HTMLAnchorElement>('a[href*="my.hupu.com"]')
    expect(authorLinks.length).toBeGreaterThan(0)
    authorLinks.forEach((link) => {
      if (link.classList.contains('reply-list-avatar-wrapper')) return
      const btn = link.nextElementSibling
      expect(btn?.classList.contains(BTN_CLASS)).toBe(true)
      expect(link.classList.contains(PROCESSED_CLASS)).toBe(true)
    })
  })

  test('不重复处理已处理的链接', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)

    const authorLink =
      dom.window.document.querySelector<HTMLAnchorElement>('a[href*="my.hupu.com"]')!
    authorLink.classList.add(PROCESSED_CLASS)
    app.start()

    const btn = authorLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(false)
  })

  test('已有标签的用户：徽标颜色与内容高亮正确', async () => {
    const values: Record<string, unknown> = {
      [STORAGE_KEY]: {
        '200': { 串子: { url: 'https://my.hupu.com/222', score: -1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.start()

    const replyLink = dom.window.document.querySelector<HTMLAnchorElement>(
      'a[href="https://my.hupu.com/222"]',
    )!
    const tag = replyLink.nextElementSibling
    expect(tag?.classList.contains('gm-author-tag')).toBe(true)
    expect(tag?.textContent).toBe('串子')
    expect((tag as HTMLElement)?.style.color).toBe('red')

    const content = replyLink
      .closest('.post-reply-list-container')
      ?.querySelector('.post-reply-list-content')
    expect(content?.classList.contains('gm-highlight-n1')).toBe(true)
  })

  test('tagAuthor 写入标签并刷新高亮', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.start()

    app.tagAuthor('200', '222', '串子', -1)

    const map = app.getAuthorTagMap()
    expect(map['200']).toBeDefined()
    expect(map['200']!['串子']?.score).toBe(-1)

    const content = dom.window.document
      .querySelector<HTMLAnchorElement>('a[href="https://my.hupu.com/222"]')
      ?.closest('.post-reply-list-container')
      ?.querySelector('.post-reply-list-content')
    expect(content?.classList.contains('gm-highlight-n1')).toBe(true)
  })

  test('setTag 创建精确分值标签', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)

    app.setTag('300', '优质', 5, '333')

    const map = app.getAuthorTagMap()
    expect(map['300']!['优质']?.score).toBe(5)
  })

  test('unsetTag 删除标签', async () => {
    const values: Record<string, unknown> = {
      [STORAGE_KEY]: {
        '200': { 串子: { url: 'https://my.hupu.com/222', score: -1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)

    app.unsetTag('200', '串子')

    const map = app.getAuthorTagMap()
    expect(map['200']).toBeUndefined()
  })

  test('getAuthorTagMap 返回快照而非引用', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)

    const map1 = app.getAuthorTagMap()
    app.tagAuthor('200', '222', '串子', -1)
    const map2 = app.getAuthorTagMap()

    expect(map1['200']).toBeUndefined()
    expect(map2['200']).toBeDefined()
  })
})

describe('applyHighlights', () => {
  let dom: ReturnType<typeof createDom>

  beforeEach(() => {
    dom = createDom(hupuHtml(), 'https://bbs.hupu.com/100.html')
  })

  test('processElement handles newly added nodes', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)

    const container = dom.window.document.body
    const newReply = dom.window.document.createElement('div')
    newReply.className = 'index_reply__NEW'
    newReply.innerHTML = `
      <span id="p3"></span>
      <div class="post-reply-list-container">
        <div class="post-reply-list-user-info-top">
          <a href="https://my.hupu.com/444" class="post-reply-list-user-info-top-name">回复者C</a>
        </div>
        <div class="post-reply-list-content"><p>回复内容C</p></div>
      </div>
    `
    container.appendChild(newReply)

    app.processElement(container)

    const newLink = dom.window.document.querySelector<HTMLAnchorElement>(
      'a[href="https://my.hupu.com/444"]',
    )!
    expect(newLink.classList.contains(PROCESSED_CLASS)).toBe(true)
    const btn = newLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(true)
  })
})

import { beforeEach, describe, expect, test, afterAll } from 'bun:test'
import { createDom, createRuntime, closeAllWindows } from '../runtime'
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
    app.stop()

    const authorLinks = dom.document.querySelectorAll('a[href*="my.hupu.com"]')
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

    const authorLink = dom.document.querySelector('a[href*="my.hupu.com"]')! as unknown as Element
    authorLink.classList.add(PROCESSED_CLASS)
    app.start()
    app.stop()

    const btn = authorLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(false)
  })

  test('GM.setValue 在 tagAuthor 时被调用', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const setValueCalls: Array<{ key: string; value: unknown }> = []
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
      setValue: async (key: string, value: unknown) => {
        setValueCalls.push({ key, value })
        values[key] = value
      },
    }
    const app = await createHupuApp(runtime)
    app.tagAuthor('200', '222', '串子', -1)

    expect(setValueCalls.length).toBeGreaterThan(0)
    expect(setValueCalls.some((c) => c.key === STORAGE_KEY)).toBe(true)
  })

  test('getTags 返回指定作者的标签', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.tagAuthor('200', '222', '串子', -1)

    const tags = app.getTags('200')
    expect(tags).toBeDefined()
    expect(tags?.['串子']).toBeDefined()
    expect(tags?.['串子'].score).toBe(-1)
  })

  test('getTags 对不存在的作者返回 undefined', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    expect(app.getTags('nonexistent')).toBeUndefined()
  })

  test('getScore 返回作者总评分', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.tagAuthor('200', '222', '串子', -1)
    app.tagAuthor('200', '222', '家人', 1)

    const score = app.getScore('200')
    expect(score).toBe(0)
  })

  test('getScore 对不存在的作者返回 0', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    expect(app.getScore('nonexistent')).toBe(0)
  })

  test('多次 tagAuthor 累加分数', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.tagAuthor('200', '222', '串子', -1)
    app.tagAuthor('200', '222', '串子', -1)

    const tags = app.getTags('200')
    expect(tags?.['串子'].score).toBe(-2)
  })

  test('getAuthorTagMap 返回深拷贝', async () => {
    const values: Record<string, unknown> = { [STORAGE_KEY]: {} }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(key: string, defaultValue: T) => (values[key] as T) ?? defaultValue,
    }
    const app = await createHupuApp(runtime)
    app.tagAuthor('200', '222', '串子', -1)

    const map1 = app.getAuthorTagMap()
    app.tagAuthor('200', '222', '家人', 1)
    const map2 = app.getAuthorTagMap()

    expect(map1['200']).toBeDefined()
    expect(map2['200']).toBeDefined()
    expect(Object.keys(map1['200']).length).toBe(1)
    expect(Object.keys(map2['200']).length).toBe(2)
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

    const container = dom.document.body as unknown as Node
    const newReply = dom.document.createElement('div')
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
    container.appendChild(newReply as unknown as Node)

    app.processElement(container)

    const newLink = dom.document.querySelector(
      'a[href="https://my.hupu.com/444"]',
    )! as unknown as Element
    expect(newLink.classList.contains(PROCESSED_CLASS)).toBe(true)
    const btn = newLink.nextElementSibling
    expect(btn?.classList.contains(BTN_CLASS)).toBe(true)
  })
})

afterAll(() => closeAllWindows())

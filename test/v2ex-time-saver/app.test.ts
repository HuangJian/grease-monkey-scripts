import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { authorTagsKeyword, createV2exApp, defaultLabels } from '../../src/v2ex-time-saver/app'
import { extractRedeemUrl } from '../../src/v2ex-time-saver/sign-in'
import { createDom, createRuntime } from '../runtime'

function threadHtml() {
  return `
    <html>
      <head></head>
      <body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">3 replies</div>
            <div class="cell" id="r_1">
              <table><tbody><tr>
                <td><span class="no">1</span></td>
                <td>
                  <strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">hello</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 2
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td>
                  <strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content"><a href="/member/alice">@alice</a> #1 thanks</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 5
                </td>
              </tr></tbody></table>
            </div>
            <div class="cell" id="r_3">
              <table><tbody><tr>
                <td><span class="no">3</span></td>
                <td>
                  <strong><a class="dark" href="/member/carol">carol</a></strong>
                  <div class="reply_content">plain</div>
                  <div class="thank_area"><a class="thank">感谢回复者</a></div>
                  <img alt="❤️"> 1
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
        <a class="topic-link" href="/t/456">topic</a>
      </body>
    </html>
  `
}

describe('v2ex app unit flows', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = createDom(threadHtml())
  })

  test('highlights stored tags as links with relative URLs and score class', async () => {
    const values: Record<string, unknown> = {
      [authorTagsKeyword]: {
        alice: { 低质: { url: 't/123#1', score: -2 } },
        bob: { 清醒: { url: 't/123#2', score: 1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(_key: string, defaultValue: T) => (values[_key] as T) ?? defaultValue,
    }
    const app = await createV2exApp(runtime)

    app.highlightCommentsAndTopics()

    const aliceLink = dom.window.document.querySelector('a[href="/member/alice"]') as HTMLElement
    const bobLink = dom.window.document.querySelector('a[href="/member/bob"]') as HTMLElement

    const aliceTag = aliceLink.querySelector('a.gm-author-tag')
    expect(aliceTag?.getAttribute('href')).toBe('https://www.v2ex.com/t/123#1')
    expect(aliceTag?.textContent).toBe('低质')

    const bobTag = bobLink.querySelector('a.gm-author-tag')
    expect(bobTag?.getAttribute('href')).toBe('https://www.v2ex.com/t/123#2')
    expect(bobTag?.textContent).toBe('清醒')

    expect(aliceLink.closest('tr')?.classList.contains('gm-author--2')).toBe(true)
    expect(bobLink.closest('tr')?.classList.contains('gm-author-1')).toBe(true)
  })

  test('tagAuthor increments an existing tag score', async () => {
    const writes: Record<string, unknown> = {}
    const values: Record<string, unknown> = {
      [authorTagsKeyword]: { alice: { [defaultLabels.shame]: { url: 't/123#1', score: -1 } } },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(_key: string, defaultValue: T) => (values[_key] as T) ?? defaultValue,
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.tagAuthor('alice', 1, defaultLabels.shame, -1)
    app.tagAuthor('alice', 1, defaultLabels.shame, -1)

    expect(writes[authorTagsKeyword]).toEqual({
      alice: { [defaultLabels.shame]: { url: 't/123#1', score: -3 } },
    })
  })

  test('tagAuthor creates a new tag for a fresh author', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.tagAuthor('alice', 1, 'AI researcher', 2)

    expect(writes[authorTagsKeyword]).toEqual({
      alice: { 'AI researcher': { url: 't/123#1', score: 2 } },
    })
  })

  test('tagAuthor supports multiple tags per author and sums to total score', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.tagAuthor('alice', 1, defaultLabels.shame, -2)
    app.tagAuthor('alice', 1, 'AI researcher', 3)

    expect(writes[authorTagsKeyword]).toEqual({
      alice: {
        [defaultLabels.shame]: { url: 't/123#1', score: -2 },
        'AI researcher': { url: 't/123#1', score: 3 },
      },
    })
    expect(app.getScore('alice')).toBe(1)
  })

  test('setTag and unsetTag manage tags explicitly', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.setTag('alice', 'A', 1, 1)
    app.setTag('alice', 'B', -1, 1)
    expect(app.getTags('alice')).toEqual({
      A: { url: 't/123#1', score: 1 },
      B: { url: 't/123#1', score: -1 },
    })

    app.unsetTag('alice', 'A')
    expect(app.getTags('alice')).toEqual({
      B: { url: 't/123#1', score: -1 },
    })
  })

  test('tag panel: quick action buttons write tags and refresh highlights', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.start()

    const topicTagBtn = dom.window.document.querySelector(
      '.topic_buttons .gm-tag-btn',
    ) as HTMLElement | null
    expect(topicTagBtn).not.toBeNull()

    topicTagBtn!.click()

    const thankBtn = dom.window.document.querySelector('.gm-tag-quick-thank') as HTMLElement | null
    expect(thankBtn).not.toBeNull()
    thankBtn!.click()

    expect(writes[authorTagsKeyword]).toEqual({
      'topic-author': { 智者: { url: 't/123#0', score: 1 } },
    })
  })

  test('tag panel: custom tag add form sets exact score', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.start()

    const tagBtn = dom.window.document.querySelector('#r_1 .gm-tag-btn') as HTMLElement | null
    expect(tagBtn).not.toBeNull()
    tagBtn!.click()

    const nameInput = dom.window.document.querySelector(
      '.gm-tag-input-name',
    ) as HTMLInputElement | null
    const scoreInput = dom.window.document.querySelector(
      '.gm-tag-input-score',
    ) as HTMLInputElement | null
    const addBtn = dom.window.document.querySelector('.gm-tag-add-btn') as HTMLElement | null
    expect(nameInput).not.toBeNull()
    expect(scoreInput).not.toBeNull()
    expect(addBtn).not.toBeNull()

    nameInput!.value = 'AI researcher'
    scoreInput!.value = '3'
    addBtn!.click()

    expect(writes[authorTagsKeyword]).toEqual({
      alice: { 'AI researcher': { url: 't/123#1', score: 3 } },
    })
  })

  test('getAuthorTagMap returns a snapshot, not a live reference', async () => {
    const runtime = createRuntime(dom)
    const app = await createV2exApp(runtime)

    app.setTag('alice', 'A', 1, 1)
    const snapshot = app.getAuthorTagMap()
    app.setTag('alice', 'B', 2, 1)

    expect(snapshot.alice?.B).toBeUndefined()
    expect(app.getTags('alice')?.B).toEqual({ url: 't/123#1', score: 2 })
  })

  test('extracts comments from html strings', async () => {
    const runtime = createRuntime(dom)
    const app = await createV2exApp(runtime)

    const comments = app.getCommentElementsFromHtmlString(threadHtml())

    expect(comments).toHaveLength(3)
    expect(comments[0].id).toBe('r_1')
  })

  test('collapses sibling replies individually without affecting other sibling replies', async () => {
    const html = `
      <html>
        <body>
          <div id="Main">
            <div class="box"></div>
            <div class="box"></div>
            <div class="box">
              <div class="cell">3 replies</div>
              <div class="cell" id="r_1">
                <table><tbody><tr>
                  <td><span class="no">1</span></td>
                  <td><strong><a class="dark" href="/member/alice">alice</a></strong><div class="reply_content">hello</div></td>
                </tr></tbody></table>
              </div>
              <div class="cell" id="r_2">
                <table><tbody><tr>
                  <td><span class="no">2</span></td>
                  <td><strong><a class="dark" href="/member/bob">bob</a></strong><div class="reply_content"><a href="/member/alice">@alice</a> #1 comment 2</div></td>
                </tr></tbody></table>
              </div>
              <div class="cell" id="r_3">
                <table><tbody><tr>
                  <td><span class="no">3</span></td>
                  <td><strong><a class="dark" href="/member/carol">carol</a></strong><div class="reply_content"><a href="/member/alice">@alice</a> #1 comment 3</div></td>
                </tr></tbody></table>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
    dom = createDom(html)
    const runtime = createRuntime(dom)
    const app = await createV2exApp(runtime)

    app.start()

    const r1 = dom.window.document.getElementById('r_1')!
    const r2 = dom.window.document.getElementById('r_2')!
    const r3 = dom.window.document.getElementById('r_3')!

    expect(r1.contains(r2)).toBe(true)
    expect(r1.contains(r3)).toBe(true)

    const r2CollapseBtn = r2.querySelector('button.gm.collapse') as HTMLButtonElement | null
    const r2ExpandBtn = r2.querySelector('button.gm.expand') as HTMLButtonElement | null
    const r3CollapseBtn = r3.querySelector('button.gm.collapse') as HTMLButtonElement | null
    const r3ExpandBtn = r3.querySelector('button.gm.expand') as HTMLButtonElement | null

    expect(r2CollapseBtn).not.toBeNull()
    expect(r2ExpandBtn).not.toBeNull()
    expect(r3CollapseBtn).not.toBeNull()
    expect(r3ExpandBtn).not.toBeNull()

    expect(r2ExpandBtn?.textContent).toContain('（1）')
    expect(r3ExpandBtn?.textContent).toContain('（1）')

    expect(r2.classList.contains('discussions-collapsed')).toBe(false)
    expect(r3.classList.contains('discussions-collapsed')).toBe(false)

    r2CollapseBtn!.click()

    expect(r2.classList.contains('discussions-collapsed')).toBe(true)
    expect(r3.classList.contains('discussions-collapsed')).toBe(false)
    expect(r1.classList.contains('discussions-collapsed')).toBe(false)
  })
})

describe('v2ex app integration', () => {
  test('runs the no-pagination startup flow in jsdom', async () => {
    const dom = createDom(threadHtml())
    const values: Record<string, unknown> = {
      [authorTagsKeyword]: {
        alice: { 低质: { url: 't/123#1', score: -1 } },
        bob: { 清醒: { url: 't/123#2', score: 1 } },
      },
    }
    const runtime = {
      ...createRuntime(dom),
      getValue: async <T>(_key: string, defaultValue: T) => (values[_key] as T) ?? defaultValue,
    }
    const app = await createV2exApp(runtime)

    app.start()

    const commentBoxIds = Array.from(
      dom.window.document.querySelectorAll('#Main > .box > .cell[id]'),
    ).map((it) => it.id)
    expect(commentBoxIds).toEqual(['r_1', 'r_3'])
    expect(dom.window.document.querySelector('#r_1 > #r_2')).not.toBeNull()
    const aliceTag = dom.window.document
      .querySelector('a[href="/member/alice"]')
      ?.querySelector('a.gm-author-tag')
    expect(aliceTag?.textContent).toBe('低质')
    expect(dom.window.document.querySelector('.topic-link')?.getAttribute('target')).toBe('_blank')
  })
  test('loads page 1 comments from DOM and fetches subsequent pages when on page 1', async () => {
    const page1Html = `
      <html><head></head><body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">2 replies</div>
            <div class="cell" id="r_1">
              <table><tbody><tr>
                <td><span class="no">1</span></td>
                <td><strong><a class="dark" href="/member/alice">alice</a></strong>
                  <div class="reply_content">page one comment</div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
        <div class="cell ps_container">
          <a href="?p=1" class="page_current">1</a>
          <a href="?p=2" class="page_normal">2</a>
        </div>
        <div class="header"><img class="avatar" alt="topic-author"></div>
        <div class="topic_buttons"></div>
        <a id="topic_thank">感谢主题作者</a>
      </body></html>
    `
    const page2Html = `
      <html><head></head><body>
        <div id="Main">
          <div class="box"></div>
          <div class="box"></div>
          <div class="box">
            <div class="cell">2 replies</div>
            <div class="cell" id="r_2">
              <table><tbody><tr>
                <td><span class="no">2</span></td>
                <td><strong><a class="dark" href="/member/bob">bob</a></strong>
                  <div class="reply_content">page two comment</div>
                </td>
              </tr></tbody></table>
            </div>
          </div>
        </div>
      </body></html>
    `

    const dom = createDom(page1Html)
    let page2Callback: ((response: { responseText: string }) => void) | null = null

    const runtime = {
      ...createRuntime(dom),
      request: ({
        onload,
      }: {
        url: string
        method: string
        timeout: number
        onload: (r: { responseText: string }) => void
      }) => {
        page2Callback = onload
      },
    }

    const app = await createV2exApp(runtime)
    app.start()

    page2Callback!({ responseText: page2Html })

    const ids = Array.from(dom.window.document.querySelectorAll('#Main > .box > .cell[id]')).map(
      (el) => el.id,
    )
    expect(ids).toContain('r_1')
    expect(ids).toContain('r_2')
  })
})

describe('auto sign-in', () => {
  test('extractRedeemUrl parses the redeem path from mission page HTML', () => {
    const html = `
      <html><body>
        <input type="button" class="super normal button" value="领取 88 铜币"
          onclick="location.href = '/mission/daily/redeem?once=75573';">
      </body></html>
    `
    expect(extractRedeemUrl(html)).toBe('/mission/daily/redeem?once=75573')
  })

  test('extractRedeemUrl returns null when the redeem button is absent', () => {
    expect(extractRedeemUrl('<html><body><p>Already signed in.</p></body></html>')).toBeNull()
  })

  test('checkAndDoSignIn fetches mission page then fires redeem request', async () => {
    const homepageHtml = `
      <html><head></head><body>
        <a href="/mission/daily">每日登录</a>
      </body></html>
    `
    const missionPageHtml = `
      <html><body>
        <input type="button" value="领取 60 铜币"
          onclick="location.href = '/mission/daily/redeem?once=99999';">
      </body></html>
    `

    const dom = createDom(homepageHtml, 'https://www.v2ex.com/')
    const requests: string[] = []
    let missionOnload: ((r: { responseText: string }) => void) | null = null
    let redeemOnload: ((r: { responseText: string }) => void) | null = null

    const runtime = {
      ...createRuntime(dom),
      request: ({
        url,
        onload,
      }: {
        url: string
        method: string
        timeout: number
        onload: (r: { responseText: string }) => void
      }) => {
        requests.push(url)
        if (url.includes('/mission/daily') && !url.includes('redeem')) {
          missionOnload = onload
        } else if (url.includes('redeem')) {
          redeemOnload = onload
        }
      },
    }

    const app = await createV2exApp(runtime)
    app.start()

    expect(requests).toContain('https://www.v2ex.com/mission/daily')

    missionOnload!({ responseText: missionPageHtml })

    expect(requests).toContain('https://www.v2ex.com/mission/daily/redeem?once=99999')
    expect(redeemOnload).not.toBeNull()
  })

  test('checkAndDoSignIn does nothing when mission link is absent', async () => {
    const dom = createDom(
      '<html><head></head><body><p>no sign-in prompt</p></body></html>',
      'https://www.v2ex.com/',
    )
    const requests: string[] = []
    const runtime = {
      ...createRuntime(dom),
      request: ({
        url,
      }: {
        url: string
        method: string
        timeout: number
        onload: (r: { responseText: string }) => void
      }) => {
        requests.push(url)
      },
    }

    const app = await createV2exApp(runtime)
    app.start()

    expect(requests.some((u) => u.includes('mission'))).toBe(false)
  })
})

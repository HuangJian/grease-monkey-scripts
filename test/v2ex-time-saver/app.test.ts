import { beforeEach, describe, expect, test, afterAll } from 'bun:test'
import { Window } from 'happy-dom'
import { authorTagsKeyword, createV2exApp, defaultLabels } from '../../src/v2ex-time-saver/app'
import {
  checkAndDoSignIn,
  extractRedeemUrl,
  runSignInIfNeeded,
  signInStateKey,
} from '../../src/v2ex-time-saver/app/sign-in'
import { createDom, createRuntime, closeAllWindows, type TestRuntime } from '../runtime'

/** Yield past pending microtasks so fire-and-forget work can settle. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

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
  let dom: Window

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

    const aliceLink = dom.document.querySelector(
      'a[href="/member/alice"]',
    ) as unknown as HTMLElement
    const bobLink = dom.document.querySelector('a[href="/member/bob"]') as unknown as HTMLElement

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

    const topicTagBtn = dom.document.querySelector(
      '.topic_buttons .gm-tag-btn',
    ) as unknown as HTMLElement | null
    expect(topicTagBtn).not.toBeNull()

    topicTagBtn!.click()

    const thankBtn = dom.document.querySelector(
      '.gm-tag-quick-thank',
    ) as unknown as HTMLElement | null
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

    const tagBtn = dom.document.querySelector('#r_1 .gm-tag-btn') as unknown as HTMLElement | null
    expect(tagBtn).not.toBeNull()
    tagBtn!.click()

    const nameInput = dom.document.querySelector('.gm-tag-input-name') as HTMLInputElement | null
    const scoreInput = dom.document.querySelector('.gm-tag-input-score') as HTMLInputElement | null
    const addBtn = dom.document.querySelector('.gm-tag-add-btn') as unknown as HTMLElement | null
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

  test('tag panel: custom tag add form accepts a zero score', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.start()

    const tagBtn = dom.document.querySelector('#r_1 .gm-tag-btn') as unknown as HTMLElement | null
    tagBtn!.click()

    const nameInput = dom.document.querySelector('.gm-tag-input-name') as HTMLInputElement | null
    const scoreInput = dom.document.querySelector('.gm-tag-input-score') as HTMLInputElement | null
    const addBtn = dom.document.querySelector('.gm-tag-add-btn') as unknown as HTMLElement | null

    nameInput!.value = '潜水员'
    scoreInput!.value = '0'
    addBtn!.click()

    expect(writes[authorTagsKeyword]).toEqual({
      alice: { 潜水员: { url: 't/123#1', score: 0 } },
    })
  })

  test('tag panel: an emptied score field defaults to zero instead of dropping the tag', async () => {
    const writes: Record<string, unknown> = {}
    const runtime = {
      ...createRuntime(dom),
      setValue: (key: string, value: unknown) => {
        writes[key] = value
      },
    }
    const app = await createV2exApp(runtime)

    app.start()

    const tagBtn = dom.document.querySelector('#r_1 .gm-tag-btn') as unknown as HTMLElement | null
    tagBtn!.click()

    const nameInput = dom.document.querySelector('.gm-tag-input-name') as HTMLInputElement | null
    const scoreInput = dom.document.querySelector('.gm-tag-input-score') as HTMLInputElement | null
    const addBtn = dom.document.querySelector('.gm-tag-add-btn') as unknown as HTMLElement | null

    nameInput!.value = '机器人'
    scoreInput!.value = ''
    addBtn!.click()

    expect(writes[authorTagsKeyword]).toEqual({
      alice: { 机器人: { url: 't/123#1', score: 0 } },
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
    expect(comments[0]!.id).toBe('r_1')
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

    const r1 = dom.document.getElementById('r_1')!
    const r2 = dom.document.getElementById('r_2')!
    const r3 = dom.document.getElementById('r_3')!

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

    const commentBoxIds = Array.from(dom.document.querySelectorAll('#Main > .box > .cell[id]')).map(
      (it) => it.id,
    )
    expect(commentBoxIds).toEqual(['r_1', 'r_3'])
    expect(dom.document.querySelector('#r_1 > #r_2')).not.toBeNull()
    const aliceTag = dom.document
      .querySelector('a[href="/member/alice"]')
      ?.querySelector('a.gm-author-tag')
    expect(aliceTag?.textContent).toBe('低质')
    expect(dom.document.querySelector('.topic-link')?.getAttribute('target')).toBe('_blank')
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

    const ids = Array.from(dom.document.querySelectorAll('#Main > .box > .cell[id]')).map(
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

  const TODAY_MS = new Date(2026, 8, 11, 10, 0, 0).getTime()
  const TODAY = '2026-09-11'
  const YESTERDAY_MS = TODAY_MS - 24 * 60 * 60 * 1000

  const MISSION_HTML = `
    <html><body>
      <input type="button" value="领取 60 铜币"
        onclick="location.href = '/mission/daily/redeem?once=99999';">
    </body></html>
  `
  const NO_REWARD_HTML = '<html><body><p>今日的登录奖励已领取</p></body></html>'

  type SignInHarness = {
    runtime: TestRuntime
    requests: string[]
    /** Answer the pending `/mission/daily` request. */
    respondMission(html: string): void
    /** Fail the pending `/mission/daily` request. */
    failMission(): void
  }

  function createSignInHarness(options: {
    html: string
    url?: string
    store?: Record<string, unknown>
  }): SignInHarness {
    const dom = createDom(options.html, options.url ?? 'https://www.v2ex.com/t/123')
    const requests: string[] = []
    let missionOnload: ((html: string) => void) | null = null
    let missionOnerror: (() => void) | null = null

    const runtime: TestRuntime = {
      ...createRuntime(dom),
      request: (details) => {
        requests.push(details.url)
        if (details.url.includes('redeem')) {
          details.onload({ responseText: '', status: 302, responseHeaders: '' })
          return
        }
        missionOnload = (html) =>
          details.onload({ responseText: html, status: 200, responseHeaders: '' })
        missionOnerror = () => details.onerror?.()
      },
    }
    for (const [key, value] of Object.entries(options.store ?? {})) {
      runtime.stores[key] = value
    }
    runtime.setClock(TODAY_MS)

    return {
      runtime,
      requests,
      respondMission: (html) => missionOnload!(html),
      failMission: () => missionOnerror!(),
    }
  }

  test('signs in on a non-homepage page when today has no attempt yet', async () => {
    const h = createSignInHarness({ html: '<html><body><p>a thread</p></body></html>' })

    const pending = runSignInIfNeeded(h.runtime)
    await flushAsync()

    expect(h.requests).toEqual(['https://www.v2ex.com/mission/daily'])

    h.respondMission(MISSION_HTML)
    await pending

    expect(h.requests).toEqual([
      'https://www.v2ex.com/mission/daily',
      'https://www.v2ex.com/mission/daily/redeem?once=99999',
    ])
    expect(h.runtime.stores[signInStateKey]).toEqual({ attemptedDate: TODAY, signedAt: TODAY_MS })
  })

  test('does nothing when today is already recorded', async () => {
    const h = createSignInHarness({
      html: '<html><body><p>a thread</p></body></html>',
      store: { [signInStateKey]: { attemptedDate: TODAY, signedAt: TODAY_MS - 60_000 } },
    })

    await runSignInIfNeeded(h.runtime)

    expect(h.requests).toEqual([])
  })

  test('signs in again once the recorded day is not today', async () => {
    const h = createSignInHarness({
      html: '<html><body><p>a thread</p></body></html>',
      store: { [signInStateKey]: { attemptedDate: '2026-09-10', signedAt: YESTERDAY_MS } },
    })

    const pending = runSignInIfNeeded(h.runtime)
    await flushAsync()

    expect(h.requests).toEqual(['https://www.v2ex.com/mission/daily'])

    h.respondMission(MISSION_HTML)
    await pending

    expect(h.runtime.stores[signInStateKey]).toEqual({ attemptedDate: TODAY, signedAt: TODAY_MS })
  })

  test('records the day but keeps the last success time when no reward is available', async () => {
    const h = createSignInHarness({
      html: '<html><body><p>a thread</p></body></html>',
      store: { [signInStateKey]: { attemptedDate: '2026-09-10', signedAt: YESTERDAY_MS } },
    })

    const pending = runSignInIfNeeded(h.runtime)
    await flushAsync()

    h.respondMission(NO_REWARD_HTML)
    await pending

    expect(h.runtime.stores[signInStateKey]).toEqual({
      attemptedDate: TODAY,
      signedAt: YESTERDAY_MS,
    })
  })

  test('records nothing when the mission request fails, so the next page retries', async () => {
    const h = createSignInHarness({ html: '<html><body><p>a thread</p></body></html>' })

    const pending = runSignInIfNeeded(h.runtime)
    await flushAsync()

    h.failMission()
    await pending

    expect(h.runtime.stores[signInStateKey]).toBeUndefined()
  })

  test('reports success in the sidebar link when it is present', async () => {
    const h = createSignInHarness({
      html: '<html><body><a href="/mission/daily">每日登录</a></body></html>',
      url: 'https://www.v2ex.com/',
    })

    const pending = runSignInIfNeeded(h.runtime)
    await flushAsync()

    h.respondMission(MISSION_HTML)
    await pending

    expect(h.runtime.document.querySelector("a[href='/mission/daily']")?.textContent).toBe(
      '自动签到成功',
    )
  })

  test('checkAndDoSignIn runs the check in the background', async () => {
    const h = createSignInHarness({ html: '<html><body><p>a thread</p></body></html>' })

    checkAndDoSignIn(h.runtime)
    await flushAsync()

    expect(h.requests).toEqual(['https://www.v2ex.com/mission/daily'])
  })

  test('app.start() triggers the background sign-in on a thread page', async () => {
    const h = createSignInHarness({ html: threadHtml() })

    const app = await createV2exApp(h.runtime)
    app.start()
    await flushAsync()

    expect(h.requests).toContain('https://www.v2ex.com/mission/daily')
  })
})

afterAll(() => closeAllWindows())

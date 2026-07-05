import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/preact'
import { Window } from 'happy-dom'
import { createXueqiuState } from '../../../src/prism/xueqiu/state'
import type { XueqiuState } from '../../../src/prism/xueqiu/state'
import type { XueqiuNewsItem, XueqiuRenderData } from '../../../src/prism/xueqiu/types'
import { packImages, XueqiuComponent } from '../../../src/prism/xueqiu/component'
import { createRuntime, createHappyDom, closeAllWindows } from '../../runtime'
import type { TestRuntime } from '../../runtime'

function makeItem(id: number, created_at: number = Date.now()): XueqiuNewsItem {
  return {
    id,
    title: `Item ${id}`,
    description: '',
    text: '',
    target: `/status/${id}`,
    created_at,
    status_id: id,
    reply_count: 0,
    like_count: 0,
    share_count: 0,
    view_count: 0,
    sub_type: 0,
  }
}

describe('xueqiu unread filter with expand (filterUnread)', () => {
  let state: XueqiuState

  beforeEach(() => {
    state = createXueqiuState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
  })

  afterEach(() => {
    state.clear()
  })

  test('bugfix: expanded item stays visible when filterUnread is on and item is read', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))
    state.setExpanded(String(item.id), true)

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe(1)
  })

  test('read non-expanded item is excluded by filterUnread', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(0)
  })

  test('unread item is included by filterUnread regardless of expanded state', () => {
    const item = makeItem(1)
    const items = [item]

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(1)
  })

  test('collapsing a read item removes it from filterUnread results', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))
    state.setExpanded(String(item.id), true)

    let filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })
    expect(filtered).toHaveLength(1)

    state.setExpanded(String(item.id), false)

    filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })
    expect(filtered).toHaveLength(0)
  })
})

describe('packImages', () => {
  test('removes whitespace between adjacent figure elements', () => {
    const html =
      '<figure class="xq-figure"><img src="a.jpeg"></figure>\n    <figure class="xq-figure"><img src="b.jpeg"></figure>'
    expect(packImages(html)).toBe(
      '<figure class="xq-figure"><img src="a.jpeg"></figure><figure class="xq-figure"><img src="b.jpeg"></figure>',
    )
  })

  test('does not pack figures separated by <br> (only whitespace is removed)', () => {
    const html = '<figure><img src="a.jpeg"></figure>\n<br>\n<figure><img src="b.jpeg"></figure>'
    // The <br> breaks the </figure>\s+<figure pattern, so nothing is removed.
    expect(packImages(html)).toBe(html)
  })

  test('preserves whitespace between figure and non-figure siblings', () => {
    const html = '<p>aaa</p>\n    <figure><img src="a.jpeg"></figure>\n    <p>bbb</p>'
    expect(packImages(html)).toBe(html)
  })

  test('packs multiple consecutive figures', () => {
    const html = [
      '<figure><img src="1.jpeg"></figure>',
      '<figure><img src="2.jpeg"></figure>',
      '<figure><img src="3.jpeg"></figure>',
    ].join('\n    ')
    const expected = [
      '<figure><img src="1.jpeg"></figure>',
      '<figure><img src="2.jpeg"></figure>',
      '<figure><img src="3.jpeg"></figure>',
    ].join('')
    expect(packImages(html)).toBe(expected)
  })

  test('leaves non-figure html untouched', () => {
    const html = '<p>hello</p>\n<p>world</p>'
    expect(packImages(html)).toBe(html)
  })

  test('handles real xueqiu figure structure', () => {
    const html =
      '<p>aaa</p>\n<p>bbb</p>\n<figure class="xq-figure"><img class="ke_img" src="a.jpeg"></figure>\n    <figure class="xq-figure"><img class="ke_img" src="b.jpeg"></figure>\n<p>xxx</p>'
    expect(packImages(html)).toBe(
      '<p>aaa</p>\n<p>bbb</p>\n<figure class="xq-figure"><img class="ke_img" src="a.jpeg"></figure><figure class="xq-figure"><img class="ke_img" src="b.jpeg"></figure>\n<p>xxx</p>',
    )
  })

  test('normalizes <p><img></p> into <figure class="xq-figure">', () => {
    const html = '<p><img src="a.jpeg" class="ke_img"></p>'
    expect(packImages(html)).toBe(
      '<figure class="xq-figure"><img src="a.jpeg" class="ke_img"></figure>',
    )
  })

  test('does not normalize <p> with text and img', () => {
    const html = '<p>text <img src="a.jpeg"></p>'
    expect(packImages(html)).toBe(html)
  })

  test('does not normalize <p> with img and text', () => {
    const html = '<p><img src="a.jpeg"> text</p>'
    expect(packImages(html)).toBe(html)
  })

  test('packs consecutive p-wrapped images after normalization', () => {
    const html =
      '<p><img src="a.jpeg" class="ke_img"></p>\n    <p><img src="b.jpeg" class="ke_img"></p>'
    expect(packImages(html)).toBe(
      '<figure class="xq-figure"><img src="a.jpeg" class="ke_img"></figure><figure class="xq-figure"><img src="b.jpeg" class="ke_img"></figure>',
    )
  })

  test('handles real xueqiu p-wrapped image structure', () => {
    const html = [
      '<p><img src="1.png" class="ke_img"></p>',
      '<p><b>标题</b></p>',
      '<p><img src="2.jpg" class="ke_img"></p>',
      '<p><img src="3.jpg" class="ke_img"></p>',
      '<p>xxx</p>',
      '<p><img src="4.jpg" class="ke_img"></p>',
      '<p>yyy</p>',
    ].join('\n    ')
    const expected = [
      '<figure class="xq-figure"><img src="1.png" class="ke_img"></figure>',
      '<p><b>标题</b></p>',
      '<figure class="xq-figure"><img src="2.jpg" class="ke_img"></figure><figure class="xq-figure"><img src="3.jpg" class="ke_img"></figure>',
      '<p>xxx</p>',
      '<figure class="xq-figure"><img src="4.jpg" class="ke_img"></figure>',
      '<p>yyy</p>',
    ].join('\n    ')
    expect(packImages(html)).toBe(expected)
  })
})

describe('XueqiuComponent Enter-to-collapse', () => {
  let dom: Window
  let runtime: TestRuntime
  let state: XueqiuState
  // Use unknown to avoid happy-dom vs global HTMLElement type conflicts
  let root: unknown

  beforeEach(() => {
    dom = createHappyDom('<!doctype html><html><body></body></html>')
    runtime = createRuntime(dom)
    state = createXueqiuState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    // Use a real DOM element as root so querySelector / addEventListener work
    const el = dom.document.createElement('div')
    dom.document.body.appendChild(el)
    root = el
  })

  afterEach(() => {
    cleanup()
    state.clear()
  })

  afterAll(() => closeAllWindows())

  function makeData(): XueqiuRenderData {
    return {
      news: [makeItem(1, Date.now()), makeItem(2, Date.now() - 1000)],
      hotPosts: [],
    }
  }

  function dispatchEnter(): void {
    const e = new dom.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    // Dispatch on a rendered element so composedPath()[0] is an Element
    const target = (root as HTMLElement).querySelector('.gm-sp-expandable-row')
    const eventTarget = (target ?? dom.document.body) as unknown as EventTarget
    eventTarget.dispatchEvent(e as unknown as Event)
  }

  test('Enter collapses expanded item', () => {
    state.setExpanded('1', true)

    render(
      <XueqiuComponent
        data={makeData()}
        runtime={runtime}
        state={state}
        mode="news"
        dateFilter="全"
        filterUnread={false}
        root={root as unknown as ShadowRoot}
      />,
      { container: root as unknown as HTMLElement },
    )

    // Verify item is expanded
    expect(state.isExpanded('1')).toBe(true)

    // Dispatch Enter on document — simulates key press when expandable row
    // does NOT have focus (e.g. after clicking body text or closing lightbox)
    dispatchEnter()

    // Item should now be collapsed
    expect(state.isExpanded('1')).toBe(false)
  })

  test('Enter does not collapse when no item is expanded', () => {
    render(
      <XueqiuComponent
        data={makeData()}
        runtime={runtime}
        state={state}
        mode="news"
        dateFilter="全"
        filterUnread={false}
        root={root as unknown as ShadowRoot}
      />,
      { container: root as unknown as HTMLElement },
    )

    dispatchEnter()

    // Nothing should have changed
    expect(state.isExpanded('1')).toBe(false)
    expect(state.isExpanded('2')).toBe(false)
  })
})

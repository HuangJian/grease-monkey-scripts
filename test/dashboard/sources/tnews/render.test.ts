import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderTnews } from '../../../../src/dashboard/tnews/render'
import { createTnewsState } from '../../../../src/dashboard/tnews/state'
import type { TnewsItem } from '../../../../src/dashboard/tnews/types'
import { STATE_KEY } from '../../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
}

function makeRuntime(dom: JSDOM): TestRuntime {
  return createRuntime(dom)
}

const NOW = Date.parse('Mon, 06 Jan 2025 12:00:00 GMT')

function makeItem(over: Partial<TnewsItem> = {}): TnewsItem {
  return {
    id: over.id ?? 'https://t.me/x/1',
    title: over.title ?? 'Title',
    link: over.link ?? 'https://t.me/x/1',
    pubDate: over.pubDate ?? Date.parse('Mon, 06 Jan 2025 10:00:00 GMT'),
    descriptionHtml: over.descriptionHtml ?? '<p>body</p>',
  }
}

function getRoot(dom: JSDOM): HTMLDivElement {
  return dom.window.document.getElementById('root') as HTMLDivElement
}

describe('renderTnews', () => {
  test('renders empty placeholder when items is null', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    renderTnews(getRoot(dom), null, state, runtime, NOW)
    const html = getRoot(dom).innerHTML
    expect(html).toContain('暂无数据')
  })

  test('renders empty placeholder when items is empty', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    renderTnews(getRoot(dom), [], state, runtime, NOW)
    expect(getRoot(dom).innerHTML).toContain('暂无数据')
  })

  test('renders an <ol> with one <li> per item', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [
      makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1', title: 'A' }),
      makeItem({ id: 'https://t.me/b/2', link: 'https://t.me/b/2', title: 'B' }),
    ]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    expect(root.querySelectorAll('.gm-sp-list-item').length).toBe(2)
    expect(root.querySelector('ol.gm-sp-list')).not.toBeNull()
  })

  test('click on row toggles expanded state and updates DOM', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const row = li.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(false)
    expect(root.querySelector('.gm-sp-tnews-body')).toBeNull()
    row.click()
    expect(root.querySelector<HTMLElement>('.gm-sp-tnews-body')!.hidden).toBe(false)
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(state.isExpanded('https://t.me/a/1')).toBe(true)
    row.click()
    expect(root.querySelector('.gm-sp-tnews-body')).toBeNull()
    expect(state.isExpanded('https://t.me/a/1')).toBe(false)
  })

  test('click on row marks as read', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const row = li.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    row.click()
    expect(state.isRead('https://t.me/a/1')).toBe(true)
    expect(li.classList.contains('gm-sp-item-read')).toBe(true)
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(true)
  })

  test('previously read items still show read class', () => {
    const dom = makeDom()
    const state = createTnewsState()
    state.markRead('https://t.me/a/1')
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    expect(li.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('clicking hide button does not toggle expand', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const hideBtn = li.querySelector<HTMLButtonElement>('.gm-sp-item-hide')!
    hideBtn.click()
    expect(state.isExpanded('https://t.me/a/1')).toBe(false)
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(false)
  })

  test('clicking body content does not toggle expand', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [
      makeItem({
        id: 'https://t.me/a/1',
        link: 'https://t.me/a/1',
        descriptionHtml: '<p>content</p>',
      }),
    ]
    state.setExpanded('https://t.me/a/1', true)
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const body = li.querySelector<HTMLElement>('.gm-sp-tnews-body')!
    expect(body.hidden).toBe(false)
    body.click()
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(state.isExpanded('https://t.me/a/1')).toBe(true)
  })

  test('clicking row collapses other expanded items', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [
      makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1', title: 'A' }),
      makeItem({ id: 'https://t.me/b/2', link: 'https://t.me/b/2', title: 'B' }),
    ]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li1 = root.querySelectorAll<HTMLElement>('.gm-sp-list-item')[0]
    const row1 = li1.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    const li2 = root.querySelectorAll<HTMLElement>('.gm-sp-list-item')[1]
    const row2 = li2.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    row1.click()
    expect(li1.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(state.isExpanded('https://t.me/a/1')).toBe(true)
    row2.click()
    expect(li1.classList.contains('gm-sp-list-item-expanded')).toBe(false)
    expect(state.isExpanded('https://t.me/a/1')).toBe(false)
    expect(li2.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(state.isExpanded('https://t.me/b/2')).toBe(true)
  })

  test('hide click removes the item from DOM and marks hidden', async () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    runtime.stores['dashboard:v1:tnews'] = {
      schemaVersion: 2,
      data: [
        makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' }),
        makeItem({ id: 'https://t.me/b/2', link: 'https://t.me/b/2' }),
      ],
      fetchedAt: NOW,
      byteSize: 0,
    }
    const items = [
      makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' }),
      makeItem({ id: 'https://t.me/b/2', link: 'https://t.me/b/2' }),
    ]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const hideBtn = li.querySelector<HTMLButtonElement>('.gm-sp-item-hide')!
    hideBtn.click()
    expect(state.isHidden('https://t.me/a/1')).toBe(true)
    expect(root.querySelectorAll('.gm-sp-list-item').length).toBe(1)
    await new Promise((r) => setTimeout(r, 0))
    const cached = runtime.stores['dashboard:v1:tnews'] as { data: TnewsItem[] } | undefined
    expect(cached?.data.map((it) => it.id)).toEqual(['https://t.me/b/2'])
  })

  test('description body renders the sanitized html from the item', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [
      makeItem({
        id: 'https://t.me/a/1',
        link: 'https://t.me/a/1',
        descriptionHtml: '<p>safe body</p><img src="https://x/i.png" alt="img"/>',
      }),
    ]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const row = root.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    row.click()
    const body = root.querySelector<HTMLElement>('.gm-sp-tnews-body')!
    expect(body.innerHTML).toContain('<p>safe body</p>')
    expect(body.innerHTML).toContain('src="https://x/i.png"')
  })

  test('default title is empty string, falls back to (无标题) in render', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1', title: '' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const title = getRoot(dom).querySelector<HTMLElement>('.gm-sp-tnews-title')!
    expect(title.textContent).toBe('(无标题)')
  })

  test('read item keeps read class when expanded (CSS controls opacity)', () => {
    const dom = makeDom()
    const state = createTnewsState()
    state.markRead('https://t.me/a/1')
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    expect(li.classList.contains('gm-sp-item-read')).toBe(true)
    const row = li.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    row.click()
    expect(li.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(li.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('strips leading symbols from title', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [
      makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1', title: '↩️🖼real title' }),
      makeItem({ id: 'https://t.me/b/2', link: 'https://t.me/b/2', title: '🔴news' }),
    ]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const titles = root.querySelectorAll<HTMLElement>('.gm-sp-tnews-title')
    expect(titles[0]!.textContent).toBe('real title')
    expect(titles[1]!.textContent).toBe('news')
  })

  test('bugfix: click on row persists read status to storage', async () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-list-item')!
    const row = li.querySelector<HTMLElement>('.gm-sp-tnews-row')!
    row.click()
    expect(state.isRead('https://t.me/a/1')).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    const stored = runtime.stores[STATE_KEY('tnews')] as Record<string, { r?: number }>
    expect(stored['https://t.me/a/1']?.r).toBeGreaterThan(0)
  })
})

import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderTnews } from '../../../../src/dashboard/tnews/render'
import { createTnewsState } from '../../../../src/dashboard/tnews/state'
import type { TnewsItem } from '../../../../src/dashboard/tnews/types'
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
    expect(root.querySelectorAll('.gm-sp-tnews-item').length).toBe(2)
    expect(root.querySelector('ol.gm-sp-tnews-list')).not.toBeNull()
  })

  test('chevron click toggles expanded state and updates DOM', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-tnews-item')!
    const chevron = li.querySelector<HTMLButtonElement>('.gm-sp-tnews-chevron')!
    const body = li.querySelector<HTMLElement>('.gm-sp-tnews-body')!
    expect(body.hidden).toBe(true)
    expect(li.classList.contains('gm-sp-tnews-item-expanded')).toBe(false)
    chevron.click()
    expect(body.hidden).toBe(false)
    expect(li.classList.contains('gm-sp-tnews-item-expanded')).toBe(true)
    expect(state.isExpanded('https://t.me/a/1')).toBe(true)
    chevron.click()
    expect(body.hidden).toBe(true)
    expect(state.isExpanded('https://t.me/a/1')).toBe(false)
  })

  test('title click without modifier prevents default, marks read, expands', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-tnews-item')!
    const title = li.querySelector<HTMLAnchorElement>('.gm-sp-tnews-title')!
    let prevented = false
    title.addEventListener('click', (e) => {
      if (e.defaultPrevented) prevented = true
    })
    title.click()
    expect(prevented).toBe(true)
    expect(state.isRead('https://t.me/a/1')).toBe(true)
    expect(li.classList.contains('gm-sp-tnews-read')).toBe(true)
    expect(li.classList.contains('gm-sp-tnews-item-expanded')).toBe(true)
  })

  test('title click with ctrlKey does not preventDefault and does not expand', () => {
    const dom = makeDom()
    const state = createTnewsState()
    const runtime = makeRuntime(dom)
    const items = [makeItem({ id: 'https://t.me/a/1', link: 'https://t.me/a/1' })]
    renderTnews(getRoot(dom), items, state, runtime, NOW)
    const root = getRoot(dom)
    const li = root.querySelector<HTMLElement>('.gm-sp-tnews-item')!
    const title = li.querySelector<HTMLAnchorElement>('.gm-sp-tnews-title')!
    let prevented = false
    title.addEventListener('click', (e) => {
      if (e.defaultPrevented) prevented = true
    })
    const ev = new dom.window.MouseEvent('click', { ctrlKey: true, bubbles: true })
    title.dispatchEvent(ev)
    expect(prevented).toBe(false)
    expect(state.isExpanded('https://t.me/a/1')).toBe(false)
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
    const li = root.querySelector<HTMLElement>('.gm-sp-tnews-item')!
    const hideBtn = li.querySelector<HTMLButtonElement>('.gm-sp-tnews-hide')!
    hideBtn.click()
    expect(state.isHidden('https://t.me/a/1')).toBe(true)
    expect(root.querySelectorAll('.gm-sp-tnews-item').length).toBe(1)
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
    const body = getRoot(dom).querySelector<HTMLElement>('.gm-sp-tnews-body')!
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
})

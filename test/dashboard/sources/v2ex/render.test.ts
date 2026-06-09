import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderV2ex } from '../../../../src/dashboard/v2ex/render'
import { createV2exState } from '../../../../src/dashboard/v2ex/state'
import type { V2exTopic } from '../../../../src/dashboard/v2ex/types'
import type { Runtime } from '../../../../src/runtime'
import { STATE_KEY } from '../../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

const FIXTURE: V2exTopic[] = [
  {
    id: 1,
    title: 'A',
    url: 'https://www.v2ex.com/t/1',
    replies: 10,
    member: { username: 'alice' },
    node: { title: 'node-a' },
    sources: [],
  },
  {
    id: 2,
    title: 'B',
    url: 'https://www.v2ex.com/t/2',
    replies: 20,
    member: { username: 'bob' },
    node: { title: 'node-b' },
    sources: [],
  },
  {
    id: 3,
    title: 'C',
    url: 'https://www.v2ex.com/t/3',
    replies: 30,
    member: { username: 'carol' },
    node: { title: 'node-c' },
    sources: [],
  },
]

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>')
}

function fixtureWithSources(sources: V2exTopic['sources']): V2exTopic[] {
  return [
    {
      ...FIXTURE[0],
      sources,
    },
  ]
}

describe('renderV2ex', () => {
  let dom: JSDOM
  let runtime: TestRuntime
  let container: HTMLElement
  let state: ReturnType<typeof createV2exState>

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
    container = dom.window.document.createElement('div')
    state = createV2exState()
  })

  test('renders topic list with links and meta', () => {
    renderV2ex(container, FIXTURE, state, null)
    const items = container.querySelectorAll('.gm-sp-list-item')
    expect(items).toHaveLength(3)
    const firstLink = items[0].querySelector('.gm-sp-item-title') as HTMLAnchorElement
    expect(firstLink.href).toContain('/t/1')
    expect(items[0].querySelector('.gm-sp-v2ex-author')!.textContent).toBe('@alice')
    expect(items[0].querySelector('.gm-sp-item-count')!.textContent).toBe('10')
    expect(items[0].querySelector('.gm-sp-item-count')!.getAttribute('title')).toBe('回复数')
    expect(items[0].querySelector('.gm-sp-v2ex-source')!.textContent).toBe('')
  })

  test('shows badge for cross-source topics', () => {
    renderV2ex(container, fixtureWithSources(['api', 'page']), state, null)
    const item = container.querySelector('.gm-sp-list-item')!
    const badge = item.querySelector('.gm-sp-v2ex-source')!
    expect(badge.textContent).toBe('🔥')
    expect(badge.getAttribute('title')).toBe('双源确认热帖')
  })

  test('shows badge for api source', () => {
    renderV2ex(container, fixtureWithSources(['api']), state, null)
    const badge = container.querySelector('.gm-sp-v2ex-source')!
    expect(badge.textContent).toBe('⏳')
    expect(badge.getAttribute('title')).toBe('API 抓取或历史热帖')
  })

  test('shows badge for page-only topic', () => {
    renderV2ex(container, fixtureWithSources(['page']), state, null)
    const badge = container.querySelector('.gm-sp-v2ex-source')!
    expect(badge.textContent).toBe('🌅')
    expect(badge.getAttribute('title')).toBe('今天发布的热帖')
  })

  test('renders empty state when no topics', () => {
    renderV2ex(container, [], state, null)
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })

  test('renders empty state when data is null', () => {
    renderV2ex(container, null, state, null)
    expect(container.querySelector('.gm-sp-empty')).not.toBeNull()
  })

  test('filters out hidden topics', () => {
    state.markHidden(2)
    renderV2ex(container, FIXTURE, state, null)
    const items = container.querySelectorAll('.gm-sp-list-item')
    expect(items).toHaveLength(2)
    expect(
      Array.from(items).every((i) => i.querySelector('.gm-sp-item-title')!.textContent !== 'B'),
    ).toBe(true)
  })

  test('applies read class for previously-read topic', () => {
    state.markRead(1)
    renderV2ex(container, FIXTURE, state, null)
    const items = container.querySelectorAll('.gm-sp-list-item')
    const first = items[0] as HTMLElement
    expect(first.classList.contains('gm-sp-item-read')).toBe(true)
    expect((items[1] as HTMLElement).classList.contains('gm-sp-item-read')).toBe(false)
  })

  test('clicking topic link marks it as read', () => {
    renderV2ex(container, FIXTURE, state, null)
    const link = container.querySelector('.gm-sp-item-title') as HTMLAnchorElement
    link.click()
    expect(state.isRead(1)).toBe(true)
    const item = container.querySelector('.gm-sp-list-item') as HTMLElement
    expect(item.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('hide button removes the topic item, marks hidden, and saves state', async () => {
    renderV2ex(container, FIXTURE, state, runtime as unknown as Runtime)
    expect(container.querySelectorAll('.gm-sp-list-item')).toHaveLength(3)
    const hideBtn = container.querySelector('.gm-sp-item-hide') as HTMLButtonElement
    hideBtn.click()
    expect(container.querySelectorAll('.gm-sp-list-item')).toHaveLength(2)
    expect(state.isHidden(1)).toBe(true)
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[STATE_KEY('v2ex')] as Record<string, { h?: number }>
    expect(stored['1']?.h).toBeGreaterThan(0)
  })

  test('hide button is a no-op for cache mutation when runtime is null', () => {
    renderV2ex(container, FIXTURE, state, null)
    const hideBtn = container.querySelector('.gm-sp-item-hide') as HTMLButtonElement
    hideBtn.click()
    expect(state.isHidden(1)).toBe(true)
  })

  test('shows plain count for unread topic', () => {
    renderV2ex(container, FIXTURE, state, null)
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10')
  })

  test('shows plain count when read and no new replies', () => {
    state.markRead(1, Date.now(), 10)
    renderV2ex(container, FIXTURE, state, null)
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10')
  })

  test('shows new reply count when read and replies increased', () => {
    state.markRead(1, Date.now(), 10)
    const moreReplies = [{ ...FIXTURE[0], replies: 15 }]
    renderV2ex(container, moreReplies, state, null)
    const count = container.querySelector('.gm-sp-item-count')!
    expect(count.textContent).toBe('10 + 5')
  })

  test('clicking topic link stores reply count', () => {
    renderV2ex(container, FIXTURE, state, null)
    const link = container.querySelector('.gm-sp-item-title') as HTMLAnchorElement
    link.click()
    expect(state.getReadReplies(1)).toBe(10)
  })
})

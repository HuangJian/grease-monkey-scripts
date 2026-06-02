import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createV2exSource, fetchV2ex, parseV2ex } from '../../../src/dashboard/sources/v2ex'
import type { Runtime, RequestDetails } from '../../../src/runtime'
import { createRuntime } from '../../runtime'

const FIXTURE = [
  {
    id: 1,
    title: 'A',
    url: 'https://www.v2ex.com/t/1',
    replies: 10,
    member: { username: 'alice' },
    node: { title: 'node-a' },
  },
  {
    id: 2,
    title: 'B',
    url: 'https://www.v2ex.com/t/2',
    replies: 20,
    member: { username: 'bob' },
    node: { title: 'node-b' },
  },
  {
    id: 3,
    title: 'C',
    url: 'https://www.v2ex.com/t/3',
    replies: 30,
    member: { username: 'carol' },
    node: { title: 'node-c' },
  },
]

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('parseV2ex', () => {
  test('parses valid array', () => {
    const topics = parseV2ex(FIXTURE, 10)
    expect(topics).toHaveLength(3)
    expect(topics[0].title).toBe('A')
    expect(topics[0].member.username).toBe('alice')
  })
  test('limits to maxItems', () => {
    expect(parseV2ex(FIXTURE, 2)).toHaveLength(2)
  })
  test('returns empty for non-array', () => {
    expect(parseV2ex({}, 10)).toEqual([])
    expect(parseV2ex(null, 10)).toEqual([])
  })
  test('skips entries missing title or url', () => {
    const topics = parseV2ex([{ id: 1, title: '', url: '' }, FIXTURE[0]], 10)
    expect(topics).toHaveLength(1)
  })
})

describe('fetchV2ex', () => {
  test('resolves with parsed topics', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: JSON.stringify(FIXTURE) }))
    const topics = await fetchV2ex(runtime, 10)
    expect(topics).toHaveLength(3)
  })
  test('uses anonymous: true to avoid cookies', async () => {
    const dom = new JSDOM('<html></html>')
    const captured: RequestDetails[] = []
    const runtime = makeRuntime(dom, (d) => {
      captured.push(d)
      d.onload({ responseText: '[]' })
    })
    await fetchV2ex(runtime, 10)
    expect(captured[0]?.anonymous).toBe(true)
  })
  test('rejects on network error', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onerror?.())
    await expect(fetchV2ex(runtime, 10)).rejects.toThrow('network error')
  })
  test('rejects on bad JSON', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: 'oops' }))
    await expect(fetchV2ex(runtime, 10)).rejects.toThrow()
  })
})

describe('createV2exSource.render', () => {
  test('renders topic list with links and meta', () => {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    const container = dom.window.document.getElementById('c')!
    const source = createV2exSource({ ttlMinutes: 30, maxItems: 10 })
    source.render(container, FIXTURE as never)
    const items = container.querySelectorAll('.gm-sp-v2ex-item')
    expect(items).toHaveLength(3)
    const firstLink = items[0].querySelector('.gm-sp-v2ex-title') as HTMLAnchorElement
    expect(firstLink.href).toContain('/t/1')
    expect(items[0].querySelector('.gm-sp-v2ex-author')!.textContent).toBe('@alice')
    expect(items[0].querySelector('.gm-sp-v2ex-replies')!.textContent).toBe('💬 10')
  })
  test('renders empty state when no topics', () => {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    const container = dom.window.document.getElementById('c')!
    const source = createV2exSource({ ttlMinutes: 30, maxItems: 10 })
    source.render(container, [])
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('renders empty state when data is null', () => {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    const container = dom.window.document.getElementById('c')!
    const source = createV2exSource({ ttlMinutes: 30, maxItems: 10 })
    source.render(container, null)
    expect(container.querySelector('.gm-sp-empty')).not.toBeNull()
  })
})

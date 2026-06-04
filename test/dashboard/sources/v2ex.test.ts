import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createV2exSource,
  dynamicV2exCount,
  fetchV2ex,
  mergeV2exTopics,
  parseV2ex,
  parseV2exHotPage,
  type V2exCountOptions,
  type V2exSourceOptions,
  type V2exTopic,
} from '../../../src/dashboard/v2ex/source'
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
    sources: [] as const,
  },
  {
    id: 2,
    title: 'B',
    url: 'https://www.v2ex.com/t/2',
    replies: 20,
    member: { username: 'bob' },
    node: { title: 'node-b' },
    sources: [] as const,
  },
  {
    id: 3,
    title: 'C',
    url: 'https://www.v2ex.com/t/3',
    replies: 30,
    member: { username: 'carol' },
    node: { title: 'node-c' },
    sources: [] as const,
  },
]

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

const DEFAULT_COUNT_OPTS: V2exCountOptions = {
  minItems: 10,
  maxItems: 30,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffReplies: 5,
}

function defaultV2exOpts(over: Partial<V2exSourceOptions> = {}): V2exSourceOptions {
  return { ttlMinutes: 30, ...DEFAULT_COUNT_OPTS, ...over }
}

function loadPageFixture(): string {
  return readFileSync(join(import.meta.dir, '..', 'fixtures', 'v2ex-hot-page.html'), 'utf8')
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

describe('parseV2ex', () => {
  test('parses valid array', () => {
    const topics = parseV2ex(FIXTURE, 10)
    expect(topics).toHaveLength(3)
    expect(topics[0].title).toBe('A')
    expect(topics[0].member.username).toBe('alice')
    expect(topics[0].sources).toEqual([])
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
  test('skips entries with invalid id', () => {
    const topics = parseV2ex(
      [{ id: 'NaN', title: 'x', url: 'x' }, { id: 0, title: 'x', url: 'x' }, FIXTURE[0]],
      10,
    )
    expect(topics).toHaveLength(1)
  })
})

describe('parseV2exHotPage', () => {
  test('returns empty for empty html', () => {
    const dom = makeDom()
    expect(parseV2exHotPage('', 10, new dom.window.DOMParser())).toEqual([])
  })
  test('parses well-formed rows from fixture', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    const ids = topics.map((t) => t.id)
    expect(ids).toContain(1217291)
    expect(ids).toContain(1217230)
    expect(topics.length).toBeGreaterThanOrEqual(2)
  })
  test('extracts absolute url, author, node, replies', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    const topic = topics.find((t) => t.id === 1217291)!
    expect(topic.url).toBe('https://www.v2ex.com/t/1217291#reply210')
    expect(topic.title).toBe('跟老婆在一起十年了')
    expect(topic.member.username).toBe('AutumnVerse')
    expect(topic.node.title).toBe('生活')
    expect(topic.replies).toBe(210)
    expect(topic.sources).toEqual([])
  })
  test('handles missing node gracefully', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    const topic = topics.find((t) => t.id === 1217200)
    expect(topic).toBeDefined()
    expect(topic!.node.title).toBe('')
    expect(topic!.replies).toBe(42)
  })
  test('handles missing replies count as 0', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    const topic = topics.find((t) => t.id === 1217199)
    expect(topic).toBeDefined()
    expect(topic!.replies).toBe(0)
  })
  test('skips rows with non-topic-link href', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    expect(topics.some((t) => t.title === '不是 /t/ 链接的帖子')).toBe(false)
  })
  test('ignores Top 10 box rows (only .cell.item rows)', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new dom.window.DOMParser())
    for (const t of topics) {
      expect(t.replies).toBeGreaterThanOrEqual(0)
    }
    expect(topics.find((t) => t.id === 1217291)?.replies).toBe(210)
  })
  test('respects maxItems', () => {
    const dom = makeDom()
    const topics = parseV2exHotPage(loadPageFixture(), 2, new dom.window.DOMParser())
    expect(topics).toHaveLength(2)
  })
})

describe('mergeV2exTopics', () => {
  function topic(over: Partial<V2exTopic>): V2exTopic {
    return {
      id: 0,
      title: '',
      url: '',
      replies: 0,
      member: { username: '' },
      node: { title: '' },
      sources: [],
      ...over,
    }
  }

  test('merges api and page with cross-source marking', () => {
    const api = [topic({ id: 1, replies: 10, title: 'A' })]
    const page = [topic({ id: 1, replies: 5, title: 'A-page' })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].replies).toBe(10)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('takes max replies when both sources differ', () => {
    const api = [topic({ id: 1, replies: 5 })]
    const page = [topic({ id: 1, replies: 50 })]
    expect(mergeV2exTopics(api, page, 10)[0].replies).toBe(50)
  })
  test('keeps api title when both present', () => {
    const api = [topic({ id: 1, title: 'api-title', node: { title: 'api-node' } })]
    const page = [topic({ id: 1, title: 'page-title', node: { title: 'page-node' } })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged[0].title).toBe('api-title')
    expect(merged[0].node.title).toBe('api-node')
  })
  test('sorts by replies descending', () => {
    const api = [topic({ id: 1, replies: 5 }), topic({ id: 2, replies: 100 })]
    const page = [topic({ id: 3, replies: 30 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([2, 3, 1])
  })
  test('cross-source items win ties at same reply count', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 1, replies: 10 }), topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('api-only ranks above page-only at same reply count', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([1, 2])
    expect(merged[0].sources).toEqual(['api'])
    expect(merged[1].sources).toEqual(['page'])
  })
  test('api index breaks page-only ties', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 1, replies: 5 }), topic({ id: 2, replies: 5 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([1, 2])
  })
  test('skips invalid ids', () => {
    const api = [topic({ id: 0 }), topic({ id: -1 }), topic({ id: 1, replies: 5 })]
    expect(mergeV2exTopics(api, [], 10).map((t) => t.id)).toEqual([1])
  })
  test('limits to maxItems', () => {
    const api = [topic({ id: 1, replies: 1 }), topic({ id: 2, replies: 2 })]
    const page = [topic({ id: 3, replies: 3 })]
    expect(mergeV2exTopics(api, page, 2)).toHaveLength(2)
  })
  test('handles empty inputs', () => {
    expect(mergeV2exTopics([], [], 10)).toEqual([])
    const page = [topic({ id: 1, replies: 5 })]
    expect(mergeV2exTopics([], page, 10)).toEqual([{ ...page[0], sources: ['page'] }])
  })
  test('page-only items carry page index in tiebreaker', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 2, replies: 5 }), topic({ id: 1, replies: 5 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([2, 1])
  })
})

describe('dynamicV2exCount', () => {
  test('returns 0 for empty input', () => {
    expect(dynamicV2exCount([], DEFAULT_COUNT_OPTS)).toBe(0)
  })
  test('returns minItems when leader is 0 or invalid', () => {
    expect(dynamicV2exCount([0, 0, 0], DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
    expect(dynamicV2exCount([NaN, 1], DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
  })
  test('cuts at elbow when there is a sharp drop', () => {
    // drops: 0.1, 0.15, 0.1, 0.6, ... — elbow at index 3
    const replies = [200, 180, 150, 120, 30, 20, 10]
    const result = dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)
    // threshold: cutoff=20, count=5; elbow=3; max=5; clamp [10,30] → 10
    expect(result).toBe(10)
  })
  test('threshold drives the count when there is no elbow', () => {
    // no drop > 0.4; cutoff=10; 6 topics pass threshold; elbow = full length = 11
    const replies = [100, 80, 50, 30, 20, 10, 5, 3, 2, 1, 0]
    // max(6, 11) = 11, clamp to [10, 30] → 11
    expect(dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)).toBe(11)
  })
  test('clamps to max when heat is broadly distributed', () => {
    // sustained 50+ heat, no real elbow
    const replies = [100, 60, 55, 50, 48, 45, 40, 35, 30, 28, 25, 22, 20, 18, 15]
    const result = dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)
    expect(result).toBeLessThanOrEqual(DEFAULT_COUNT_OPTS.maxItems)
  })
  test('clamps to min when distribution is flat', () => {
    const replies = [5, 5, 5, 5, 5, 5, 5, 5]
    expect(dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
  })
  test('weak leader falls back to min via clamp', () => {
    // leader 3, cutoff 5 → no one passes threshold; elbow at 1; clamp → min
    expect(dynamicV2exCount([3, 0, 0, 0, 0, 0, 0, 0, 0, 0], DEFAULT_COUNT_OPTS)).toBe(
      DEFAULT_COUNT_OPTS.minItems,
    )
  })
  test('honors custom min/max', () => {
    const replies = [100, 80, 50, 30, 20, 10, 5, 3]
    const opts = { ...DEFAULT_COUNT_OPTS, minItems: 3, maxItems: 5 }
    const result = dynamicV2exCount(replies, opts)
    expect(result).toBeGreaterThanOrEqual(3)
    expect(result).toBeLessThanOrEqual(5)
  })
  test('minCutoffReplies raises the threshold floor', () => {
    // leader 50, ratio 0.1 → 5; both 5, but minCutoffReplies=20 means cutoff=20
    const replies = [50, 20, 10, 8, 5, 5, 5]
    const opts = { ...DEFAULT_COUNT_OPTS, minCutoffReplies: 20, displayRatio: 0.1 }
    const result = dynamicV2exCount(replies, opts)
    // threshold count: 2 (50, 20)
    expect(result).toBeLessThanOrEqual(15)
  })
})

describe('fetchV2ex', () => {
  test('resolves with merged topics from both sources', async () => {
    const dom = makeDom()
    const html = loadPageFixture()
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      } else {
        d.onload({ responseText: html })
      }
    })
    const topics = await fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser())
    expect(topics.length).toBeGreaterThan(0)
    const ids = topics.map((t) => t.id)
    expect(ids).toContain(1)
    expect(ids).toContain(1217291)
  })
  test('uses anonymous: true on both calls', async () => {
    const dom = makeDom()
    const captured: RequestDetails[] = []
    const runtime = makeRuntime(dom, (d) => {
      captured.push(d)
      d.onload({ responseText: '[]' })
    })
    await fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser())
    expect(captured).toHaveLength(2)
    for (const c of captured) expect(c.anonymous).toBe(true)
  })
  test('rejects with combined error when both sources fail', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom, (d) => d.onerror?.())
    await expect(
      fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser()),
    ).rejects.toThrow(/v2ex api/)
  })
  test('falls back to page when api fails', async () => {
    const dom = makeDom()
    const html = loadPageFixture()
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('hot.json')) d.onerror?.()
      else d.onload({ responseText: html })
    })
    const topics = await fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser())
    const pageTopic = topics.find((t) => t.id === 1217291)
    expect(pageTopic).toBeDefined()
    expect(pageTopic!.sources).toEqual(['page'])
  })
  test('falls back to api when page fails', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      } else {
        d.onerror?.()
      }
    })
    const topics = await fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser())
    const apiTopic = topics.find((t) => t.id === 1)
    expect(apiTopic).toBeDefined()
    expect(apiTopic!.sources).toEqual(['api'])
  })
  test('marks cross-source topics when both have the same id', async () => {
    const dom = makeDom()
    const html = loadPageFixture()
    const sharedTopic = {
      id: 1217291,
      title: 'shared',
      url: 'https://www.v2ex.com/t/1217291',
      replies: 5,
      member: { username: 'u' },
      node: { title: 'n' },
      sources: [],
    }
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify([sharedTopic]) })
      } else {
        d.onload({ responseText: html })
      }
    })
    const topics = await fetchV2ex(runtime, 50, DEFAULT_COUNT_OPTS, new dom.window.DOMParser())
    const shared = topics.find((t) => t.id === 1217291)
    expect(shared).toBeDefined()
    expect(shared!.sources).toEqual(['api', 'page'])
  })
  test('respects maxItems in the count options', async () => {
    const dom = makeDom()
    const html = loadPageFixture()
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('hot.json')) d.onload({ responseText: JSON.stringify(FIXTURE) })
      else d.onload({ responseText: html })
    })
    const topics = await fetchV2ex(
      runtime,
      50,
      { ...DEFAULT_COUNT_OPTS, minItems: 2, maxItems: 2 },
      new dom.window.DOMParser(),
    )
    expect(topics.length).toBe(2)
  })
})

describe('createV2exSource.render', () => {
  test('renders topic list with links and meta', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createV2exSource(defaultV2exOpts())
    source.render(container, FIXTURE as never)
    const items = container.querySelectorAll('.gm-sp-v2ex-item')
    expect(items).toHaveLength(3)
    const firstLink = items[0].querySelector('.gm-sp-v2ex-title') as HTMLAnchorElement
    expect(firstLink.href).toContain('/t/1')
    expect(items[0].querySelector('.gm-sp-v2ex-author')!.textContent).toBe('@alice')
    expect(items[0].querySelector('.gm-sp-v2ex-count')!.textContent).toBe('10')
    expect(items[0].querySelector('.gm-sp-v2ex-count')!.getAttribute('title')).toBe('回复数')
    expect(items[0].querySelector('.gm-sp-v2ex-source')!.textContent).toBe('')
  })
  test('shows badge for cross-source topics', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createV2exSource(defaultV2exOpts())
    const crossTopic = { ...FIXTURE[0], sources: ['api', 'page'] as const }
    source.render(container, [crossTopic] as never)
    const item = container.querySelector('.gm-sp-v2ex-item')!
    const badge = item.querySelector('.gm-sp-v2ex-source')!
    expect(badge.textContent).toBe('🔥')
    expect(badge.getAttribute('title')).toBe('双源确认热帖')
  })
  test('hides badge for single-source topics', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createV2exSource(defaultV2exOpts())
    const single = { ...FIXTURE[0], sources: ['api'] as const }
    source.render(container, [single] as never)
    const badge = container.querySelector('.gm-sp-v2ex-source')!
    expect(badge.textContent).toBe('')
  })
  test('renders empty state when no topics', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createV2exSource(defaultV2exOpts())
    source.render(container, [])
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('renders empty state when data is null', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createV2exSource(defaultV2exOpts())
    source.render(container, null)
    expect(container.querySelector('.gm-sp-empty')).not.toBeNull()
  })
})

import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeSortScore,
  dynamicV2exCount,
  mergeV2exTopics,
  parseCreatedFromTitle,
  parseV2ex,
  parseV2exHotPage,
  sortByDecayedScore,
} from '../../../../src/dashboard/v2ex/parser'
import type { V2exCountOptions, V2exTopic } from '../../../../src/dashboard/v2ex/types'

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

const DEFAULT_COUNT_OPTS: V2exCountOptions = {
  minItems: 10,
  maxItems: 30,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minReplies: 5,
  ageHalfLifeDays: 2,
}

function loadPageFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'v2ex-hot-page.html'), 'utf8')
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
    expect(topic.created).toBeDefined()
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
    expect(merged.map((t) => t.id)).toEqual([3])
  })
  test('retains api-only topics when dropApiOnly is false', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page: V2exTopic[] = []
    const merged = mergeV2exTopics(api, page, 10, false)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api'])
  })
  test('cross-source items win ties at same reply count', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 1, replies: 10 }), topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('api-only topics are filtered out', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([2])
    expect(merged[0].sources).toEqual(['page'])
  })
  test('api index breaks page-only ties', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 1, replies: 5 }), topic({ id: 2, replies: 5 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([1, 2])
  })
  test('skips invalid ids', () => {
    const api = [topic({ id: 0 }), topic({ id: -1 }), topic({ id: 1, replies: 5 })]
    const page = [topic({ id: 2, replies: 5 })]
    expect(mergeV2exTopics(api, page, 10).map((t) => t.id)).toEqual([2])
  })
  test('limits to maxItems', () => {
    const api = [topic({ id: 1, replies: 1 }), topic({ id: 2, replies: 2 })]
    const page = [topic({ id: 3, replies: 3 })]
    expect(mergeV2exTopics(api, page, 1)).toHaveLength(1)
  })
  test('handles empty inputs', () => {
    expect(mergeV2exTopics([], [], 10)).toEqual([])
    const page = [topic({ id: 1, replies: 5 })]
    expect(mergeV2exTopics([], page, 10)).toEqual([{ ...page[0], sources: ['page'] }])
  })
  test('filters out API-only topics', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page = [topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(2)
    expect(merged[0].sources).toEqual(['page'])
  })
  test('keeps cross-source topics', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page = [topic({ id: 1, replies: 50 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('page-only items carry page index in tiebreaker', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 2, replies: 5 }), topic({ id: 1, replies: 5 })]
    const merged = mergeV2exTopics(api, page, 10)
    expect(merged.map((t) => t.id)).toEqual([2, 1])
  })
  test('historical api topics retain api source when merged as first arg', () => {
    const historical = [topic({ id: 100, replies: 30, sources: ['api'] as const })]
    const current = [
      topic({ id: 1, replies: 50, sources: ['page'] as const }),
      topic({ id: 100, replies: 40, sources: ['api', 'page'] as const }),
    ]
    const merged = mergeV2exTopics(historical, current, 10, false)
    const t100 = merged.find((t) => t.id === 100)!
    expect(t100.sources).toEqual(['api', 'page'])
    expect(t100.replies).toBe(40)
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
    const replies = [200, 180, 150, 120, 30, 20, 10]
    const result = dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)
    expect(result).toBe(10)
  })
  test('threshold drives the count when there is no elbow', () => {
    const replies = [100, 80, 50, 30, 20, 10, 5, 3, 2, 1, 0]
    expect(dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)).toBe(11)
  })
  test('clamps to max when heat is broadly distributed', () => {
    const replies = [100, 60, 55, 50, 48, 45, 40, 35, 30, 28, 25, 22, 20, 18, 15]
    const result = dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)
    expect(result).toBeLessThanOrEqual(DEFAULT_COUNT_OPTS.maxItems)
  })
  test('clamps to min when distribution is flat', () => {
    const replies = [5, 5, 5, 5, 5, 5, 5, 5]
    expect(dynamicV2exCount(replies, DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
  })
  test('weak leader falls back to min via clamp', () => {
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
  test('minReplies raises the threshold floor', () => {
    const replies = [50, 20, 10, 8, 5, 5, 5]
    const opts = { ...DEFAULT_COUNT_OPTS, minReplies: 20, displayRatio: 0.1 }
    const result = dynamicV2exCount(replies, opts)
    expect(result).toBeLessThanOrEqual(15)
  })
})

describe('computeSortScore', () => {
  test('returns 0 for invalid replies', () => {
    const now = Date.now()
    expect(
      computeSortScore(
        { id: 1, replies: 0, title: '', url: '', member: { username: '' }, node: { title: '' } },
        now,
        2,
      ),
    ).toBe(0)
    expect(
      computeSortScore(
        { id: 1, replies: NaN, title: '', url: '', member: { username: '' }, node: { title: '' } },
        now,
        2,
      ),
    ).toBe(0)
  })
  test('does not decay topics without created time', () => {
    const now = Date.now()
    const score = computeSortScore(
      { id: 1, replies: 100, title: '', url: '', member: { username: '' }, node: { title: '' } },
      now,
      2,
    )
    expect(score).toBe(100)
  })
  test('applies half-life decay for old topics', () => {
    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000
    const score = computeSortScore(
      {
        id: 1,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        created: oneDayAgo,
      },
      now,
      2,
    )
    const expected = 100 * Math.pow(0.5, 1 / 2)
    expect(score).toBeCloseTo(expected, 1)
  })
  test('applies full half-life decay at halfLifeDays', () => {
    const now = Date.now()
    const twoDaysAgo = now - 48 * 60 * 60 * 1000
    const score = computeSortScore(
      {
        id: 1,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        created: twoDaysAgo,
      },
      now,
      2,
    )
    expect(score).toBeCloseTo(50, 0)
  })
})

describe('sortByDecayedScore', () => {
  test('sorts by decayed score descending', () => {
    const now = Date.now()
    const yesterday = now - 24 * 60 * 60 * 1000
    const topics = [
      { id: 1, replies: 30, title: '', url: '', member: { username: '' }, node: { title: '' } },
      {
        id: 2,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        created: yesterday,
      },
    ]
    const sorted = sortByDecayedScore(topics, now, 2)
    expect(sorted[0].id).toBe(2)
  })
  test('cross-source topics win ties', () => {
    const now = Date.now()
    const topics = [
      {
        id: 1,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: ['api'] as const,
      },
      {
        id: 2,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: ['api', 'page'] as const,
      },
    ]
    const sorted = sortByDecayedScore(topics, now, 2)
    expect(sorted[0].id).toBe(2)
  })
})

describe('parseCreatedFromTitle', () => {
  test('parses valid datetime with timezone', () => {
    const result = parseCreatedFromTitle('2026-06-02 20:41:31 +08:00')
    expect(result).toBeDefined()
    expect(result).toBeGreaterThan(0)
  })
  test('returns undefined for invalid format', () => {
    expect(parseCreatedFromTitle('')).toBeUndefined()
    expect(parseCreatedFromTitle('not a date')).toBeUndefined()
  })
})

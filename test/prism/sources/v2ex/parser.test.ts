import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  computeSortScore,
  mergeV2exTopics,
  parseV2ex,
  parseV2exHotPage,
  sortByDecayedScore,
} from '../../../../src/prism/v2ex/parser'
import { applyDateFilter } from '../../../../src/prism/shared-utils'
import type { V2exTopic } from '../../../../src/prism/v2ex/types'

const FIXTURE = [
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

function loadPageFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'v2ex-hot-page.html'), 'utf8')
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
    expect(parseV2exHotPage('', 10, new DOMParser())).toEqual([])
  })
  test('parses well-formed rows from fixture', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    const ids = topics.map((t) => t.id)
    expect(ids).toContain(1217291)
    expect(ids).toContain(1217230)
    expect(topics.length).toBeGreaterThanOrEqual(2)
  })
  test('extracts absolute url, author, node, replies', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    const topic = topics.find((t) => t.id === 1217291)!
    expect(topic.url).toBe('https://www.v2ex.com/t/1217291#reply210')
    expect(topic.title).toBe('跟老婆在一起十年了')
    expect(topic.member.username).toBe('AutumnVerse')
    expect(topic.node.title).toBe('生活')
    expect(topic.replies).toBe(210)
    expect(topic.sources).toEqual([])
    // V2EX 热门页 span[title] 显示的是 last_touched 而非 created，
    // 页面源 created 设为首次抓取时间（近似 Date.now()）
    expect(topic.created).toBeGreaterThan(0)
    expect(Date.now() - topic.created).toBeLessThan(5000)
  })
  test('handles missing node gracefully', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    const topic = topics.find((t) => t.id === 1217200)
    expect(topic).toBeDefined()
    expect(topic!.node.title).toBe('')
    expect(topic!.replies).toBe(42)
  })
  test('handles missing replies count as 0', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    const topic = topics.find((t) => t.id === 1217199)
    expect(topic).toBeDefined()
    expect(topic!.replies).toBe(0)
  })
  test('skips rows with non-topic-link href', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    expect(topics.some((t) => t.title === '不是 /t/ 链接的帖子')).toBe(false)
  })
  test('ignores Top 10 box rows (only .cell.item rows)', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    for (const t of topics) {
      expect(t.replies).toBeGreaterThanOrEqual(0)
    }
    expect(topics.find((t) => t.id === 1217291)?.replies).toBe(210)
  })
  test('respects maxItems', () => {
    const topics = parseV2exHotPage(loadPageFixture(), 2, new DOMParser())
    expect(topics).toHaveLength(2)
  })
  test('bugfix: does not extract span[title] (last_touched) as created', () => {
    // V2EX 热门页 .topic_info > span[title] 显示的是 last_touched（最后回复时间），
    // 不是主题创建时间。页面源 created 应为首次抓取时间（≈ Date.now()），
    // 而非 fixture 中 span[title] 的 2026-06-02 20:41:31。
    const before = Date.now()
    const topics = parseV2exHotPage(loadPageFixture(), 50, new DOMParser())
    const after = Date.now()
    for (const t of topics) {
      // created 应在 [before, after] 区间，不是 fixture 中的 2026-06-02 时间戳
      expect(t.created).toBeGreaterThanOrEqual(before)
      expect(t.created).toBeLessThanOrEqual(after)
    }
  })
  test('bugfix: page-only topic with fetch-time created passes date filter', () => {
    // 页面源 created = Date.now()（首次抓取时间），
    // 因此 page-only 主题会出现在「今」date filter 中（合理近似）。
    const pageOnlyTopic: { id: number; created: number } = { id: 1224080, created: Date.now() }
    const today = applyDateFilter([pageOnlyTopic], '今', (t) => t.created)
    expect(today).toHaveLength(1)
    const all = applyDateFilter([pageOnlyTopic], '全', (t) => t.created)
    expect(all).toHaveLength(1)
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
      created: 0,
      ...over,
    }
  }

  test('merges api and page with cross-source marking', () => {
    const api = [topic({ id: 1, replies: 10, title: 'A' })]
    const page = [topic({ id: 1, replies: 5, title: 'A-page' })]
    const merged = mergeV2exTopics(api, page)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].replies).toBe(10)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('takes max replies when both sources differ', () => {
    const api = [topic({ id: 1, replies: 5 })]
    const page = [topic({ id: 1, replies: 50 })]
    expect(mergeV2exTopics(api, page)[0].replies).toBe(50)
  })
  test('keeps api title when both present', () => {
    const api = [topic({ id: 1, title: 'api-title', node: { title: 'api-node' } })]
    const page = [topic({ id: 1, title: 'page-title', node: { title: 'page-node' } })]
    const merged = mergeV2exTopics(api, page)
    expect(merged[0].title).toBe('api-title')
    expect(merged[0].node.title).toBe('api-node')
  })
  test('sorts by replies descending', () => {
    const api = [topic({ id: 1, replies: 5 }), topic({ id: 2, replies: 100 })]
    const page = [topic({ id: 3, replies: 30 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged.map((t) => t.id)).toEqual([3])
  })
  test('retains api-only topics when dropApiOnly is false', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page: V2exTopic[] = []
    const merged = mergeV2exTopics(api, page, false)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api'])
  })
  test('cross-source items win ties at same reply count', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 1, replies: 10 }), topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('api-only topics are filtered out', () => {
    const api = [topic({ id: 1, replies: 10 })]
    const page = [topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged.map((t) => t.id)).toEqual([2])
    expect(merged[0].sources).toEqual(['page'])
  })
  test('api index breaks page-only ties', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 1, replies: 5 }), topic({ id: 2, replies: 5 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged.map((t) => t.id)).toEqual([1, 2])
  })
  test('skips invalid ids', () => {
    const api = [topic({ id: 0 }), topic({ id: -1 }), topic({ id: 1, replies: 5 })]
    const page = [topic({ id: 2, replies: 5 })]
    expect(mergeV2exTopics(api, page).map((t) => t.id)).toEqual([2])
  })
  test('handles empty inputs', () => {
    expect(mergeV2exTopics([], [])).toEqual([])
    const page = [topic({ id: 1, replies: 5 })]
    expect(mergeV2exTopics([], page)).toEqual([{ ...page[0], sources: ['page'] }])
  })
  test('filters out API-only topics', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page = [topic({ id: 2, replies: 10 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(2)
    expect(merged[0].sources).toEqual(['page'])
  })
  test('keeps cross-source topics', () => {
    const api = [topic({ id: 1, replies: 100 })]
    const page = [topic({ id: 1, replies: 50 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe(1)
    expect(merged[0].sources).toEqual(['api', 'page'])
  })
  test('page-only items carry page index in tiebreaker', () => {
    const api: V2exTopic[] = []
    const page = [topic({ id: 2, replies: 5 }), topic({ id: 1, replies: 5 })]
    const merged = mergeV2exTopics(api, page)
    expect(merged.map((t) => t.id)).toEqual([2, 1])
  })
  test('historical api topics retain api source when merged as first arg', () => {
    const historical = [topic({ id: 100, replies: 30, sources: ['api'] })]
    const current = [
      topic({ id: 1, replies: 50, sources: ['page'] }),
      topic({ id: 100, replies: 40, sources: ['api', 'page'] }),
    ]
    const merged = mergeV2exTopics(historical, current, false)
    const t100 = merged.find((t) => t.id === 100)!
    expect(t100.sources).toEqual(['api', 'page'])
    expect(t100.replies).toBe(40)
  })
})

describe('computeSortScore', () => {
  test('returns 0 for invalid replies', () => {
    const now = Date.now()
    expect(
      computeSortScore(
        {
          id: 1,
          replies: 0,
          title: '',
          url: '',
          member: { username: '' },
          node: { title: '' },
          sources: [],
          created: 0,
        },
        now,
        2,
      ),
    ).toBe(0)
    expect(
      computeSortScore(
        {
          id: 1,
          replies: NaN,
          title: '',
          url: '',
          member: { username: '' },
          node: { title: '' },
          sources: [],
          created: 0,
        },
        now,
        2,
      ),
    ).toBe(0)
  })
  test('does not decay topics without created time', () => {
    const now = Date.now()
    const score = computeSortScore(
      {
        id: 1,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: [],
        created: 0,
      },
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
        sources: [],
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
        sources: [],
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
      {
        id: 1,
        replies: 30,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: [],
        created: 0,
      },
      {
        id: 2,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: [],
        created: yesterday,
      },
    ]
    const sorted = sortByDecayedScore(topics, now, 2)
    expect(sorted[0].id).toBe(2)
  })
  test('cross-source topics win ties', () => {
    const now = Date.now()
    const topics: V2exTopic[] = [
      {
        id: 1,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: ['api'],
        created: 0,
      },
      {
        id: 2,
        replies: 100,
        title: '',
        url: '',
        member: { username: '' },
        node: { title: '' },
        sources: ['api', 'page'],
        created: 0,
      },
    ]
    const sorted = sortByDecayedScore(topics, now, 2)
    expect(sorted[0].id).toBe(2)
  })
})

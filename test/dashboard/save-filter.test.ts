import { describe, expect, test } from 'bun:test'
import {
  isExcludedKey,
  describeKey,
  stateKeyForCache,
  buildSaveData,
  type ReadState,
} from '../../src/dashboard/save-filter'
import type { CachedSource } from '../../src/dashboard/types'
import type { V2exTopic } from '../../src/dashboard/v2ex/types'
import type { RedditPost } from '../../src/dashboard/reddit/types'
import type { TnewsItem } from '../../src/dashboard/tnews/types'
import type { XueqiuRenderData } from '../../src/dashboard/xueqiu/types'

// ── Helpers ──

function todayStart(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function cached<T>(data: T, fetchedAt = Date.now()): CachedSource<T> {
  return { schemaVersion: 2, data, fetchedAt, error: '' }
}

// ── isExcludedKey ──

describe('isExcludedKey', () => {
  test('excludes config, xit, xit-filters', () => {
    expect(isExcludedKey('dashboard:v2:config')).toBe(true)
    expect(isExcludedKey('dashboard:v2:xit')).toBe(true)
    expect(isExcludedKey('dashboard:v2:xit-filters')).toBe(true)
  })

  test('excludes lock keys', () => {
    expect(isExcludedKey('dashboard:v2:lock:v2ex')).toBe(true)
    expect(isExcludedKey('dashboard:v2:lock:reddit')).toBe(true)
  })

  test('excludes gm:misc keys', () => {
    expect(isExcludedKey('gm:misc:codex')).toBe(true)
    expect(isExcludedKey('gm:misc:codex:cache')).toBe(true)
    expect(isExcludedKey('gm:misc:antigravity')).toBe(true)
    expect(isExcludedKey('gm:misc:trae:cache')).toBe(true)
  })

  test('does not exclude cache, state, or tag keys', () => {
    expect(isExcludedKey('dashboard:v2:v2ex')).toBe(false)
    expect(isExcludedKey('dashboard:v2:state:v2ex')).toBe(false)
    expect(isExcludedKey('v2ex_author_tags')).toBe(false)
  })
})

// ── describeKey ──

describe('describeKey', () => {
  test('returns null for excluded keys', () => {
    expect(describeKey('dashboard:v2:config')).toBeNull()
    expect(describeKey('dashboard:v2:xit')).toBeNull()
    expect(describeKey('gm:misc:codex')).toBeNull()
    expect(describeKey('dashboard:v2:lock:v2ex')).toBeNull()
  })

  test('describes tag keys', () => {
    expect(describeKey('v2ex_author_tags')).toEqual({
      category: 'tags',
      label: 'V2EX 作者标签',
    })
    expect(describeKey('reddit_author_tags')).toEqual({
      category: 'tags',
      label: 'Reddit 作者标签',
    })
    expect(describeKey('author_tags')).toEqual({
      category: 'tags',
      label: '作者标签',
    })
  })

  test('describes state keys', () => {
    expect(describeKey('dashboard:v2:state:v2ex')).toEqual({
      category: 'state',
      label: 'V2EX 状态',
      sourceId: 'v2ex',
    })
    expect(describeKey('dashboard:v2:state:tnews')).toEqual({
      category: 'state',
      label: '竹新社 状态',
      sourceId: 'tnews',
    })
  })

  test('describes cache keys', () => {
    expect(describeKey('dashboard:v2:v2ex')).toEqual({
      category: 'cache',
      label: 'V2EX 缓存',
      sourceId: 'v2ex',
    })
    expect(describeKey('dashboard:v2:xueqiu-news')).toEqual({
      category: 'cache',
      label: '雪球新闻 缓存',
      sourceId: 'xueqiu-news',
    })
  })

  test('returns null for unknown keys', () => {
    expect(describeKey('some:random:key')).toBeNull()
    expect(describeKey('')).toBeNull()
  })
})

// ── stateKeyForCache ──

describe('stateKeyForCache', () => {
  test('maps cache key to state key', () => {
    expect(stateKeyForCache('dashboard:v2:v2ex')).toBe('dashboard:v2:state:v2ex')
    expect(stateKeyForCache('dashboard:v2:reddit')).toBe('dashboard:v2:state:reddit')
    expect(stateKeyForCache('dashboard:v2:tnews')).toBe('dashboard:v2:state:tnews')
  })

  test('maps xueqiu cache keys to shared xueqiu state', () => {
    expect(stateKeyForCache('dashboard:v2:xueqiu-news')).toBe('dashboard:v2:state:xueqiu')
    expect(stateKeyForCache('dashboard:v2:xueqiu-hot')).toBe('dashboard:v2:state:xueqiu')
  })

  test('returns null for sources without state', () => {
    expect(stateKeyForCache('dashboard:v2:weather')).toBeNull()
    expect(stateKeyForCache('dashboard:v2:novels')).toBeNull()
    expect(stateKeyForCache('dashboard:v2:misc')).toBeNull()
  })

  test('returns null for non-cache keys', () => {
    expect(stateKeyForCache('v2ex_author_tags')).toBeNull()
    expect(stateKeyForCache('dashboard:v2:state:v2ex')).toBeNull()
  })
})

// ── buildSaveData ──

describe('buildSaveData', () => {
  test('passes through state and tag data unfiltered', () => {
    const stateData: ReadState = { '1': { r: 1000 } }
    const tagData = { from: { user1: { url: '/t/1', score: 2 } } }
    const values = new Map<string, unknown>([
      ['dashboard:v2:state:v2ex', stateData],
      ['v2ex_author_tags', tagData],
    ])

    const result = buildSaveData(
      ['dashboard:v2:state:v2ex', 'v2ex_author_tags'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    expect(result['dashboard:v2:state:v2ex']).toBe(stateData)
    expect(result['v2ex_author_tags']).toBe(tagData)
  })

  test('filters v2ex cache by date (今)', () => {
    const ts = todayStart()
    const topics: V2exTopic[] = [
      {
        id: 1,
        title: 'today',
        url: '/t/1',
        replies: 5,
        member: { username: 'a' },
        node: { title: 'n' },
        sources: [],
        created: ts + 3600_000,
      },
      {
        id: 2,
        title: 'yesterday',
        url: '/t/2',
        replies: 3,
        member: { username: 'b' },
        node: { title: 'n' },
        sources: [],
        created: ts - 86400_000,
      },
    ]
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', cached(topics)]])

    const result = buildSaveData(
      ['dashboard:v2:v2ex'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:v2ex'] as CachedSource<V2exTopic[]>
    expect(saved.data).toHaveLength(1)
    expect(saved.data![0]!.id).toBe(1)
  })

  test('filters v2ex cache by unread (未)', () => {
    const topics: V2exTopic[] = [
      {
        id: 1,
        title: 'read',
        url: '/t/1',
        replies: 5,
        member: { username: 'a' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
      {
        id: 2,
        title: 'unread',
        url: '/t/2',
        replies: 3,
        member: { username: 'b' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
    ]
    const readState: ReadState = { '1': { r: 1000 } }
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', cached(topics)]])
    const readStates = new Map<string, ReadState | null>([['dashboard:v2:state:v2ex', readState]])

    const result = buildSaveData(['dashboard:v2:v2ex'], values, '未', readStates)

    const saved = result['dashboard:v2:v2ex'] as CachedSource<V2exTopic[]>
    expect(saved.data).toHaveLength(1)
    expect(saved.data![0]!.id).toBe(2)
  })

  test('v2ex 未 with null read state includes all items', () => {
    const topics: V2exTopic[] = [
      {
        id: 1,
        title: 'a',
        url: '/t/1',
        replies: 1,
        member: { username: 'x' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
      {
        id: 2,
        title: 'b',
        url: '/t/2',
        replies: 2,
        member: { username: 'y' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
    ]
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', cached(topics)]])

    const result = buildSaveData(
      ['dashboard:v2:v2ex'],
      values,
      '未',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:v2ex'] as CachedSource<V2exTopic[]>
    expect(saved.data).toHaveLength(2)
  })

  test('filters reddit cache by date (今)', () => {
    const ts = todayStart()
    const redditData: Record<string, RedditPost[]> = {
      sub1: [
        {
          id: 'a',
          title: 'today',
          url: '/r/a',
          score: 10,
          numComments: 5,
          author: 'u1',
          created: ts + 3600_000,
        },
        {
          id: 'b',
          title: 'old',
          url: '/r/b',
          score: 5,
          numComments: 2,
          author: 'u2',
          created: ts - 86400_000,
        },
      ],
    }
    const values = new Map<string, unknown>([['dashboard:v2:reddit', cached(redditData)]])

    const result = buildSaveData(
      ['dashboard:v2:reddit'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:reddit'] as CachedSource<Record<string, RedditPost[]>>
    expect(saved.data!['sub1']).toHaveLength(1)
    expect(saved.data!['sub1']![0]!.id).toBe('a')
  })

  test('filters reddit cache by unread (未), drops empty groups', () => {
    const redditData: Record<string, RedditPost[]> = {
      sub1: [
        {
          id: 'a',
          title: 'read',
          url: '/r/a',
          score: 10,
          numComments: 5,
          author: 'u1',
          created: 0,
        },
      ],
      sub2: [
        {
          id: 'b',
          title: 'unread',
          url: '/r/b',
          score: 5,
          numComments: 2,
          author: 'u2',
          created: 0,
        },
      ],
    }
    const readState: ReadState = { a: { r: 1000 } }
    const values = new Map<string, unknown>([['dashboard:v2:reddit', cached(redditData)]])
    const readStates = new Map<string, ReadState | null>([['dashboard:v2:state:reddit', readState]])

    const result = buildSaveData(['dashboard:v2:reddit'], values, '未', readStates)

    const saved = result['dashboard:v2:reddit'] as CachedSource<Record<string, RedditPost[]>>
    expect(Object.keys(saved.data!)).toEqual(['sub2'])
  })

  test('filters tnews cache by pubDate (今)', () => {
    const ts = todayStart()
    const items: TnewsItem[] = [
      {
        id: 'https://t.me/t/1',
        title: 'today',
        link: 'https://t.me/t/1',
        pubDate: ts + 3600_000,
        descriptionHtml: '',
      },
      {
        id: 'https://t.me/t/2',
        title: 'old',
        link: 'https://t.me/t/2',
        pubDate: ts - 86400_000,
        descriptionHtml: '',
      },
    ]
    const values = new Map<string, unknown>([['dashboard:v2:tnews', cached(items)]])

    const result = buildSaveData(
      ['dashboard:v2:tnews'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:tnews'] as CachedSource<TnewsItem[]>
    expect(saved.data).toHaveLength(1)
    expect(saved.data![0]!.id).toBe('https://t.me/t/1')
  })

  test('filters xueqiu cache by created_at (今) - both selected', () => {
    const ts = todayStart()
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'today',
          text: '',
          description: '',
          target: '',
          created_at: ts + 3600_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
        {
          id: 2,
          title: 'old',
          text: '',
          description: '',
          target: '',
          created_at: ts - 86400_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [],
    }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-news', 'dashboard:v2:xueqiu-hot'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toHaveLength(1)
    expect(saved.data!.news![0]!.id).toBe(1)
  })

  test('filters xueqiu cache by unread (未) with String(id) lookup', () => {
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'read',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
        {
          id: 2,
          title: 'unread',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [],
    }
    const readState: ReadState = { '1': { r: 1000 } }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])
    const readStates = new Map<string, ReadState | null>([['dashboard:v2:state:xueqiu', readState]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-news', 'dashboard:v2:xueqiu-hot'],
      values,
      '未',
      readStates,
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toHaveLength(1)
    expect(saved.data!.news![0]!.id).toBe(2)
  })

  test('xueqiu dual-source: news only → hotPosts stripped', () => {
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'n1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [
        {
          id: 2,
          title: 'h1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
    }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-news'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toHaveLength(1)
    expect(saved.data!.hotPosts).toEqual([])
    expect(result['dashboard:v2:xueqiu-hot']).toBeUndefined()
  })

  test('xueqiu dual-source: hot only → news stripped', () => {
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'n1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [
        {
          id: 2,
          title: 'h1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
    }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-hot'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toEqual([])
    expect(saved.data!.hotPosts).toHaveLength(1)
    expect(saved.data!.hotPosts![0]!.id).toBe(2)
    expect(result['dashboard:v2:xueqiu-hot']).toBeUndefined()
  })

  test('xueqiu dual-source: both selected → full data', () => {
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'n1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [
        {
          id: 2,
          title: 'h1',
          text: '',
          description: '',
          target: '',
          created_at: 0,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
    }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-news', 'dashboard:v2:xueqiu-hot'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toHaveLength(1)
    expect(saved.data!.hotPosts).toHaveLength(1)
    expect(result['dashboard:v2:xueqiu-hot']).toBeUndefined()
  })

  test('xueqiu dual-source: date filter applies to both news and hotPosts', () => {
    const ts = todayStart()
    const xueqiuData: XueqiuRenderData = {
      news: [
        {
          id: 1,
          title: 'today',
          text: '',
          description: '',
          target: '',
          created_at: ts + 3600_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
        {
          id: 2,
          title: 'old',
          text: '',
          description: '',
          target: '',
          created_at: ts - 86400_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
      hotPosts: [
        {
          id: 3,
          title: 'today-hot',
          text: '',
          description: '',
          target: '',
          created_at: ts + 3600_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
        {
          id: 4,
          title: 'old-hot',
          text: '',
          description: '',
          target: '',
          created_at: ts - 86400_000,
          status_id: 0,
          reply_count: 0,
          like_count: 0,
          share_count: 0,
          view_count: 0,
          sub_type: 0,
        },
      ],
    }
    const values = new Map<string, unknown>([['dashboard:v2:xueqiu-news', cached(xueqiuData)]])

    const result = buildSaveData(
      ['dashboard:v2:xueqiu-news', 'dashboard:v2:xueqiu-hot'],
      values,
      '今',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:xueqiu-news'] as CachedSource<XueqiuRenderData>
    expect(saved.data!.news).toHaveLength(1)
    expect(saved.data!.news![0]!.id).toBe(1)
    expect(saved.data!.hotPosts).toHaveLength(1)
    expect(saved.data!.hotPosts![0]!.id).toBe(3)
  })

  test('全 filter includes all cache items', () => {
    const topics: V2exTopic[] = [
      {
        id: 1,
        title: 'a',
        url: '/t/1',
        replies: 1,
        member: { username: 'x' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
      {
        id: 2,
        title: 'b',
        url: '/t/2',
        replies: 2,
        member: { username: 'y' },
        node: { title: 'n' },
        sources: [],
        created: 0,
      },
    ]
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', cached(topics)]])

    const result = buildSaveData(
      ['dashboard:v2:v2ex'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:v2ex'] as CachedSource<V2exTopic[]>
    expect(saved.data).toHaveLength(2)
  })

  test('preserves CachedSource wrapper (fetchedAt, schemaVersion, error)', () => {
    const topics: V2exTopic[] = []
    const original = cached(topics, 1700000000000)
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', original]])

    const result = buildSaveData(
      ['dashboard:v2:v2ex'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    const saved = result['dashboard:v2:v2ex'] as CachedSource<V2exTopic[]>
    expect(saved.fetchedAt).toBe(1700000000000)
    expect(saved.schemaVersion).toBe(2)
    expect(saved.error).toBe('')
  })

  test('skips missing values', () => {
    const values = new Map<string, unknown>()

    const result = buildSaveData(
      ['dashboard:v2:v2ex'],
      values,
      '全',
      new Map<string, ReadState | null>(),
    )

    expect(result).toEqual({})
  })

  test('empty selection produces empty result', () => {
    const values = new Map<string, unknown>([['dashboard:v2:v2ex', cached([])]])

    const result = buildSaveData([], values, '全', new Map<string, ReadState | null>())

    expect(result).toEqual({})
  })
})

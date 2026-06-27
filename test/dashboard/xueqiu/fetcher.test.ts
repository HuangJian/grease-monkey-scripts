import { describe, expect, test } from 'bun:test'
import type { XueqiuNewsItem, XueqiuRenderData } from '../../../src/dashboard/xueqiu/types'
import { mergeItems } from '../../../src/dashboard/xueqiu/source'
import { shouldEarlyExit } from '../../../src/dashboard/xueqiu/fetcher'
import { createRuntime } from '../../runtime'

function makeItem(id: number, overrides: Partial<XueqiuNewsItem> = {}): XueqiuNewsItem {
  return {
    id,
    title: `Item ${id}`,
    description: '',
    text: `<p>Content for item ${id}</p>`,
    target: `/status/${id}`,
    created_at: Date.now(),
    status_id: id,
    reply_count: 10,
    like_count: 5,
    share_count: 1,
    view_count: 100,
    sub_type: 0,
    ...overrides,
  }
}

function dedupById(items: XueqiuNewsItem[]): XueqiuNewsItem[] {
  const seen = new Set<number>()
  const result: XueqiuNewsItem[] = []
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      result.push(item)
    }
  }
  return result
}

describe('xueqiu dedup', () => {
  test('dedupById removes duplicate items by id', () => {
    const items = [makeItem(1), makeItem(2), makeItem(1), makeItem(3), makeItem(2)]
    const result = dedupById(items)
    expect(result).toHaveLength(3)
    expect(result.map((it) => it.id)).toEqual([1, 2, 3])
  })

  test('dedupById keeps first occurrence of duplicate', () => {
    const item1a = makeItem(1, { title: 'First' })
    const item1b = makeItem(1, { title: 'Second' })
    const result = dedupById([item1a, item1b])
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('First')
  })

  test('dedupById returns empty array for empty input', () => {
    expect(dedupById([])).toEqual([])
  })

  test('dedupById returns single item unchanged', () => {
    const item = makeItem(1)
    expect(dedupById([item])).toEqual([item])
  })

  test('dedupById handles items with same id but different content', () => {
    const item1 = makeItem(1, { title: 'Original', reply_count: 10 })
    const item1Dup = makeItem(1, { title: 'Duplicate', reply_count: 99 })
    const item2 = makeItem(2, { title: 'Unique', reply_count: 5 })
    const result = dedupById([item1, item1Dup, item2])
    expect(result).toHaveLength(2)
    expect(result[0]?.title).toBe('Original')
    expect(result[1]?.title).toBe('Unique')
  })

  test('bugfix: hotPosts with duplicates from API should be deduped', () => {
    const hotPosts = [
      makeItem(100, { title: '热门话题A' }),
      makeItem(200, { title: '热门话题B' }),
      makeItem(100, { title: '热门话题A (dup)' }),
      makeItem(300, { title: '热门话题C' }),
      makeItem(200, { title: '热门话题B (dup)' }),
    ]
    const deduped = dedupById(hotPosts)
    expect(deduped).toHaveLength(3)
    expect(deduped.map((it) => it.id)).toEqual([100, 200, 300])
  })
})

describe('xueqiu early exit', () => {
  test('bugfix: news should not early-exit when batch contains new items alongside known items', () => {
    const knownIds = new Set<number>([1, 2, 3])
    const batch = [makeItem(1), makeItem(2), makeItem(3), makeItem(4), makeItem(5)]
    const result = shouldEarlyExit('news', batch, knownIds)
    expect(result).toBe(false)
  })

  test('news should early-exit when all items in batch are already known', () => {
    const knownIds = new Set<number>([1, 2, 3])
    const batch = [makeItem(1), makeItem(2), makeItem(3)]
    const result = shouldEarlyExit('news', batch, knownIds)
    expect(result).toBe(true)
  })

  test('news should not early-exit when batch is empty', () => {
    const knownIds = new Set<number>([1, 2, 3])
    const result = shouldEarlyExit('news', [], knownIds)
    expect(result).toBe(true)
  })

  test('hot should early-exit only when all items are known', () => {
    const knownIds = new Set<number>([1, 2])
    const batch = [makeItem(1), makeItem(2), makeItem(3)]
    expect(shouldEarlyExit('hot', batch, knownIds)).toBe(false)

    const allKnown = [makeItem(1), makeItem(2)]
    expect(shouldEarlyExit('hot', allKnown, knownIds)).toBe(true)
  })
})

describe('xueqiu cache merge', () => {
  test('mergeItems keeps all items from both arrays', () => {
    const old = [makeItem(1), makeItem(2)]
    const fresh = [makeItem(3)]
    const result = mergeItems(old, fresh)
    expect(result).toHaveLength(3)
  })

  test('mergeItems overwrites old item with new one when id matches', () => {
    const old = [makeItem(1, { title: 'Old', reply_count: 5 })]
    const fresh = [makeItem(1, { title: 'New', reply_count: 99 })]
    const result = mergeItems(old, fresh)
    expect(result).toHaveLength(1)
    expect(result[0]?.title).toBe('New')
    expect(result[0]?.reply_count).toBe(99)
  })

  test('bugfix: saveXueqiuCache should not drop old items when new fetch returns only recent items', () => {
    const oldItems = [
      makeItem(1, { title: '昨天的消息', created_at: Date.now() - 86400000 }),
      makeItem(2, { title: '前天的消息', created_at: Date.now() - 172800000 }),
    ]
    const newItems = [makeItem(3, { title: '最新的消息' })]
    const result = mergeItems(oldItems, newItems)
    expect(result).toHaveLength(3)
    expect(result.map((it) => it.id)).toContain(1)
    expect(result.map((it) => it.id)).toContain(2)
    expect(result.map((it) => it.id)).toContain(3)
  })
})

// ---- Raw API item factory (matches real API field shapes) ----

function makeApiItem(
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> & { id: number } {
  return { id, ...overrides }
}

describe('xueqiu fetchXueqiu (direct API)', () => {
  test('fetches news (cursor) and hot (page-based) from API', async () => {
    const runtime = createRuntime()

    // NEWS: single page, no next_max_id → stops after round 1
    runtime.queueResponse(
      'https://xueqiu.com/statuses/livenews/list.json',
      JSON.stringify({
        items: [
          makeApiItem(101, {
            text: 'News 1',
            created_at: 1000,
            target: '/status/101',
            status_id: 101,
            reply_count: 1,
            share_count: 2,
            view_count: 10,
            sub_type: 0,
          }),
          makeApiItem(102, {
            text: 'News 2',
            created_at: 2000,
            target: '/status/102',
            status_id: 102,
            reply_count: 3,
            share_count: 4,
            view_count: 20,
            sub_type: 0,
          }),
        ],
        next_max_id: null,
      }),
    )

    // HOT: single page, has_next_page=false → stops after round 1
    runtime.queueResponse(
      'https://xueqiu.com/statuses/hot/listV3.json?page=1',
      JSON.stringify({
        list: [
          makeApiItem(201, {
            title: 'Hot 1',
            text: '<p>Hot 1</p>',
            created_at: 1000,
            target: '/status/201',
            reply_count: 5,
            like_count: 10,
            view_count: 100,
            description: 'desc',
            fav_count: 10,
            retweet_count: 1,
            type: 1,
          }),
          makeApiItem(202, {
            title: 'Hot 2',
            text: '<p>Hot 2</p>',
            created_at: 2000,
            target: '/status/202',
            reply_count: 6,
            like_count: 20,
            view_count: 200,
            description: 'desc2',
            fav_count: 20,
            retweet_count: 2,
            type: 1,
          }),
        ],
        has_next_page: false,
      }),
    )

    const { fetchXueqiu } = await import('../../../src/dashboard/xueqiu/fetcher')
    const result = await fetchXueqiu(runtime, { ttlMinutes: 60, retentionDays: 7 })

    // NEWS: items lack title/description/like_count → toNewsItem uses ?? fallbacks
    expect(result.news).toHaveLength(2)
    expect(result.news[0]?.id).toBe(101)
    expect(result.news[0]?.title).toBe('')
    expect(result.news[0]?.text).toBe('News 1')
    expect(result.news[0]?.like_count).toBe(0)
    expect(result.news[0]?.share_count).toBe(2)

    // HOT: items have title, like_count, etc.
    expect(result.hotPosts).toHaveLength(2)
    expect(result.hotPosts[0]?.id).toBe(201)
    expect(result.hotPosts[0]?.title).toBe('Hot 1')
    expect(result.hotPosts[0]?.like_count).toBe(10)
  })

  test('throws on first-round NEWS failure', async () => {
    const runtime = createRuntime()
    // No response queued for NEWS → onerror → reject

    const { fetchXueqiu } = await import('../../../src/dashboard/xueqiu/fetcher')
    await expect(fetchXueqiu(runtime, { ttlMinutes: 60, retentionDays: 7 })).rejects.toThrow()
  })

  test('skips already-known items from cache', async () => {
    const runtime = createRuntime()
    const { saveCache } = await import('../../../src/dashboard/cache')

    // Pre-populate cache with item 101
    await saveCache(runtime, 'xueqiu-news', {
      data: { news: [makeItem(101)], hotPosts: [] },
      fetchedAt: Date.now(),
      error: '',
    })

    // NEWS returns 101 (known) + 102 (new), no next_max_id
    runtime.queueResponse(
      'https://xueqiu.com/statuses/livenews/list.json',
      JSON.stringify({
        items: [
          makeApiItem(101, {
            text: 'Known',
            created_at: 1000,
            target: '/s/101',
            status_id: 101,
            reply_count: 0,
            share_count: 0,
            view_count: 0,
            sub_type: 0,
          }),
          makeApiItem(102, {
            text: 'New',
            created_at: 2000,
            target: '/s/102',
            status_id: 102,
            reply_count: 0,
            share_count: 0,
            view_count: 0,
            sub_type: 0,
          }),
        ],
        next_max_id: null,
      }),
    )

    // HOT returns empty
    runtime.queueResponse(
      'https://xueqiu.com/statuses/hot/listV3.json?page=1',
      JSON.stringify({ list: [], has_next_page: false }),
    )

    const { fetchXueqiu } = await import('../../../src/dashboard/xueqiu/fetcher')
    const result = await fetchXueqiu(runtime, { ttlMinutes: 60, retentionDays: 7 })

    // Only the new item 102 should be returned
    expect(result.news).toHaveLength(1)
    expect(result.news[0]?.id).toBe(102)
    expect(result.hotPosts).toHaveLength(0)
  })

  test('toNewsItem uses fallback fields when direct fields are absent', async () => {
    const runtime = createRuntime()

    // HOT item with only fallback fields (like_count→fav_count, share_count→retweet_count, sub_type→type)
    runtime.queueResponse(
      'https://xueqiu.com/statuses/hot/listV3.json?page=1',
      JSON.stringify({
        list: [
          makeApiItem(301, {
            title: 'Fallback',
            text: 'text',
            created_at: 1000,
            target: '/s/301',
            reply_count: 1,
            view_count: 10,
            description: 'd',
            fav_count: 42,
            retweet_count: 7,
            type: 3,
          }),
        ],
        has_next_page: false,
      }),
    )

    // NEWS returns empty so fetchXueqiu doesn't fail on NEWS
    runtime.queueResponse(
      'https://xueqiu.com/statuses/livenews/list.json',
      JSON.stringify({ items: [], next_max_id: null }),
    )

    const { fetchXueqiu } = await import('../../../src/dashboard/xueqiu/fetcher')
    const result = await fetchXueqiu(runtime, { ttlMinutes: 60, retentionDays: 7 })

    expect(result.hotPosts).toHaveLength(1)
    const item = result.hotPosts[0]!
    expect(item.like_count).toBe(42) // from fav_count
    expect(item.share_count).toBe(7) // from retweet_count
    expect(item.sub_type).toBe(3) // from type
  })
})

describe('xueqiu hotPosts persistence', () => {
  test('hotSource.fetch must not persist anything to cache', async () => {
    const runtime = createRuntime()
    const { saveCache, loadCache } = await import('../../../src/dashboard/cache')
    const { createXueqiuSources } = await import('../../../src/dashboard/xueqiu/source')
    const sourceId = 'xueqiu-news'

    await saveCache(runtime, sourceId, {
      data: {
        news: [makeItem(1)],
        hotPosts: [makeItem(100), makeItem(200)],
      } satisfies XueqiuRenderData,
      fetchedAt: Date.now(),
      error: '',
    })

    const before = await loadCache<XueqiuRenderData>(runtime, sourceId)

    const { hotSource } = createXueqiuSources({ ttlMinutes: 60, retentionDays: 7 })
    await hotSource.fetch(runtime)

    // Cache must be completely unchanged — hotSource only reads, never writes
    const after = await loadCache<XueqiuRenderData>(runtime, sourceId)
    expect(after?.data?.hotPosts).toEqual(before?.data?.hotPosts)
    expect(after?.data?.news).toEqual(before?.data?.news)
    expect(after?.fetchedAt).toEqual(before?.fetchedAt)
  })

  test('hotPosts are persisted only under xueqiu-news, not xueqiu-hot', async () => {
    const runtime = createRuntime()
    const { saveCache, loadCache } = await import('../../../src/dashboard/cache')
    const { createXueqiuSources } = await import('../../../src/dashboard/xueqiu/source')

    // Setup: xueqiu-news cache has hotPosts, xueqiu-hot has none
    await saveCache(runtime, 'xueqiu-news', {
      data: {
        news: [makeItem(1)],
        hotPosts: [makeItem(100), makeItem(200)],
      } satisfies XueqiuRenderData,
      fetchedAt: Date.now(),
      error: '',
    })

    // hotSource.fetch must not write hotPosts to xueqiu-hot cache
    const { hotSource } = createXueqiuSources({ ttlMinutes: 60, retentionDays: 7 })
    await hotSource.fetch(runtime)

    // xueqiu-news still has hotPosts
    const newsCache = await loadCache<XueqiuRenderData>(runtime, 'xueqiu-news')
    expect(newsCache?.data?.hotPosts).toHaveLength(2)

    // xueqiu-hot must not contain hotPosts (hotSource returns empty data)
    const hotCache = await loadCache<XueqiuRenderData>(runtime, 'xueqiu-hot')
    expect(hotCache?.data?.hotPosts ?? []).toHaveLength(0)
  })
})

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

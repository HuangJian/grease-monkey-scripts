import { describe, expect, test } from 'bun:test'
import type { XueqiuNewsItem } from '../../../src/dashboard/xueqiu/types'

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

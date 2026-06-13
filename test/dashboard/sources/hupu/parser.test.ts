import { describe, expect, test } from 'bun:test'
import {
  normalizeBoardSlug,
  buildBoardUrl,
  parseHupuDataJson,
  mergeHupuPosts,
} from '../../../../src/dashboard/hupu/parser'
import type { HupuPost } from '../../../../src/dashboard/hupu/types'

describe('normalizeBoardSlug', () => {
  test('strips full URL prefix', () => {
    expect(normalizeBoardSlug('https://bbs.hupu.com/vote-hot')).toBe('vote-hot')
  })
  test('strips leading slash', () => {
    expect(normalizeBoardSlug('/vote-hot')).toBe('vote-hot')
  })
  test('trims whitespace', () => {
    expect(normalizeBoardSlug('  vote-hot  ')).toBe('vote-hot')
  })
  test('strips trailing slash', () => {
    expect(normalizeBoardSlug('vote-hot/')).toBe('vote-hot')
  })
  test('returns empty for blank input', () => {
    expect(normalizeBoardSlug('   ')).toBe('')
  })
})

describe('buildBoardUrl', () => {
  test('builds correct URL', () => {
    expect(buildBoardUrl('vote-hot')).toBe('https://bbs.hupu.com/vote-hot')
  })
})

describe('parseHupuDataJson', () => {
  test('parses valid window.$$data structure (topic.threads.list)', () => {
    const json = {
      topic: {
        threads: {
          list: [
            {
              tid: '639900526',
              title: 'Test Post',
              url: '/639900526.html',
              lights: 50,
              replies: 315,
              read: 270747,
              createdAt: 1781235056000,
              author: { puname: 'user1', url: 'https://my.hupu.com/123' },
              topic: { name: '湿乎乎的话题', url: '/vote' },
            },
          ],
        },
      },
    }
    const posts = parseHupuDataJson(json, 'vote-hot', 100)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.id).toBe('639900526')
    expect(posts[0]!.title).toBe('Test Post')
    expect(posts[0]!.lights).toBe(50)
    expect(posts[0]!.replies).toBe(315)
    expect(posts[0]!.views).toBe(270747)
    expect(posts[0]!.author).toBe('user1')
    expect(posts[0]!.board).toBe('vote-hot')
  })
  test('returns empty for non-object input', () => {
    expect(parseHupuDataJson(null, 'x', 10)).toEqual([])
    expect(parseHupuDataJson({}, 'x', 10)).toEqual([])
    expect(parseHupuDataJson({ topic: { threads: { list: 'x' } } }, 'x', 10)).toEqual([])
  })
  test('skips items with missing tid or title', () => {
    const json = {
      topic: {
        threads: {
          list: [
            { tid: '', title: 'no id' },
            { tid: '1', title: '' },
            { tid: '2', title: 'valid' },
          ],
        },
      },
    }
    const posts = parseHupuDataJson(json, 'x', 10)
    expect(posts).toHaveLength(1)
    expect(posts[0]!.id).toBe('2')
  })
  test('respects maxItems', () => {
    const json = {
      topic: {
        threads: {
          list: Array.from({ length: 50 }, (_, i) => ({
            tid: String(i),
            title: `Post ${i}`,
          })),
        },
      },
    }
    expect(parseHupuDataJson(json, 'x', 5)).toHaveLength(5)
  })
  test('clamps negative lights/replies to 0', () => {
    const json = {
      topic: {
        threads: {
          list: [{ tid: '1', title: 't', lights: -5, replies: -10 }],
        },
      },
    }
    const posts = parseHupuDataJson(json, 'x', 10)
    expect(posts[0]!.lights).toBe(0)
    expect(posts[0]!.replies).toBe(0)
  })
})

describe('mergeHupuPosts', () => {
  test('deduplicates by id, preferring JSON data', () => {
    const jsonPosts: HupuPost[] = [
      {
        id: '1',
        title: 'JSON',
        url: '',
        lights: 50,
        replies: 100,
        views: 0,
        author: 'a',
        authorUrl: '',
        board: 'x',
        topicName: '',
        created: 1000,
      },
    ]
    const domPosts: HupuPost[] = [
      {
        id: '1',
        title: 'DOM',
        url: '',
        lights: 30,
        replies: 80,
        views: 0,
        author: 'b',
        authorUrl: '',
        board: 'x',
        topicName: '',
        created: 2000,
      },
    ]
    const merged = mergeHupuPosts(jsonPosts, domPosts)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.lights).toBe(50)
    expect(merged[0]!.replies).toBe(100)
    expect(merged[0]!.author).toBe('a')
  })
  test('adds DOM-only posts', () => {
    const jsonPosts: HupuPost[] = []
    const domPosts: HupuPost[] = [
      {
        id: '1',
        title: 'DOM',
        url: '',
        lights: 0,
        replies: 10,
        views: 0,
        author: '',
        authorUrl: '',
        board: 'x',
        topicName: '',
        created: 1000,
      },
    ]
    const merged = mergeHupuPosts(jsonPosts, domPosts)
    expect(merged).toHaveLength(1)
    expect(merged[0]!.title).toBe('DOM')
  })
  test('returns empty for empty inputs', () => {
    expect(mergeHupuPosts([], [])).toEqual([])
  })
})

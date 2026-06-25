import { describe, expect, test } from 'bun:test'
import { compressForStorage, expandFromStorage } from '../../src/dashboard/codec'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'

function roundTrip<T>(sourceId: string, data: T, fetchedAt: number = Date.now()): T {
  const cached = { data, fetchedAt, error: '' }
  const compressed = compressForStorage(sourceId, cached)
  const stored = { ...compressed, schemaVersion: CACHE_SCHEMA_VERSION } as CachedSource<T>
  const expanded = expandFromStorage(sourceId, stored)
  return expanded.data as T
}

describe('codec round-trip: v2ex', () => {
  test('preserves basic fields', () => {
    const data = [
      {
        id: '1',
        title: 'Hello',
        url: 'https://www.v2ex.com/t/1',
        replies: 5,
        member: { username: 'alice' },
        node: { title: 'jobs' },
        created: 1700000000000,
      },
    ]
    const result = roundTrip('v2ex', data)
    expect(result[0].id).toBe('1')
    expect(result[0].title).toBe('Hello')
    expect(result[0].replies).toBe(5)
    expect(result[0].member.username).toBe('alice')
    expect(result[0].node.title).toBe('jobs')
  })

  test('strips domain from URLs', () => {
    const data = [
      {
        id: '1',
        title: 'T',
        url: 'https://www.v2ex.com/t/1',
        replies: 0,
        member: { username: '' },
        node: { title: '' },
      },
    ]
    const compressed = compressForStorage('v2ex', { data, fetchedAt: Date.now(), error: '' })
    const items = compressed.data as Record<string, unknown>[]
    expect(items[0].u).toBe('/t/1')
  })

  test('handles empty array', () => {
    const result = roundTrip('v2ex', [])
    expect(result).toEqual([])
  })
})

describe('codec round-trip: reddit', () => {
  test('preserves basic fields', () => {
    const data = {
      javascript: [
        {
          id: 'abc',
          title: 'Post',
          url: 'https://www.reddit.com/r/javascript/comments/abc',
          score: 100,
          numComments: 25,
          subreddits: ['javascript'],
          author: 'bob',
          created: 1700000000000,
        },
      ],
    }
    const result = roundTrip('reddit', data)
    expect(result.javascript[0].id).toBe('abc')
    expect(result.javascript[0].title).toBe('Post')
    expect(result.javascript[0].score).toBe(100)
    expect(result.javascript[0].numComments).toBe(25)
    expect(result.javascript[0].author).toBe('bob')
  })

  test('strips domain from URLs', () => {
    const data = {
      test: [
        {
          id: 'x',
          title: 'T',
          url: 'https://www.reddit.com/r/test/comments/x',
          score: 1,
          numComments: 0,
          subreddits: ['test'],
          author: '',
          created: 0,
        },
      ],
    }
    const compressed = compressForStorage('reddit', { data, fetchedAt: Date.now(), error: '' })
    const groups = compressed.data as Record<string, Record<string, unknown>[]>
    expect(groups.test[0].u).toBe('/r/test/comments/x')
  })
})

describe('codec round-trip: hupu', () => {
  test('preserves basic fields', () => {
    const data = {
      'vote-hot': [
        {
          id: 'h1',
          title: 'Topic',
          url: 'https://bbs.hupu.com/123.html',
          lights: 50,
          replies: 10,
          author: 'user',
          created: 1700000000000,
        },
      ],
    }
    const result = roundTrip('hupu', data)
    expect(result['vote-hot'][0].id).toBe('h1')
    expect(result['vote-hot'][0].title).toBe('Topic')
    expect(result['vote-hot'][0].lights).toBe(50)
    expect(result['vote-hot'][0].replies).toBe(10)
  })
})

describe('codec round-trip: xueqiu-news', () => {
  test('preserves basic fields', () => {
    const data = {
      news: [
        {
          id: 123,
          title: 'Market up',
          text: 'Details here',
          target: 'https://xueqiu.com/123',
          created_at: 1700000000000,
          reply_count: 5,
          like_count: 10,
        },
      ],
    }
    const result = roundTrip('xueqiu-news', data)
    expect(result.news[0].id).toBe(123)
    expect(result.news[0].title).toBe('Market up')
    expect(result.news[0].text).toBe('Details here')
    expect(result.news[0].reply_count).toBe(5)
    expect(result.news[0].like_count).toBe(10)
  })

  test('strips domain from target', () => {
    const data = {
      news: [
        {
          id: 1,
          title: 'T',
          text: 'X',
          target: 'https://xueqiu.com/1',
          created_at: 0,
          reply_count: 0,
        },
      ],
    }
    const compressed = compressForStorage('xueqiu-news', { data, fetchedAt: Date.now(), error: '' })
    const groups = compressed.data as Record<string, Record<string, unknown>[]>
    expect(groups.news[0].u).toBe('/1')
  })
})

describe('codec round-trip: tnews', () => {
  test('preserves basic fields', () => {
    const data = [
      {
        id: 't1',
        title: 'News',
        link: 'https://example.com',
        pubDate: 1700000000000,
        descriptionHtml: '<p>Hello</p>',
      },
    ]
    const result = roundTrip('tnews', data)
    expect(result[0].id).toBe('t1')
    expect(result[0].title).toBe('News')
    expect(result[0].link).toBe('https://example.com')
    expect(result[0].descriptionHtml).toBe('<p>Hello</p>')
  })
})

describe('codec round-trip: novels', () => {
  test('preserves book fields', () => {
    const data = {
      books: [
        {
          url: 'https://example.com/book',
          siteId: 'site1',
          title: 'My Novel',
          latestChapters: [
            { url: 'https://example.com/ch1', title: 'Chapter 1', postedAt: 1700000000000 },
          ],
          fetchedAt: 1700000000000,
          lastSeenChapterUrl: 'https://example.com/ch1',
        },
      ],
    }
    const result = roundTrip('novels', data)
    expect(result.books[0].url).toBe('https://example.com/book')
    expect(result.books[0].title).toBe('My Novel')
    expect(result.books[0].latestChapters[0].title).toBe('Chapter 1')
    expect(result.books[0].lastSeenChapterUrl).toBe('https://example.com/ch1')
  })
})

describe('codec: short item passthrough', () => {
  test('items with only t field pass through unchanged', () => {
    const data = [{ id: '1', t: 'short' }]
    const compressed = compressForStorage('v2ex', { data, fetchedAt: Date.now(), error: '' })
    const items = compressed.data as Record<string, unknown>[]
    expect(items[0].t).toBe('short')
    expect(items[0].id).toBe('1')
  })
})

describe('codec: unknown source passthrough', () => {
  test('unknown sourceId returns data unchanged', () => {
    const data = { foo: 'bar' }
    const compressed = compressForStorage('unknown-source', {
      data,
      fetchedAt: Date.now(),
      error: '',
    })
    expect(compressed.data).toBe(data)

    const stored = { ...compressed, schemaVersion: CACHE_SCHEMA_VERSION } as CachedSource<unknown>
    const expanded = expandFromStorage('unknown-source', stored)
    expect(expanded.data).toBe(data)
  })
})

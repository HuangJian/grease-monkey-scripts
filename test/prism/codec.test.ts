import { describe, expect, test } from 'bun:test'
import { compressForStorage, expandFromStorage } from '../../src/prism/codec'
import { migrateCache } from '../../src/prism/codec-migrate'
import { CACHE_CODEC_VERSION, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/prism/types'
import type { NovelBook } from '../../src/prism/novels/types'

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

  test('drops url from storage and computes on expand', () => {
    const data = {
      test: [
        {
          id: 'x',
          title: 'T',
          url: 'https://www.reddit.com/r/test/comments/x',
          score: 1,
          numComments: 0,
          author: '',
          created: 0,
        },
      ],
    }
    const compressed = compressForStorage('reddit', { data, fetchedAt: Date.now(), error: '' })
    const groups = compressed.data as Record<string, Record<string, unknown>[]>
    expect(groups.test[0].u).toBeUndefined()
    const result = roundTrip('reddit', data)
    expect(result.test[0].url).toBe('https://www.reddit.com/comments/x/')
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
  test('preserves book fields and per-source variants', () => {
    const data: { books: NovelBook[] } = {
      books: [
        {
          id: 'u:https://example.com/book',
          title: 'My Novel',
          sources: [
            { url: 'https://example.com/book', siteId: 'sudugu', chapterCount: 100, error: '' },
          ],
          latestChapters: [
            {
              key: 'n:1',
              title: 'Chapter 1',
              postedAt: 1700000000000,
              variants: [
                {
                  url: 'https://example.com/ch1',
                  title: 'Chapter 1',
                  postedAt: 1700000000000,
                  siteId: 'sudugu',
                  host: undefined,
                },
              ],
            },
          ],
          lastSeenChapterKey: 'n:1',
          fetchedAt: 1700000000000,
          error: '',
        },
      ],
    }
    const result = roundTrip('novels', data)
    expect(result.books[0]!.id).toBe('u:https://example.com/book')
    expect(result.books[0]!.title).toBe('My Novel')
    expect(result.books[0]!.lastSeenChapterKey).toBe('n:1')
    expect(result.books[0]!.sources[0]!.siteId).toBe('sudugu')
    expect(result.books[0]!.latestChapters[0]!.title).toBe('Chapter 1')
    expect(result.books[0]!.latestChapters[0]!.variants[0]!.url).toBe('https://example.com/ch1')
  })

  test('preserves per-source mirrorHost and per-variant host across round-trip', () => {
    const data: { books: NovelBook[] } = {
      books: [
        {
          id: 'u:https://www.sudugu.org/166/',
          title: 'My Novel',
          sources: [
            {
              url: 'https://www.sudugu.org/166/',
              siteId: 'sudugu',
              mirrorHost: 'www.shudugu.org',
              chapterCount: 100,
              error: '',
            },
          ],
          latestChapters: [
            {
              key: 'n:1',
              title: 'Chapter 1',
              postedAt: 1700000000000,
              variants: [
                {
                  url: 'https://www.sudugu.org/166/c1.html',
                  title: 'Chapter 1',
                  postedAt: 1700000000000,
                  siteId: 'sudugu',
                  host: 'www.shudugu.org',
                },
              ],
            },
          ],
          lastSeenChapterKey: 'n:1',
          fetchedAt: 1700000000000,
          error: '',
        },
      ],
    }
    const result = roundTrip('novels', data)
    expect(result.books[0]!.sources[0]!.mirrorHost).toBe('www.shudugu.org')
    expect(result.books[0]!.latestChapters[0]!.variants[0]!.host).toBe('www.shudugu.org')
  })

  test('omits mirrorHost when not set', () => {
    const data: { books: NovelBook[] } = {
      books: [
        {
          id: 'u:https://www.sudugu.org/166/',
          title: 'My Novel',
          sources: [
            { url: 'https://www.sudugu.org/166/', siteId: 'sudugu', chapterCount: 0, error: '' },
          ],
          latestChapters: [],
          lastSeenChapterKey: '',
          fetchedAt: 1700000000000,
          error: '',
        },
      ],
    }
    const result = roundTrip('novels', data)
    expect(result.books[0]!.sources[0]!.mirrorHost).toBeUndefined()
  })

  test('round-trips a multi-source chapter (multiple variants)', () => {
    const data: { books: NovelBook[] } = {
      books: [
        {
          id: 'u:https://www.sudugu.org/166/',
          title: 'My Novel',
          sources: [
            { url: 'https://www.sudugu.org/166/', siteId: 'sudugu', chapterCount: 5, error: '' },
            { url: 'https://b.example/166/', siteId: 'site-b', chapterCount: 4, error: '' },
          ],
          latestChapters: [
            {
              key: 'n:5',
              title: '第5章',
              postedAt: 0,
              variants: [
                {
                  url: 'https://www.sudugu.org/166/c5.html',
                  title: '第5章',
                  postedAt: 0,
                  siteId: 'sudugu',
                  host: undefined,
                },
                {
                  url: 'https://b.example/166/c5.html',
                  title: '第5章',
                  postedAt: 0,
                  siteId: 'site-b',
                  host: undefined,
                },
              ],
            },
          ],
          lastSeenChapterKey: '',
          fetchedAt: 1700000000000,
          error: '',
        },
      ],
    }
    const result = roundTrip('novels', data)
    expect(result.books[0]!.sources).toHaveLength(2)
    expect(result.books[0]!.latestChapters[0]!.variants.map((v) => v.siteId)).toEqual([
      'sudugu',
      'site-b',
    ])
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

describe('codec: codecVersion behavior', () => {
  test('compressForStorage stamps the current codecVersion', () => {
    const compressed = compressForStorage('v2ex', {
      data: [{ id: '1', title: 'T', url: '', replies: 0 }],
      fetchedAt: Date.now(),
      error: '',
    })
    expect(compressed.codecVersion).toBe(CACHE_CODEC_VERSION)
  })

  test('unknown-source storage omits codecVersion', () => {
    const compressed = compressForStorage('unknown-source', {
      data: { a: 1 },
      fetchedAt: Date.now(),
      error: '',
    })
    expect(compressed.codecVersion).toBeUndefined()
  })

  test('expandFromStorage passes legacy (no codecVersion) data through', () => {
    const stored = {
      data: {
        news: [{ id: 1, title: 'Full', text: 'x', target: 'https://xueqiu.com/1', created_at: 0 }],
      },
      schemaVersion: CACHE_SCHEMA_VERSION,
      fetchedAt: 1,
      error: '',
    } as unknown as CachedSource<unknown>
    const expanded = expandFromStorage('xueqiu-news', stored)
    const items = expanded.data as { news: { title: string }[] }
    expect(items.news[0]!.title).toBe('Full')
  })

  test('expandFromStorage leaves unknown codecVersion data untouched and migrateCache drops it', () => {
    const data = { x: 1 }
    const stored = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      codecVersion: (CACHE_CODEC_VERSION ?? 0) + 1,
      data,
      fetchedAt: 123,
      error: '',
    } as CachedSource<unknown>
    const expanded = expandFromStorage('v2ex', stored)
    expect(expanded.data).toBe(data)

    expect(migrateCache('v2ex', stored)).toBeNull()
  })
})

describe('codec-migrate: migrateCache', () => {
  test('returns null for non-object values', () => {
    expect(migrateCache('v2ex', null)).toBeNull()
    expect(migrateCache('v2ex', 'x')).toBeNull()
  })

  test('returns null without fetchedAt', () => {
    expect(migrateCache('v2ex', { error: 'x' })).toBeNull()
  })

  test('returns null on schemaVersion mismatch', () => {
    const stored = { schemaVersion: 1, fetchedAt: 1, error: '' }
    expect(migrateCache('v2ex', stored)).toBeNull()
  })

  test('migrates current-schema v2ex cache', () => {
    const data = [{ t: 'compressed title', u: '/t/1', a: 'alice', nt: 'jobs' }]
    const stored = { schemaVersion: CACHE_SCHEMA_VERSION, data, fetchedAt: 1, error: '' }
    const migrated = migrateCache('v2ex', stored)
    expect(migrated).not.toBeNull()
    const items = migrated?.data as { title: string }[]
    expect(items[0]!.title).toBe('compressed title')
  })
})

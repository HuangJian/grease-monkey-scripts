import { describe, expect, test } from 'bun:test'
import { createNovelsSource, markSeen } from '../../../src/prism/novels/source'
import { loadCache, saveCache } from '../../../src/prism/cache'
import { CONFIG_KEY } from '../../../src/prism/types'
import type { NovelData } from '../../../src/prism/novels/types'
import { bookId } from '../../../src/prism/novels/migrate'
import { chapterKey } from '../../../src/prism/novels/chapter-key'
import { createRuntime } from '../../runtime'

describe('createNovelsSource', () => {
  test('fetch reads books from CONFIG_KEY when storage has books that differ from captured options', async () => {
    const runtime = createRuntime()

    runtime.stores[CONFIG_KEY] = {
      novels: { books: [{ title: '', urls: ['https://unknown-host.example/book/'] }] },
    }

    const source = createNovelsSource(
      {
        books: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const result = await source.fetch(runtime, undefined)
    expect(result.books).toHaveLength(1)
    expect(result.books[0]!.id).toBe(bookId('https://unknown-host.example/book/'))
    expect(result.books[0]!.sources[0]!.url).toBe('https://unknown-host.example/book/')
  })

  test('fetch falls back to captured options.books when CONFIG_KEY has no novels books', async () => {
    const runtime = createRuntime()

    delete runtime.stores[CONFIG_KEY]

    const source = createNovelsSource(
      {
        books: [{ title: '', urls: ['https://unknown-host.example/fallback/'] }],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const result = await source.fetch(runtime, undefined)
    expect(result.books).toHaveLength(1)
    expect(result.books[0]!.id).toBe(bookId('https://unknown-host.example/fallback/'))
  })

  test('persistFetchedTitles saves fetched title into the matching book config', async () => {
    const runtime = createRuntime()

    runtime.stores[CONFIG_KEY] = {
      novels: { books: [{ title: '', urls: ['https://www.sudugu.org/166/'] }] },
    }

    const source = createNovelsSource(
      {
        books: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const prevData: NovelData = {
      books: [
        {
          id: bookId('https://www.sudugu.org/166/'),
          title: '九龙夺嫡',
          sources: [
            { url: 'https://www.sudugu.org/166/', siteId: 'sudugu', chapterCount: 0, error: '' },
          ],
          latestChapters: [],
          lastSeenChapterKey: '',
          fetchedAt: 1000,
          error: '',
        },
      ],
    }

    await source.fetch(runtime, prevData)

    const updated = runtime.stores[CONFIG_KEY] as Record<string, unknown>
    expect(updated?.novels).toBeTruthy()
    const books = (updated.novels as { books: { title: string }[] }).books
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('九龙夺嫡')
  })
})

describe('markSeen', () => {
  test('bugfix: preserves fetchedAt and updates lastSeenChapterKey from cache', async () => {
    const runtime = createRuntime()
    const bookUrl = 'https://unknown-host.example/book/'
    const chapterUrl = 'https://unknown-host.example/book/c1.html'
    const id = bookId(bookUrl)
    const key = chapterKey('Ch1')

    await saveCache(runtime, 'novels', {
      data: {
        books: [
          {
            id,
            title: 'Test',
            sources: [{ url: bookUrl, siteId: 'unknown', chapterCount: 0, error: '' }],
            latestChapters: [
              {
                key,
                title: 'Ch1',
                postedAt: 0,
                variants: [{ url: chapterUrl, title: 'Ch1', postedAt: 0, siteId: 'unknown' }],
              },
            ],
            lastSeenChapterKey: '',
            fetchedAt: 1000,
            error: '',
          },
        ],
      },
      fetchedAt: 1000,
      error: '',
    })

    await markSeen(runtime, id)

    const cached = await loadCache<NovelData>(runtime, 'novels')
    expect(cached).not.toBeNull()
    expect(cached!.fetchedAt).toBe(1000)
    expect(cached!.data!.books[0]!.lastSeenChapterKey).toBe(key)
  })

  test('bugfix: source.fetch picks up lastSeenChapterKey from cache (race condition)', async () => {
    const runtime = createRuntime()
    const bookUrl = 'https://unknown-host.example/book/'
    const chapterUrl = 'https://unknown-host.example/book/c1.html'
    const id = bookId(bookUrl)
    const key = chapterKey('Ch1')

    runtime.stores[CONFIG_KEY] = {
      novels: { books: [{ title: '', urls: [bookUrl] }] },
    }

    const source = createNovelsSource(
      {
        books: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    // Cache has updated lastSeenChapterKey (written by markSeen during a fetch)
    await saveCache(runtime, 'novels', {
      data: {
        books: [
          {
            id,
            title: 'Test',
            sources: [{ url: bookUrl, siteId: 'unknown', chapterCount: 0, error: '' }],
            latestChapters: [
              {
                key,
                title: 'Ch1',
                postedAt: 0,
                variants: [{ url: chapterUrl, title: 'Ch1', postedAt: 0, siteId: 'unknown' }],
              },
            ],
            lastSeenChapterKey: key,
            fetchedAt: 1000,
            error: '',
          },
        ],
      },
      fetchedAt: 1000,
      error: '',
    })

    // Fetch with stale prevData (lastSeenChapterKey = '' — the value before markSeen)
    const stalePrev: NovelData = {
      books: [
        {
          id,
          title: 'Test',
          sources: [{ url: bookUrl, siteId: 'unknown', chapterCount: 0, error: '' }],
          latestChapters: [
            {
              key,
              title: 'Ch1',
              postedAt: 0,
              variants: [{ url: chapterUrl, title: 'Ch1', postedAt: 0, siteId: 'unknown' }],
            },
          ],
          lastSeenChapterKey: '',
          fetchedAt: 1000,
          error: '',
        },
      ],
    }

    const result = await source.fetch(runtime, stalePrev)

    // mergeLatestSeen should pick up the cache's lastSeenChapterKey
    expect(result.books[0]!.lastSeenChapterKey).toBe(key)
  })
})

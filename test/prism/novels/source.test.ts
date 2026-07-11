import { describe, expect, test } from 'bun:test'
import { createNovelsSource, markSeen } from '../../../src/prism/novels/source'
import { loadCache, saveCache } from '../../../src/prism/cache'
import { CONFIG_KEY } from '../../../src/prism/types'
import type { NovelData } from '../../../src/prism/novels/types'
import { createRuntime } from '../../runtime'

describe('createNovelsSource', () => {
  test('fetch reads entries from CONFIG_KEY when storage has entries that differ from captured options', async () => {
    const runtime = createRuntime()

    runtime.stores[CONFIG_KEY] = {
      novels: { entries: [{ url: 'https://unknown-host.example/book/' }] },
    }

    const source = createNovelsSource(
      {
        entries: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const result = await source.fetch(runtime, undefined)
    expect(result.books).toHaveLength(1)
    expect(result.books[0]!.url).toBe('https://unknown-host.example/book/')
  })

  test('fetch falls back to captured options.entries when CONFIG_KEY has no novels entries', async () => {
    const runtime = createRuntime()

    delete runtime.stores[CONFIG_KEY]

    const source = createNovelsSource(
      {
        entries: [{ url: 'https://unknown-host.example/fallback/' }],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const result = await source.fetch(runtime, undefined)
    expect(result.books).toHaveLength(1)
    expect(result.books[0]!.url).toBe('https://unknown-host.example/fallback/')
  })

  test('persistFetchedTitles saves fetched title as alias for entries without one', async () => {
    const runtime = createRuntime()

    runtime.stores[CONFIG_KEY] = {
      novels: { entries: [{ url: 'https://www.sudugu.org/166/' }] },
    }

    const source = createNovelsSource(
      {
        entries: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    const prevData = {
      books: [
        {
          url: 'https://www.sudugu.org/166/',
          siteId: 'unknown',
          title: '九龙夺嫡',
          latestChapters: [],
          fetchedAt: 1000,
          lastSeenChapterUrl: '',
          error: '',
        },
      ],
    }

    await source.fetch(runtime, prevData)

    const updated = runtime.stores[CONFIG_KEY] as Record<string, unknown>
    expect(updated?.novels).toBeTruthy()
    const entries = (updated.novels as { entries: { url: string; alias?: string }[] }).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]!.alias).toBe('九龙夺嫡')
  })
})

describe('markSeen', () => {
  test('bugfix: preserves fetchedAt and updates lastSeenChapterUrl from cache', async () => {
    const runtime = createRuntime()
    const bookUrl = 'https://unknown-host.example/book/'
    const chapterUrl = 'https://unknown-host.example/book/c1.html'

    await saveCache(runtime, 'novels', {
      data: {
        books: [
          {
            url: bookUrl,
            siteId: 'unknown',
            title: 'Test',
            latestChapters: [{ url: chapterUrl, title: 'Ch1', postedAt: 0 }],
            fetchedAt: 1000,
            lastSeenChapterUrl: '',
            error: '',
          },
        ],
      },
      fetchedAt: 1000,
      error: '',
    })

    await markSeen(runtime, bookUrl)

    const cached = await loadCache<NovelData>(runtime, 'novels')
    expect(cached).not.toBeNull()
    expect(cached!.fetchedAt).toBe(1000)
    expect(cached!.data!.books[0]!.lastSeenChapterUrl).toBe(chapterUrl)
  })

  test('bugfix: source.fetch picks up lastSeenChapterUrl from cache (race condition)', async () => {
    const runtime = createRuntime()
    const bookUrl = 'https://unknown-host.example/book/'
    const chapterUrl = 'https://unknown-host.example/book/c1.html'

    runtime.stores[CONFIG_KEY] = {
      novels: { entries: [{ url: bookUrl }] },
    }

    const source = createNovelsSource(
      {
        entries: [],
        ttlMinutes: 60,
        maxNewChaptersPerBook: 5,
        initialNewChapters: 3,
        maxLatestWindow: 50,
      },
      runtime,
    )

    // Cache has updated lastSeenChapterUrl (written by markSeen during a fetch)
    await saveCache(runtime, 'novels', {
      data: {
        books: [
          {
            url: bookUrl,
            siteId: 'unknown',
            title: 'Test',
            latestChapters: [{ url: chapterUrl, title: 'Ch1', postedAt: 0 }],
            fetchedAt: 1000,
            lastSeenChapterUrl: chapterUrl,
            error: '',
          },
        ],
      },
      fetchedAt: 1000,
      error: '',
    })

    // Fetch with stale prevData (lastSeenChapterUrl = '' — the value before markSeen)
    const stalePrev: NovelData = {
      books: [
        {
          url: bookUrl,
          siteId: 'unknown',
          title: 'Test',
          latestChapters: [{ url: chapterUrl, title: 'Ch1', postedAt: 0 }],
          fetchedAt: 1000,
          lastSeenChapterUrl: '',
          error: '',
        },
      ],
    }

    const result = await source.fetch(runtime, stalePrev)

    // mergeLatestSeen should pick up the cache's lastSeenChapterUrl
    expect(result.books[0]!.lastSeenChapterUrl).toBe(chapterUrl)
  })
})

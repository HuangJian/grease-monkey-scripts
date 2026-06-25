import { describe, expect, test } from 'bun:test'
import { createNovelsSource } from '../../../src/dashboard/novels/source'
import { CONFIG_KEY } from '../../../src/dashboard/types'
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

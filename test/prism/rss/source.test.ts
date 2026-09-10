import { describe, expect, test } from 'bun:test'
import { createRssSource, rssTabLabel } from '../../../src/prism/rss/source'
import { createRssState } from '../../../src/prism/rss/state'
import type { RssFeed, RssSourceOptions } from '../../../src/prism/rss/types'
import { CONFIG_KEY, STATE_KEY } from '../../../src/prism/types'
import type { RequestDetails } from '../../../src/runtime'
import { createRuntime, type TestRuntime, XmlDOMParser } from '../../runtime'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

function feedXml(entries: Array<{ id: string; title: string; ageDays?: number }>): string {
  const items = entries
    .map(
      (e) => `<item><title>${e.title}</title><link>https://example.com/${e.id}</link>
        <pubDate>${new Date(NOW - (e.ageDays ?? 1) * DAY).toUTCString()}</pubDate>
        <description>body ${e.id}</description></item>`,
    )
    .join('')
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items}</channel></rss>`
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const runtime = createRuntime()
  runtime.DOMParser = XmlDOMParser as unknown as typeof DOMParser
  runtime.setClock(NOW)
  runtime.request = handler as TestRuntime['request']
  return runtime
}

function defaultOptions(over: Partial<RssSourceOptions> = {}): RssSourceOptions {
  return {
    feeds: [{ url: 'https://example.com/feed.xml', title: '' }],
    ttlMinutes: 123,
    retentionDays: 30,
    maxItemsPerFeed: 100,
    viewMode: 'grouped',
    ...over,
  }
}

describe('createRssSource metadata', () => {
  test('id/title/groupId/order/ttlMs and editor factory are wired', () => {
    const source = createRssSource(defaultOptions())
    expect(source.id).toBe('rss')
    expect(source.title).toBe('RSS 阅读')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(6)
    expect(source.ttlMs).toBe(123 * 60_000)
    expect(typeof source.createEditor).toBe('function')
    expect(typeof source.loadState).toBe('function')
  })

  test('ttlMs follows the configured value', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({ responseText: feedXml([]), status: 200, responseHeaders: '' }),
    )
    const source = createRssSource(defaultOptions({ ttlMinutes: 60 }))
    await source.loadState?.(runtime)
    expect(source.ttlMs).toBe(60 * 60_000)
  })
})

describe('createRssSource.fetch', () => {
  test('fetches every configured feed and returns the parsed entries', async () => {
    const requested: string[] = []
    const runtime = makeRuntime((d) => {
      requested.push(d.url)
      d.onload({
        responseText: feedXml([{ id: '1', title: 'One' }]),
        status: 200,
        responseHeaders: '',
      })
    })
    const source = createRssSource(
      defaultOptions({
        feeds: [
          { url: 'https://a.example/feed.xml', title: 'A' },
          { url: 'https://b.example/feed.xml', title: 'B' },
        ],
      }),
    )
    const feeds = await source.fetch(runtime, undefined)
    expect(requested.sort()).toEqual(['https://a.example/feed.xml', 'https://b.example/feed.xml'])
    expect(feeds.map((f) => f.title)).toEqual(['A', 'B'])
    expect(feeds[0]!.items).toHaveLength(1)
  })

  test('returns an empty list when nothing is configured', async () => {
    const runtime = makeRuntime(() => {})
    const source = createRssSource(defaultOptions({ feeds: [] }))
    expect(await source.fetch(runtime, undefined)).toEqual([])
  })

  test('applies the retention window from config on refetch', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({
        responseText: feedXml([
          { id: 'fresh', title: 'Fresh', ageDays: 1 },
          { id: 'old', title: 'Old', ageDays: 40 },
        ]),
        status: 200,
        responseHeaders: '',
      })
    })
    const source = createRssSource(defaultOptions({ retentionDays: 7 }))
    const feeds = await source.fetch(runtime, undefined)
    expect(feeds[0]!.items.map((it) => it.id)).toEqual(['https://example.com/fresh'])
  })

  test('honours the per-feed cap from config', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({
        responseText: feedXml([
          { id: 'a', title: 'A', ageDays: 1 },
          { id: 'b', title: 'B', ageDays: 2 },
          { id: 'c', title: 'C', ageDays: 3 },
        ]),
        status: 200,
        responseHeaders: '',
      })
    })
    const source = createRssSource(defaultOptions({ maxItemsPerFeed: 2 }))
    const feeds = await source.fetch(runtime, undefined)
    expect(feeds[0]!.items).toHaveLength(2)
  })

  test('propagates a total failure so the refresh layer can back off', async () => {
    const runtime = makeRuntime((d) => d.onerror?.())
    const source = createRssSource(defaultOptions())
    await expect(source.fetch(runtime, undefined)).rejects.toThrow(/all feeds failed/)
  })

  test('changing the retention window keeps the read markers', async () => {
    // Regression: rebuilding the store without reloading it made the next
    // `saveToStorage` write an empty object over every persisted marker, so
    // editing 保留天数 in the editor wiped all read/hidden state.
    const runtime = makeRuntime((d) =>
      d.onload({
        responseText: feedXml([{ id: '1', title: 'One' }]),
        status: 200,
        responseHeaders: '',
      }),
    )
    runtime.stores[CONFIG_KEY] = { rss: defaultOptions({ retentionDays: 30 }) }

    const seeded = createRssState({ retentionMs: 30 * DAY })
    seeded.markRead('https://example.com/1', NOW)
    await seeded.saveToStorage(runtime)

    const source = createRssSource(defaultOptions())
    await source.loadState?.(runtime)
    const oneItem: RssFeed = {
      id: 'u:https://example.com/feed.xml',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      items: [
        {
          id: 'https://example.com/1',
          title: 'One',
          link: 'https://example.com/1',
          pubDate: NOW - DAY,
          summaryText: '',
        },
      ],
      error: '',
      fetchedAt: NOW,
    }
    expect(source.getTabLabel?.([oneItem])?.badge).toBeNull()

    runtime.stores[CONFIG_KEY] = { rss: defaultOptions({ retentionDays: 7 }) }
    await source.fetch(runtime, undefined)

    const stored = runtime.stores[STATE_KEY('rss')] as Record<string, unknown>
    expect(Object.keys(stored)).toEqual(['https://example.com/1'])
    expect(source.getTabLabel?.([oneItem])?.badge).toBeNull()
  })
})

describe('rssTabLabel', () => {
  function makeFeed(itemIds: string[]): RssFeed {
    return {
      id: 'u:https://example.com/feed.xml',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      items: itemIds.map((id) => ({
        id,
        title: id,
        link: `https://example.com/${id}`,
        pubDate: NOW,
        summaryText: '',
      })),
      error: '',
      fetchedAt: NOW,
    }
  }

  test('counts unread entries across feeds', () => {
    const state = createRssState({ retentionMs: 30 * DAY })
    expect(rssTabLabel([makeFeed(['a', 'b']), makeFeed(['c'])], state)).toEqual({
      label: 'RSS 阅读',
      badge: 3,
    })
  })

  test('ignores disabled feeds', () => {
    const state = createRssState({ retentionMs: 30 * DAY })
    const feeds = [makeFeed(['a']), { ...makeFeed(['b']), enabled: false }]
    expect(rssTabLabel(feeds, state).badge).toBe(1)
  })

  test('returns a null badge when nothing is unread', () => {
    const state = createRssState({ retentionMs: 30 * DAY })
    expect(rssTabLabel([], state)).toEqual({ label: 'RSS 阅读', badge: null })
  })
})

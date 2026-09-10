import { describe, expect, test } from 'bun:test'
import { fetchRssFeeds } from '../../../src/prism/rss/fetcher'
import { MAX_SUMMARY_CHARS } from '../../../src/prism/rss/constants'
import type { RssFeed, RssFeedConfig } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime, XmlDOMParser } from '../../runtime'

const DAY = 24 * 60 * 60 * 1000
const NOW = 10 * DAY

function feedXml(title: string, entries: Array<{ id: string; title: string; date?: string }>) {
  const items = entries
    .map(
      (e) => `    <item>
      <title>${e.title}</title>
      <link>https://example.com/${e.id}</link>
      <guid>${e.id}</guid>
      ${e.date ? `<pubDate>${e.date}</pubDate>` : ''}
      <description><![CDATA[<p>Body ${e.id}</p><script>alert(1)</script>]]></description>
    </item>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${title}</title>
${items}
</channel></rss>`
}

const RFC822 = (ms: number) => new Date(ms).toUTCString()

function makeRuntime(): TestRuntime {
  const runtime = createRuntime()
  // happy-dom's parser cannot handle XML with CDATA sections (see test/runtime).
  runtime.DOMParser = XmlDOMParser as unknown as typeof DOMParser
  runtime.setClock(NOW)
  return runtime
}

const OPTS = { maxItemsPerFeed: 100, retentionMs: 30 * DAY }

function config(url: string, over: Partial<RssFeedConfig> = {}): RssFeedConfig {
  return { url, title: '', ...over }
}

describe('fetchRssFeeds', () => {
  test('parses entries into plain-text summaries and keeps config order', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://a.example/feed.xml',
      feedXml('Feed A', [{ id: '1', title: 'One', date: RFC822(NOW - DAY) }]),
    )
    runtime.queueResponse(
      'https://b.example/feed.xml',
      feedXml('Feed B', [{ id: '2', title: 'Two', date: RFC822(NOW - DAY) }]),
    )

    const feeds = await fetchRssFeeds(
      runtime,
      [config('https://a.example/feed.xml'), config('https://b.example/feed.xml')],
      [],
      OPTS,
    )
    expect(feeds.map((f) => f.url)).toEqual([
      'https://a.example/feed.xml',
      'https://b.example/feed.xml',
    ])
    expect(feeds[0]!.title).toBe('Feed A')
    expect(feeds[0]!.items[0]!.title).toBe('One')
    // Plain text, script stripped (plan D9).
    expect(feeds[0]!.items[0]!.summaryText).toBe('Body 1')
    expect(feeds[0]!.error).toBe('')
  })

  test('sends the identifying User-Agent and an RSS Accept header', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse('https://a.example/feed.xml', feedXml('A', [{ id: '1', title: 'One' }]))
    await fetchRssFeeds(runtime, [config('https://a.example/feed.xml')], [], OPTS)
    expect(runtime.lastRequest?.headers?.['User-Agent']).toContain('grease-monkey-dashboard')
    expect(runtime.lastRequest?.headers?.['Accept']).toContain('application/rss+xml')
  })

  test('truncates long summaries', async () => {
    const runtime = makeRuntime()
    const long = `https://a.example/feed.xml`
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item>
      <title>T</title><link>https://example.com/1</link>
      <description>${'y'.repeat(2000)}</description>
    </item></channel></rss>`
    runtime.queueResponse(long, xml)
    const feeds = await fetchRssFeeds(runtime, [config(long)], [], OPTS)
    expect(feeds[0]!.items[0]!.summaryText.length).toBe(MAX_SUMMARY_CHARS)
  })

  test('isolates a single feed failure', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://good.example/feed.xml',
      feedXml('Good', [{ id: '1', title: 'One' }]),
    )
    // bad.example has no queued response → the test runtime calls onerror.
    const feeds = await fetchRssFeeds(
      runtime,
      [config('https://bad.example/feed.xml'), config('https://good.example/feed.xml')],
      [],
      OPTS,
    )
    expect(feeds[0]!.error).not.toBe('')
    expect(feeds[1]!.error).toBe('')
    expect(feeds[1]!.items).toHaveLength(1)
  })

  test('keeps previously cached entries when a fetch fails (and does not throw while another succeeds)', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://good.example/feed.xml',
      feedXml('Good', [{ id: 'g1', title: 'G' }]),
    )
    const prev: RssFeed[] = [
      {
        id: 'u:https://bad.example/feed.xml',
        title: 'Prev',
        url: 'https://bad.example/feed.xml',
        items: [
          {
            id: 'p1',
            title: 'Cached',
            link: 'https://example.com/p1',
            pubDate: NOW,
            summaryText: '',
          },
        ],
        error: '',
        fetchedAt: NOW - DAY,
      },
    ]
    const feeds = await fetchRssFeeds(
      runtime,
      [config('https://bad.example/feed.xml'), config('https://good.example/feed.xml')],
      prev,
      OPTS,
    )
    expect(feeds[0]!.error).not.toBe('')
    expect(feeds[0]!.items.map((it) => it.id)).toEqual(['p1'])
    expect(feeds[0]!.fetchedAt).toBe(NOW - DAY)
    expect(feeds[1]!.error).toBe('')
  })

  test('throws only when every feed failed', async () => {
    const runtime = makeRuntime()
    await expect(
      fetchRssFeeds(
        runtime,
        [config('https://bad1.example/f.xml'), config('https://bad2.example/f.xml')],
        [],
        OPTS,
      ),
    ).rejects.toThrow(/all feeds failed/)
  })

  test('skips disabled feeds without issuing a request', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://off.example/feed.xml',
      feedXml('Off', [{ id: '1', title: 'One' }]),
    )
    const feeds = await fetchRssFeeds(
      runtime,
      [config('https://off.example/feed.xml', { enabled: false })],
      [],
      OPTS,
    )
    expect(feeds[0]!.items).toEqual([])
    expect(feeds[0]!.error).toBe('')
    expect(runtime.lastRequest).toBeNull()
  })

  test('title precedence: config title, then feed title, then hostname', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://named.example/feed.xml',
      feedXml('Feed Title', [{ id: '1', title: 'One' }]),
    )
    runtime.queueResponse(
      'https://unnamed.example/feed.xml',
      `<?xml version="1.0"?><rss version="2.0"><channel><item><title>T</title><link>https://example.com/1</link></item></channel></rss>`,
    )

    const feeds = await fetchRssFeeds(
      runtime,
      [
        config('https://named.example/feed.xml', { title: '自定义' }),
        config('https://named.example/feed.xml'),
        config('https://unnamed.example/feed.xml'),
      ],
      [],
      OPTS,
    )
    expect(feeds[0]!.title).toBe('自定义')
    expect(feeds[1]!.title).toBe('Feed Title')
    expect(feeds[2]!.title).toBe('unnamed.example')
  })

  test('applies retention and the per-feed cap', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      'https://cap.example/feed.xml',
      feedXml('Cap', [
        { id: 'fresh', title: 'Fresh', date: RFC822(NOW) },
        { id: 'stale', title: 'Stale', date: RFC822(NOW - 40 * DAY) },
        { id: 'nodate', title: 'NoDate' },
      ]),
    )
    const feeds = await fetchRssFeeds(runtime, [config('https://cap.example/feed.xml')], [], {
      maxItemsPerFeed: 2,
      retentionMs: 30 * DAY,
    })
    // Stale dropped by retention; cap then trims to 2.
    const ids = feeds[0]!.items.map((it) => it.id)
    expect(ids).not.toContain('stale')
    expect(ids.length).toBeLessThanOrEqual(2)
  })

  test('returns an empty list when nothing is configured', async () => {
    const runtime = makeRuntime()
    expect(await fetchRssFeeds(runtime, [], [], OPTS)).toEqual([])
  })
})

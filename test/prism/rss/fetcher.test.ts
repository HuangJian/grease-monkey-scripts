import { describe, expect, test } from 'bun:test'
import { fetchRssFeeds } from '../../../src/prism/rss/fetcher'
import { MAX_SUMMARY_CHARS, SUMMARY_KEEP_COUNT } from '../../../src/prism/rss/constants'
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

/**
 * Scheduling off for the tests that predate it: `ttlMinutes: 1` keeps every
 * cached feed due immediately, so each case only exercises fetching/parsing.
 * `respectFeedPeriod: false` keeps a feed's own `<ttl>` out of the way.
 */
const OPTS = {
  maxItemsPerFeed: 100,
  retentionMs: 30 * DAY,
  ttlMinutes: 1,
  respectFeedPeriod: false,
}

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

  test('an entry without a publish date is dated with the fetch time', async () => {
    const runtime = makeRuntime()
    const url = 'https://nodate.example/feed.xml'
    runtime.queueResponse(url, feedXml('NoDate', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(runtime, [config(url)], [], OPTS)
    // Not `0`: an undated entry is unplaceable downstream — it would sort last,
    // sit outside every date window and never expire.
    expect(feeds[0]!.items[0]!.pubDate).toBe(NOW)
  })

  test('that date is the first sighting, not the latest fetch', async () => {
    // Regression shape: re-stamping on every fetch would drag a week-old post
    // forward forever and it would read as brand new on every refresh.
    const runtime = makeRuntime()
    const url = 'https://nodate.example/feed.xml'
    runtime.queueResponse(url, feedXml('NoDate', [{ id: '1', title: 'One' }]))
    const first = await fetchRssFeeds(runtime, [config(url)], [], OPTS)

    runtime.setClock(NOW + 3 * DAY)
    runtime.queueResponse(url, feedXml('NoDate', [{ id: '1', title: 'One' }]))
    const second = await fetchRssFeeds(runtime, [config(url)], first, OPTS)
    expect(second[0]!.items[0]!.pubDate).toBe(NOW)
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
    expect(feeds[0]!.enabled).toBe(false)
    expect(runtime.lastRequest).toBeNull()
  })

  test('a disabled feed keeps its cached entries so re-enabling is lossless', async () => {
    const runtime = makeRuntime()
    const url = 'https://off.example/feed.xml'
    const prev: RssFeed[] = [
      {
        id: `u:${url}`,
        title: 'Off',
        url,
        items: [
          {
            id: 'https://example.com/kept',
            title: 'Kept',
            link: 'https://example.com/kept',
            pubDate: NOW,
            summaryText: '',
          },
        ],
        error: '',
        fetchedAt: NOW - DAY,
      },
    ]
    const feeds = await fetchRssFeeds(runtime, [config(url, { enabled: false })], prev, OPTS)
    expect(feeds[0]!.items.map((it) => it.id)).toEqual(['https://example.com/kept'])
    expect(feeds[0]!.enabled).toBe(false)
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
      ...OPTS,
      maxItemsPerFeed: 2,
    })
    expect(feeds[0]!.items.map((it) => it.id)).toEqual([
      'https://example.com/fresh',
      'https://example.com/nodate',
    ])
  })

  test('keeps summaries only for the newest entries (storage window)', async () => {
    const runtime = makeRuntime()
    const url = 'https://many.example/feed.xml'
    runtime.queueResponse(
      url,
      feedXml(
        'Many',
        Array.from({ length: SUMMARY_KEEP_COUNT + 5 }, (_, i) => ({
          id: `e${i}`,
          title: `Entry ${i}`,
          // Newest first: e0 is the newest.
          date: RFC822(NOW - i * 60_000),
        })),
      ),
    )
    const feeds = await fetchRssFeeds(runtime, [config(url)], [], OPTS)
    const items = feeds[0]!.items
    expect(items).toHaveLength(SUMMARY_KEEP_COUNT + 5)
    expect(items[0]!.summaryText).toBe(`Body e0`)
    expect(items[SUMMARY_KEEP_COUNT - 1]!.summaryTrimmed).toBeUndefined()
    expect(items[SUMMARY_KEEP_COUNT]!.summaryText).toBe('')
    expect(items[SUMMARY_KEEP_COUNT]!.summaryTrimmed).toBe(true)
  })

  test('returns an empty list when nothing is configured', async () => {
    const runtime = makeRuntime()
    expect(await fetchRssFeeds(runtime, [], [], OPTS)).toEqual([])
  })
})

describe('fetchRssFeeds scheduling', () => {
  const url = 'https://a.example/feed.xml'
  const HOUR = 60 * 60 * 1000
  /** 60-minute minimum, feed declarations honoured. */
  const SCHED = {
    maxItemsPerFeed: 100,
    retentionMs: 30 * DAY,
    ttlMinutes: 60,
    respectFeedPeriod: true,
  }

  function cachedFeed(over: Partial<RssFeed> = {}): RssFeed {
    return {
      id: `u:${url}`,
      title: 'A',
      url,
      items: [],
      error: '',
      fetchedAt: NOW,
      ...over,
    }
  }

  function item(id: string, pubDate: number): RssFeed['items'][number] {
    return { id, title: id, link: `https://example.com/${id}`, pubDate, summaryText: '' }
  }

  test('a feed fetched inside its interval is not requested again', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(runtime, [config(url)], [cachedFeed()], SCHED)
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.fetchedAt).toBe(NOW)
  })

  test('a forced refresh fetches a feed that is not due', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(runtime, [config(url)], [cachedFeed()], {
      ...SCHED,
      force: true,
    })
    expect(runtime.lastRequest?.url).toBe(url)
    expect(feeds[0]!.fetchedAt).toBe(NOW)
  })

  test('a forced refresh still skips a disabled feed', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url, { enabled: false })],
      [cachedFeed({ fetchedAt: 0 })],
      { ...SCHED, force: true },
    )
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.enabled).toBe(false)
  })

  test('the same feed is requested once the interval elapses', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ fetchedAt: NOW - 2 * HOUR })],
      SCHED,
    )
    expect(runtime.lastRequest?.url).toBe(url)
    expect(feeds[0]!.items).toHaveLength(1)
    expect(feeds[0]!.fetchedAt).toBe(NOW)
  })

  test('a declared interval keeps a slow feed from being fetched', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ fetchedAt: NOW - 2 * HOUR, declaredIntervalMs: 7 * 24 * HOUR })],
      SCHED,
    )
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.declaredIntervalMs).toBe(7 * 24 * HOUR)
  })

  test('a feed that is not due still drops entries past retention', async () => {
    const runtime = makeRuntime()
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ items: [item('old', NOW - 40 * DAY), item('kept', NOW)] })],
      SCHED,
    )
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.items.map((it) => it.id)).toEqual(['kept'])
  })

  test('sends the cached validators as conditional-request headers', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    await fetchRssFeeds(
      runtime,
      [config(url)],
      [
        cachedFeed({
          fetchedAt: NOW - 2 * HOUR,
          etag: '"v1"',
          lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT',
        }),
      ],
      SCHED,
    )
    expect(runtime.lastRequest?.headers?.['If-None-Match']).toBe('"v1"')
    expect(runtime.lastRequest?.headers?.['If-Modified-Since']).toBe(
      'Wed, 21 Oct 2015 07:28:00 GMT',
    )
  })

  test('stores the validators a 200 response carries', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      url,
      feedXml('A', [{ id: '1', title: 'One' }]),
      200,
      'ETag: "v2"\r\nLast-Modified: Wed, 21 Oct 2015 07:28:00 GMT',
    )
    const feeds = await fetchRssFeeds(runtime, [config(url)], [], SCHED)
    expect(feeds[0]!.etag).toBe('"v2"')
    expect(feeds[0]!.lastModified).toBe('Wed, 21 Oct 2015 07:28:00 GMT')
  })

  test('a 304 reuses the cached entries and counts as a success', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, '', 304, 'ETag: "v1"')
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [
        cachedFeed({
          fetchedAt: NOW - 2 * HOUR,
          etag: '"v1"',
          error: 'boom',
          failureCount: 2,
          nextRetryAt: NOW - 1,
          items: [{ ...item('kept', NOW), summaryText: 'body' }],
        }),
      ],
      SCHED,
    )
    expect(feeds[0]!.items.map((it) => it.id)).toEqual(['kept'])
    expect(feeds[0]!.items[0]!.summaryText).toBe('body')
    expect(feeds[0]!.error).toBe('')
    expect(feeds[0]!.fetchedAt).toBe(NOW)
    expect(feeds[0]!.attemptedAt).toBe(NOW)
    expect(feeds[0]!.failureCount).toBeUndefined()
    expect(feeds[0]!.nextRetryAt).toBeUndefined()
    expect(feeds[0]!.etag).toBe('"v1"')
  })

  test('a failed attempt is recorded on the retry ladder, not as a success', async () => {
    const runtime = makeRuntime()
    const good = 'https://good.example/feed.xml'
    runtime.queueResponse(good, feedXml('Good', []))
    // No queued response for `url` → the test runtime calls onerror.
    const feeds = await fetchRssFeeds(runtime, [config(url), config(good)], [], SCHED)
    expect(feeds[0]!.error).not.toBe('')
    expect(feeds[0]!.fetchedAt).toBe(0)
    expect(feeds[0]!.attemptedAt).toBe(NOW)
    expect(feeds[0]!.failureCount).toBe(1)
    expect(feeds[0]!.nextRetryAt).toBe(NOW + 60_000)
    expect(feeds[1]!.error).toBe('')
  })

  test('a feed that is not due keeps a stale error without failing the refresh', async () => {
    const runtime = makeRuntime()
    // Not due by *interval* (fetched a minute ago, 60-minute floor), and its
    // error is from an earlier attempt — the source must not report a failure
    // for a refresh that made no request at all.
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ error: 'http 500' })],
      SCHED,
    )
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.error).toBe('http 500')
  })

  test('a feed inside its retry delay keeps its error and is not requested', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ fetchedAt: 0, error: 'boom', failureCount: 3, nextRetryAt: NOW + 5 * 60_000 })],
      SCHED,
    )
    expect(runtime.lastRequest).toBeNull()
    expect(feeds[0]!.error).toBe('boom')
    expect(feeds[0]!.failureCount).toBe(3)
  })

  test('the retry happens once the delay elapses, and success clears the ladder', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [cachedFeed({ fetchedAt: 0, error: 'boom', failureCount: 3, nextRetryAt: NOW - 1 })],
      SCHED,
    )
    expect(runtime.lastRequest?.url).toBe(url)
    expect(feeds[0]!.error).toBe('')
    expect(feeds[0]!.failureCount).toBeUndefined()
    expect(feeds[0]!.nextRetryAt).toBeUndefined()
    expect(feeds[0]!.fetchedAt).toBe(NOW)
  })

  test('a feed whose last attempt failed is retried without validators', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(url, feedXml('A', [{ id: '1', title: 'One' }]))
    const feeds = await fetchRssFeeds(
      runtime,
      [config(url)],
      [
        cachedFeed({
          fetchedAt: NOW - 2 * HOUR,
          etag: '"v1"',
          lastModified: 'Wed, 21 Oct 2015 07:28:00 GMT',
          error: 'http 403',
          failureCount: 1,
          nextRetryAt: NOW - 1,
        }),
      ],
      SCHED,
    )
    // A refusal cannot be persisted (a failed source throws and its result is
    // discarded), so the rule is derived from the previous outcome instead:
    // after any failure the next attempt goes unconditional.
    expect(runtime.lastRequest?.headers?.['If-None-Match']).toBeUndefined()
    expect(runtime.lastRequest?.headers?.['If-Modified-Since']).toBeUndefined()
    expect(feeds[0]!.error).toBe('')
    // This 200 carried no validators, so none are stored.
    expect(feeds[0]!.etag).toBeUndefined()
  })

  test('a declaration arriving with a fetch is stored for the next round', async () => {
    const runtime = makeRuntime()
    runtime.queueResponse(
      url,
      `<?xml version="1.0"?><rss version="2.0"><channel><title>A</title><ttl>720</ttl>
        <item><title>T</title><link>https://example.com/1</link></item>
      </channel></rss>`,
    )
    const feeds = await fetchRssFeeds(runtime, [config(url)], [], SCHED)
    expect(feeds[0]!.declaredIntervalMs).toBe(12 * 60 * 60 * 1000)
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchTnews } from '../../../../src/dashboard/tnews/fetcher'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, XmlDOMParser, type TestRuntime } from '../../../runtime'

function loadFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'tnews-sample.xml'), 'utf8')
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  base.DOMParser = XmlDOMParser
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('fetchTnews', () => {
  test('throws when no feeds configured', async () => {
    const runtime = makeRuntime(() => {})
    await expect(fetchTnews(runtime, { feeds: [], mirrors: [] })).rejects.toThrow(
      /no feeds configured/,
    )
  })

  test('returns items from a single feed', async () => {
    const fixture = loadFixture()
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
    })
    const result = await fetchTnews(runtime, {
      feeds: ['https://rsshub.app/telegram/channel/tnews365'],
      mirrors: [],
    })
    expect(fetched).toEqual(['https://rsshub.app/telegram/channel/tnews365'])
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
  })

  test('tries mirrors when primary rsshub.app URL fails', async () => {
    const fixture = loadFixture()
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      if (d.url.startsWith('https://rsshub.app/')) {
        d.onerror?.()
        return
      }
      if (d.url.includes('mirror-a')) {
        d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
        return
      }
      d.onerror?.()
    })
    const result = await fetchTnews(runtime, {
      feeds: ['https://rsshub.app/telegram/channel/tnews365'],
      mirrors: ['rsshub.mirror-a.com', 'rsshub.mirror-b.com'],
    })
    expect(fetched).toContain('https://rsshub.mirror-a.com/telegram/channel/tnews365')
    expect(result.items.length).toBeGreaterThan(0)
  })

  test('stops at first successful mirror', async () => {
    const fixture = loadFixture()
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      if (d.url.includes('mirror-a')) {
        d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
        return
      }
      d.onerror?.()
    })
    await fetchTnews(runtime, {
      feeds: ['https://rsshub.app/telegram/channel/tnews365'],
      mirrors: ['rsshub.mirror-a.com', 'rsshub.mirror-b.com'],
    })
    expect(fetched).toContain('https://rsshub.mirror-a.com/telegram/channel/tnews365')
    expect(fetched).not.toContain('https://rsshub.mirror-b.com/telegram/channel/tnews365')
  })

  test('does not try mirrors for non-rsshub URLs', async () => {
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      d.onerror?.()
    })
    await expect(
      fetchTnews(runtime, {
        feeds: ['https://example.com/feed.xml'],
        mirrors: ['rsshub.mirror.com'],
      }),
    ).rejects.toThrow()
    expect(fetched).toEqual(['https://example.com/feed.xml'])
  })

  test('throws when all feeds fail', async () => {
    const runtime = makeRuntime((d) => {
      d.onerror?.()
    })
    await expect(
      fetchTnews(runtime, {
        feeds: ['https://rsshub.app/telegram/channel/tnews365'],
        mirrors: [],
      }),
    ).rejects.toThrow(/all feeds failed/)
  })

  test('partial failure: one feed ok, one fails → returns items, no throw', async () => {
    const fixture = loadFixture()
    const runtime = makeRuntime((d) => {
      if (d.url.includes('ok.com')) {
        d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
        return
      }
      d.onerror?.()
    })
    const result = await fetchTnews(runtime, {
      feeds: ['https://ok.com/feed.xml', 'https://rsshub.app/telegram/channel/tnews365'],
      mirrors: [],
    })
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.errors.length).toBe(1)
  })

  test('items from multiple feeds are merged and sorted by pubDate desc', async () => {
    const old = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>old</title><link>https://t.me/a/1</link>
      <pubDate>Mon, 06 Jan 2025 08:00:00 GMT</pubDate>
      <description><![CDATA[<p>old</p>]]></description></item>
    </channel></rss>`
    const recent = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>new</title><link>https://t.me/b/2</link>
      <pubDate>Mon, 06 Jan 2025 10:00:00 GMT</pubDate>
      <description><![CDATA[<p>new</p>]]></description></item>
    </channel></rss>`
    const runtime = makeRuntime((d) => {
      if (d.url.includes('feed-a'))
        d.onload({ responseText: old, status: 200, responseHeaders: '' })
      else d.onload({ responseText: recent, status: 200, responseHeaders: '' })
    })
    const result = await fetchTnews(runtime, {
      feeds: ['https://x.com/feed-a', 'https://y.com/feed-b'],
      mirrors: [],
    })
    expect(result.items.length).toBe(2)
    expect(result.items[0]!.link).toBe('https://t.me/b/2')
    expect(result.items[1]!.link).toBe('https://t.me/a/1')
  })

  test('preserves query string when substituting mirror hostname', async () => {
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      if (d.url.startsWith('https://rsshub.app/')) {
        d.onerror?.()
        return
      }
      d.onload({
        responseText: '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>',
        status: 200,
        responseHeaders: '',
      })
    })
    await fetchTnews(runtime, {
      feeds: ['https://rsshub.app/telegram/channel/tnews365?limit=50'],
      mirrors: ['rsshub.m.com'],
    })
    expect(fetched).toContain('https://rsshub.m.com/telegram/channel/tnews365?limit=50')
  })

  test('rejects primary URL with non-2xx status', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: 'bad', status: 503, responseHeaders: '' })
    })
    await expect(
      fetchTnews(runtime, {
        feeds: ['https://rsshub.app/telegram/channel/tnews365'],
        mirrors: [],
      }),
    ).rejects.toThrow()
  })
})

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTnewsSource } from '../../../../src/prism/tnews/source'
import { validateConfig } from '../../../../src/prism/config'
import { TNEWS_FEED_URL } from '../../../../src/prism/tnews/constants'
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

const DEFAULT_OPTS = {
  ttlMinutes: 30,
}

describe('createTnewsSource metadata', () => {
  test('id/title/groupId/order/ttlMs are correct', () => {
    const { source } = createTnewsSource(DEFAULT_OPTS)
    expect(source.id).toBe('tnews')
    expect(source.title).toBe('竹新社')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(1)
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(typeof source.createEditor).toBe('function')
  })
})

describe('createTnewsSource.fetch', () => {
  test('fetches from hardcoded TNEWS_FEED_URL', async () => {
    const fixture = loadFixture()
    const fetched: string[] = []
    const runtime = makeRuntime((d) => {
      fetched.push(d.url)
      d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
    })
    const { source } = createTnewsSource(DEFAULT_OPTS)
    await source.fetch(runtime, undefined)
    expect(fetched).toEqual([TNEWS_FEED_URL])
  })

  test('merges prevData with newly fetched items (link-based union)', async () => {
    const now = Date.now()
    const freshXml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Fresh title</title><link>https://t.me/z/9</link>
      <guid>https://t.me/z/9</guid>
      <pubDate>${new Date(now - 1 * 3600 * 1000).toUTCString()}</pubDate>
      <description><![CDATA[<p>fresh</p>]]></description></item>
      <item><title>Replaced</title><link>https://t.me/x/1</link>
      <pubDate>${new Date(now - 30 * 60 * 1000).toUTCString()}</pubDate>
      <description><![CDATA[<p>newer version</p>]]></description></item>
    </channel></rss>`
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: freshXml, status: 200, responseHeaders: '' })
    })
    const { source, state } = createTnewsSource(DEFAULT_OPTS)
    const recentPrev: import('../../../../src/prism/tnews/types').TnewsItem[] = [
      {
        id: 'https://t.me/x/1',
        title: 'preexisting old',
        link: 'https://t.me/x/1',
        pubDate: now - 2 * 3600 * 1000,
        descriptionHtml: '<p>old</p>',
      },
      {
        id: 'https://t.me/y/2',
        title: 'prev only',
        link: 'https://t.me/y/2',
        pubDate: now - 1 * 3600 * 1000,
        descriptionHtml: '<p>prev</p>',
      },
    ]
    const result = (await source.fetch(
      runtime,
      recentPrev,
    )) as import('../../../../src/prism/tnews/types').TnewsItem[]
    const links = result.map((it) => it.link)
    expect(links).toContain('https://t.me/z/9')
    expect(links).toContain('https://t.me/y/2')
    const replaced = result.find((it) => it.link === 'https://t.me/x/1')!
    expect(replaced.title).toBe('Replaced')
    expect(state).toBeDefined()
  })

  test('filters items older than retention window', async () => {
    const oldXml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>old</title><link>https://t.me/x/1</link>
      <pubDate>${new Date(Date.now() - 73 * 3600 * 1000).toUTCString()}</pubDate>
      <description><![CDATA[<p>old</p>]]></description></item>
    </channel></rss>`
    const recentXml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>new</title><link>https://t.me/y/2</link>
      <pubDate>${new Date(Date.now() - 1 * 3600 * 1000).toUTCString()}</pubDate>
      <description><![CDATA[<p>new</p>]]></description></item>
    </channel></rss>`
    const runtime = makeRuntime((d) => {
      d.onload({
        responseText: d.url.includes('tnews365') ? recentXml : oldXml,
        status: 200,
        responseHeaders: '',
      })
    })
    const { source } = createTnewsSource(DEFAULT_OPTS)
    const result = (await source.fetch(
      runtime,
      undefined,
    )) as import('../../../../src/prism/tnews/types').TnewsItem[]
    const links = result.map((it) => it.link)
    expect(links).toContain('https://t.me/y/2')
    expect(links).not.toContain('https://t.me/x/1')
  })

  test('fetch does not write to a double-prefixed cache key', async () => {
    const fixture = loadFixture()
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: fixture, status: 200, responseHeaders: '' })
    })
    const { source } = createTnewsSource(DEFAULT_OPTS)
    await source.fetch(runtime, undefined)
    expect(runtime.stores['dashboard:v2:dashboard:v2:tnews']).toBeUndefined()
  })
})

describe('createTnewsSource state handle', () => {
  test('exposed state.clear() resets read/hidden/expanded maps', async () => {
    const { state } = createTnewsSource(DEFAULT_OPTS)
    state.markRead('https://t.me/a/1')
    state.markHidden('https://t.me/b/2')
    state.setExpanded('https://t.me/c/3', true)
    state.clear()
    expect(state.isRead('https://t.me/a/1')).toBe(false)
    expect(state.isHidden('https://t.me/b/2')).toBe(false)
    expect(state.isExpanded('https://t.me/c/3')).toBe(false)
  })
})

describe('validateConfig.tnews', () => {
  test('accepts default config', () => {
    expect(
      validateConfig({
        tnews: { ttlMinutes: 30 },
      }),
    ).toEqual({ ok: true })
  })
  test('rejects non-object tnews', () => {
    expect(validateConfig({ tnews: 'no' }).ok).toBe(false)
  })
  test('rejects ttlMinutes <= 0', () => {
    expect(
      validateConfig({
        tnews: { ttlMinutes: 0 },
      }).ok,
    ).toBe(false)
  })
})

describe('tnewsTabLabel', () => {
  test('returns null badge when all items are read', () => {
    const handle = createTnewsSource(DEFAULT_OPTS)
    const items: import('../../../../src/prism/tnews/types').TnewsItem[] = [
      { id: 'a', title: 'a', link: 'https://t.me/a', pubDate: 1, descriptionHtml: '' },
      { id: 'b', title: 'b', link: 'https://t.me/b', pubDate: 2, descriptionHtml: '' },
    ]
    handle.state.markRead('a')
    handle.state.markRead('b')
    const label = handle.source.getTabLabel!(items as never)
    expect(label.label).toBe('竹新社')
    expect(label.badge).toBeNull()
  })
  test('counts items not in state.isRead as unread', () => {
    const handle = createTnewsSource(DEFAULT_OPTS)
    const items: import('../../../../src/prism/tnews/types').TnewsItem[] = [
      { id: 'a', title: 'a', link: 'https://t.me/a', pubDate: 1, descriptionHtml: '' },
      { id: 'b', title: 'b', link: 'https://t.me/b', pubDate: 2, descriptionHtml: '' },
      { id: 'c', title: 'c', link: 'https://t.me/c', pubDate: 3, descriptionHtml: '' },
    ]
    handle.state.markRead('a')
    const label = handle.source.getTabLabel!(items as never)
    expect(label.badge).toBe(2)
  })
  test('returns null badge when data is empty or null', () => {
    const handle = createTnewsSource(DEFAULT_OPTS)
    expect(handle.source.getTabLabel!(null)).toEqual({ label: '竹新社', badge: null })
    expect(handle.source.getTabLabel!([] as never)).toEqual({ label: '竹新社', badge: null })
  })
})

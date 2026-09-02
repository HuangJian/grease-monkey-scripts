import { describe, expect, test } from 'bun:test'
import { suduguAdapter } from '../../../src/prism/novels/adapters/sudugu'
import { adapterByUrl } from '../../../src/prism/novels/adapters/registry'
import type { NovelAdapter } from '../../../src/prism/novels/adapters/types'
import { mergeTail, fetchNovels } from '../../../src/prism/novels/fetcher'
import { bookId, normalizeBook } from '../../../src/prism/novels/migrate'
import type { NovelBook, NovelBookConfig, NovelRawChapter } from '../../../src/prism/novels/types'
import type { RequestDetails } from '../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../runtime'

function raw(url: string, title = url, postedAt: number = 0): NovelRawChapter {
  return { url, title, postedAt }
}

function homeHtml(opts: {
  title: string
  chapters: { url: string; title: string; label: string }[]
  pages?: number
}): string {
  const lis = opts.chapters
    .map((c) => `<li><i>${c.label}</i><a href="${c.url}">${c.title}</a></li>`)
    .join('')
  const pages =
    opts.pages && opts.pages > 1
      ? `<div id="pages"><select id="pageSelect">${Array.from({ length: opts.pages }, (_, i) => `<option value="${i + 1}">第${i + 1}页</option>`).join('')}</select></div>`
      : ''
  return `<!doctype html><html><body>
    <div class="item">
      <div class="itemtxt">
        <h1><i>100万字</i>${opts.title}</h1>
        <ul>${lis}</ul>
      </div>
    </div>
    <div id="list"><ul></ul></div>
    ${pages}
  </body></html>`
}

function tailHtml(chapters: { url: string; title: string }[]): string {
  const lis = chapters.map((c) => `<li><a href="${c.url}">${c.title}</a></li>`).join('')
  return `<!doctype html><html><body>
    <div id="list"><ul>${lis}</ul></div>
  </body></html>`
}

type FakeServer = {
  runtime: TestRuntime
  hits: string[]
  setResponse(url: string, body: string): void
  setError(url: string): void
}

function makeServer(): FakeServer {
  const runtime = createRuntime()
  const responses = new Map<string, string>()
  const errors = new Set<string>()
  const hits: string[] = []
  runtime.request = ((d: RequestDetails) => {
    hits.push(d.url)
    if (errors.has(d.url)) {
      d.onerror?.()
      return
    }
    const body = responses.get(d.url)
    if (body === undefined) {
      d.onerror?.()
      return
    }
    d.onload({ responseText: body, status: 200, responseHeaders: '' })
  }) as TestRuntime['request']
  return {
    runtime,
    hits,
    setResponse(url, body) {
      responses.set(url, body)
    },
    setError(url) {
      errors.add(url)
    },
  }
}

const URL_166 = 'https://www.sudugu.org/166/'
const URL_12 = 'https://www.sudugu.org/12/'
const URL_OTHER = 'https://other.example/book/1/'
const SITE_B = 'https://b.example/166/'

/** A second site, parsed with the same fixtures so tests stay about merging. */
function siteAdapter(id: string, hostnames: string[]): NovelAdapter {
  return { ...suduguAdapter, id, hostnames }
}

const SITE_B_ADAPTER = siteAdapter('site-b', ['b.example'])

function resolveAdapter(url: string): NovelAdapter | undefined {
  if (SITE_B_ADAPTER.hostnames.includes(new URL(url).hostname)) return SITE_B_ADAPTER
  return adapterByUrl(url)
}

function book(title: string, ...urls: string[]): NovelBookConfig {
  return { title, urls }
}

/** Previous state in the legacy single-url shape, to keep fixtures short. */
function legacyPrev(
  fields: Partial<NovelBook> & { url: string; lastSeenUrl: string; seenTitle?: string },
): NovelBook {
  return normalizeBook({
    ...fields,
    siteId: 'sudugu',
    title: 'T',
    latestChapters: [
      { url: fields.lastSeenUrl, title: fields.seenTitle ?? '第4章', postedAt: 0 },
      { url: `${fields.url}c3.html`, title: '第3章', postedAt: 0 },
    ],
    lastSeenChapterUrl: fields.lastSeenUrl,
    fetchedAt: 1000,
    error: '',
  })!
}

describe('fetchNovels', () => {
  test('single-page book: only home request, returns latest three', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: '九龙夺嫡',
        chapters: [
          { url: '/166/c3.html', title: '第3章', label: '今天' },
          { url: '/166/c2.html', title: '第2章', label: '昨天' },
          { url: '/166/c1.html', title: '第1章', label: '06-01' },
        ],
      }),
    )
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [])
    expect(server.hits).toEqual([URL_166])
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('九龙夺嫡')
    expect(books[0]!.id).toBe(bookId(URL_166))
    expect(books[0]!.sources).toEqual([
      {
        url: URL_166,
        siteId: 'sudugu',
        mirrorHost: 'www.sudugu.org',
        chapterCount: 3,
        error: '',
      },
    ])
    expect(books[0]!.latestChapters).toHaveLength(3)
  })

  test('a new book has no read marker', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: 'T',
        chapters: [
          { url: '/166/c3.html', title: '第3章', label: '今天' },
          { url: '/166/c2.html', title: '第2章', label: '今天' },
          { url: '/166/c1.html', title: '第1章', label: '今天' },
        ],
      }),
    )
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [])
    expect(books[0]!.lastSeenChapterKey).toBe('')
    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual(['n:3', 'n:2', 'n:1'])
  })

  test('initial fetch of a multi-page book fetches the tail page', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: '龙藏',
        chapters: [
          { url: '/12/c10.html', title: '第10章', label: '今天' },
          { url: '/12/c9.html', title: '第9章', label: '昨天' },
          { url: '/12/c8.html', title: '第8章', label: '06-01' },
        ],
        pages: 2,
      }),
    )
    server.setResponse(
      'https://www.sudugu.org/12/p-2.html',
      tailHtml([
        { url: '/12/c5.html', title: '第5章' },
        { url: '/12/c6.html', title: '第6章' },
        { url: '/12/c7.html', title: '第7章' },
        { url: '/12/c8.html', title: '第8章' },
        { url: '/12/c9.html', title: '第9章' },
        { url: '/12/c10.html', title: '第10章' },
      ]),
    )
    const books = await fetchNovels(server.runtime, [book('', URL_12)], [])
    expect(server.hits).toEqual([URL_12, 'https://www.sudugu.org/12/p-2.html'])
    expect(books[0]!.sources[0]!.chapterCount).toBe(6)
    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual([
      'n:10',
      'n:9',
      'n:8',
      'n:7',
      'n:6',
      'n:5',
    ])
    expect(books[0]!.latestChapters[0]!.postedAt).toBeGreaterThan(0)
    expect(books[0]!.latestChapters[3]!.postedAt).toBe(0)
  })

  test('preserves the read marker across refresh', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: 'T',
        chapters: [
          { url: '/166/c5.html', title: '第5章', label: '今天' },
          { url: '/166/c4.html', title: '第4章', label: '昨天' },
          { url: '/166/c3.html', title: '第3章', label: '06-01' },
        ],
      }),
    )
    const prev = legacyPrev({
      url: URL_166,
      lastSeenUrl: 'https://www.sudugu.org/166/c4.html',
    })
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [prev])
    expect(books[0]!.lastSeenChapterKey).toBe('n:4')
    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual(['n:5', 'n:4'])
  })

  test('finds previous state through a shared source url after the primary changed', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: 'T',
        chapters: [{ url: '/166/c5.html', title: '第5章', label: '今天' }],
      }),
    )
    const prev: NovelBook = {
      ...legacyPrev({ url: SITE_B, lastSeenUrl: 'https://b.example/166/c4.html' }),
      id: bookId(SITE_B),
    }
    // Primary is now sudugu, but sudugu is still listed, so the marker is recovered.
    const books = await fetchNovels(
      server.runtime,
      [book('T', URL_166, SITE_B)],
      [prev],
      undefined,
      resolveAdapter,
    )
    expect(books[0]!.lastSeenChapterKey).toBe('n:4')
  })

  test('skips the tail page when the read marker is within the latest three', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: '龙藏',
        chapters: [
          { url: '/12/c10.html', title: '第10章', label: '今天' },
          { url: '/12/c9.html', title: '第9章', label: '昨天' },
          { url: '/12/c8.html', title: '第8章', label: '06-01' },
        ],
        pages: 2,
      }),
    )
    const prev = legacyPrev({
      url: URL_12,
      lastSeenUrl: 'https://www.sudugu.org/12/c9.html',
      seenTitle: '第9章',
    })
    const books = await fetchNovels(server.runtime, [book('', URL_12)], [prev])
    expect(server.hits).toEqual([URL_12])
    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual(['n:10', 'n:9'])
  })

  test('merges two sources that are at different progress', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: '九龙夺嫡',
        chapters: [
          { url: '/166/c3.html', title: '第3章', label: '今天' },
          { url: '/166/c2.html', title: '第2章', label: '昨天' },
          { url: '/166/c1.html', title: '第1章', label: '06-01' },
        ],
      }),
    )
    server.setResponse(
      SITE_B,
      homeHtml({
        title: '九龙夺嫡',
        chapters: [
          { url: '/166/b5.html', title: '第5章', label: '今天' },
          { url: '/166/b4.html', title: '第4章', label: '昨天' },
          { url: '/166/b3.html', title: '第3章', label: '06-01' },
        ],
      }),
    )
    const books = await fetchNovels(
      server.runtime,
      [book('九龙夺嫡', URL_166, SITE_B)],
      [],
      undefined,
      resolveAdapter,
    )

    expect(books[0]!.sources.map((s) => s.siteId)).toEqual(['sudugu', 'site-b'])
    expect(books[0]!.sources.map((s) => s.chapterCount)).toEqual([3, 3])
    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual(['n:5', 'n:4', 'n:3', 'n:2', 'n:1'])
    // Chapter 5 only exists on the second site, chapter 3 on both.
    expect(books[0]!.latestChapters[0]!.variants.map((v) => v.siteId)).toEqual(['site-b'])
    expect(books[0]!.latestChapters[2]!.variants.map((v) => v.siteId)).toEqual(['sudugu', 'site-b'])
  })

  test('keeps the book usable when one of two sources fails', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: '九龙夺嫡',
        chapters: [{ url: '/166/c3.html', title: '第3章', label: '今天' }],
      }),
    )
    server.setError(SITE_B)
    const books = await fetchNovels(
      server.runtime,
      [book('九龙夺嫡', URL_166, SITE_B)],
      [],
      undefined,
      resolveAdapter,
    )

    expect(books[0]!.latestChapters.map((c) => c.key)).toEqual(['n:3'])
    expect(books[0]!.sources[0]!.error).toBe('')
    expect(books[0]!.sources[1]!.error).toMatch(/network error/)
    expect(books[0]!.sources[1]!.chapterCount).toBe(0)
  })

  test('a fully failed fetch keeps the previous chapters and timestamp', async () => {
    const server = makeServer()
    server.setError(URL_166)
    const prev = legacyPrev({ url: URL_166, lastSeenUrl: 'https://www.sudugu.org/166/c4.html' })
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [prev])

    expect(books[0]!.sources[0]!.error).toMatch(/network error/)
    expect(books[0]!.fetchedAt).toBe(1000)
    expect(books[0]!.latestChapters).toEqual(prev.latestChapters)
    expect(books[0]!.lastSeenChapterKey).toBe('n:4')
  })

  test('unknown site reports per source and falls back to the configured title', async () => {
    const server = makeServer()
    const books = await fetchNovels(server.runtime, [book('神书', URL_OTHER)], [])
    expect(server.hits).toEqual([])
    expect(books[0]!.sources).toEqual([
      { url: URL_OTHER, siteId: 'unknown', chapterCount: 0, error: '未知站点，暂不支持' },
    ])
    expect(books[0]!.title).toBe('神书')
    expect(books[0]!.latestChapters).toEqual([])
  })

  test('unknown site without a configured title falls back to the hostname', async () => {
    const server = makeServer()
    const books = await fetchNovels(server.runtime, [book('', URL_OTHER)], [])
    expect(books[0]!.title).toBe('other.example')
  })

  test('first-time failure has empty chapters', async () => {
    const server = makeServer()
    server.setError(URL_166)
    const books = await fetchNovels(server.runtime, [book('神书', URL_166)], [])
    expect(books[0]!.sources[0]!.error).toMatch(/network error/)
    expect(books[0]!.latestChapters).toEqual([])
    expect(books[0]!.title).toBe('神书')
  })

  test('falls back to shudugu.org mirror when sudugu.org fails', async () => {
    const server = makeServer()
    server.setError(URL_166)
    server.setResponse(
      'https://www.shudugu.org/166/',
      homeHtml({
        title: '镜中书',
        chapters: [
          { url: '/166/c3.html', title: '第3章', label: '今天' },
          { url: '/166/c2.html', title: '第2章', label: '昨天' },
          { url: '/166/c1.html', title: '第1章', label: '06-01' },
        ],
      }),
    )
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [])
    expect(server.hits).toEqual([URL_166, 'https://www.shudugu.org/166/'])
    // Book identity stays on the canonical sudugu url; the serving host is per source.
    expect(books[0]!.id).toBe(bookId(URL_166))
    expect(books[0]!.sources[0]!.url).toBe(URL_166)
    expect(books[0]!.sources[0]!.mirrorHost).toBe('www.shudugu.org')
    expect(books[0]!.title).toBe('镜中书')
    expect(books[0]!.latestChapters).toHaveLength(3)
    // Links point at the host that actually served the content.
    expect(books[0]!.latestChapters[0]!.variants[0]!.host).toBe('www.shudugu.org')
  })

  test('records error only after every mirror fails', async () => {
    const server = makeServer()
    server.setError(URL_166)
    server.setError('https://www.shudugu.org/166/')
    const prev = legacyPrev({ url: URL_166, lastSeenUrl: 'https://www.sudugu.org/166/c4.html' })
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [prev])
    expect(server.hits).toEqual([URL_166, 'https://www.shudugu.org/166/'])
    expect(books[0]!.sources[0]!.error).toMatch(/network error/)
    expect(books[0]!.fetchedAt).toBe(1000)
  })

  test('tries the mirror that served last before the original', async () => {
    const server = makeServer()
    server.setResponse(
      'https://www.shudugu.org/166/',
      homeHtml({
        title: '镜中书',
        chapters: [{ url: '/166/c3.html', title: '第3章', label: '今天' }],
      }),
    )
    const prev: NovelBook = {
      ...legacyPrev({ url: URL_166, lastSeenUrl: '' }),
      sources: [
        {
          url: URL_166,
          siteId: 'sudugu',
          mirrorHost: 'www.shudugu.org',
          chapterCount: 0,
          error: '',
        },
      ],
    }
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [prev])
    expect(server.hits).toEqual(['https://www.shudugu.org/166/'])
    expect(books[0]!.sources[0]!.mirrorHost).toBe('www.shudugu.org')
  })

  test('falls back to the original host when the preferred mirror is down', async () => {
    const server = makeServer()
    server.setError('https://www.shudugu.org/166/')
    server.setResponse(
      URL_166,
      homeHtml({
        title: '回源',
        chapters: [{ url: '/166/c3.html', title: '第3章', label: '今天' }],
      }),
    )
    const prev: NovelBook = {
      ...legacyPrev({ url: URL_166, lastSeenUrl: '' }),
      sources: [
        {
          url: URL_166,
          siteId: 'sudugu',
          mirrorHost: 'www.shudugu.org',
          chapterCount: 0,
          error: '',
        },
      ],
    }
    const books = await fetchNovels(server.runtime, [book('', URL_166)], [prev])
    expect(server.hits).toEqual(['https://www.shudugu.org/166/', URL_166])
    expect(books[0]!.sources[0]!.mirrorHost).toBe('www.sudugu.org')
    expect(books[0]!.title).toBe('回源')
  })

  test('sources of one book are fetched in parallel', async () => {
    const server = makeServer()
    let pending = 0
    let maxPending = 0
    server.runtime.request = ((d: RequestDetails) => {
      pending++
      if (pending > maxPending) maxPending = pending
      setTimeout(() => {
        pending--
        d.onload({
          responseText: homeHtml({
            title: d.url,
            chapters: [{ url: `${d.url}c1.html`, title: '第1章', label: '今天' }],
          }),
          status: 200,
          responseHeaders: '',
        })
      }, 5)
    }) as TestRuntime['request']
    await fetchNovels(server.runtime, [book('', URL_166, SITE_B)], [], undefined, resolveAdapter)
    expect(maxPending).toBe(2)
  })

  test('preserves config order in the result', async () => {
    const server = makeServer()
    for (const [url, path] of [
      ['https://www.sudugu.org/a/', '/a/'],
      ['https://www.sudugu.org/c/', '/c/'],
    ] as const) {
      server.setResponse(
        url,
        homeHtml({
          title: url,
          chapters: [{ url: `${path}c1.html`, title: '第1章', label: '今天' }],
        }),
      )
    }
    server.setResponse(
      'https://b.example/b/',
      homeHtml({
        title: 'B',
        chapters: [{ url: '/b/c1.html', title: '第1章', label: '今天' }],
      }),
    )
    const books = await fetchNovels(
      server.runtime,
      [
        book('', 'https://www.sudugu.org/a/'),
        book('B', 'https://b.example/b/'),
        book('', 'https://www.sudugu.org/c/'),
      ],
      [],
      undefined,
      resolveAdapter,
    )
    expect(books.map((b) => b.id)).toEqual([
      bookId('https://www.sudugu.org/a/'),
      bookId('https://b.example/b/'),
      bookId('https://www.sudugu.org/c/'),
    ])
    expect(books[1]!.title).toBe('B')
  })
})

describe('mergeTail', () => {
  test('reverses tail to newest-first and slices up to and including the seen chapter', () => {
    const tail = [
      raw('c1', '第1章'),
      raw('c2', '第2章'),
      raw('c3', '第3章'),
      raw('c4', '第4章'),
      raw('c5', '第5章'),
    ]
    const out = mergeTail(tail, [], 'n:3')
    expect(out.map((c) => c.url)).toEqual(['c5', 'c4', 'c3'])
  })

  test('returns the full reversed tail when the seen chapter is absent', () => {
    const tail = [raw('c1', '第1章'), raw('c2', '第2章'), raw('c3', '第3章')]
    const out = mergeTail(tail, [], 'n:99')
    expect(out.map((c) => c.url)).toEqual(['c3', 'c2', 'c1'])
  })

  test('overlays postedAt from latestThree onto matching chapters', () => {
    const tail = [raw('c1', '第1章'), raw('c2', '第2章'), raw('c3', '第3章')]
    const latest = [raw('c3', '第3章', 1000), raw('c2', '第2章', 2000)]
    const out = mergeTail(tail, latest, 'n:1')
    const byUrl = new Map(out.map((c) => [c.url, c.postedAt]))
    expect(byUrl.get('c3')).toBe(1000)
    expect(byUrl.get('c2')).toBe(2000)
    expect(byUrl.get('c1')).toBe(0)
  })

  test('matches the seen chapter by number, not by url', () => {
    const tail = [raw('/a/1.html', '第1章'), raw('/a/2.html', '第2章')]
    const out = mergeTail(tail, [], 'n:2')
    expect(out.map((c) => c.url)).toEqual(['/a/2.html'])
  })
})

import { describe, expect, test } from 'bun:test'
import { collapseChapters, fetchNovels, mergeTail } from '../../../src/prism/novels/fetcher'
import type { NovelAdapter } from '../../../src/prism/novels/adapters/types'
import type { NovelBook, NovelChapter, NovelEntry } from '../../../src/prism/novels/types'
import type { RequestDetails } from '../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../runtime'

function chapter(url: string, title = url, postedAt: number = 0): NovelChapter {
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
    const entries: NovelEntry[] = [{ url: URL_166 }]
    const books = await fetchNovels(server.runtime, entries, [])
    expect(server.hits).toEqual([URL_166])
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('九龙夺嫡')
    expect(books[0]!.siteId).toBe('sudugu')
    expect(books[0]!.latestChapters).toHaveLength(3)
    expect(books[0]!.error).toBe('')
  })

  test('initialSeenUrl applies when no prev', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: 'T',
        chapters: [
          { url: '/166/c3.html', title: '3', label: '今天' },
          { url: '/166/c2.html', title: '2', label: '今天' },
          { url: '/166/c1.html', title: '1', label: '今天' },
        ],
      }),
    )
    const books = await fetchNovels(server.runtime, [{ url: URL_166 }], [], {
      initialNewChapters: 3,
      maxLatestWindow: 50,
    })
    expect(books[0]!.lastSeenChapterUrl).toBe('')
  })

  test('new book sets lastSeenChapterUrl to empty (all chapters new)', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: 'T',
        chapters: [
          { url: '/12/c3.html', title: '3', label: '今天' },
          { url: '/12/c2.html', title: '2', label: '今天' },
          { url: '/12/c1.html', title: '1', label: '今天' },
        ],
      }),
    )
    const books = await fetchNovels(server.runtime, [{ url: URL_12 }], [], {
      initialNewChapters: 1,
      maxLatestWindow: 50,
    })
    // New books have lastSeenChapterUrl = '' (all chapters are new)
    expect(books[0]!.lastSeenChapterUrl).toBe('')
  })

  test('bugfix: initial fetch of multi-page book fetches tail and sets lastSeenChapterUrl', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: '龙藏',
        chapters: [
          { url: '/12/c10.html', title: '10', label: '今天' },
          { url: '/12/c9.html', title: '9', label: '昨天' },
          { url: '/12/c8.html', title: '8', label: '06-01' },
        ],
        pages: 2,
      }),
    )
    server.setResponse(
      'https://www.sudugu.org/12/p-2.html',
      tailHtml([
        { url: '/12/c5.html', title: '5' },
        { url: '/12/c6.html', title: '6' },
        { url: '/12/c7.html', title: '7' },
        { url: '/12/c8.html', title: '8' },
        { url: '/12/c9.html', title: '9' },
        { url: '/12/c10.html', title: '10' },
      ]),
    )
    const books = await fetchNovels(server.runtime, [{ url: URL_12 }], [], {
      initialNewChapters: 3,
      maxLatestWindow: 50,
    })
    // Should have fetched both home and tail page
    expect(server.hits).toEqual([URL_12, 'https://www.sudugu.org/12/p-2.html'])
    // latestChapters should have the merged list (newest-first, capped to prevSeen)
    const urls = books[0]!.latestChapters.map((c) => c.url)
    expect(urls).toEqual([
      'https://www.sudugu.org/12/c10.html',
      'https://www.sudugu.org/12/c9.html',
      'https://www.sudugu.org/12/c8.html',
      'https://www.sudugu.org/12/c7.html',
      'https://www.sudugu.org/12/c6.html',
      'https://www.sudugu.org/12/c5.html',
    ])
    // New book: lastSeenChapterUrl = '' (all chapters are new)
    expect(books[0]!.lastSeenChapterUrl).toBe('')
    // newChapters should return all chapters
    const { newChapters } = await import('../../../src/prism/novels/state')
    expect(newChapters(books[0]!).map((c) => c.url)).toEqual([
      'https://www.sudugu.org/12/c10.html',
      'https://www.sudugu.org/12/c9.html',
      'https://www.sudugu.org/12/c8.html',
      'https://www.sudugu.org/12/c7.html',
      'https://www.sudugu.org/12/c6.html',
      'https://www.sudugu.org/12/c5.html',
    ])
  })

  test('preserves prev lastSeenChapterUrl across refresh', async () => {
    const server = makeServer()
    server.setResponse(
      URL_166,
      homeHtml({
        title: 'T',
        chapters: [
          { url: '/166/c5.html', title: '5', label: '今天' },
          { url: '/166/c4.html', title: '4', label: '昨天' },
          { url: '/166/c3.html', title: '3', label: '06-01' },
        ],
      }),
    )
    const prev: NovelBook = {
      url: URL_166,
      siteId: 'sudugu',
      title: 'T',
      latestChapters: [chapter('https://www.sudugu.org/166/c4.html', '4')],
      lastSeenChapterUrl: 'https://www.sudugu.org/166/c4.html',
      fetchedAt: 1000,
      error: '',
    }
    const books = await fetchNovels(server.runtime, [{ url: URL_166 }], [prev])
    expect(books[0]!.lastSeenChapterUrl).toBe('https://www.sudugu.org/166/c4.html')
  })

  test('supplements with tail page when prevSeen falls outside latest three', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: '龙藏',
        chapters: [
          { url: '/12/c10.html', title: '10', label: '今天' },
          { url: '/12/c9.html', title: '9', label: '昨天' },
          { url: '/12/c8.html', title: '8', label: '06-01' },
        ],
        pages: 2,
      }),
    )
    server.setResponse(
      'https://www.sudugu.org/12/p-2.html',
      tailHtml([
        { url: '/12/c5.html', title: '5' },
        { url: '/12/c6.html', title: '6' },
        { url: '/12/c7.html', title: '7' },
        { url: '/12/c8.html', title: '8' },
        { url: '/12/c9.html', title: '9' },
        { url: '/12/c10.html', title: '10' },
      ]),
    )
    const prev: NovelBook = {
      url: URL_12,
      siteId: 'sudugu',
      title: '龙藏',
      latestChapters: [chapter('https://www.sudugu.org/12/c5.html', '5')],
      lastSeenChapterUrl: 'https://www.sudugu.org/12/c5.html',
      fetchedAt: 1000,
      error: '',
    }
    const books = await fetchNovels(server.runtime, [{ url: URL_12 }], [prev])
    expect(server.hits).toEqual([URL_12, 'https://www.sudugu.org/12/p-2.html'])
    const urls = books[0]!.latestChapters.map((c) => c.url)
    expect(urls).toEqual([
      'https://www.sudugu.org/12/c10.html',
      'https://www.sudugu.org/12/c9.html',
      'https://www.sudugu.org/12/c8.html',
      'https://www.sudugu.org/12/c7.html',
      'https://www.sudugu.org/12/c6.html',
      'https://www.sudugu.org/12/c5.html',
    ])
    expect(books[0]!.latestChapters[0]!.postedAt).toBeGreaterThan(0)
    expect(books[0]!.latestChapters[3]!.postedAt).toBe(0)
  })

  test('skips tail page when prevSeen is within latest three', async () => {
    const server = makeServer()
    server.setResponse(
      URL_12,
      homeHtml({
        title: '龙藏',
        chapters: [
          { url: '/12/c10.html', title: '10', label: '今天' },
          { url: '/12/c9.html', title: '9', label: '昨天' },
          { url: '/12/c8.html', title: '8', label: '06-01' },
        ],
        pages: 2,
      }),
    )
    const prev: NovelBook = {
      url: URL_12,
      siteId: 'sudugu',
      title: '龙藏',
      latestChapters: [chapter('https://www.sudugu.org/12/c9.html', '9')],
      lastSeenChapterUrl: 'https://www.sudugu.org/12/c9.html',
      fetchedAt: 1000,
      error: '',
    }
    const books = await fetchNovels(server.runtime, [{ url: URL_12 }], [prev])
    expect(server.hits).toEqual([URL_12])
    // Chapters are trimmed to newest..prevSeen: [c10, c9]
    expect(books[0]!.latestChapters).toHaveLength(2)
    expect(books[0]!.latestChapters.map((c) => c.url)).toEqual([
      'https://www.sudugu.org/12/c10.html',
      'https://www.sudugu.org/12/c9.html',
    ])
  })

  test('unknown site returns siteId=unknown with error and preserves prev fields', async () => {
    const server = makeServer()
    const prev: NovelBook = {
      url: URL_OTHER,
      siteId: 'unknown',
      title: 'Previously known',
      latestChapters: [chapter('https://other.example/book/1/c1', 'old')],
      lastSeenChapterUrl: 'https://other.example/book/1/c1',
      fetchedAt: 1000,
      error: '',
    }
    const books = await fetchNovels(server.runtime, [{ url: URL_OTHER }], [prev])
    expect(server.hits).toEqual([])
    expect(books[0]!.siteId).toBe('unknown')
    expect(books[0]!.error).toBe('未知站点，暂不支持')
    expect(books[0]!.title).toBe('Previously known')
    expect(books[0]!.latestChapters).toHaveLength(1)
    expect(books[0]!.fetchedAt).toBe(1000)
    expect(books[0]!.lastSeenChapterUrl).toBe('https://other.example/book/1/c1')
  })

  test('unknown site without prev uses alias or hostname', async () => {
    const server = makeServer()
    const books = await fetchNovels(server.runtime, [{ url: URL_OTHER, alias: '神书' }], [])
    expect(books[0]!.title).toBe('神书')
    expect(books[0]!.siteId).toBe('unknown')
  })

  test('network error preserves prev data and records error message', async () => {
    const server = makeServer()
    server.setError(URL_166)
    const prev: NovelBook = {
      url: URL_166,
      siteId: 'sudugu',
      title: 'T',
      latestChapters: [chapter('https://www.sudugu.org/166/c4.html', '4')],
      lastSeenChapterUrl: 'https://www.sudugu.org/166/c4.html',
      fetchedAt: 1000,
      error: '',
    }
    const books = await fetchNovels(server.runtime, [{ url: URL_166 }], [prev])
    expect(books[0]!.error).toMatch(/network error/)
    expect(books[0]!.fetchedAt).toBe(1000)
    expect(books[0]!.latestChapters).toHaveLength(1)
    expect(books[0]!.lastSeenChapterUrl).toBe('https://www.sudugu.org/166/c4.html')
  })

  test('first-time failure has empty chapters and fallback title', async () => {
    const server = makeServer()
    server.setError(URL_166)
    const books = await fetchNovels(server.runtime, [{ url: URL_166, alias: '神书' }], [])
    expect(books[0]!.error).toMatch(/network error/)
    expect(books[0]!.latestChapters).toEqual([])
    expect(books[0]!.title).toBe('神书')
  })

  test('runs same-host entries serially', async () => {
    const server = makeServer()
    const callOrder: string[] = []
    server.runtime.request = ((d: RequestDetails) => {
      callOrder.push(d.url)
      setTimeout(() => {
        d.onload({
          responseText: homeHtml({
            title: d.url,
            chapters: [{ url: `${d.url}c1.html`, title: '1', label: '今天' }],
          }),
          status: 200,
          responseHeaders: '',
        })
      }, 5)
    }) as TestRuntime['request']
    await fetchNovels(
      server.runtime,
      [
        { url: 'https://www.sudugu.org/1/' },
        { url: 'https://www.sudugu.org/2/' },
        { url: 'https://www.sudugu.org/3/' },
      ],
      [],
    )
    expect(callOrder).toEqual([
      'https://www.sudugu.org/1/',
      'https://www.sudugu.org/2/',
      'https://www.sudugu.org/3/',
    ])
  })

  test('runs different-host entries in parallel (cross-host start interleaves)', async () => {
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
            chapters: [{ url: `${d.url}c1.html`, title: '1', label: '今天' }],
          }),
          status: 200,
          responseHeaders: '',
        })
      }, 5)
    }) as TestRuntime['request']
    const fakeAdapters: NovelAdapter[] = [
      makeFakeAdapter('fake-a', ['hostb.example']),
      makeFakeAdapter('fake-b', ['hostc.example']),
    ]
    const resolve = (url: string) => {
      if (url.startsWith('https://www.sudugu.org/')) {
        return realSuduguForTest()
      }
      return fakeAdapters.find((a) => a.hostnames.includes(new URL(url).hostname))
    }
    await fetchNovels(
      server.runtime,
      [
        { url: 'https://www.sudugu.org/1/' },
        { url: 'https://hostb.example/2/' },
        { url: 'https://hostc.example/3/' },
      ],
      [],
      undefined,
      resolve,
    )
    expect(maxPending).toBeGreaterThanOrEqual(2)
  })

  test('preserves config order in result', async () => {
    const server = makeServer()
    server.setResponse(
      'https://www.sudugu.org/a/',
      homeHtml({
        title: 'A',
        chapters: [{ url: '/a/c1.html', title: '1', label: '今天' }],
      }),
    )
    server.setResponse(
      'https://hostb.example/b/',
      homeHtml({
        title: 'B',
        chapters: [{ url: '/b/c1.html', title: '1', label: '今天' }],
      }),
    )
    server.setResponse(
      'https://www.sudugu.org/c/',
      homeHtml({
        title: 'C',
        chapters: [{ url: '/c/c1.html', title: '1', label: '今天' }],
      }),
    )
    const fakeAdapters: NovelAdapter[] = [makeFakeAdapter('fake-b', ['hostb.example'])]
    const resolve = (url: string) => {
      if (url.startsWith('https://www.sudugu.org/')) {
        return realSuduguForTest()
      }
      return fakeAdapters.find((a) => a.hostnames.includes(new URL(url).hostname))
    }
    const books = await fetchNovels(
      server.runtime,
      [
        { url: 'https://www.sudugu.org/a/' },
        { url: 'https://hostb.example/b/' },
        { url: 'https://www.sudugu.org/c/' },
      ],
      [],
      undefined,
      resolve,
    )
    expect(books.map((b) => b.title)).toEqual(['A', 'B', 'C'])
  })
})

describe('mergeTail', () => {
  test('reverses tail to newest-first and slices up to and including prevSeen', () => {
    const tail = [chapter('c1'), chapter('c2'), chapter('c3'), chapter('c4'), chapter('c5')]
    const out = mergeTail(tail, [], 'c3')
    expect(out.map((c) => c.url)).toEqual(['c5', 'c4', 'c3'])
  })

  test('returns full reversed tail when prevSeen is not present', () => {
    const tail = [chapter('c1'), chapter('c2'), chapter('c3')]
    const out = mergeTail(tail, [], 'gone')
    expect(out.map((c) => c.url)).toEqual(['c3', 'c2', 'c1'])
  })

  test('overlays postedAt from latestThree onto matching chapters', () => {
    const tail = [chapter('c1'), chapter('c2'), chapter('c3')]
    const latest = [chapter('c3', '3', 1000), chapter('c2', '2', 2000)]
    const out = mergeTail(tail, latest, 'c1')
    const byUrl = new Map(out.map((c) => [c.url, c.postedAt]))
    expect(byUrl.get('c3')).toBe(1000)
    expect(byUrl.get('c2')).toBe(2000)
    expect(byUrl.get('c1')).toBe(0)
  })
})

describe('collapseChapters', () => {
  test('does not collapse when <= 20 unread', () => {
    const chapters = Array.from({ length: 20 }, (_, i) => chapter(`c${i}`))
    const out = collapseChapters(chapters, '')
    expect(out).toEqual(chapters)
  })

  test('collapses to earliest 10 + gap + latest 10 when > 20 unread', () => {
    const chapters = Array.from({ length: 36 }, (_, i) => chapter(`c${i}`))
    const out = collapseChapters(chapters, '')
    // Should have: 10 latest + 1 gap + 10 earliest = 21
    expect(out).toHaveLength(21)
    // First 10 are latest chapters (c0..c9)
    expect(out.slice(0, 10).map((c) => c.url)).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i}`),
    )
    // Gap marker at index 10
    expect(out[10]!.omittedCount).toBe(16)
    // Last 10 are earliest chapters (c26..c35)
    expect(out.slice(11).map((c) => c.url)).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i + 26}`),
    )
  })

  test('preserves seen chapter at the end', () => {
    const chapters = Array.from({ length: 36 }, (_, i) => chapter(`c${i}`))
    // Add seen chapter at the end
    chapters.push(chapter('seen'))
    const out = collapseChapters(chapters, 'seen')
    // Should have: 10 latest + 1 gap + 10 earliest + 1 seen = 22
    expect(out).toHaveLength(22)
    expect(out[out.length - 1]!.url).toBe('seen')
  })

  test('does not collapse when no chapters', () => {
    expect(collapseChapters([], '')).toEqual([])
  })
})

function makeFakeAdapter(id: string, hostnames: string[]): NovelAdapter {
  return {
    id,
    hostnames,
    parseHome(html, _pageUrl, _domParser, _now) {
      const titleMatch = html.match(/<h1>(?:<i>[^<]*<\/i>)?([^<]+)<\/h1>/)
      return {
        title: titleMatch ? titleMatch[1]! : null,
        latestThree: [],
        homeChapters: [],
        lastPageNumber: 1,
      }
    },
    parseChapterList() {
      return []
    },
    buildTailUrl(homeUrl) {
      return homeUrl
    },
  }
}

function realSuduguForTest(): NovelAdapter {
  return makeFakeAdapter('sudugu-test', ['www.sudugu.org'])
}

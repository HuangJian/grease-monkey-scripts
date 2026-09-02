import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { suduguAdapter } from '../../../src/prism/novels/adapters/sudugu'
import { adapterByUrl } from '../../../src/prism/novels/adapters/registry'
import { fetchNovels } from '../../../src/prism/novels/fetcher'
import { chapterKey } from '../../../src/prism/novels/chapter-key'
import type { NovelBookConfig } from '../../../src/prism/novels/types'
import type { RequestDetails } from '../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../runtime'

// Real homepage HTML saved from https://www.deqixs.org/97/ (book 1984：从破产川菜馆开始).
// The #list holds 538 chapter links spanning 第1章 → 第621章 — the author's
// displayed numbering has gaps, so 538 is the complete list (page shows 1/1,
// no pagination). Same template sudugu uses.
const DEQIXS_FIXTURE = readFileSync(join(__dirname, 'fixtures', 'deqixs-97-home.html'), 'utf8')

const SHUDUGU_URL = 'https://www.shudugu.org/79/'
const DEQIXS_URL = 'https://www.deqixs.org/97/'
const TITLE = '1984：从破产川菜馆开始'

/**
 * Faithful shudugu stand-in. shudugu.org is unreachable from the sandbox
 * (connection errors), but the user confirmed it shares the deqixs template.
 * Rather than invent a contiguously-numbered list (which would create spurious
 * chapter numbers the real deqixs page lacks), we derive the shudugu page from
 * the REAL deqixs fixture: keep every deqixs chapter except the newest
 * `len - truncate`, and rewrite the host to shudugu. The result is a true
 * subset with identical chapter numbers — exactly the "same book, one mirror
 * lags" scenario the multi-source feature targets.
 */
function buildShuduguHtml(truncate: number): string {
  const runtime = createRuntime()
  const domParser = new runtime.DOMParser()
  const deqHome = suduguAdapter.parseHome(DEQIXS_FIXTURE, DEQIXS_URL, domParser, Date.now())
  // homeChapters is newest-first; drop the newest so the mirror lags by one.
  const kept = deqHome.homeChapters.slice(deqHome.homeChapters.length - truncate)
  const rewrite = (url: string) => url.replace(/www\.deqixs\.org\/97\//, 'www.shudugu.org/79/')
  const listItems = [...kept]
    .reverse()
    .map((c) => `<li><a href="${rewrite(c.url)}">${c.title}</a></li>`)
    .join('')
  const latest = kept
    .slice(0, 3)
    .map((c) => `<li><i>今天</i><a href="${rewrite(c.url)}">${c.title}</a></li>`)
    .join('')
  return `<!doctype html><html><body>
    <div class="item"><div class="itemtxt">
      <h1><a href="/79/#dir">${TITLE}</a>最新章节</h1>
      <ul>${latest}</ul>
    </div></div>
    <div id="list" class="dir clear"><ul>${listItems}</ul></div>
  </body></html>`
}

function makeServer(): {
  runtime: TestRuntime
  hits: string[]
  setResponse(url: string, body: string): void
} {
  const runtime = createRuntime()
  const responses = new Map<string, string>()
  const hits: string[] = []
  runtime.request = ((d: RequestDetails) => {
    hits.push(d.url)
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
  }
}

describe('multi-source fetching against the real deqixs template', () => {
  test('both example urls resolve to a registered adapter', () => {
    expect(adapterByUrl(SHUDUGU_URL)?.id).toBe('sudugu')
    expect(adapterByUrl(DEQIXS_URL)?.id).toBe('deqixs')
  })

  test('parseHome on the real deqixs page: clean title + full chapter list, no pagination', () => {
    const runtime = createRuntime()
    const domParser = new runtime.DOMParser()
    const home = suduguAdapter.parseHome(DEQIXS_FIXTURE, DEQIXS_URL, domParser, Date.now())

    // The trailing "最新章节" marker must NOT bleed into the title.
    expect(home.title).toBe(TITLE)
    // 538 actual chapter pages (author numbering runs to 第621章 with gaps).
    expect(home.homeChapters).toHaveLength(538)
    expect(home.lastPageNumber).toBe(1)
    // homeChapters are newest-first
    expect(home.homeChapters[0]!.title).toContain('第621章')
    expect(home.homeChapters.at(-1)!.title).toContain('第1章')
  })

  test('parseHome on the shudugu stand-in yields its own (smaller) chapter count', () => {
    const runtime = createRuntime()
    const domParser = new runtime.DOMParser()
    const home = suduguAdapter.parseHome(buildShuduguHtml(537), SHUDUGU_URL, domParser, Date.now())
    expect(home.title).toBe(TITLE)
    expect(home.homeChapters).toHaveLength(537)
  })

  test('end-to-end: two sites at different progress merge into one book', async () => {
    const server = makeServer()
    server.setResponse(SHUDUGU_URL, buildShuduguHtml(537))
    server.setResponse(DEQIXS_URL, DEQIXS_FIXTURE)

    const cfg: NovelBookConfig = { title: TITLE, urls: [SHUDUGU_URL, DEQIXS_URL] }
    const books = await fetchNovels(server.runtime, [cfg], [])

    expect(books).toHaveLength(1)
    const book = books[0]!

    // Both sources resolved through the adapter registry (no "未知站点").
    expect(book.sources.map((s) => s.siteId)).toEqual(['sudugu', 'deqixs'])
    expect(book.sources.map((s) => s.error)).toEqual(['', ''])
    // deqixs serves 538 real chapter pages; shudugu stand-in lags by one.
    expect(book.sources.map((s) => s.chapterCount)).toEqual([537, 538])
    // Both were requested (parallel fetch).
    expect(server.hits).toEqual(expect.arrayContaining([SHUDUGU_URL, DEQIXS_URL]))

    // deqixs is one chapter ahead (第621章); it appears exactly once, from deqixs only.
    const ch621 = book.latestChapters.find((c) => c.key === 'n:621')
    expect(ch621).toBeDefined()
    expect(ch621!.variants.map((v) => v.host)).toEqual(['www.deqixs.org'])

    // A chapter present on both sites carries variants from both hosts.
    const ch620 = book.latestChapters.find((c) => c.key === 'n:620')
    expect(ch620).toBeDefined()
    expect(ch620!.variants.map((v) => v.host).sort()).toEqual(['www.deqixs.org', 'www.shudugu.org'])

    // Spine endpoints survived the unread collapse (621 newest + 1..10 oldest).
    const keys = new Set(book.latestChapters.filter((c) => c.key).map((c) => c.key))
    expect(keys.has('n:1')).toBe(true)
    expect(keys.has('n:621')).toBe(true)

    // Collapse keeps 10 newest + 1 gap + 10 oldest = 21 entries. The gap's
    // omittedCount reflects the unique chapter total minus the 20 shown. We
    // derive it from the real fixture so duplicate-numbered entries are handled.
    const runtime = createRuntime()
    const domParser = new runtime.DOMParser()
    const deqChapters = suduguAdapter.parseHome(DEQIXS_FIXTURE, DEQIXS_URL, domParser, Date.now())
    const uniqueChapters = new Set(deqChapters.homeChapters.map((c) => chapterKey(c.title))).size
    expect(book.latestChapters).toHaveLength(21)
    expect(book.latestChapters[10]!.omittedCount).toBe(uniqueChapters - 20)
  })
})

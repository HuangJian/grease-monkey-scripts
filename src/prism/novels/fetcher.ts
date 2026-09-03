import type { Runtime } from '../../runtime'
import { adapterByUrl } from './adapters/registry'
import type { NovelAdapter } from './adapters/types'
import type { NovelBook, NovelBookConfig, NovelChapterVariant, NovelSourceState } from './types'
import { bookId, normalizeBooks } from './migrate'
import { chapterKey } from './chapter-key'
import { mergeSourceChapters } from './merge'
import { requestText } from '../shared/request'
import { mapLimit } from '../shared/concurrency'

export type FetchNovelsOptions = {
  initialNewChapters: number
  maxLatestWindow: number
}

const DEFAULT_MAX_WINDOW = 50

// Bound the otherwise-unbounded fan-out (see frontend.refactor.md P2: "全局无并发控制").
// A book fans out over its mirrors; many books fan out over fetchOneBook. Limiting
// both keeps total in-flight requests finite even with many books/mirrors.
const MAX_BOOK_CONCURRENCY = 4
const MAX_MIRROR_CONCURRENCY = 3

type RawChapter = { url: string; title: string; postedAt: number }

/**
 * Fetch every configured book (each potentially spanning several mirror URLs),
 * merge the per-source chapter lists into one book, and return one NovelBook
 * per config entry.
 */
export async function fetchNovels(
  runtime: Runtime,
  books: NovelBookConfig[],
  prevBooks: NovelBook[],
  options: FetchNovelsOptions = { initialNewChapters: 3, maxLatestWindow: DEFAULT_MAX_WINDOW },
  resolveAdapter: (url: string) => NovelAdapter | undefined = adapterByUrl,
): Promise<NovelBook[]> {
  const prevList = normalizeBooks(prevBooks, runtime.now)
  const prevById = new Map(prevList.map((b) => [b.id, b]))
  const prevByUrl = new Map<string, NovelBook>()
  prevList.forEach((b) => b.sources.forEach((s) => prevByUrl.set(s.url, b)))

  return mapLimit(
    books,
    (cfg) => fetchOneBook(runtime, cfg, prevById, prevByUrl, options, resolveAdapter),
    MAX_BOOK_CONCURRENCY,
  )
}

function findPrevByAnyUrl(
  prevByUrl: Map<string, NovelBook>,
  urls: string[],
): NovelBook | undefined {
  for (const u of urls) {
    const b = prevByUrl.get(u)
    if (b) return b
  }
  return undefined
}

function buildPrevPostedAt(book: NovelBook): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of book.latestChapters) {
    for (const v of c.variants) {
      if (v.postedAt > 0) m.set(v.url, v.postedAt)
    }
  }
  return m
}

async function fetchOneBook(
  runtime: Runtime,
  cfg: NovelBookConfig,
  prevById: Map<string, NovelBook>,
  prevByUrl: Map<string, NovelBook>,
  options: FetchNovelsOptions,
  resolveAdapter: (url: string) => NovelAdapter | undefined,
): Promise<NovelBook> {
  const primaryUrl = cfg.urls[0] ?? ''
  const id = bookId(primaryUrl)
  const prev = prevById.get(id) ?? findPrevByAnyUrl(prevByUrl, cfg.urls)
  const prevPostedAt = prev ? buildPrevPostedAt(prev) : new Map<string, number>()
  const seenKey = prev?.lastSeenChapterKey ?? ''

  const sources: NovelSourceState[] = []
  const inputs: NovelChapterVariant[][] = []
  let anyResolved = false
  let anyInput = false
  let anyError = false
  const fetchedTitles: string[] = []

  // Fetch every source of the book, bounded per-book; results stay in config order.
  const sourceResults = await mapLimit(
    cfg.urls,
    async (url) => {
      const adapter = resolveAdapter(url)
      const prevSource = prev?.sources.find((s) => s.url === url)
      if (!adapter) {
        return {
          source: {
            url,
            siteId: 'unknown',
            mirrorHost: prevSource?.mirrorHost,
            chapterCount: prevSource?.chapterCount ?? 0,
            error: '未知站点，暂不支持',
          } as NovelSourceState,
          fetchedTitle: '',
          input: undefined,
          resolved: false,
          inputOk: false,
          failed: true,
        }
      }
      try {
        const res = await fetchSourceChapters(
          runtime,
          url,
          adapter,
          prevPostedAt,
          prevSource?.mirrorHost,
          seenKey,
          options.maxLatestWindow,
        )
        return {
          source: {
            url,
            siteId: adapter.id,
            mirrorHost: res.mirrorHost,
            chapterCount: res.chapterCount,
            error: '',
          } as NovelSourceState,
          fetchedTitle: res.title ?? '',
          input: res.chapters.map((c) => ({ ...c, siteId: adapter.id, host: res.mirrorHost })),
          resolved: true,
          inputOk: true,
          failed: false,
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        return {
          source: {
            url,
            siteId: adapter.id,
            mirrorHost: prevSource?.mirrorHost,
            chapterCount: prevSource?.chapterCount ?? 0,
            error: message,
          } as NovelSourceState,
          fetchedTitle: '',
          input: undefined,
          resolved: true,
          inputOk: false,
          failed: true,
        }
      }
    },
    MAX_MIRROR_CONCURRENCY,
  )

  for (const r of sourceResults) {
    sources.push(r.source)
    if (r.fetchedTitle) fetchedTitles.push(r.fetchedTitle)
    if (r.input) inputs.push(r.input)
    if (r.resolved) anyResolved = true
    if (r.inputOk) anyInput = true
    if (r.failed) anyError = true
  }

  if (anyInput) {
    const merged = mergeSourceChapters(inputs, seenKey, { maxWindow: options.maxLatestWindow })
    const title = cfg.title || fetchedTitles[0] || prev?.title || hostnameFallback(primaryUrl)
    const error = !anyResolved
      ? '未知站点，暂不支持'
      : anyError && sources.every((s) => s.error)
        ? '所有源加载失败'
        : ''
    return {
      id,
      title,
      sources,
      latestChapters: merged,
      lastSeenChapterKey: seenKey,
      fetchedAt: runtime.now(),
      error,
    }
  }

  return {
    id,
    title: cfg.title || prev?.title || hostnameFallback(primaryUrl),
    sources,
    latestChapters: prev?.latestChapters ?? [],
    lastSeenChapterKey: seenKey,
    fetchedAt: prev?.fetchedAt ?? runtime.now(),
    error: !anyResolved ? '未知站点，暂不支持' : '所有源加载失败',
  }
}

async function fetchSourceChapters(
  runtime: Runtime,
  url: string,
  adapter: NovelAdapter,
  prevPostedAt: Map<string, number>,
  prevMirrorHost: string | undefined,
  seenKey: string,
  maxLatestWindow: number,
): Promise<{ chapters: RawChapter[]; title?: string; mirrorHost?: string; chapterCount: number }> {
  const now = runtime.now()
  const hosts = orderedMirrorHosts(url, adapter.hostnames, prevMirrorHost)
  const homeResult = await fetchWithFallback(runtime, url, hosts)
  let usedHost = homeResult.host
  const homeHtml = homeResult.html
  const domParser = new runtime.DOMParser()
  const home = adapter.parseHome(homeHtml, url, domParser, now)

  const title = home.title ?? undefined
  let chapters: RawChapter[]

  if (home.homeChapters.length > 0) {
    chapters = home.homeChapters.map((c) => ({ url: c.url, title: c.title, postedAt: c.postedAt }))
    // Tail pages hold only chapters older than the home page. If the read
    // marker is already on the home page, there is nothing older to fetch.
    const seenInHome = seenKey && home.homeChapters.some((c) => chapterKey(c.title) === seenKey)
    // If the home page already fills the latest-window, no tail fetch is needed.
    const homeFillsWindow =
      Number.isFinite(maxLatestWindow) && home.homeChapters.length >= maxLatestWindow
    if (home.lastPageNumber > 1 && !seenInHome && !homeFillsWindow) {
      // Collect tail pages, then reverse+flat once (avoids O(pages²) per-page
      // array rebuild). Stop early once we have enough to cover the window.
      const collected: RawChapter[][] = []
      for (let p = 2; p <= home.lastPageNumber; p++) {
        const tailUrl = adapter.buildTailUrl(url, p)
        const tailResult = await fetchWithFallback(
          runtime,
          tailUrl,
          orderedMirrorHosts(tailUrl, adapter.hostnames, usedHost),
        )
        usedHost = tailResult.host
        const tailChapters = adapter.parseChapterList(tailResult.html, tailUrl, domParser)
        // Reverse each page (oldest→newest within a page → newest→oldest) to
        // match the original per-page `[...tailChapters.reverse(), ...]` order.
        collected.push(tailChapters.slice().reverse())
        if (
          Number.isFinite(maxLatestWindow) &&
          home.homeChapters.length + collected.reduce((n, t) => n + t.length, 0) >= maxLatestWindow
        ) {
          break
        }
      }
      const tailAll = collected.reverse().flat()
      chapters = [...tailAll, ...chapters]
    }
    overlayTimestamps(chapters, prevPostedAt)
  } else if (home.lastPageNumber > 1) {
    // The home page only lists the latest three; the older chapters live on a
    // tail page. If the marker is already among the latest three, skip it.
    const seenInLatestThree =
      seenKey && home.latestThree.some((c) => chapterKey(c.title) === seenKey)
    if (seenInLatestThree) {
      chapters = home.latestThree.map((c) => ({
        url: c.url,
        title: c.title,
        postedAt: c.postedAt,
      }))
    } else {
      const tailUrl = adapter.buildTailUrl(url, home.lastPageNumber)
      const tailResult = await fetchWithFallback(
        runtime,
        tailUrl,
        orderedMirrorHosts(tailUrl, adapter.hostnames, usedHost),
      )
      usedHost = tailResult.host
      const tailChapters = adapter.parseChapterList(tailResult.html, tailUrl, domParser)
      chapters = mergeTail(tailChapters, home.latestThree, seenKey)
    }
  } else {
    chapters = home.latestThree.map((c) => ({ url: c.url, title: c.title, postedAt: c.postedAt }))
  }

  return { chapters, title, mirrorHost: usedHost, chapterCount: chapters.length }
}

/**
 * Merge tail-page chapters (oldest-first) with the home page's latest three
 * (newest-first), overlaying the home timestamps. Used when the full `#list`
 * is unavailable on the home page.
 */
export function mergeTail(
  tailChapters: RawChapter[],
  latestThree: RawChapter[],
  prevSeen?: string,
): RawChapter[] {
  const reversed = [...tailChapters].reverse()
  const seenIdx = prevSeen ? reversed.findIndex((c) => chapterKey(c.title) === prevSeen) : -1
  const sliced = seenIdx >= 0 ? reversed.slice(0, seenIdx + 1) : reversed
  const enriched = [...sliced]
  overlayTimestamps(enriched, postedAtMap(latestThree))
  return enriched
}

function postedAtMap(chapters: RawChapter[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of chapters) {
    if (c.postedAt > 0) m.set(c.url, c.postedAt)
  }
  return m
}

function overlayTimestamps(chapters: RawChapter[], prevPostedAt: Map<string, number>): void {
  for (const c of chapters) {
    const pa = prevPostedAt.get(c.url)
    if (pa !== undefined && pa > 0) c.postedAt = pa
  }
}

function hostnameFallback(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function fetchWithFallback(
  runtime: Runtime,
  baseUrl: string,
  orderedHosts: string[],
): Promise<{ html: string; host: string }> {
  let lastError: Error | undefined
  for (const host of orderedHosts) {
    const url = rewriteHost(baseUrl, host)
    try {
      return { html: await requestText(runtime, url, { anonymous: true }), host }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.debug('[gm-novels] mirror fetch failed:', url, lastError.message)
    }
  }
  throw lastError ?? new Error('network error')
}

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host
}

function rewriteHost(url: string, newHost: string): string {
  try {
    const u = new URL(url)
    u.hostname = newHost
    return u.href
  } catch {
    return url
  }
}

/** Ordered candidate hosts: preferred mirror, original host, then other mirrors (one per site). */
function orderedMirrorHosts(
  url: string,
  hostnames: ReadonlyArray<string>,
  preferredHost?: string,
): string[] {
  let originalHost: string
  try {
    originalHost = new URL(url).hostname
  } catch {
    return preferredHost ? [preferredHost] : []
  }
  const originalSite = stripWww(originalHost)
  const seen = new Set<string>()
  const order: string[] = []
  const pushUnique = (h: string) => {
    const s = stripWww(h)
    if (seen.has(s)) return
    seen.add(s)
    order.push(h)
  }
  if (
    preferredHost &&
    stripWww(preferredHost) !== originalSite &&
    hostnames.includes(preferredHost)
  ) {
    pushUnique(preferredHost)
  }
  pushUnique(originalHost)
  for (const h of otherMirrorHosts(url, hostnames)) pushUnique(h)
  return order
}

function otherMirrorHosts(url: string, hostnames: ReadonlyArray<string>): string[] {
  let originalHost: string
  try {
    originalHost = new URL(url).hostname
  } catch {
    return []
  }
  const originalSite = stripWww(originalHost)
  const seenSites = new Set<string>()
  const result: string[] = []
  for (const h of hostnames) {
    if (h === originalHost) continue
    if (stripWww(h) === originalSite) continue
    const site = stripWww(h)
    if (seenSites.has(site)) continue
    seenSites.add(site)
    result.push(h)
  }
  return result
}

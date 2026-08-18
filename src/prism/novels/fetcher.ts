import type { Runtime } from '../../runtime'
import { adapterByUrl } from './adapters/registry'
import type { NovelAdapter } from './adapters/types'
import type { NovelBook, NovelChapter, NovelEntry } from './types'

export type FetchNovelsOptions = {
  initialNewChapters: number
  maxLatestWindow: number
}

const DEFAULT_MAX_WINDOW = 50

/** Collapse threshold: if unread chapters exceed this, keep earliest+latest 10. */
const COLLAPSE_THRESHOLD = 20
const COLLAPSE_KEEP = 10

export async function fetchNovels(
  runtime: Runtime,
  entries: NovelEntry[],
  prevBooks: NovelBook[],
  options: FetchNovelsOptions = { initialNewChapters: 3, maxLatestWindow: DEFAULT_MAX_WINDOW },
  resolveAdapter: (url: string) => NovelAdapter | undefined = adapterByUrl,
): Promise<NovelBook[]> {
  const prevByUrl = new Map(prevBooks.map((b) => [b.url, b]))
  const groups = groupByHostname(entries)

  const groupResults = await Promise.all(
    [...groups.values()].map((hostEntries) =>
      fetchHostGroup(runtime, hostEntries, prevByUrl, options, resolveAdapter),
    ),
  )

  const bookByUrl = new Map<string, NovelBook>()
  groupResults.forEach((group) => group.forEach((book) => bookByUrl.set(book.url, book)))
  return entries
    .map((entry) => bookByUrl.get(entry.url))
    .filter((b): b is NovelBook => b !== undefined)
}

async function fetchHostGroup(
  runtime: Runtime,
  hostEntries: NovelEntry[],
  prevByUrl: Map<string, NovelBook>,
  options: FetchNovelsOptions,
  resolveAdapter: (url: string) => NovelAdapter | undefined,
): Promise<NovelBook[]> {
  return Promise.all(
    hostEntries.map((entry) =>
      fetchOneEntry(runtime, entry, prevByUrl.get(entry.url), options, resolveAdapter),
    ),
  )
}

async function fetchOneEntry(
  runtime: Runtime,
  entry: NovelEntry,
  prev: NovelBook | undefined,
  options: FetchNovelsOptions,
  resolveAdapter: (url: string) => NovelAdapter | undefined,
): Promise<NovelBook> {
  const adapter = resolveAdapter(entry.url)
  if (!adapter) {
    return buildUnknownBook(entry, prev)
  }
  try {
    return await fetchKnownEntry(runtime, adapter, entry, prev, options)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return buildFailureBook(entry, prev, adapter.id, message)
  }
}

async function fetchKnownEntry(
  runtime: Runtime,
  adapter: NovelAdapter,
  entry: NovelEntry,
  prev: NovelBook | undefined,
  _options: FetchNovelsOptions,
): Promise<NovelBook> {
  const now = Date.now()
  const hosts = orderedMirrorHosts(entry.url, adapter.hostnames, prev?.mirrorHost)
  const homeResult = await fetchWithFallback(runtime, entry.url, hosts)
  // Host that actually served the home page; reused for tail pages and recorded on the book.
  let usedHost = homeResult.host
  const homeHtml = homeResult.html
  const domParser = new runtime.DOMParser()
  const home = adapter.parseHome(homeHtml, entry.url, domParser, now)

  let chapters: NovelChapter[]

  if (home.homeChapters.length > 0) {
    // Full chapter list available on home page via #list
    chapters = home.homeChapters

    // Fetch additional pages if the chapter list is paginated (e.g. >1000 chapters)
    if (home.lastPageNumber > 1) {
      console.debug(
        '[gm-novels] fetching tail pages',
        entry.url,
        'pages:',
        home.lastPageNumber,
        'homeChapters:',
        home.homeChapters.length,
      )
      for (let p = 2; p <= home.lastPageNumber; p++) {
        const tailUrl = adapter.buildTailUrl(entry.url, p)
        const tailResult = await fetchWithFallback(
          runtime,
          tailUrl,
          orderedMirrorHosts(tailUrl, adapter.hostnames, usedHost),
        )
        usedHost = tailResult.host
        const tailChapters = adapter.parseChapterList(tailResult.html, tailUrl, domParser)
        console.debug('[gm-novels] tail page', p, tailUrl, 'chapters:', tailChapters.length)
        // tailChapters are oldest-first; prepend reversed to get newest-first
        chapters = [...tailChapters.reverse(), ...chapters]
      }
      console.debug('[gm-novels] merged chapters after tail fetch:', chapters.length)
      overlayTimestamps(chapters, [home.latestThree, prev?.latestChapters ?? []])
    } else {
      // Overlay timestamps from prev for chapters not in latestThree
      overlayTimestamps(chapters, [home.latestThree, prev?.latestChapters ?? []])
    }
  } else {
    // Fallback: only latest three from itemtxt, maybe fetch tail page
    const prevSeen = prev?.lastSeenChapterUrl
    const needTailPage =
      home.lastPageNumber > 1 &&
      (prevSeen == null || !home.latestThree.some((c) => c.url === prevSeen))

    if (!needTailPage) {
      chapters = home.latestThree
    } else {
      const tailUrl = adapter.buildTailUrl(entry.url, home.lastPageNumber)
      const tailResult = await fetchWithFallback(
        runtime,
        tailUrl,
        orderedMirrorHosts(tailUrl, adapter.hostnames, usedHost),
      )
      usedHost = tailResult.host
      const tailChapters = adapter.parseChapterList(tailResult.html, tailUrl, domParser)
      chapters = mergeTail(tailChapters, home.latestThree, prevSeen)
    }
  }

  // Compute lastSeen BEFORE collapse so it sees the full chapter list
  const lastSeen = prev?.lastSeenChapterUrl ?? ''

  // Trim chapters to the range needed for display (from newest down to lastSeen)
  if (lastSeen) {
    const seenIdx = chapters.findIndex((c) => c.url === lastSeen)
    if (seenIdx >= 0) {
      chapters = chapters.slice(0, seenIdx + 1)
    }
  }

  // Collapse: if more than COLLAPSE_THRESHOLD unread chapters, keep earliest+latest 10
  chapters = collapseChapters(chapters, lastSeen)

  const book: NovelBook = {
    url: entry.url,
    siteId: adapter.id,
    title: home.title ?? entry.alias ?? hostnameFallback(entry.url),
    latestChapters: chapters,
    fetchedAt: now,
    lastSeenChapterUrl: lastSeen,
    error: '',
    mirrorHost: usedHost,
  }
  return book
}

/**
 * Collapse the chapter list when there are more than COLLAPSE_THRESHOLD unread chapters.
 * Keeps the latest COLLAPSE_KEEP and earliest COLLAPSE_KEEP unread chapters,
 * inserting a gap marker with omittedCount in between.
 * The seen chapter (if present) is kept at the end as a boundary marker.
 */
export function collapseChapters(chapters: NovelChapter[], seenUrl: string): NovelChapter[] {
  if (chapters.length === 0) return chapters

  const seenIdx = seenUrl ? chapters.findIndex((c) => c.url === seenUrl) : -1
  const unread = seenIdx >= 0 ? chapters.slice(0, seenIdx) : chapters

  if (unread.length <= COLLAPSE_THRESHOLD) return chapters

  const latest = unread.slice(0, COLLAPSE_KEEP)
  const earliest = unread.slice(unread.length - COLLAPSE_KEEP)
  const omitted = unread.length - COLLAPSE_THRESHOLD
  const gap: NovelChapter = { url: '', title: '', postedAt: 0, omittedCount: omitted }

  const result: NovelChapter[] = [...latest, gap, ...earliest]
  if (seenIdx >= 0) result.push(chapters[seenIdx]!)
  return result
}

function overlayTimestamps(chapters: NovelChapter[], sources: NovelChapter[][]): void {
  const labelByUrl = new Map<string, number>()
  for (const source of sources) {
    for (const c of source) {
      if (c.postedAt > 0) labelByUrl.set(c.url, c.postedAt)
    }
  }
  for (let i = 0; i < chapters.length; i++) {
    const pa = labelByUrl.get(chapters[i]!.url)
    if (pa !== undefined) chapters[i] = { ...chapters[i]!, postedAt: pa }
  }
}

export function mergeTail(
  tailChapters: NovelChapter[],
  latestThree: NovelChapter[],
  prevSeen: string | undefined,
): NovelChapter[] {
  const reversed = [...tailChapters].reverse()
  const seenIdx = prevSeen ? reversed.findIndex((c) => c.url === prevSeen) : -1
  const sliced = seenIdx >= 0 ? reversed.slice(0, seenIdx + 1) : reversed

  const enriched = [...sliced]
  overlayTimestamps(enriched, [latestThree])
  return enriched
}

function buildUnknownBook(entry: NovelEntry, prev: NovelBook | undefined): NovelBook {
  const book: NovelBook = {
    url: entry.url,
    siteId: 'unknown',
    title: prev?.title ?? entry.alias ?? hostnameFallback(entry.url),
    latestChapters: prev?.latestChapters ?? [],
    fetchedAt: prev?.fetchedAt ?? Date.now(),
    lastSeenChapterUrl: prev?.lastSeenChapterUrl ?? '',
    error: '未知站点，暂不支持',
    mirrorHost: prev?.mirrorHost,
  }
  return book
}

function buildFailureBook(
  entry: NovelEntry,
  prev: NovelBook | undefined,
  siteId: string,
  message: string,
): NovelBook {
  const book: NovelBook = {
    url: entry.url,
    siteId,
    title: prev?.title ?? entry.alias ?? hostnameFallback(entry.url),
    latestChapters: prev?.latestChapters ?? [],
    fetchedAt: prev?.fetchedAt ?? Date.now(),
    lastSeenChapterUrl: prev?.lastSeenChapterUrl ?? '',
    error: message,
    mirrorHost: prev?.mirrorHost,
  }
  return book
}

function hostnameFallback(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function groupByHostname(entries: NovelEntry[]): Map<string, NovelEntry[]> {
  const groups = new Map<string, NovelEntry[]>()
  entries.forEach((entry) => {
    let hostname: string
    try {
      hostname = new URL(entry.url).hostname
    } catch {
      hostname = '__invalid__'
    }
    const arr = groups.get(hostname) ?? []
    arr.push(entry)
    groups.set(hostname, arr)
  })
  return groups
}

function getText(runtime: Runtime, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      anonymous: true,
      onload: (response) => settle(() => resolve(response.responseText)),
      onerror: () => settle(() => reject(new Error('network error'))),
      ontimeout: () => settle(() => reject(new Error('timeout'))),
    })
  })
}

/**
 * Fetch `baseUrl`, trying each host in `orderedHosts` (in order) and returning the
 * first successful response together with the host that served it. Throws the last
 * error only if every candidate fails.
 */
async function fetchWithFallback(
  runtime: Runtime,
  baseUrl: string,
  orderedHosts: string[],
): Promise<{ html: string; host: string }> {
  let lastError: Error | undefined
  for (const host of orderedHosts) {
    const url = rewriteHost(baseUrl, host)
    try {
      return { html: await getText(runtime, url), host }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.debug('[gm-novels] mirror fetch failed:', url, lastError.message)
    }
  }
  throw lastError ?? new Error('network error')
}

/** Host without a leading `www.`, used to treat `www.x` and `x` as the same site. */
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

/** Distinct *other* mirror sites (one host per site; original & same-site variants excluded). */
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
    // Skip same-site variants (e.g. www vs bare) so we don't retry a host that failed.
    if (stripWww(h) === originalSite) continue
    const site = stripWww(h)
    if (seenSites.has(site)) continue
    seenSites.add(site)
    result.push(h)
  }
  return result
}

/**
 * Ordered candidate hosts for a fetch: the preferred mirror first (if it's a distinct,
 * declared site), then the original host, then remaining mirror sites. At most one host
 * per site. This makes the last-working mirror the first choice on the next fetch while
 * still falling back to the original and other mirrors.
 */
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
  // Preferred mirror first, but only if it's a distinct, declared site.
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

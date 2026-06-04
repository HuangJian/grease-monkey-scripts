import type { Runtime } from '../../runtime'
import { adapterByUrl } from './adapters/registry'
import type { NovelAdapter } from './adapters/types'
import { initialSeenUrl } from './state'
import type { NovelBook, NovelChapter, NovelEntry } from './types'

export type FetchNovelsOptions = {
  initialNewChapters: number
  maxLatestWindow: number
}

const DEFAULT_MAX_WINDOW = 50

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
  for (const group of groupResults) {
    for (const book of group) bookByUrl.set(book.url, book)
  }
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
  const out: NovelBook[] = []
  for (const entry of hostEntries) {
    out.push(await fetchOneEntry(runtime, entry, prevByUrl.get(entry.url), options, resolveAdapter))
  }
  return out
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
  options: FetchNovelsOptions,
): Promise<NovelBook> {
  const now = Date.now()
  const homeHtml = await getText(runtime, entry.url)
  const domParser = new runtime.DOMParser()
  const home = adapter.parseHome(homeHtml, entry.url, domParser, now)

  const prevSeen = prev?.lastSeenChapterUrl
  const needTailPage =
    prevSeen != null && !home.latestThree.some((c) => c.url === prevSeen) && home.lastPageNumber > 1

  let chapters: NovelChapter[]
  if (!needTailPage) {
    chapters = home.latestThree
  } else {
    const tailUrl = adapter.buildTailUrl(entry.url, home.lastPageNumber)
    const tailHtml = await getText(runtime, tailUrl)
    const tailChapters = adapter.parseChapterList(tailHtml, tailUrl, domParser)
    chapters = mergeTail(tailChapters, home.latestThree, prevSeen, options.maxLatestWindow)
  }

  const lastSeen = prev?.lastSeenChapterUrl ?? initialSeenUrl(chapters, options.initialNewChapters)

  const book: NovelBook = {
    url: entry.url,
    siteId: adapter.id,
    title: home.title ?? entry.alias ?? hostnameFallback(entry.url),
    latestChapters: chapters,
    fetchedAt: now,
  }
  if (lastSeen !== undefined) book.lastSeenChapterUrl = lastSeen
  return book
}

export function mergeTail(
  tailChapters: NovelChapter[],
  latestThree: NovelChapter[],
  prevSeen: string,
  maxWindow: number,
): NovelChapter[] {
  const reversed = [...tailChapters].reverse()
  const seenIdx = reversed.findIndex((c) => c.url === prevSeen)
  const sliced = seenIdx >= 0 ? reversed.slice(0, seenIdx + 1) : reversed

  const labelByUrl = new Map<string, number>()
  for (const c of latestThree) {
    if (c.postedAt !== undefined) labelByUrl.set(c.url, c.postedAt)
  }

  const enriched = sliced.map((c) => {
    const pa = labelByUrl.get(c.url)
    return pa !== undefined ? { ...c, postedAt: pa } : c
  })
  return enriched.slice(0, maxWindow)
}

function buildUnknownBook(entry: NovelEntry, prev: NovelBook | undefined): NovelBook {
  const book: NovelBook = {
    url: entry.url,
    siteId: 'unknown',
    title: prev?.title ?? entry.alias ?? hostnameFallback(entry.url),
    latestChapters: prev?.latestChapters ?? [],
    fetchedAt: prev?.fetchedAt ?? Date.now(),
    error: '未知站点，暂不支持',
  }
  if (prev?.lastSeenChapterUrl !== undefined) book.lastSeenChapterUrl = prev.lastSeenChapterUrl
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
    error: message,
  }
  if (prev?.lastSeenChapterUrl !== undefined) book.lastSeenChapterUrl = prev.lastSeenChapterUrl
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
  for (const entry of entries) {
    let hostname: string
    try {
      hostname = new URL(entry.url).hostname
    } catch {
      hostname = '__invalid__'
    }
    const arr = groups.get(hostname) ?? []
    arr.push(entry)
    groups.set(hostname, arr)
  }
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

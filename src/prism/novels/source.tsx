import type { Runtime } from '../../runtime'
import { CONFIG_KEY } from '../types'
import type { Source, SourceSettings, TabLabel } from '../types'
import { loadCache, saveCache } from '../cache'
import { NovelsComponent } from './component'
import { createNovelsEditor } from './editor/form'
import { fetchNovels } from './fetcher'
import { newChapterCount } from './state'
import type { NovelBook, NovelData, NovelEntry, NovelSourceOptions } from './types'

export function createNovelsSource(
  options: NovelSourceOptions,
  runtime: Runtime,
): Source<NovelData> {
  return {
    id: 'novels',
    title: '网文更新',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 2,
    RenderComponent: ({ data, root }) => (
      <NovelsComponent
        data={data}
        root={root}
        runtime={runtime}
        onMarkSeen={(bookUrl) => {
          void markSeen(runtime, bookUrl)
        }}
      />
    ),
    getTabLabel(data) {
      return novelsTabLabel(data)
    },
    async fetch(runtimeArg, prevData) {
      const entries = await loadFreshEntries(runtimeArg, options.entries)
      const prevBooks = prevData?.books ?? []
      const books = await fetchNovels(runtimeArg, entries, prevBooks, {
        initialNewChapters: options.initialNewChapters,
        maxLatestWindow: options.maxLatestWindow,
      })
      // Pick up lastSeenChapterUrl updates that markSeen may have written
      // to the cache while the fetch was in flight. Without this, a
      // refreshSource save would overwrite markSeen's update with the
      // stale prevData value, causing already-seen chapters to reappear
      // as "new" on the next render.
      await mergeLatestSeen(runtimeArg, books)
      void persistFetchedTitles(runtimeArg, entries, books)
      return { books }
    },
    createEditor(settings: SourceSettings) {
      return createNovelsEditor(
        {
          entries: options.entries,
          ttlMinutes: options.ttlMinutes,
          maxNewChaptersPerBook: options.maxNewChaptersPerBook,
          initialNewChapters: options.initialNewChapters,
          maxLatestWindow: options.maxLatestWindow,
          getCachedTitles: () => loadCachedTitleMap(runtime),
        },
        settings,
      )
    },
  }
}

export function novelsTabLabel(data: NovelData | null): TabLabel {
  const books = (data?.books ?? []) as NovelBook[]
  const updated = books.filter((b) => newChapterCount(b) > 0).length
  return { label: '网文更新', badge: updated > 0 ? updated : null }
}

async function loadFreshEntries(runtime: Runtime, fallback: NovelEntry[]): Promise<NovelEntry[]> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const entries = (stored?.novels as { entries?: NovelEntry[] } | undefined)?.entries
    if (Array.isArray(entries) && entries.length > 0) return entries
  } catch (e) {
    console.debug('[gm-dashboard] novels loadFreshEntries error', e)
  }
  return fallback
}

function entryHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function persistFetchedTitles(
  runtime: Runtime,
  entries: NovelEntry[],
  books: NovelBook[],
): Promise<void> {
  try {
    const bookByUrl = new Map(books.map((b) => [b.url, b]))
    let changed = false
    const updated = entries.map((e) => {
      if (e.alias) return e
      const book = bookByUrl.get(e.url)
      if (!book?.title || book.title === entryHostname(e.url)) return e
      changed = true
      return { url: e.url, alias: book.title }
    })
    if (!changed) return
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    await runtime.setValue(CONFIG_KEY, {
      ...(stored ?? {}),
      novels: { ...((stored?.novels as Record<string, unknown>) ?? {}), entries: updated },
    })
  } catch (e) {
    console.debug('[gm-dashboard] novels persistFetchedTitles error', e)
  }
}

async function loadCachedTitleMap(runtime: Runtime): Promise<Map<string, string>> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  const map = new Map<string, string>()
  ;(cached?.data?.books ?? []).forEach((book) => {
    if (book.title) map.set(book.url, book.title)
  })
  return map
}

/**
 * Read-modify-write: updates only lastSeenChapterUrl for the given book,
 * preserving fetchedAt and the rest of the cache. Reads from the live cache
 * (not stale component-closure data) to avoid clobbering a concurrent fetch.
 */
export async function markSeen(runtime: Runtime, bookUrl: string): Promise<void> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  if (!cached?.data?.books) return
  const current = cached.data.books.find((b) => b.url === bookUrl)
  if (!current) return
  const newSeen = current.latestChapters.find((c) => !c.omittedCount)?.url
  if (!newSeen || newSeen === current.lastSeenChapterUrl) return
  const books = cached.data.books.map((b) =>
    b.url === bookUrl ? { ...b, lastSeenChapterUrl: newSeen } : b,
  )
  await saveCache(runtime, 'novels', {
    data: { books },
    fetchedAt: cached.fetchedAt,
    error: cached.error,
  })
}

/**
 * Merges lastSeenChapterUrl values from the live cache into freshly fetched
 * books. This prevents a race condition where markSeen writes a new
 * lastSeenChapterUrl during a fetch, but refreshSource overwrites it with
 * the stale prevData value when saving the fetch result.
 */
async function mergeLatestSeen(runtime: Runtime, books: NovelBook[]): Promise<void> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  if (!cached?.data?.books) return
  const seenByUrl = new Map(cached.data.books.map((b) => [b.url, b.lastSeenChapterUrl]))
  for (const book of books) {
    const seen = seenByUrl.get(book.url)
    if (seen && seen !== book.lastSeenChapterUrl) {
      book.lastSeenChapterUrl = seen
    }
  }
}

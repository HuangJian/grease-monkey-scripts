import type { Runtime } from '../../runtime'
import { CONFIG_KEY } from '../types'
import type { Source, SourceSettings, TabLabel } from '../types'
import { loadCache, saveCache } from '../cache'
import { NovelsComponent } from './component'
import { createNovelsEditor } from './editor/form'
import { fetchNovels } from './fetcher'
import { newChapterCount } from './state'
import { bookId, normalizeBooks } from './migrate'
import { coerceNovelBooks } from './editor/types'
import type { NovelBook, NovelBookConfig, NovelData, NovelSourceOptions } from './types'

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
        onMarkSeen={(bookId_) => {
          void markSeen(runtime, bookId_)
        }}
      />
    ),
    getTabLabel(data) {
      return novelsTabLabel(data)
    },
    async fetch(runtimeArg, prevData) {
      const configs = await loadFreshBooks(runtimeArg, options.books)
      const prevBooks = normalizeBooks(prevData?.books)
      const books = await fetchNovels(runtimeArg, configs, prevBooks, {
        initialNewChapters: options.initialNewChapters,
        maxLatestWindow: options.maxLatestWindow,
      })
      // Pick up lastSeenChapterKey updates that markSeen may have written
      // to the cache while the fetch was in flight. Without this, a
      // refreshSource save would overwrite markSeen's update with the
      // stale prevData value, causing already-seen chapters to reappear
      // as "new" on the next render.
      await mergeLatestSeen(runtimeArg, books)
      void persistFetchedTitles(runtimeArg, configs, books)
      return { books }
    },
    createEditor(settings: SourceSettings) {
      return createNovelsEditor(
        {
          books: options.books,
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
  // Normalize so legacy cached data (chapters without `key`) counts as new.
  const books = normalizeBooks(data?.books)
  const updated = books.filter((b) => newChapterCount(b) > 0).length
  return { label: '网文更新', badge: updated > 0 ? updated : null }
}

async function loadFreshBooks(
  runtime: Runtime,
  fallback: NovelBookConfig[],
): Promise<NovelBookConfig[]> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const books = coerceNovelBooks(stored?.['novels'] as Record<string, unknown> | undefined, [])
    if (books.length > 0) return books
  } catch (e) {
    console.debug('[gm-dashboard] novels loadFreshBooks error', e)
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
  configs: NovelBookConfig[],
  books: NovelBook[],
): Promise<void> {
  try {
    const bookById = new Map(books.map((b) => [b.id, b]))
    let changed = false
    const updated = configs.map((config) => {
      if (config.title) return config
      const primaryUrl = config.urls[0] ?? ''
      const book = bookById.get(bookId(primaryUrl))
      if (!book?.title || book.title === entryHostname(primaryUrl)) return config
      changed = true
      return { ...config, title: book.title }
    })
    if (!changed) return
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    await runtime.setValue(CONFIG_KEY, {
      ...(stored ?? {}),
      novels: { ...((stored?.['novels'] as Record<string, unknown>) ?? {}), books: updated },
    })
  } catch (e) {
    console.debug('[gm-dashboard] novels persistFetchedTitles error', e)
  }
}

/** Cached book titles keyed by both book id and each source url, so the editor can name books it has never fetched. */
async function loadCachedTitleMap(runtime: Runtime): Promise<Map<string, string>> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  const map = new Map<string, string>()
  for (const book of normalizeBooks(cached?.data?.books)) {
    if (!book.title) continue
    map.set(book.id, book.title)
    for (const s of book.sources) map.set(s.url, book.title)
  }
  return map
}

/**
 * Read-modify-write: updates only lastSeenChapterKey for the given book,
 * preserving fetchedAt and the rest of the cache. Reads from the live cache
 * (not stale component-closure data) to avoid clobbering a concurrent fetch.
 */
export async function markSeen(runtime: Runtime, id: string): Promise<void> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  if (!cached?.data?.books) return
  const cachedBooks = normalizeBooks(cached.data.books)
  const current = cachedBooks.find((b) => b.id === id)
  if (!current) return
  const newSeen = current.latestChapters.find((c) => !c.omittedCount)?.key
  if (!newSeen || newSeen === current.lastSeenChapterKey) return
  const books = cachedBooks.map((b) => (b.id === id ? { ...b, lastSeenChapterKey: newSeen } : b))
  await saveCache(runtime, 'novels', {
    data: { books },
    fetchedAt: cached.fetchedAt,
    error: cached.error,
  })
}

/**
 * Merges lastSeenChapterKey values from the live cache into freshly fetched
 * books. This prevents a race condition where markSeen writes a new
 * lastSeenChapterKey during a fetch, but refreshSource overwrites it with
 * the stale prevData value when saving the fetch result.
 */
async function mergeLatestSeen(runtime: Runtime, books: NovelBook[]): Promise<void> {
  const cached = await loadCache<NovelData>(runtime, 'novels')
  if (!cached?.data?.books) return
  const seenById = new Map(
    normalizeBooks(cached.data.books).map((b) => [b.id, b.lastSeenChapterKey]),
  )
  for (const book of books) {
    const seen = seenById.get(book.id)
    if (seen && seen !== book.lastSeenChapterKey) {
      book.lastSeenChapterKey = seen
    }
  }
}

import type { Runtime } from '../../runtime'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, CONFIG_KEY } from '../types'
import type { Source, SourceSettings, TabLabel } from '../types'
import { NovelsComponent } from './component'
import { createNovelsEditor } from './editor'
import { fetchNovels } from './fetcher'
import { newChapters } from './state'
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
          void markSeen(runtime, bookUrl, data)
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
  const updated = books.filter((b) => newChapters(b).length > 0).length
  return { label: '网文更新', badge: updated > 0 ? updated : null }
}

async function loadFreshEntries(runtime: Runtime, fallback: NovelEntry[]): Promise<NovelEntry[]> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const entries = (stored?.novels as { entries?: NovelEntry[] } | undefined)?.entries
    if (Array.isArray(entries) && entries.length > 0) return entries
  } catch {}
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
}

async function loadCachedTitleMap(runtime: Runtime): Promise<Map<string, string>> {
  const cached = await runtime.getValue<{ data?: NovelData } | null>(CACHE_KEY('novels'), null)
  const map = new Map<string, string>()
  for (const book of cached?.data?.books ?? []) {
    if (book.title) map.set(book.url, book.title)
  }
  return map
}

async function markSeen(runtime: Runtime, bookUrl: string, _data: NovelData | null): Promise<void> {
  const cached = await runtime.getValue<{ data?: NovelData } | null>(CACHE_KEY('novels'), null)
  const data = cached?.data ?? _data
  const current = data?.books.find((b) => b.url === bookUrl)
  if (!current) return
  const newSeen = current.latestChapters[0]?.url
  if (!newSeen || newSeen === current.lastSeenChapterUrl) return
  const books = (data?.books ?? []).map((b) =>
    b.url === bookUrl ? { ...b, lastSeenChapterUrl: newSeen } : b,
  )
  await runtime.setValue(CACHE_KEY('novels'), {
    schemaVersion: CACHE_SCHEMA_VERSION,
    data: { books },
    fetchedAt: Date.now(),
    byteSize: 0,
  })
}

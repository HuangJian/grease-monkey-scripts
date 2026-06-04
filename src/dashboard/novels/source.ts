import type { Runtime } from '../../runtime'
import { CACHE_KEY, CACHE_SCHEMA_VERSION } from '../types'
import type { Source } from '../sources/types'
import { createNovelsEditor } from './editor'
import { fetchNovels } from './fetcher'
import { renderNovels } from './render'
import type { NovelData, NovelSourceOptions } from './types'

export function createNovelsSource(
  options: NovelSourceOptions,
  runtime: Runtime,
): Source<NovelData> {
  return {
    id: 'novels',
    title: '网文更新',
    ttlMs: options.ttlMinutes * 60_000,
    fetch(runtimeArg, prevData) {
      const prevBooks = prevData?.books ?? []
      return fetchNovels(runtimeArg, options.entries, prevBooks, {
        initialNewChapters: options.initialNewChapters,
        maxLatestWindow: options.maxLatestWindow,
      }).then((books) => ({ books }))
    },
    render(container, data) {
      renderNovels(container, data, {
        onMarkSeen: (bookUrl) => {
          void markSeen(runtime, bookUrl, data)
        },
      })
    },
    createEditor() {
      return createNovelsEditor({
        entries: options.entries,
        ttlMinutes: options.ttlMinutes,
        maxNewChaptersPerBook: options.maxNewChaptersPerBook,
        initialNewChapters: options.initialNewChapters,
        maxLatestWindow: options.maxLatestWindow,
        getCachedTitles: () => loadCachedTitleMap(runtime),
      })
    },
  }
}

async function loadCachedTitleMap(runtime: Runtime): Promise<Map<string, string>> {
  const cached = await runtime.getValue<{ data?: NovelData } | null>(CACHE_KEY('novels'), null)
  const map = new Map<string, string>()
  for (const book of cached?.data?.books ?? []) {
    if (book.title) map.set(book.url, book.title)
  }
  return map
}

async function markSeen(runtime: Runtime, bookUrl: string, data: NovelData | null): Promise<void> {
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

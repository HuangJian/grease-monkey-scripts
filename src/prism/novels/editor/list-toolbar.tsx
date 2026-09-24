import type { NovelBookConfig } from '../types'

/** Which books the editor shows. */
export const BOOK_STATUSES = ['all', 'unknown', 'noSource'] as const
export type BookStatus = (typeof BOOK_STATUSES)[number]

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  all: '全部',
  unknown: '未知站点',
  noSource: '无来源',
}

/** Books per page — a fifty-title library rendered at once is unusable. */
export const BOOKS_PER_PAGE = 20

/**
 * Books matching the query and the status filter.
 *
 * A book is known by its title *or* by any of its urls: the ones imported
 * without a title are exactly the ones the reader has to find by host.
 */
export function filterBooks(
  books: ReadonlyArray<NovelBookConfig>,
  query: string,
  status: BookStatus,
  isUnknown: (url: string) => boolean,
): NovelBookConfig[] {
  const needle = query.trim().toLowerCase()
  return books.filter((book) => {
    if (status === 'unknown' && !book.urls.some(isUnknown)) return false
    if (status === 'noSource' && book.urls.length > 0) return false
    if (!needle) return true
    return (
      book.title.toLowerCase().includes(needle) ||
      book.urls.some((url) => url.toLowerCase().includes(needle))
    )
  })
}

/** Rename a key in a keyed set — a row's identity moves with its first url. */
export function renameKey(set: ReadonlySet<string>, from: string, to: string): ReadonlySet<string> {
  if (!set.has(from)) return set
  const next = new Set(set)
  next.delete(from)
  next.add(to)
  return next
}

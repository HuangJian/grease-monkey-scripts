import type { NovelBook, NovelChapter } from './types'

export function newChapters(book: NovelBook): NovelChapter[] {
  if (book.lastSeenChapterKey === '') return [...book.latestChapters]
  const seenIdx = book.latestChapters.findIndex((c) => c.key === book.lastSeenChapterKey)
  if (seenIdx < 0) return [...book.latestChapters]
  return book.latestChapters.slice(0, seenIdx)
}

/** Count of unread chapters, counting gap markers' omittedCount toward the total. */
export function newChapterCount(book: NovelBook): number {
  return newChapters(book).reduce((sum, c) => sum + (c.omittedCount ?? 1), 0)
}

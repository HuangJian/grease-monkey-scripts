import type { NovelBook, NovelChapter } from './types'

/** Chapter key at index N (skipping gap markers) when more than N real chapters exist. */
export function initialSeenKey(latestChapters: NovelChapter[], initialNewChapters: number): string {
  if (latestChapters.length === 0) return ''
  const real = latestChapters.filter((c) => !c.omittedCount)
  if (real.length <= initialNewChapters) return ''
  return real[initialNewChapters]!.key
}

export function isNewChapter(chapter: NovelChapter, book: NovelBook): boolean {
  if (book.lastSeenChapterKey === '') return true
  if (chapter.key === book.lastSeenChapterKey) return false
  const seenIdx = book.latestChapters.findIndex((c) => c.key === book.lastSeenChapterKey)
  if (seenIdx < 0) return true
  const chapterIdx = chapter.omittedCount
    ? book.latestChapters.indexOf(chapter)
    : book.latestChapters.findIndex((c) => c.key === chapter.key)
  if (chapterIdx < 0) return false
  return chapterIdx < seenIdx
}

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

import type { NovelBook, NovelChapter } from './types'

export function initialSeenUrl(latestChapters: NovelChapter[], initialNewChapters: number): string {
  if (latestChapters.length === 0) return ''
  // Count only real chapters (skip gap markers)
  const realChapters = latestChapters.filter((c) => !c.omittedCount)
  if (realChapters.length <= initialNewChapters) return ''
  return realChapters[initialNewChapters]!.url
}

export function isNewChapter(chapter: NovelChapter, book: NovelBook): boolean {
  if (book.lastSeenChapterUrl === '') return true
  if (chapter.url === book.lastSeenChapterUrl) return false
  const seenIdx = book.latestChapters.findIndex((c) => c.url === book.lastSeenChapterUrl)
  if (seenIdx < 0) return true
  // For gap markers (empty url), use reference-based indexOf
  const chapterIdx = chapter.omittedCount
    ? book.latestChapters.indexOf(chapter)
    : book.latestChapters.findIndex((c) => c.url === chapter.url)
  if (chapterIdx < 0) return false
  return chapterIdx < seenIdx
}

export function newChapters(book: NovelBook): NovelChapter[] {
  if (book.lastSeenChapterUrl === '') return [...book.latestChapters]
  const seenIdx = book.latestChapters.findIndex((c) => c.url === book.lastSeenChapterUrl)
  if (seenIdx < 0) return [...book.latestChapters]
  return book.latestChapters.slice(0, seenIdx)
}

/** Returns the actual count of unread chapters, including omitted ones from gap markers. */
export function newChapterCount(book: NovelBook): number {
  return newChapters(book).reduce((sum, c) => sum + (c.omittedCount ?? 1), 0)
}

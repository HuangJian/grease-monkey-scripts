import type { NovelBook, NovelChapter } from './types'

export function initialSeenUrl(latestChapters: NovelChapter[], initialNewChapters: number): string {
  if (latestChapters.length === 0) return ''
  if (latestChapters.length <= initialNewChapters) return ''
  return latestChapters[initialNewChapters]!.url
}

export function isNewChapter(chapter: NovelChapter, book: NovelBook): boolean {
  if (book.lastSeenChapterUrl === '') return true
  if (chapter.url === book.lastSeenChapterUrl) return false
  const seenIdx = book.latestChapters.findIndex((c) => c.url === book.lastSeenChapterUrl)
  if (seenIdx < 0) return true
  const chapterIdx = book.latestChapters.findIndex((c) => c.url === chapter.url)
  if (chapterIdx < 0) return false
  return chapterIdx < seenIdx
}

export function newChapters(book: NovelBook): NovelChapter[] {
  return book.latestChapters.filter((c) => isNewChapter(c, book))
}

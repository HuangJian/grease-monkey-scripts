export type NovelEntry = {
  url: string
  alias?: string
}

export type NovelChapter = {
  url: string
  title: string
  postedAt: number
  /** Gap marker: number of omitted chapters between the surrounding entries. */
  omittedCount?: number
}

export type NovelBook = {
  url: string
  siteId: string
  title: string
  latestChapters: NovelChapter[]
  lastSeenChapterUrl: string
  fetchedAt: number
  error: string
  /** Host that last successfully served this book's content (e.g. the working mirror). */
  mirrorHost?: string
}

export type NovelData = {
  books: NovelBook[]
}

export type NovelSourceOptions = {
  entries: NovelEntry[]
  ttlMinutes: number
  maxNewChaptersPerBook: number
  initialNewChapters: number
  maxLatestWindow: number
}

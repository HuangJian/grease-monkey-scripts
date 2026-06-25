export type NovelEntry = {
  url: string
  alias?: string
}

export type NovelChapter = {
  url: string
  title: string
  postedAt: number
}

export type NovelBook = {
  url: string
  siteId: string
  title: string
  latestChapters: NovelChapter[]
  lastSeenChapterUrl: string
  fetchedAt: number
  error: string
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

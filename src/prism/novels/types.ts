/** A single chapter as served by one mirror site. */
export type NovelChapterVariant = {
  url: string
  title: string
  postedAt: number
  siteId: string
  /** Host that actually served this source's pages (mirror), for link rewriting. */
  host?: string
}

export type NovelChapter = {
  /** Cross-site identity: `n:<num>` or `t:<normalized title>`. */
  key: string
  /** Chapter number when derivable, else undefined. */
  number?: number
  /** Display title, taken from the highest-priority variant that has this chapter. */
  title: string
  /** Best-known timestamp across variants (0 = unknown). */
  postedAt: number
  /** Variants in source-priority order (index 0 = primary source). */
  variants: NovelChapterVariant[]
  /** Gap marker: number of omitted chapters between surrounding entries. */
  omittedCount?: number
}

/** Fetch outcome for one configured source URL. */
export type NovelSourceState = {
  url: string
  siteId: string
  /** Host that served this source's pages, for link rewriting. */
  mirrorHost?: string
  /** Total chapters the site listed (progress indicator), 0 when unavailable. */
  chapterCount: number
  /** Empty on success. */
  error: string
}

export type NovelBook = {
  /** Stable identity: `u:${urls[0]}`. Decoupled from title so renaming is safe. */
  id: string
  title: string
  sources: NovelSourceState[]
  latestChapters: NovelChapter[]
  /** Cross-site seen marker (chapter key); '' = nothing seen yet. */
  lastSeenChapterKey: string
  fetchedAt: number
  /** Whole-book error (e.g. unknown site); '' when ok. */
  error: string
}

export type NovelData = {
  books: NovelBook[]
}

/** A chapter as returned by an adapter before merge (no cross-site identity yet). */
export type NovelRawChapter = {
  url: string
  title: string
  postedAt: number
}

/** One configured book and its mirror URLs (ordered; index 0 is the primary source). */
export type NovelBookConfig = {
  title: string
  urls: string[]
}

export type NovelSourceOptions = {
  books: NovelBookConfig[]
  ttlMinutes: number
  maxNewChaptersPerBook: number
  initialNewChapters: number
  maxLatestWindow: number
}

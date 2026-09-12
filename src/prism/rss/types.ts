/** One subscribed feed as configured by the user. */
export type RssFeedConfig = {
  url: string
  /** Overrides the feed's self-reported title; empty means "use the feed's". */
  title: string
  /** Defaults to enabled when omitted. */
  enabled?: boolean
}

export type RssItem = {
  /** Canonical link — stable across feed regenerations (see plan D4). */
  id: string
  title: string
  link: string
  /** Publication timestamp in ms; 0 when the feed omits it. */
  pubDate: number
  /** Plain-text summary, sanitized and truncated (see plan D9). */
  summaryText: string
  /** Set when the summary was dropped by the storage window (see SUMMARY_KEEP_COUNT). */
  summaryTrimmed?: boolean
  author?: string
}

export type RssFeed = {
  /** `u:${url}` — stable even when the title changes. */
  id: string
  title: string
  url: string
  /** Newest first, already capped and retention-filtered. */
  items: RssItem[]
  /** Empty on success; fetch failure message otherwise. */
  error: string
  /**
   * Timestamp of the last **successful** fetch (200 or 304). Never advanced by
   * a failure — that is what `attemptedAt` is for. 0 means "never succeeded",
   * which `isFeedDue` treats as due immediately.
   */
  fetchedAt: number
  /**
   * False for a feed the user disabled. Kept optional so caches written before
   * this field existed still render (`!== false` treats them as enabled).
   */
  enabled?: boolean
  /** Timestamp of the last attempt, successful or not. */
  attemptedAt?: number | undefined
  /** Consecutive failures, cleared on success. */
  failureCount?: number | undefined
  /** Earliest time this feed may be retried after failures. */
  nextRetryAt?: number | undefined
  /** Interval the feed declares for itself (ms); absent = uses the user's minimum. */
  declaredIntervalMs?: number | undefined
  /** Conditional-request credentials, echoed back verbatim. */
  etag?: string | undefined
  lastModified?: string | undefined
}

export type RssViewMode = 'grouped' | 'timeline'

export type RssSourceOptions = {
  feeds: RssFeedConfig[]
  /**
   * Lower bound on how often a feed is fetched (minutes). A feed that declares
   * a longer interval than this is fetched at its own pace.
   */
  ttlMinutes: number
  retentionDays: number
  maxItemsPerFeed: number
  viewMode: RssViewMode
  /**
   * Honour the interval a feed declares for itself (`<ttl>` /
   * `sy:updatePeriod`). When false every feed follows `ttlMinutes`.
   */
  respectFeedPeriod: boolean
}

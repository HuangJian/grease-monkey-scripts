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
  fetchedAt: number
}

export type RssViewMode = 'grouped' | 'timeline'

export type RssSourceOptions = {
  feeds: RssFeedConfig[]
  ttlMinutes: number
  retentionDays: number
  maxItemsPerFeed: number
  viewMode: RssViewMode
}

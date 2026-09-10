/** Identify the script to feed hosts that reject unknown clients. Mirrors tnews's UA. */
export const RSS_USER_AGENT =
  'web:grease-monkey-dashboard:1.0 (contact: https://github.com/HuangJian/grease-monkey-scripts)'

export const RSS_ACCEPT_HEADER =
  'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'

/** Bounded fan-out: one request per configured feed (see frontend.refactor.md P2). */
export const FEED_FETCH_CONCURRENCY = 4

/** Unread entries per feed shown before the rest fold behind a toggle. */
export const FOLD_THRESHOLD = 3

/**
 * Upper bound on rows the timeline renders at once. With 100 entries per feed
 * and many feeds the merged list can reach thousands of nodes; the card says
 * explicitly when it is truncated.
 */
export const TIMELINE_MAX_ITEMS = 100

/**
 * Summary length kept per entry. Plain text only (plan D9): at 100 entries per
 * feed, storing sanitized HTML pushes the GM cache into megabytes.
 */
export const MAX_SUMMARY_CHARS = 300

/**
 * How many of the newest entries per feed keep their summary (R5.3 measurement).
 *
 * With 20 feeds × 100 entries × 300-char summaries the stored payload measured
 * ~2.0MB — the summaries themselves are ~90% of it, and key compression cannot
 * help. Summaries are therefore kept only for the newest entries; older ones
 * carry `summaryTrimmed` so the card can say so instead of looking empty.
 */
export const SUMMARY_KEEP_COUNT = 30

export const DEFAULT_TTL_MINUTES = 123
export const DEFAULT_RETENTION_DAYS = 30
export const DEFAULT_MAX_ITEMS_PER_FEED = 100
export const DEFAULT_VIEW_MODE = 'grouped'

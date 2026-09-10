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
 * Summary length kept per entry. Plain text only (plan D9): at 100 entries per
 * feed, storing sanitized HTML pushes the GM cache into megabytes.
 */
export const MAX_SUMMARY_CHARS = 300

export const DEFAULT_TTL_MINUTES = 123
export const DEFAULT_RETENTION_DAYS = 30
export const DEFAULT_MAX_ITEMS_PER_FEED = 100
export const DEFAULT_VIEW_MODE = 'grouped'

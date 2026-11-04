export const REDDIT_USER_AGENT =
  'web:grease-monkey-dashboard:1.0 (contact: https://github.com/HuangJian/grease-monkey-scripts)'

/**
 * Reddit closed anonymous `.json` access in 2026: every listing endpoint answers
 * 403 (`You've been blocked by network security`) for every User-Agent,
 * `old.reddit.com` 302s to a login wall, and the HTML listing serves a
 * "prove your humanity" challenge. The Atom feed is the only door still open to
 * an unauthenticated client, and only from `www.reddit.com`.
 *
 * The trade: the feed carries no `score` / `num_comments` (see
 * `RedditPost.metrics`), but its document order *is* Reddit's own hot ranking,
 * so ordering is preserved downstream instead of recomputed.
 */
export const REDDIT_FEED_HOST = 'www.reddit.com'

/**
 * Feed-wide cap, not per subreddit. One multi-sub request (`/r/a+b+c/hot/.rss`)
 * shares this budget between all members, which is why a small subreddit can end
 * up with only a handful of entries. That trade is deliberate: reddit throttles
 * the feed to roughly one success per minute per IP, so five separate requests
 * would take minutes while one takes a second.
 */
export const REDDIT_FEED_LIMIT = 100

export const MAX_RETRIES_ON_429 = 1

/** Members must already be normalized (`[a-z0-9_]`); `+` is the multi-sub separator. */
export const REDDIT_FEED_URL = (members: readonly string[], limit: number): string =>
  `https://${REDDIT_FEED_HOST}/r/${members.join('+')}/hot/.rss?limit=${limit}`

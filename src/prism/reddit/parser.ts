import { parseFeed } from '../shared/feed-parser'
import type { RedditPost } from './types'

export function normalizeSubredditName(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?r\//i, '')
    .replace(/^\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
}

/**
 * Separator inside one subscription entry: `opencode+opencodecli` is a single
 * section fed by both subs. Reddit itself uses this for multi-reddits, so the
 * syntax needs no explanation to anyone who has seen a /r/a+b URL.
 */
export const SUBREDDIT_GROUP_SEP = '+'

/** Members of an entry, normalized and deduped, in the order written. */
export function splitSubredditSpec(spec: string): string[] {
  return Array.from(
    new Set(
      spec
        .split(SUBREDDIT_GROUP_SEP)
        .map((part) => normalizeSubredditName(part))
        .filter((part) => part.length > 0),
    ),
  )
}

/**
 * Canonical form of one `subreddits` entry — also the section key. Members are
 * sorted so that `a+b` and `b+a` are the same entry: the key is a cache and
 * read-state identity, and a re-typed order must not orphan it.
 */
export function normalizeSubredditSpec(raw: string): string {
  return [...splitSubredditSpec(raw)].sort().join(SUBREDDIT_GROUP_SEP)
}

/** Does a post from `postSub` belong to the section keyed by `spec`? */
export function specContainsSub(spec: string, postSub: string): boolean {
  const normalized = normalizeSubredditName(postSub)
  return normalized.length > 0 && splitSubredditSpec(spec).includes(normalized)
}

/** `opencode+opencodecli` → `r/opencode + r/opencodecli`. */
export function subredditSpecLabel(spec: string): string {
  return splitSubredditSpec(spec)
    .map((sub) => `r/${sub}`)
    .join(' + ')
}

/** `/r/{sub}/comments/{id}/...` — the only stable identity the feed exposes. */
const POST_LINK_RE = /\/r\/([^/]+)\/comments\/([a-z0-9]+)/i

export type RedditFeedEntry = { sub: string; post: RedditPost }

/** Atom author is `/u/name`; sections and author tags key on the bare name. */
function normalizeRedditAuthor(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/^\/?u\//i, '')
}

/**
 * Parse an Atom listing (`/r/a+b/hot/.rss`) into posts tagged with the
 * subreddit they belong to.
 *
 * The subreddit is read from the permalink, not from `<category>`: category
 * labels keep the display casing (`LocalLLaMA`, `opencodeCLI`) while every
 * section key is normalized. Entries whose link is not a comments permalink are
 * skipped — the feed also carries no vote/comment counts, so `metrics: false`
 * marks the zeros as "not measured" rather than "measured as zero".
 */
export function parseRedditFeed(
  xml: string,
  domParser: DOMParser,
  options: { maxItems?: number; now?: () => number } = {},
): RedditFeedEntry[] {
  const now = options.now ?? Date.now
  const { items } = parseFeed(
    xml,
    domParser,
    options.maxItems === undefined ? {} : { maxItems: options.maxItems },
  )
  const out: RedditFeedEntry[] = []
  for (const item of items) {
    const m = item.link.match(POST_LINK_RE)
    if (!m) continue
    const sub = normalizeSubredditName(m[1]!)
    const id = m[2]!.toLowerCase()
    if (!sub || !id) continue
    out.push({
      sub,
      post: {
        id,
        title: item.title,
        url: item.link,
        score: 0,
        numComments: 0,
        author: normalizeRedditAuthor(item.author),
        created: item.pubDate > 0 ? item.pubDate : now(),
        metrics: false,
      },
    })
  }
  return out
}

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

export function parseRedditListing(
  json: unknown,
  maxItems: number,
  now: () => number = Date.now,
): RedditPost[] {
  if (!json || typeof json !== 'object') return []
  const data = (json as { data?: unknown }).data
  if (!data || typeof data !== 'object') return []
  const children = (data as { children?: unknown }).children
  if (!Array.isArray(children)) return []
  const out: RedditPost[] = []
  children.some((child) => {
    if (!child || typeof child !== 'object') return false
    const c = child as { kind?: unknown; data?: unknown }
    if (c.kind !== 't3') return false
    if (!c.data || typeof c.data !== 'object') return false
    const d = c.data as Record<string, unknown>
    if (d['over_18'] === true) return false
    if (d['distinguished'] === 'promoted') return false
    const id = d['id']
    const title = d['title']
    const permalink = d['permalink']
    const score = d['score']
    const numComments = d['num_comments']
    const subreddit = d['subreddit']
    const author = d['author']
    const createdUtc = d['created_utc']
    if (typeof id !== 'string' || !id) return false
    if (typeof title !== 'string' || !title) return false
    if (typeof permalink !== 'string' || !permalink) return false
    if (typeof score !== 'number' || !Number.isFinite(score)) return false
    if (typeof numComments !== 'number' || !Number.isFinite(numComments)) return false
    if (typeof subreddit !== 'string' || !subreddit) return false
    const authorText = typeof author === 'string' ? author : ''
    const normalizedSub = normalizeSubredditName(subreddit)
    if (!normalizedSub) return false
    let created: number
    if (typeof createdUtc === 'number' && Number.isFinite(createdUtc) && createdUtc > 0) {
      created = Math.floor(createdUtc * 1000)
    } else {
      created = now()
    }
    out.push({
      id,
      title,
      url: `https://www.reddit.com${permalink}`,
      score: Math.max(0, Math.floor(score)),
      numComments: Math.max(0, Math.floor(numComments)),
      author: authorText,
      created,
    })
    return out.length >= maxItems
  })
  return out
}

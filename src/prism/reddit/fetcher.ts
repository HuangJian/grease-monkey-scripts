import type { Runtime } from '../../runtime'
import {
  MAX_RETRIES_ON_429,
  REDDIT_FEED_LIMIT,
  REDDIT_FEED_URL,
  REDDIT_USER_AGENT,
} from './constants'
import { computeRetryDelayMs, headerValue } from '../shared/request'
import {
  normalizeSubredditSpec,
  parseRedditFeed,
  specContainsSub,
  splitSubredditSpec,
} from './parser'
import type { RedditFetchResult, RedditPost, RedditSourceOptions } from './types'

type FeedEntry = { sub: string; post: RedditPost }

type FeedOutcome = { ok: true; entries: readonly FeedEntry[] } | { ok: false; error: string }

/**
 * Reddit throttles the feed to roughly one success per minute per IP and answers
 * the rest with 429. `Retry-After` is usually `0`, so the useful signal is
 * `x-ratelimit-reset` (seconds until the window reopens); wait that out once
 * rather than burning the retry after one second.
 */
function feedRetryDelayMs(responseHeaders: string, attempt: number): number {
  const resetSecs = Number(headerValue(responseHeaders, 'x-ratelimit-reset'))
  if (Number.isFinite(resetSecs) && resetSecs > 0) return Math.min(resetSecs * 1000 + 1000, 60_000)
  return computeRetryDelayMs(attempt, responseHeaders)
}

/**
 * One request covers every configured subreddit (`/r/a+b+c/hot/.rss`). Per-sub
 * requests would need a minute each because of the IP-wide throttle, so the
 * whole feed is fetched as a single multi-sub listing and split afterwards.
 */
function fetchFeed(runtime: Runtime, members: readonly string[]): Promise<FeedOutcome> {
  return new Promise<FeedOutcome>((resolve) => {
    let settled = false
    let retriesLeft = MAX_RETRIES_ON_429
    const settle = (outcome: FeedOutcome) => {
      if (settled) return
      settled = true
      console.debug('[gm-dashboard] reddit.fetchFeed settled members=', members, 'outcome=', {
        ok: outcome.ok,
        error: outcome.ok ? undefined : outcome.error,
        count: outcome.ok ? outcome.entries.length : undefined,
      })
      resolve(outcome)
    }
    const attempt = () => {
      runtime.request({
        url: REDDIT_FEED_URL(members, REDDIT_FEED_LIMIT),
        method: 'GET',
        timeout: 20000,
        anonymous: false,
        headers: {
          'User-Agent': REDDIT_USER_AGENT,
          Accept: 'application/atom+xml, application/xml;q=0.9, */*;q=0.8',
        },
        onload(response) {
          if (response.status === 429 && retriesLeft > 0) {
            retriesLeft--
            const attemptIndex = MAX_RETRIES_ON_429 - retriesLeft
            const waitMs = feedRetryDelayMs(response.responseHeaders, attemptIndex)
            console.debug('[gm-dashboard] reddit.fetchFeed 429, retry in', waitMs, 'ms')
            runtime.setTimeout(attempt, waitMs)
            return
          }
          if (response.status >= 400) {
            settle({ ok: false, error: `http ${response.status}` })
            return
          }
          const entries = parseRedditFeed(response.responseText, new runtime.DOMParser(), {
            now: () => runtime.now(),
          })
          if (entries.length === 0) {
            settle({ ok: false, error: 'feed carried no recognizable posts' })
            return
          }
          settle({ ok: true, entries })
        },
        onerror: () => settle({ ok: false, error: 'network error' }),
        ontimeout: () => settle({ ok: false, error: 'timeout' }),
      })
    }
    attempt()
  })
}

export async function fetchReddit(
  runtime: Runtime,
  options: RedditSourceOptions,
): Promise<RedditFetchResult> {
  // One entry may be several subs merged into a single section ("opencode+opencodecli").
  // The feed is fetched once for all members; members are only used to build its URL.
  const specs = Array.from(
    new Set(options.subreddits.map(normalizeSubredditSpec).filter((s) => s.length > 0)),
  )
  const members = Array.from(new Set(specs.flatMap(splitSubredditSpec)))
  if (members.length === 0) {
    throw new Error('reddit: no valid subreddits configured')
  }

  const outcome = await fetchFeed(runtime, members)
  if (!outcome.ok) {
    throw new Error(`reddit: ${outcome.error} (${members.map((m) => `r/${m}`).join(', ')})`)
  }

  const perSpec = specs
    .map((spec) => ({
      sub: spec,
      posts: outcome.entries.filter((e) => specContainsSub(spec, e.sub)).map((e) => e.post),
    }))
    .filter(({ posts }) => posts.length > 0)

  if (perSpec.length === 0) {
    throw new Error(
      `reddit: feed has no posts for the configured subs (${members.map((m) => `r/${m}`).join(', ')})`,
    )
  }

  // A member missing from the feed is normal, not an error: the 100-entry cap is
  // shared across the whole multi-sub listing, so a quiet subreddit can lose out.
  const silent = members.filter((m) => !outcome.entries.some((e) => e.sub === m))
  if (silent.length > 0) {
    console.debug(
      '[gm-dashboard] reddit: subs with no entries in this feed:',
      silent.map((m) => `r/${m}`),
    )
  }

  return { posts: perSpec, partialErrors: [] }
}

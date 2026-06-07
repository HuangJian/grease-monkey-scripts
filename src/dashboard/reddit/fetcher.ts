import type { Runtime } from '../../runtime'
import { MAX_RETRIES_ON_429, REDDIT_API_URL, REDDIT_HOSTS, REDDIT_USER_AGENT } from './constants'
import { normalizeSubredditName, parseRedditListing } from './parser'
import type { RedditFetchResult, RedditPost, RedditSourceOptions } from './types'

function parseRetryAfter(headers: string | undefined): number {
  if (!headers) return 0
  const match = headers.match(/^retry-after:\s*(\d+)/im)
  if (!match) return 0
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

type FetchOutcome =
  | { ok: true; posts: RedditPost[] }
  | { ok: false; error: string; status?: number }

function fetchOneSub(runtime: Runtime, subreddit: string): Promise<FetchOutcome> {
  return new Promise<FetchOutcome>((resolve) => {
    let settled = false
    let hostIdx = 0
    let retriesLeft = MAX_RETRIES_ON_429
    let lastError = 'unknown'
    const settle = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      console.debug(
        '[gm-dashboard] reddit.fetchOneSub settled sub=',
        subreddit,
        'hostIdx=',
        hostIdx,
        'outcome=',
        outcome,
      )
      resolve(outcome)
    }
    const attempt = () => {
      const host = REDDIT_HOSTS[hostIdx]!
      console.debug(
        '[gm-dashboard] reddit.fetchOneSub attempt sub=',
        subreddit,
        'host=',
        host,
        'retriesLeft=',
        retriesLeft,
      )
      runtime.request({
        url: REDDIT_API_URL(host, subreddit),
        method: 'GET',
        timeout: 15000,
        anonymous: false,
        headers: { 'User-Agent': REDDIT_USER_AGENT },
        onload(response) {
          if (response.status === 429 && retriesLeft > 0) {
            retriesLeft--
            const waitSec = parseRetryAfter(response.responseHeaders)
            setTimeout(() => attempt(), Math.max(0, waitSec * 1000))
            return
          }
          if (response.status === 403) {
            lastError = 'http 403'
            advanceHost()
            return
          }
          if (response.status && response.status >= 400) {
            settle({
              ok: false,
              error: `http ${response.status}`,
              status: response.status,
            })
            return
          }
          try {
            const json: unknown = JSON.parse(response.responseText)
            const posts = parseRedditListing(json, 100)
            settle({ ok: true, posts })
          } catch (e) {
            settle({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        },
        onerror: () => {
          lastError = 'network error'
          advanceHost()
        },
        ontimeout: () => {
          lastError = 'timeout'
          advanceHost()
        },
      })
    }
    const advanceHost = () => {
      if (hostIdx + 1 >= REDDIT_HOSTS.length) {
        settle({ ok: false, error: lastError })
        return
      }
      hostIdx++
      retriesLeft = MAX_RETRIES_ON_429
      attempt()
    }
    attempt()
  })
}

export async function fetchReddit(
  runtime: Runtime,
  options: RedditSourceOptions,
): Promise<RedditFetchResult> {
  const normalizedSubs = options.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0)
  const uniqueSubs = Array.from(new Set(normalizedSubs))
  if (uniqueSubs.length === 0) {
    throw new Error('reddit: no valid subreddits configured')
  }

  const settled = await Promise.all(
    uniqueSubs.map(async (sub) => {
      const outcome = await fetchOneSub(runtime, sub)
      if (!outcome.ok) return { sub, posts: [] as RedditPost[], error: outcome.error }
      return { sub, posts: outcome.posts, error: null as string | null }
    }),
  )

  const errors: string[] = []
  const perSub: Array<{ sub: string; posts: RedditPost[] }> = []
  for (const item of settled) {
    if (item.error) errors.push(`r/${item.sub}: ${item.error}`)
    if (item.posts.length > 0) perSub.push({ sub: item.sub, posts: item.posts })
  }

  if (perSub.length === 0) {
    throw new Error(`reddit: all subs failed: ${errors.join('; ')}`)
  }

  return { posts: perSub, partialErrors: errors }
}

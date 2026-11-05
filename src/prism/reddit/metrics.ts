import type { Runtime } from '../../runtime'
import type { RedditPost } from './types'

/**
 * The official Atom feed carries no score / comment counts. Arctic Shift is a
 * community-run public archive of Reddit submissions; we use it to fill those
 * two numbers back in *by post id*, without taking content or ordering from it.
 *
 * Metrics are refreshed **when the user looks at the dashboard**, not when a
 * post is fetched: a post captured days ago must show its current activity, not
 * whatever the archive said on the day it was first seen. `loadState` (runs
 * before the panel renders) and `fetch` both call `refreshMetricsForData`, which
 * covers the entire cache in one batched request (500 ids verified to work).
 *
 * Deliberately best-effort: never throws, never blocks the feed. When the
 * archive is down or has not ingested a fresh post yet, that post keeps
 * `metrics: false` and the UI simply omits the two columns for it.
 *
 * The archive's numbers are a snapshot taken a few hours after submission, so
 * they are good for judging magnitude but must not drive ranking or gating —
 * Reddit's own hot order in the feed is more current.
 */
export const REDDIT_METRICS_URL = (ids: readonly string[]): string =>
  `https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${ids.join(',')}`

/** Page-lifetime throttle; reloading the page naturally allows a fresh read. */
export const METRICS_REFRESH_MIN_INTERVAL_MS = 5 * 60_000

/**
 * How long to wait after the panel opens before refreshing. The panel must paint
 * first: metrics are a cosmetic improvement on cached rows, so they lose to an
 * instant first render. The cache write that follows triggers the dashboard's
 * `addValueChangeListener`, which repaints the group with fresh numbers.
 */
export const METRICS_REFRESH_DELAY_MS = 20_000

let lastRefreshAt = 0

/** Test hook: simulate a page reload / force the next refresh to run. */
export function resetMetricsThrottle(): void {
  lastRefreshAt = 0
}

type ArchiveRow = {
  id?: unknown
  score?: unknown
  num_comments?: unknown
}

function nonNegativeInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null
}

/**
 * Mutates the provided post objects in place and returns how many of them now
 * carry real metrics. With `force`, posts that already had numbers are queried
 * again — that is the whole point of a "view-time" refresh. A post the archive
 * omits keeps whatever it had before; a refresh must never erase good numbers.
 */
export async function enrichRedditMetrics(
  runtime: Runtime,
  posts: readonly RedditPost[],
  options: { force?: boolean } = {},
): Promise<number> {
  const pending = options.force ? [...posts] : posts.filter((p) => p.metrics === false)
  if (pending.length === 0) return 0

  return new Promise<number>((resolve) => {
    let settled = false
    const done = (count: number) => {
      if (settled) return
      settled = true
      resolve(count)
    }
    const fail = (reason: string) => {
      // A third-party outage must never turn into a failed source refresh.
      console.debug('[gm-dashboard] reddit metrics unavailable:', reason)
      done(0)
    }
    runtime.request({
      url: REDDIT_METRICS_URL(pending.map((p) => p.id)),
      method: 'GET',
      // This runs on the render path; a stalled archive must not hold the panel
      // open for long. Old numbers / hidden columns are an acceptable fallback.
      timeout: 5000,
      // Never send browser cookies to a third-party host: only public post ids
      // (already public in the feed) leave the browser.
      anonymous: true,
      headers: { Accept: 'application/json' },
      onload(response) {
        if (response.status >= 400) {
          fail(`http ${response.status}`)
          return
        }
        try {
          const json: unknown = JSON.parse(response.responseText)
          const rows = (json as { data?: unknown } | null)?.data
          if (!Array.isArray(rows)) {
            fail('response has no data array')
            return
          }
          const byId = new Map<string, ArchiveRow>()
          rows.forEach((row) => {
            if (!row || typeof row !== 'object') return
            const r = row as ArchiveRow
            if (typeof r.id === 'string' && r.id) byId.set(r.id, r)
          })
          let count = 0
          pending.forEach((post) => {
            const row = byId.get(post.id)
            if (!row) return
            const score = nonNegativeInt(row.score)
            const comments = nonNegativeInt(row.num_comments)
            if (score === null || comments === null) return
            post.score = score
            post.numComments = comments
            post.metrics = true
            count++
          })
          console.debug('[gm-dashboard] reddit metrics enriched', count, '/', pending.length)
          done(count)
        } catch (e) {
          fail(e instanceof Error ? e.message : String(e))
        }
      },
      onerror: () => fail('network error'),
      ontimeout: () => fail('timeout'),
    })
  })
}

/**
 * Refresh metrics for every post in a `Record<sub, posts[]>` payload — including
 * old posts the user is scrolling back to. Returns whether anything changed, so
 * the caller can decide to persist the cache.
 */
export async function refreshMetricsForData(
  runtime: Runtime,
  data: Record<string, RedditPost[]>,
  now: number,
): Promise<boolean> {
  // Dedupe by id: the same post can show up in more than one stale cache group.
  const byId = new Map<string, RedditPost>()
  Object.values(data).forEach((posts) => {
    posts.forEach((p) => {
      if (!byId.has(p.id)) byId.set(p.id, p)
    })
  })
  if (byId.size === 0) return false
  const posts = Array.from(byId.values())
  // A freshly parsed post has no numbers at all — those must be filled even if
  // the throttle would skip a refresh. Only a payload whose posts all already
  // have numbers may be left alone for the cooldown.
  const hasMissing = posts.some((p) => p.metrics === false)
  if (!hasMissing && lastRefreshAt > 0 && now - lastRefreshAt < METRICS_REFRESH_MIN_INTERVAL_MS) {
    return false
  }
  lastRefreshAt = now

  const count = await enrichRedditMetrics(runtime, posts, { force: true })
  console.debug('[gm-dashboard] reddit metrics refresh', count, '/', posts.length)
  return count > 0
}

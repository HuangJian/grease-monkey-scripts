/**
 * Per-feed fetch scheduling: when each feed is due, how long to wait after a
 * failure, and what interval a feed's own declaration resolves to.
 *
 * Pure functions only — no Runtime, no storage, no `app/` imports, so the whole
 * scheduling policy is unit-testable with a fake clock. `fetcher.ts` does the
 * IO and the caching; `source.tsx` uses the same helpers for its `isDue` gate.
 *
 * See `rss-fetch-schedule.plan.md` D3/D6.
 */
import type { RssFeed, RssSourceOptions } from './types'

/**
 * Retry ladder for a single feed (1m, 2m, 5m, 10m, 30m, 60m cap).
 *
 * Deliberately separate from `app/refresh.ts`'s source-level ladder: a feature
 * module must not depend on the composition layer. Longer than the source-level
 * ladder because one failed feed is not a broken source — the last two rungs
 * keep a permanently dead URL down to one request per hour.
 */
export const FEED_BACKOFF_DELAYS_MS = [
  60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000,
] as const

/** Options that shape the schedule (the rest of RssSourceOptions is unrelated). */
export type FeedScheduleOptions = Pick<RssSourceOptions, 'ttlMinutes' | 'respectFeedPeriod'> & {
  /**
   * Skip the interval and retry gates because the user asked for this refresh
   * explicitly (the card's refresh button). Disabled feeds are still skipped,
   * and a broken feed is retried once per click — which is the point: it is the
   * user's way out of a long interval or a backoff.
   */
  force?: boolean
}

/**
 * How often this feed may be fetched.
 *
 * The user's `ttlMinutes` is a **floor**, not the answer: it bounds how often
 * any single feed is polled, while the feed's own declaration (`<ttl>` /
 * `sy:updatePeriod`, resolved by the parser) decides when it is slower. A
 * declared interval can therefore only slow a feed down, never speed it up.
 */
export function resolveIntervalMs(
  declaredIntervalMs: number | undefined,
  minIntervalMinutes: number,
  respectFeedPeriod: boolean,
): number {
  const floor = Math.max(1, Math.round(minIntervalMinutes)) * 60_000
  if (!respectFeedPeriod || !declaredIntervalMs || declaredIntervalMs <= 0) return floor
  return Math.max(declaredIntervalMs, floor)
}

/** The fields scheduling needs; lets callers pass partial rows in tests. */
export type DueFields = Pick<RssFeed, 'fetchedAt' | 'nextRetryAt'>

/**
 * When the feed becomes fetchable again; 0 = never successfully fetched, which
 * callers read as "due now" (that is how a newly added source gets fetched on
 * the next tick).
 */
export function nextFetchAtOf(feed: DueFields, intervalMs: number): number {
  return feed.fetchedAt > 0 ? feed.fetchedAt + intervalMs : 0
}

/** Delay before retrying a feed that has failed `failureCount` times in a row. */
export function feedRetryDelayMs(failureCount: number): number {
  if (failureCount <= 0) return 0
  const idx = Math.min(failureCount - 1, FEED_BACKOFF_DELAYS_MS.length - 1)
  return FEED_BACKOFF_DELAYS_MS[idx]!
}

/**
 * Whether the feed should be fetched at `now`.
 *
 * Two gates: its interval has elapsed, and — when it has been failing — its
 * retry delay has too. A feed that never succeeded has `fetchedAt === 0` and is
 * due immediately, so a failing first fetch still gets retried on the ladder
 * instead of waiting a whole interval.
 */
export function isFeedDue(feed: DueFields, now: number, intervalMs: number): boolean {
  if (typeof feed.nextRetryAt === 'number' && now < feed.nextRetryAt) return false
  return now >= nextFetchAtOf(feed, intervalMs)
}

export type FeedSchedule = {
  /** Interval the feed currently follows (ms). */
  intervalMs: number
  /** True when a fetch should happen now. */
  due: boolean
  /** When the feed becomes due again (ms epoch); 0 = due immediately. */
  nextFetchAt: number
}

/**
 * The whole per-feed decision in one place, so `fetcher` (which fetches) and
 * `source.isDue` (which decides whether to start a refresh at all) cannot drift
 * apart.
 *
 * `enabled` comes from the user's config, not from the cached feed: config is
 * the truth about which feeds exist, the cache only remembers what was fetched.
 */
export function feedSchedule(
  feed: RssFeed | undefined,
  enabled: boolean,
  options: FeedScheduleOptions,
  now: number,
): FeedSchedule {
  const intervalMs = resolveIntervalMs(
    feed?.declaredIntervalMs,
    options.ttlMinutes,
    options.respectFeedPeriod,
  )
  if (!enabled) return { intervalMs, due: false, nextFetchAt: 0 }
  // A forced refresh (manual click) bypasses both gates.
  if (options.force) {
    return { intervalMs, due: true, nextFetchAt: feed ? nextFetchAtOf(feed, intervalMs) : 0 }
  }
  // No cache row means it has never been fetched — due on the spot.
  if (!feed) return { intervalMs, due: true, nextFetchAt: 0 }
  return {
    intervalMs,
    due: isFeedDue(feed, now, intervalMs),
    nextFetchAt: nextFetchAtOf(feed, intervalMs),
  }
}

import type { Runtime } from '../../runtime'
import { mapLimit } from '../shared/concurrency'
import { parseFeed, stripHtmlToText, type FeedItem } from '../shared/feed-parser'
import { headerValue, requestTextWithHeaders } from '../shared/request'
import {
  FEED_FETCH_CONCURRENCY,
  MAX_SUMMARY_CHARS,
  RSS_ACCEPT_HEADER,
  RSS_USER_AGENT,
  SUMMARY_KEEP_COUNT,
} from './constants'
import {
  applySummaryWindow,
  capItems,
  filterByRetention,
  mergeFeedItems,
  sortByPubDateDesc,
  truncateText,
} from './merge'
import { feedRetryDelayMs, feedSchedule, type FeedScheduleOptions } from './schedule'
import type { RssFeed, RssFeedConfig, RssItem } from './types'

export type FetchRssFeedsOptions = FeedScheduleOptions & {
  maxItemsPerFeed: number
  retentionMs: number
}

/** Stable feed identity, decoupled from the title so renaming is safe (same as novels' bookId). */
export function feedId(url: string): string {
  return `u:${url}`
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function toRssItem(item: FeedItem, domParser: DOMParser): RssItem {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    // Plain text only (plan D9): at 100 entries per feed, sanitized HTML would
    // push the GM cache into megabytes.
    summaryText: truncateText(stripHtmlToText(item.summaryHtml, domParser), MAX_SUMMARY_CHARS),
    ...(item.author ? { author: item.author } : {}),
  }
}

/**
 * Retention/cap/summary pass over a list of entries.
 *
 * Shared by the fetched path (prev ∪ fresh) and the carried-over path (prev
 * only): retention is a promise about stored data, not about fetching, so a
 * feed that is not due yet must still be pruned — otherwise a feed declaring a
 * monthly interval would keep entries far past `retentionDays`, which is what
 * the old whole-source refresh used to prevent by accident.
 */
function windowItems(
  items: ReadonlyArray<RssItem>,
  now: number,
  options: FetchRssFeedsOptions,
): RssItem[] {
  return applySummaryWindow(
    capItems(
      sortByPubDateDesc(filterByRetention(items, now, options.retentionMs)),
      options.maxItemsPerFeed,
    ),
    SUMMARY_KEEP_COUNT,
  )
}

/** Fields every returned feed shares, derived from config + the previous entry. */
type FeedBase = { id: string; title: string; url: string; enabled: boolean }

/**
 * Build a feed result without fetching it: everything cached is inherited
 * (entries, schedule state, conditional-request credentials), only the derived
 * labels are refreshed. `clearError` serves the disabled path, which never
 * reported an error.
 */
function carryOver(prev: RssFeed | undefined, base: FeedBase, clearError = false): RssFeed {
  const inherited: RssFeed = prev ?? { ...base, items: [], error: '', fetchedAt: 0 }
  return { ...inherited, ...base, error: clearError ? '' : inherited.error }
}

/** Request headers for one feed, including the validators worth sending. */
function requestHeadersOf(prev: RssFeed | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': RSS_USER_AGENT,
    Accept: RSS_ACCEPT_HEADER,
  }
  // Conditional request, but only after a *successful* fetch: a server that
  // refuses conditional requests must be able to recover, and the failure path
  // cannot persist that decision — a source whose feeds all failed throws, so
  // its result (and any cleared credentials) is discarded. Going unconditional
  // after a failure costs one full download and needs no stored flag.
  if (!prev || prev.error) return headers
  if (prev.etag) headers['If-None-Match'] = prev.etag
  if (prev.lastModified) headers['If-Modified-Since'] = prev.lastModified
  return headers
}

/**
 * The result of looking at one feed, plus whether that involved a request.
 *
 * `attempted` is what keeps the "every feed failed" rule honest: a refresh where
 * nothing was due is a no-op, not a failure.
 */
type FeedAttempt = { feed: RssFeed; attempted: boolean }

/**
 * Fetch one feed. Never rejects: a failure is reported through the feed's
 * `error` field so `mapLimit` keeps the successful results (it is fail-fast).
 */
async function fetchOneFeed(
  runtime: Runtime,
  config: RssFeedConfig,
  prev: RssFeed | undefined,
  options: FetchRssFeedsOptions,
): Promise<FeedAttempt> {
  const id = feedId(config.url)
  const title = () => config.title || prev?.title || hostnameOf(config.url)
  const now = runtime.now()
  const enabled = config.enabled !== false
  const base: FeedBase = { id, title: title(), url: config.url, enabled }

  if (!enabled) {
    // Keep the cached entries (and the read markers that point at them) so
    // re-enabling a feed is instant; `visibleFeeds` filters disabled feeds out.
    return { feed: carryOver(prev, { ...base, enabled: false }, true), attempted: false }
  }

  const schedule = feedSchedule(prev, enabled, options, now)
  if (!schedule.due) {
    // Not due: the feed follows its own (possibly long) interval, or is inside
    // its retry delay. No request — and `fetchedAt` stays put so the next tick
    // agrees with this one.
    return {
      feed: { ...carryOver(prev, base), items: windowItems(prev?.items ?? [], now, options) },
      attempted: false,
    }
  }

  try {
    const response = await requestTextWithHeaders(runtime, config.url, {
      headers: requestHeadersOf(prev),
    })

    if (response.status === 304) {
      // Nothing changed since the last fetch: entries and the declared interval
      // are reused as-is, only the success timestamp and failure bookkeeping move.
      return {
        feed: {
          ...carryOver(prev, base),
          fetchedAt: now,
          attemptedAt: now,
          error: '',
          failureCount: undefined,
          nextRetryAt: undefined,
        },
        attempted: true,
      }
    }

    const domParser = new runtime.DOMParser()
    // Cap while parsing: every entry costs two DOM parses (sanitize + text) and
    // only `maxItemsPerFeed` survive the merge below, so do not pay for the rest.
    const parsed = parseFeed(response.text, domParser, { maxItems: options.maxItemsPerFeed })
    const items = parsed.items.map((item) => toRssItem(item, domParser))

    return {
      feed: {
        ...base,
        title: config.title || parsed.title || prev?.title || hostnameOf(config.url),
        // `now` is the date an entry the feed leaves undated is given — the
        // moment this refresh first saw it (see `mergeFeedItems`).
        items: windowItems(mergeFeedItems(prev?.items ?? [], items, now), now, options),
        error: '',
        fetchedAt: now,
        attemptedAt: now,
        failureCount: undefined,
        nextRetryAt: undefined,
        // The parse result is the truth: a feed that dropped its `<ttl>` falls
        // back to the user's minimum instead of keeping a stale declaration.
        declaredIntervalMs: parsed.declaredIntervalMs,
        // Validators come from the response, never from the previous entry: a
        // 200 without an ETag means the server offers none (and one that only
        // sends validators on unconditional responses would otherwise oscillate).
        etag: headerValue(response.headers, 'etag') || undefined,
        lastModified: headerValue(response.headers, 'last-modified') || undefined,
      },
      attempted: true,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const failureCount = (prev?.failureCount ?? 0) + 1
    return {
      feed: {
        ...carryOver(prev, base),
        // Keep whatever we had: a transient failure must not empty the list.
        // `fetchedAt` stays put — only a success advances it, so a feed that has
        // never succeeded keeps retrying on the ladder below.
        fetchedAt: prev?.fetchedAt ?? 0,
        attemptedAt: now,
        error: message,
        failureCount,
        nextRetryAt: now + feedRetryDelayMs(failureCount),
      },
      attempted: true,
    }
  }
}

/**
 * Fetch every feed that is due and return one `RssFeed` per config entry, in
 * config order. Feeds that are not due are carried over without a request, so
 * this stays cheap when only one feed has new content.
 *
 * Throws only when everything that was actually requested failed, which is what
 * lets `refreshSource` record a `failureCount` and back off instead of caching a
 * wall of errors. A refresh where nothing was due cannot fail: its feeds keep
 * whatever error they already had, and counting those would trip the
 * source-level backoff on every tick without a single request.
 */
export async function fetchRssFeeds(
  runtime: Runtime,
  configs: ReadonlyArray<RssFeedConfig>,
  prevFeeds: ReadonlyArray<RssFeed>,
  options: FetchRssFeedsOptions,
): Promise<RssFeed[]> {
  if (configs.length === 0) return []
  const prevById = new Map(prevFeeds.map((f) => [f.id, f]))
  const attempts = await mapLimit(
    configs,
    (config) => fetchOneFeed(runtime, config, prevById.get(feedId(config.url)), options),
    FEED_FETCH_CONCURRENCY,
  )
  const requested = attempts.filter((attempt) => attempt.attempted)
  if (requested.length > 0 && requested.every((attempt) => attempt.feed.error !== '')) {
    const detail = requested
      .map((attempt) => `${attempt.feed.url}: ${attempt.feed.error}`)
      .join('; ')
    throw new Error(`rss: all feeds failed: ${detail}`)
  }
  return attempts.map((attempt) => attempt.feed)
}

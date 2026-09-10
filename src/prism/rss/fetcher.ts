import type { Runtime } from '../../runtime'
import { mapLimit } from '../shared/concurrency'
import { parseFeed, stripHtmlToText, type FeedItem } from '../shared/feed-parser'
import { requestText } from '../shared/request'
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
import type { RssFeed, RssFeedConfig, RssItem } from './types'

export type FetchRssFeedsOptions = {
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
 * Fetch one feed. Never rejects: a failure is reported through the feed's
 * `error` field so `mapLimit` keeps the successful results (it is fail-fast).
 */
async function fetchOneFeed(
  runtime: Runtime,
  config: RssFeedConfig,
  prev: RssFeed | undefined,
  options: FetchRssFeedsOptions,
): Promise<RssFeed> {
  const id = feedId(config.url)
  const title = () => config.title || prev?.title || hostnameOf(config.url)
  const now = runtime.now()

  if (config.enabled === false) {
    // Keep the cached entries (and the read markers that point at them) so
    // re-enabling a feed is instant; `visibleFeeds` filters disabled feeds out.
    return {
      id,
      title: title(),
      url: config.url,
      items: prev?.items ?? [],
      error: '',
      fetchedAt: prev?.fetchedAt ?? now,
      enabled: false,
    }
  }

  try {
    const xml = await requestText(runtime, config.url, {
      headers: { 'User-Agent': RSS_USER_AGENT, Accept: RSS_ACCEPT_HEADER },
    })
    const domParser = new runtime.DOMParser()
    // Cap while parsing: every entry costs two DOM parses (sanitize + text) and
    // only `maxItemsPerFeed` survive the merge below, so do not pay for the rest.
    const parsed = parseFeed(xml, domParser, { maxItems: options.maxItemsPerFeed })
    const items = parsed.items.map((item) => toRssItem(item, domParser))
    const merged = applySummaryWindow(
      capItems(
        sortByPubDateDesc(
          filterByRetention(mergeFeedItems(prev?.items ?? [], items), now, options.retentionMs),
        ),
        options.maxItemsPerFeed,
      ),
      SUMMARY_KEEP_COUNT,
    )
    return {
      id,
      title: config.title || parsed.title || prev?.title || hostnameOf(config.url),
      url: config.url,
      items: merged,
      error: '',
      fetchedAt: now,
      enabled: true,
    }
  } catch (e) {
    return {
      id,
      title: title(),
      url: config.url,
      // Keep whatever we had: a transient failure must not empty the list.
      items: prev?.items ?? [],
      error: e instanceof Error ? e.message : String(e),
      fetchedAt: prev?.fetchedAt ?? now,
      enabled: true,
    }
  }
}

/**
 * Fetch every enabled feed concurrently (bounded) and return one `RssFeed` per
 * config entry, in config order.
 *
 * Throws only when every feed failed, which is what lets `refreshSource`
 * record a `failureCount` and back off instead of caching a wall of errors.
 */
export async function fetchRssFeeds(
  runtime: Runtime,
  configs: ReadonlyArray<RssFeedConfig>,
  prevFeeds: ReadonlyArray<RssFeed>,
  options: FetchRssFeedsOptions,
): Promise<RssFeed[]> {
  if (configs.length === 0) return []
  const prevById = new Map(prevFeeds.map((f) => [f.id, f]))
  const feeds = await mapLimit(
    configs,
    (config) => fetchOneFeed(runtime, config, prevById.get(feedId(config.url)), options),
    FEED_FETCH_CONCURRENCY,
  )
  if (feeds.every((feed) => feed.error !== '')) {
    const detail = feeds.map((feed) => `${feed.url}: ${feed.error}`).join('; ')
    throw new Error(`rss: all feeds failed: ${detail}`)
  }
  return feeds
}

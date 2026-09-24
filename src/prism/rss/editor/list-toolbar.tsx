import type { RssFeedConfig } from '../types'

/** Which rows the editor shows. */
export const FEED_STATUSES = ['all', 'enabled', 'disabled', 'failing'] as const
export type FeedStatus = (typeof FEED_STATUSES)[number]

export const FEED_STATUS_LABELS: Record<FeedStatus, string> = {
  all: '全部',
  enabled: '已启用',
  disabled: '已停用',
  failing: '至今失败',
}

/** Rows per page — a hundred feeds at once is what made the dialog unusable. */
export const FEEDS_PER_PAGE = 50

/**
 * Rows matching the query and the status filter.
 *
 * The query matches the title *and* the url: a feed the reader knows only by its
 * host has no title yet, and matching on one field alone would hide it.
 *
 * `isFailing` comes from the caller because failure lives in the cache, not in
 * the config — the config cannot tell a broken feed from a healthy one.
 */
export function filterFeeds(
  feeds: ReadonlyArray<RssFeedConfig>,
  query: string,
  status: FeedStatus,
  isFailing: (feed: RssFeedConfig) => boolean = () => false,
): RssFeedConfig[] {
  const needle = query.trim().toLowerCase()
  return feeds.filter((feed) => {
    if (status === 'enabled' && feed.enabled === false) return false
    if (status === 'disabled' && feed.enabled !== false) return false
    if (status === 'failing' && !isFailing(feed)) return false
    if (!needle) return true
    return feed.title.toLowerCase().includes(needle) || feed.url.toLowerCase().includes(needle)
  })
}

/** Paging helpers are shared with the novels editor: see `editor-helpers/list-toolbar`. */
export { pageCount, pageOf } from '../../editor-helpers/list-toolbar'

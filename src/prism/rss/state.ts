import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createExpandedState, createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'
import type { RssFeed, RssItem } from './types'

export type RssState = ItemState<string> & {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Read/hidden/expanded state for RSS entries.
 *
 * TTL is one day longer than the data retention window so a failed fetch never
 * lets state disappear before the entries it refers to (same rule as tnews).
 */
export function createRssState(options: { retentionMs: number }): RssState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('rss'),
    ttlMs: options.retentionMs + ONE_DAY_MS,
  })
  const expanded = createExpandedState()

  return {
    ...itemState,
    ...expanded,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'rss', id)
    },
    clear() {
      itemState.clear()
      expanded.clear()
    },
  }
}

export function unreadItems(feed: RssFeed, state: RssState): RssItem[] {
  return feed.items.filter((item) => !state.isRead(item.id))
}

export function unreadCount(feed: RssFeed, state: RssState): number {
  return unreadItems(feed, state).length
}

export function totalUnread(feeds: ReadonlyArray<RssFeed>, state: RssState): number {
  return feeds.reduce((sum, feed) => sum + unreadCount(feed, state), 0)
}

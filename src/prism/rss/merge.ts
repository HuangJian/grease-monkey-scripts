import { MAX_SUMMARY_CHARS } from './constants'
import type { RssItem } from './types'

/**
 * Union of previously cached entries and freshly parsed ones, keyed by id.
 *
 * A fresh entry wins, except when it arrives without a publish date: some feeds
 * omit `pubDate` on later requests, and dropping the date we already know would
 * make the entry expire instantly under retention filtering.
 */
export function mergeFeedItems(
  prev: ReadonlyArray<RssItem>,
  next: ReadonlyArray<RssItem>,
): RssItem[] {
  const byId = new Map<string, RssItem>()
  for (const item of prev) byId.set(item.id, item)
  for (const item of next) {
    const existing = byId.get(item.id)
    byId.set(
      item.id,
      existing && item.pubDate === 0 ? { ...item, pubDate: existing.pubDate } : item,
    )
  }
  return Array.from(byId.values())
}

/**
 * Drop entries older than the retention window.
 *
 * Entries without a publish date (`pubDate === 0`) are always kept: feeds that
 * omit dates would otherwise lose everything, and `capItems` still bounds how
 * many are stored.
 */
export function filterByRetention(
  items: ReadonlyArray<RssItem>,
  now: number,
  retentionMs: number,
): RssItem[] {
  const cutoff = now - retentionMs
  return items.filter((item) => item.pubDate === 0 || item.pubDate >= cutoff)
}

export function sortByPubDateDesc(items: ReadonlyArray<RssItem>): RssItem[] {
  return [...items].sort((a, b) => b.pubDate - a.pubDate)
}

export function capItems(items: ReadonlyArray<RssItem>, max: number): RssItem[] {
  return items.slice(0, Math.max(0, max))
}

/** Collapse a summary to plain text, appending an ellipsis when truncated. */
export function truncateText(text: string, max: number = MAX_SUMMARY_CHARS): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

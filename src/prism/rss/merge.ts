import { MAX_SUMMARY_CHARS } from './constants'
import type { RssItem } from './types'

/**
 * Union of previously cached entries and freshly parsed ones, keyed by id.
 *
 * A fresh entry wins, except when it arrives without a publish date: some feeds
 * omit `pubDate` on later requests, and dropping the date we already know would
 * make the entry expire instantly under retention filtering.
 *
 * Order matters: entries present in `next` come first, entries only in `prev`
 * follow. Callers sort by date and then cap, so with every date identical (or
 * absent) the cap would otherwise keep the stale head of the list and silently
 * drop everything new — a feed without `pubDate` would freeze at its first 100
 * entries forever.
 */
export function mergeFeedItems(
  prev: ReadonlyArray<RssItem>,
  next: ReadonlyArray<RssItem>,
): RssItem[] {
  const fromPrev = new Map(prev.map((item) => [item.id, item]))
  const merged: RssItem[] = []
  const seen = new Set<string>()
  for (const item of next) {
    const existing = fromPrev.get(item.id)
    merged.push(existing && item.pubDate === 0 ? { ...item, pubDate: existing.pubDate } : item)
    seen.add(item.id)
  }
  for (const item of prev) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
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

/**
 * Keep summaries only for the newest `keep` entries (the input must already be
 * sorted newest-first). Older entries keep title/link/date but drop their
 * summary text, which is what makes the stored payload fit in one GM value —
 * measured in plan R5.3, summaries are ~90% of the bytes.
 *
 * Entries that never had a summary are returned untouched, so a genuinely empty
 * summary is never mislabelled as trimmed.
 */
export function applySummaryWindow(items: ReadonlyArray<RssItem>, keep: number): RssItem[] {
  return items.map((item, index) => {
    if (index < keep || !item.summaryText) return item
    return { ...item, summaryText: '', summaryTrimmed: true }
  })
}

/** Collapse a summary to plain text, appending an ellipsis when truncated. */
export function truncateText(text: string, max: number = MAX_SUMMARY_CHARS): string {
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

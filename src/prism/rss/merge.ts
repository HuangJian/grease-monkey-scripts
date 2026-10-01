import { MAX_SUMMARY_CHARS } from './constants'
import type { RssItem } from './types'

/**
 * Union of previously cached entries and freshly parsed ones, keyed by id.
 *
 * A fresh entry wins, except for its publish date. When it arrives without one
 * (some feeds omit `pubDate` on later requests) the entry keeps the date we
 * already know — dropping it would make the entry expire instantly under
 * retention filtering. An entry we have never seen before is given
 * `firstSeenAt`, the fetch time: `0` may be legal RSS, but downstream it means
 * nothing can place the entry — it sorts last, falls outside every date window,
 * and is exempt from retention forever. The moment the reader's own refresh
 * first saw it is the only date anyone can honestly attach, and it is attached
 * once, so the entry does not drift forward on every later fetch.
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
  /** Fetch time: the publish date given to an entry we have never seen before. */
  firstSeenAt: number,
): RssItem[] {
  const fromPrev = new Map(prev.map((item) => [item.id, item]))
  const merged: RssItem[] = []
  const seen = new Set<string>()
  for (const item of next) {
    seen.add(item.id)
    if (item.pubDate !== 0) {
      merged.push(item)
      continue
    }
    // A cached entry still carrying `0` (written before this stamping existed)
    // takes the same branch: its real first-seen time is gone, so this fetch is
    // the best date available for it.
    const known = fromPrev.get(item.id)?.pubDate ?? 0
    merged.push({ ...item, pubDate: known !== 0 ? known : firstSeenAt })
  }
  for (const item of prev) {
    if (!seen.has(item.id)) merged.push(item)
  }
  return merged
}

/**
 * Drop entries older than the retention window.
 *
 * Entries without a publish date (`pubDate === 0`) are still kept: `mergeFeedItems`
 * now dates everything it fetches, but cache entries written before that survive
 * until the feed that carries them is fetched again, and losing them outright
 * would be worse than keeping them past the window. `capItems` bounds how many.
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

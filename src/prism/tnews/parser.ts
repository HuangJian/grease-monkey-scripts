/**
 * tnews feed adapter.
 *
 * The generic RSS/Atom/RDF parsing lives in `../shared/feed-parser` (shared with
 * the `rss` source); this module only maps generic entries onto `TnewsItem` and
 * keeps tnews's own policy — entries without a publish date are dropped, which
 * the shared parser deliberately does not enforce. See `rss-reader.plan.md` R1.
 */
import { TITLE_FALLBACK_MAX_CHARS } from './constants'
import { parseFeed, type FeedItem } from '../shared/feed-parser'
import type { TnewsItem } from './types'

// Re-exported so existing callers (and `tnews/index.ts`) keep importing from
// here. `sanitizeFeedHtml` defaults to wrapping bare images in an anchor, which
// is exactly what this source's `sanitizeHtml` used to do.
export {
  extractTitle,
  normalizeLink,
  stripHtmlToText,
  sanitizeFeedHtml as sanitizeHtml,
} from '../shared/feed-parser'

function toTnewsItem(item: FeedItem): TnewsItem {
  return {
    id: item.id,
    title: item.title,
    link: item.link,
    pubDate: item.pubDate,
    descriptionHtml: item.summaryHtml,
  }
}

export function parseRssItems(xml: string, domParser: DOMParser): TnewsItem[] {
  const { items } = parseFeed(xml, domParser, { maxTitleChars: TITLE_FALLBACK_MAX_CHARS })
  return items.filter((item) => item.pubDate > 0).map(toTnewsItem)
}

export function mergeByLink(a: ReadonlyArray<TnewsItem>, b: ReadonlyArray<TnewsItem>): TnewsItem[] {
  const byKey = new Map<string, TnewsItem>()
  a.forEach((item) => byKey.set(item.link, item))
  b.forEach((item) => {
    const existing = byKey.get(item.link)
    if (!existing) {
      byKey.set(item.link, item)
      return
    }
    if (item.pubDate > existing.pubDate) {
      byKey.set(item.link, item)
    }
  })
  return Array.from(byKey.values())
}

export function filterByRetention(
  items: ReadonlyArray<TnewsItem>,
  now: number,
  retentionMs: number,
): TnewsItem[] {
  const cutoff = now - retentionMs
  return items.filter((it) => it.pubDate >= cutoff)
}

export function sortByPubDateDesc(items: TnewsItem[]): TnewsItem[] {
  return [...items].sort((a, b) => b.pubDate - a.pubDate)
}

import type { DateFilter } from './date-filter'
import { dateFilterBounds } from './date-filter'

export function formatReplyCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

export function sourceBadge(created: number): { icon: string; title: string } {
  const now = Date.now()
  const isToday = new Date(created).toDateString() === new Date(now).toDateString()
  return isToday ? { icon: '🌅', title: '今日主题' } : { icon: '⏳', title: '历史主题' }
}

/**
 * A usable creation timestamp.
 *
 * Parsers drop items whose timestamp fails this check (`parseV2ex`, xueqiu
 * `fetcher`, tnews `pubDate`), so downstream code only ever sees real ones —
 * the one exception is a legacy cache entry written before that guard existed.
 */
export function hasKnownTimestamp(ts: number | undefined | null): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0
}

/** Earliest of two timestamps, ignoring unknown ones so a stale `0` cannot win. */
export function earliestTimestamp(a: number, b: number): number {
  if (!hasKnownTimestamp(a)) return b
  if (!hasKnownTimestamp(b)) return a
  return Math.min(a, b)
}

/**
 * True when an item has aged past the retention window.
 *
 * `created === 0` also counts as expired on purpose: that is the purge path for
 * historical entries written before the parsers started guaranteeing a real
 * timestamp. Every `pruneExpiredCache` drops them from the cache and clears
 * their state, so a stale `0` cannot linger and poison the date buckets.
 *
 * Live items never hit this branch — parsers substitute the fetch time when the
 * upstream payload omits the timestamp, so nothing fetched can carry `0`.
 */
export function isRetentionExpired(created: number, now: number, retentionMs: number): boolean {
  return now - created >= retentionMs
}

type DateBounds = { start?: number; end?: number }

function matchesDateBounds(created: number, bounds: DateBounds): boolean {
  if (bounds.start !== undefined && created < bounds.start) return false
  if (bounds.end !== undefined && created >= bounds.end) return false
  return true
}

export function applyDateFilter<T>(
  items: T[],
  filter: DateFilter,
  getCreated: (item: T) => number,
): T[] {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds) return items
  return items.filter((item) => matchesDateBounds(getCreated(item), bounds))
}

export function applyGroupedDateFilter<T>(
  data: Record<string, T[]>,
  filter: DateFilter,
  getCreated: (item: T) => number,
): Record<string, T[]> {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds) return data
  return Object.entries(data).reduce<Record<string, T[]>>((result, [key, items]) => {
    const filtered = items.filter((item) => matchesDateBounds(getCreated(item), bounds))
    if (filtered.length > 0) result[key] = filtered
    return result
  }, {})
}

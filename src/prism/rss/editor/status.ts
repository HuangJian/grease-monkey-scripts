import { loadCache } from '../../cache'
import type { Runtime } from '../../../runtime'
import type { RssFeed } from '../types'

/**
 * Fetch state of one configured feed, read from the cache at editor-open time.
 *
 * The config alone cannot answer "is this source healthy?" — only the cache
 * knows when a feed last updated and how long it has been failing.
 */
export type FeedFetchStatus = {
  /** Last **successful** fetch (200/304); 0 = never succeeded. */
  fetchedAt: number
  /** Last attempt, successful or not; 0 = never attempted. */
  attemptedAt: number
  /** Consecutive failures, cleared on success. */
  failureCount: number
  /** Latest failure message; empty when the last attempt succeeded. */
  error: string
}

/** Reads every feed's fetch state out of the cache, keyed by feed url. */
export async function loadFeedStatuses(runtime: Runtime): Promise<Map<string, FeedFetchStatus>> {
  const cached = await loadCache<RssFeed[]>(runtime, 'rss')
  const statuses = new Map<string, FeedFetchStatus>()
  for (const feed of cached?.data ?? []) {
    if (!feed?.url) continue
    statuses.set(feed.url, {
      fetchedAt: feed.fetchedAt ?? 0,
      attemptedAt: feed.attemptedAt ?? 0,
      failureCount: feed.failureCount ?? 0,
      error: feed.error ?? '',
    })
  }
  return statuses
}

/** "刚刚" / "12 分钟前" / "3 小时前" / "2 天前" — the mirror of `formatCountdownLabel`. */
export function formatAgoLabel(elapsedMs: number): string {
  if (elapsedMs < 60_000) return '刚刚'
  const minutes = Math.floor(elapsedMs / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

/** "2 小时" / "3 天" — a span, not a point in time, so it reads inside a sentence. */
function formatSpanLabel(elapsedMs: number): string {
  const minutes = Math.max(1, Math.floor(elapsedMs / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

export type FeedStatusLabel = {
  text: string
  /** Renders in the danger colour and survives the row's muted styling. */
  failed: boolean
  /** Hover text: the failure reason, or when it last tried. */
  detail: string
}

/**
 * One line of status for a feed row.
 *
 * Failing is both rarer and more urgent than "updated a while ago", so it takes
 * the line when both are true. The failing duration is measured from the last
 * **success** — that is the honest answer to "how long has this been broken?",
 * and it is already in the cache; a separate `failingSince` field would need a
 * new codec entry to survive a round trip, for the same number.
 */
export function feedStatusLabel(status: FeedFetchStatus | undefined, now: number): FeedStatusLabel {
  if (!status || (!status.fetchedAt && !status.error)) {
    return { text: '尚未抓取', failed: false, detail: '还没有抓取记录' }
  }
  if (status.error) {
    const since =
      status.fetchedAt > 0 ? `已 ${formatSpanLabel(now - status.fetchedAt)}未成功` : '从未成功'
    return {
      text: `⚠ 失败 ${Math.max(1, status.failureCount)} 次 · ${since}`,
      failed: true,
      detail: status.error,
    }
  }
  const detail =
    status.attemptedAt > 0 ? `最后尝试 ${formatAgoLabel(now - status.attemptedAt)}` : '最后更新未知'
  return { text: `最后更新 ${formatAgoLabel(now - status.fetchedAt)}`, failed: false, detail }
}

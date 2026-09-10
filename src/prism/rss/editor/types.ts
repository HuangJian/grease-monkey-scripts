import type { NumberFieldDef } from '../../editor-helpers'
import {
  DEFAULT_MAX_ITEMS_PER_FEED,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TTL_MINUTES,
  DEFAULT_VIEW_MODE,
} from '../constants'
import type { RssFeedConfig, RssSourceOptions, RssViewMode } from '../types'

export const ADVANCED_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: '刷新间隔', unit: '分钟', min: 1, integer: true },
  { prop: 'retentionDays', name: '保留天数', unit: '天', min: 1, integer: true },
  { prop: 'maxItemsPerFeed', name: '每源条数', min: 1, integer: true },
]

function isViewMode(value: unknown): value is RssViewMode {
  return value === 'grouped' || value === 'timeline'
}

function sanitizeFeed(raw: unknown): RssFeedConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const url = record['url']
  if (typeof url !== 'string' || !url.trim()) return undefined
  const enabled = record['enabled']
  return {
    url: url.trim(),
    title: typeof record['title'] === 'string' ? record['title'] : '',
    ...(typeof enabled === 'boolean' ? { enabled } : {}),
  }
}

/**
 * Read a bounded number, falling back when the value is missing or unusable.
 *
 * `numberOrDefault` accepts `NaN`/`Infinity`, and a negative TTL or item cap is
 * as broken as a missing one (a negative TTL refreshes on every render, a zero
 * cap empties every feed). The minimum mirrors the editor's own validation.
 */
function boundedNumber(value: unknown, fallback: number, min: number): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.round(raw))
}

/** Reads the configured feeds, dropping malformed rows instead of failing the section. */
export function coerceRssFeeds(
  section: Record<string, unknown> | null | undefined,
  fallback: RssFeedConfig[],
): RssFeedConfig[] {
  if (!Array.isArray(section?.['feeds'])) return fallback
  const feeds: RssFeedConfig[] = []
  const seen = new Set<string>()
  // Two rows for one url would yield two feeds with the same id (duplicate keys,
  // a double fetch). The add-form and the OPML import already dedupe, so this
  // only guards hand-edited config.
  for (const raw of section['feeds'] as unknown[]) {
    const feed = sanitizeFeed(raw)
    if (!feed || seen.has(feed.url)) continue
    seen.add(feed.url)
    feeds.push(feed)
  }
  return feeds.length > 0 || section!['feeds'].length === 0 ? feeds : fallback
}

export function coerceRssOptions(
  raw: Record<string, unknown>,
  fallback: RssSourceOptions,
): RssSourceOptions {
  const viewMode = raw['viewMode']
  return {
    feeds: coerceRssFeeds(raw, fallback.feeds),
    ttlMinutes: boundedNumber(raw['ttlMinutes'], fallback.ttlMinutes, 1),
    retentionDays: boundedNumber(raw['retentionDays'], fallback.retentionDays, 1),
    maxItemsPerFeed: boundedNumber(raw['maxItemsPerFeed'], fallback.maxItemsPerFeed, 1),
    viewMode: isViewMode(viewMode) ? viewMode : fallback.viewMode,
  }
}

export const DEFAULT_RSS_OPTIONS: RssSourceOptions = {
  feeds: [],
  ttlMinutes: DEFAULT_TTL_MINUTES,
  retentionDays: DEFAULT_RETENTION_DAYS,
  maxItemsPerFeed: DEFAULT_MAX_ITEMS_PER_FEED,
  viewMode: DEFAULT_VIEW_MODE as RssViewMode,
}

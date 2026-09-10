import { numberOrDefault } from '../../../utils'
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

/** Reads the configured feeds, dropping malformed rows instead of failing the section. */
export function coerceRssFeeds(
  section: Record<string, unknown> | null | undefined,
  fallback: RssFeedConfig[],
): RssFeedConfig[] {
  if (!Array.isArray(section?.['feeds'])) return fallback
  const feeds = (section['feeds'] as unknown[])
    .map(sanitizeFeed)
    .filter((f): f is RssFeedConfig => !!f)
  return feeds.length > 0 || section!['feeds'].length === 0 ? feeds : fallback
}

export function coerceRssOptions(
  raw: Record<string, unknown>,
  fallback: RssSourceOptions,
): RssSourceOptions {
  const viewMode = raw['viewMode']
  return {
    feeds: coerceRssFeeds(raw, fallback.feeds),
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
    maxItemsPerFeed: numberOrDefault(raw['maxItemsPerFeed'], fallback.maxItemsPerFeed),
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

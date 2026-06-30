import type { CachedSource } from './types'
import type { DateFilter } from './date-filter'
import { applyDateFilter, applyGroupedDateFilter } from './shared-utils'
import type { V2exTopic } from './v2ex/types'
import type { RedditPost } from './reddit/types'
import type { HupuPost } from './hupu/types'
import type { TnewsItem } from './tnews/types'
import type { XueqiuNewsItem, XueqiuRenderData } from './xueqiu/types'

// ── Types ──

export type ReadState = Record<string, { r?: number; h?: number; n?: number }>

export type KeyCategory = 'cache' | 'state' | 'tags'

export type KeyDescription = {
  category: KeyCategory
  label: string
  sourceId?: string
}

// ── Key classification ──

const KEY_PREFIX = 'dashboard:v2'
const CACHE_KEY_PREFIX = `${KEY_PREFIX}:`
const STATE_KEY_PREFIX = `${KEY_PREFIX}:state:`
const LOCK_KEY_PREFIX = `${KEY_PREFIX}:lock:`

const TAG_KEY_LABELS: Record<string, string> = {
  v2ex_author_tags: 'V2EX 作者标签',
  reddit_author_tags: 'Reddit 作者标签',
  hupu_author_tags: '虎扑 作者标签',
  author_tags: '作者标签',
}

const SOURCE_LABELS: Record<string, string> = {
  v2ex: 'V2EX',
  reddit: 'Reddit',
  hupu: '虎扑',
  tnews: '竹新社',
  'xueqiu-news': '雪球新闻',
  'xueqiu-hot': '雪球热帖',
  weather: '天气',
  novels: '网文更新',
  misc: '杂项',
}

const EXACT_EXCLUDED_KEYS = new Set([
  `${KEY_PREFIX}:config`,
  `${KEY_PREFIX}:xit`,
  `${KEY_PREFIX}:xit-filters`,
])

export function isExcludedKey(key: string): boolean {
  if (EXACT_EXCLUDED_KEYS.has(key)) return true
  if (key.startsWith(LOCK_KEY_PREFIX)) return true
  if (key.startsWith('gm:misc:')) return true
  return false
}

export function describeKey(key: string): KeyDescription | null {
  if (isExcludedKey(key)) return null

  if (key in TAG_KEY_LABELS) {
    return { category: 'tags', label: TAG_KEY_LABELS[key]! }
  }

  if (key.startsWith(STATE_KEY_PREFIX)) {
    const sourceId = key.slice(STATE_KEY_PREFIX.length)
    const label = SOURCE_LABELS[sourceId] ?? sourceId
    return { category: 'state', label: `${label} 状态`, sourceId }
  }

  if (key.startsWith(CACHE_KEY_PREFIX)) {
    const sourceId = key.slice(CACHE_KEY_PREFIX.length)
    const label = SOURCE_LABELS[sourceId] ?? sourceId
    return { category: 'cache', label: `${label} 缓存`, sourceId }
  }

  return null
}

// ── State source mapping ──

export function stateKeyForCache(cacheKey: string): string | null {
  const desc = describeKey(cacheKey)
  if (desc?.category !== 'cache' || !desc.sourceId) return null
  const stateSourceId = stateSourceIdFor(desc.sourceId)
  if (!stateSourceId) return null
  return STATE_KEY_PREFIX + stateSourceId
}

function stateSourceIdFor(cacheSourceId: string): string | null {
  if (cacheSourceId === 'weather' || cacheSourceId === 'novels' || cacheSourceId === 'misc') {
    return null
  }
  if (cacheSourceId === 'xueqiu-news' || cacheSourceId === 'xueqiu-hot') {
    return 'xueqiu'
  }
  return cacheSourceId
}

// ── Xueqiu dual-source ──

export const XUEQIU_NEWS_CACHE_KEY = 'dashboard:v2:xueqiu-news'
export const XUEQIU_HOT_CACHE_KEY = 'dashboard:v2:xueqiu-hot'
const XUEQIU_STATE_KEY = `${STATE_KEY_PREFIX}xueqiu`

/** xueqiu-hot data lives inside xueqiu-news cache (dual-source single-fetch). */
export function isXueqiuHotKey(key: string): boolean {
  return key === XUEQIU_HOT_CACHE_KEY
}

/** If xueqiu-news cache exists, the hot companion should appear in the list too. */
export function getXueqiuCompanionKey(key: string): string | null {
  if (key === XUEQIU_NEWS_CACHE_KEY) return XUEQIU_HOT_CACHE_KEY
  return null
}

// ── Cache filters ──

function isRead(readState: ReadState | null, id: string): boolean {
  if (!readState) return false
  const entry = readState[id]
  return entry != null && entry.r != null
}

type CacheFilter = (
  data: unknown,
  filter: DateFilter,
  filterUnread: boolean,
  readState: ReadState | null,
) => unknown

const v2exFilter: CacheFilter = (data, filter, filterUnread, readState) => {
  const items = data as V2exTopic[]
  if (!Array.isArray(items)) return data
  if (filterUnread) {
    return items.filter((t) => !isRead(readState, String(t.id)))
  }
  return applyDateFilter(items, filter, (t) => t.created)
}

const redditFilter: CacheFilter = (data, filter, filterUnread, readState) => {
  const groups = data as Record<string, RedditPost[]>
  if (!groups || typeof groups !== 'object') return data
  if (filterUnread) {
    return Object.entries(groups).reduce<Record<string, RedditPost[]>>((acc, [sub, posts]) => {
      const unread = posts.filter((p) => !isRead(readState, p.id))
      if (unread.length > 0) acc[sub] = unread
      return acc
    }, {})
  }
  return applyGroupedDateFilter(groups, filter, (t) => t.created)
}

const hupuFilter: CacheFilter = (data, filter, filterUnread, readState) => {
  const groups = data as Record<string, HupuPost[]>
  if (!groups || typeof groups !== 'object') return data
  if (filterUnread) {
    return Object.entries(groups).reduce<Record<string, HupuPost[]>>((acc, [board, posts]) => {
      const unread = posts.filter((p) => !isRead(readState, p.id))
      if (unread.length > 0) acc[board] = unread
      return acc
    }, {})
  }
  return applyGroupedDateFilter(groups, filter, (t) => t.created)
}

const tnewsFilter: CacheFilter = (data, filter, filterUnread, readState) => {
  const items = data as TnewsItem[]
  if (!Array.isArray(items)) return data
  if (filterUnread) {
    return items.filter((it) => !isRead(readState, it.id))
  }
  return applyDateFilter(items, filter, (it) => it.pubDate)
}

function filterXueqiuItems(
  items: XueqiuNewsItem[] | undefined,
  filter: DateFilter,
  filterUnread: boolean,
  readState: ReadState | null,
): XueqiuNewsItem[] | undefined {
  if (!Array.isArray(items)) return items
  if (filterUnread) {
    return items.filter((it) => !isRead(readState, String(it.id)))
  }
  return applyDateFilter(items, filter, (it) => it.created_at)
}

const CACHE_FILTERS: Record<string, CacheFilter> = {
  v2ex: v2exFilter,
  reddit: redditFilter,
  hupu: hupuFilter,
  tnews: tnewsFilter,
}

function filterCacheData(
  sourceId: string,
  data: unknown,
  filter: DateFilter,
  filterUnread: boolean,
  readState: ReadState | null,
): unknown {
  const filterFn = CACHE_FILTERS[sourceId]
  if (!filterFn) return data
  return filterFn(data, filter, filterUnread, readState)
}

// ── Build save data ──

function isCachedSource(value: unknown): value is CachedSource<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CachedSource<unknown>).fetchedAt === 'number'
  )
}

export function buildSaveData(
  selectedKeys: string[],
  values: ReadonlyMap<string, unknown>,
  filter: DateFilter,
  filterUnread: boolean,
  readStates: ReadonlyMap<string, ReadState | null>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const skipKeys = new Set<string>()

  // Xueqiu dual-source: news and hotPosts are both stored under xueqiu-news.
  // xueqiu-hot is a virtual key that controls whether hotPosts is included.
  const hasXueqiuNews = selectedKeys.includes(XUEQIU_NEWS_CACHE_KEY)
  const hasXueqiuHot = selectedKeys.includes(XUEQIU_HOT_CACHE_KEY)
  if (hasXueqiuNews || hasXueqiuHot) {
    skipKeys.add(XUEQIU_NEWS_CACHE_KEY)
    skipKeys.add(XUEQIU_HOT_CACHE_KEY)
    const xueqiuValue = values.get(XUEQIU_NEWS_CACHE_KEY)
    if (xueqiuValue && isCachedSource(xueqiuValue)) {
      const readState = readStates.get(XUEQIU_STATE_KEY) ?? null
      const data = xueqiuValue.data as XueqiuRenderData | null
      const news = hasXueqiuNews
        ? (filterXueqiuItems(data?.news, filter, filterUnread, readState) ?? [])
        : []
      const hotPosts = hasXueqiuHot
        ? (filterXueqiuItems(data?.hotPosts, filter, filterUnread, readState) ?? [])
        : []
      result[XUEQIU_NEWS_CACHE_KEY] = { ...xueqiuValue, data: { news, hotPosts } }
    }
  }

  for (const key of selectedKeys) {
    if (skipKeys.has(key)) continue
    const value = values.get(key)
    if (value === undefined || value === null) continue
    const desc = describeKey(key)
    if (desc?.category === 'cache' && desc.sourceId && isCachedSource(value)) {
      const stateKey = stateKeyForCache(key)
      const readState = stateKey ? (readStates.get(stateKey) ?? null) : null
      const filteredData = filterCacheData(
        desc.sourceId,
        value.data,
        filter,
        filterUnread,
        readState,
      )
      result[key] = { ...value, data: filteredData }
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * Xueqiu data fetcher.
 *
 * Fetches hot posts and 7x24 news from xueqiu.com via direct API calls.
 *
 * - HOT (/statuses/hot/listV3.json): WAF-protected, uses page-context fetch
 *   (runtime.pageFetch) with page-based pagination (page=1,2,3…).
 * - NEWS (/statuses/livenews/list.json): no WAF, uses GM_xmlhttpRequest
 *   (runtime.request) with cursor-based pagination (max_id from next_max_id).
 *
 * Test script: scripts/fetchers/xueqiu-api-test.user.js
 */
import { loadCache } from '../cache'
import type { Runtime } from '../../runtime'
import type { XueqiuRenderData, XueqiuNewsItem, XueqiuSourceOptions } from './types'

// ---- API types ----

type ApiItem = Record<string, unknown> & { id: number }

type ApiResponse = {
  list?: ApiItem[]
  items?: ApiItem[]
  has_next_page?: boolean
  next_max_id?: number | null
  next_id?: number | null
}

// ---- API item to XueqiuNewsItem mapping ----

function toNewsItem(item: ApiItem): XueqiuNewsItem {
  return {
    id: item.id,
    title: String(item.title ?? ''),
    text: String(item.text ?? item.description ?? ''),
    description: String(item.description ?? ''),
    target: String(item.target ?? `/status/${item.id}`),
    created_at: Number(item.created_at ?? 0),
    status_id: Number(item.status_id ?? item.id),
    reply_count: Number(item.reply_count ?? 0),
    like_count: Number(item.like_count ?? item.fav_count ?? 0),
    share_count: Number(item.share_count ?? item.retweet_count ?? 0),
    view_count: Number(item.view_count ?? 0),
    sub_type: Number(item.sub_type ?? item.type ?? 0),
  }
}

// ---- Constants ----

const API_BASE = 'https://xueqiu.com'
const HOT_URL = `${API_BASE}/statuses/hot/listV3.json`
const NEWS_URL = `${API_BASE}/statuses/livenews/list.json`
const MAX_ROUNDS = 30
const REQUEST_DELAY_MS = 3000
const REQUEST_DELAY_VARIANCE = 0.4

// ---- Fetch helpers ----

function waitJitter(baseMs: number, variance = REQUEST_DELAY_VARIANCE): Promise<void> {
  const ms = baseMs * (1 - variance + Math.random() * variance * 2)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** GM_xmlhttpRequest wrapper — for NEWS endpoint (no WAF). */
function gmFetchJson(runtime: Runtime, url: string): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    runtime.request({
      method: 'GET',
      url,
      timeout: 15000,
      onload: (res) => {
        if (res.status !== 200) {
          reject(new Error(`HTTP ${res.status} for ${url}`))
          return
        }
        try {
          resolve(JSON.parse(res.responseText) as ApiResponse)
        } catch (e) {
          reject(new Error(`JSON parse failed for ${url}: ${(e as Error).message}`))
        }
      },
      onerror: () => reject(new Error(`Network error for ${url}`)),
      ontimeout: () => reject(new Error(`Timeout for ${url}`)),
    })
  })
}

/** Page-context fetch — for HOT endpoint (WAF-protected). */
async function pageFetchJson(runtime: Runtime, url: string): Promise<ApiResponse> {
  return (await runtime.pageFetch(url)) as ApiResponse
}

// ---- Dedup ----

function dedupById(items: XueqiuNewsItem[]): XueqiuNewsItem[] {
  const seen = new Set<number>()
  const result: XueqiuNewsItem[] = []
  items.forEach((item) => {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      result.push(item)
    }
  })
  return result
}

// ---- Early exit logic (exported for testing) ----

export function shouldEarlyExit(
  _mode: 'news' | 'hot',
  asNewsItems: XueqiuNewsItem[],
  knownIds: Set<number>,
): boolean {
  return asNewsItems.every((item) => knownIds.has(item.id))
}

// ---- Fetch logic for one source ----

async function fetchSource(
  runtime: Runtime,
  mode: 'news' | 'hot',
  knownIds: Set<number>,
): Promise<XueqiuNewsItem[]> {
  const fetchFn = mode === 'hot' ? pageFetchJson : gmFetchJson
  const all: XueqiuNewsItem[] = []
  let nextMaxId: number | null = null

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    // Build URL per pagination mode
    let url: string
    if (mode === 'hot') {
      url = `${HOT_URL}?page=${round}`
    } else {
      url = NEWS_URL
      if (nextMaxId) url += `?max_id=${nextMaxId}`
    }

    // Fetch — first round failure is fatal, subsequent rounds just stop
    let data: ApiResponse
    try {
      data = await fetchFn(runtime, url)
    } catch (e) {
      if (round === 1) throw e
      console.warn(`[gm-xueqiu] ${mode} round ${round} failed: ${(e as Error).message}`)
      break
    }

    const batch = data.list || data.items || []
    if (batch.length === 0) break

    // Convert and filter out already-known IDs
    const asNewsItems = batch.map(toNewsItem)
    const newItems: XueqiuNewsItem[] = []
    const seen = new Set<number>()
    asNewsItems.forEach((item) => {
      if (!seen.has(item.id)) {
        seen.add(item.id)
        if (!knownIds.has(item.id)) {
          newItems.push(item)
        }
      }
    })

    if (newItems.length === 0) break

    all.push(...newItems)
    newItems.forEach((item) => knownIds.add(item.id))

    if (shouldEarlyExit(mode, asNewsItems, knownIds)) break

    // Update pagination cursor
    if (mode === 'news') {
      nextMaxId = data.next_max_id ?? data.next_id ?? null
      if (!nextMaxId) break
    } else if (data.has_next_page === false) {
      break
    }

    await waitJitter(REQUEST_DELAY_MS)
  }

  return dedupById(all)
}

// ---- Public API ----

export async function fetchXueqiu(
  runtime: Runtime,
  _options: XueqiuSourceOptions,
): Promise<XueqiuRenderData> {
  const cached = await loadCache<XueqiuRenderData>(runtime, 'xueqiu-news')
  const newsKnownIds = new Set<number>()
  const hotKnownIds = new Set<number>()
  if (cached?.data) {
    cached.data.news.forEach((item) => newsKnownIds.add(item.id))
    cached.data.hotPosts.forEach((item) => hotKnownIds.add(item.id))
  }

  const news = await fetchSource(runtime, 'news', newsKnownIds)
  const hotPosts = await fetchSource(runtime, 'hot', hotKnownIds)

  return { news, hotPosts }
}

import type { Runtime } from '../../runtime'
import { HOT_API_BASE, HOT_PAGE_URL } from './constants'
import {
  getTodayStart,
  mergeV2exTopics,
  parseV2ex,
  parseV2exHotPage,
  sortByDecayedScore,
} from './parser'
import type { V2exState } from './state'
import type { V2exCountOptions, V2exTopic } from './types'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * V2EX 热门话题抓取算法
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  后续 agent 注意：修改算法时必须同步更新本注释，不要删除！
 *
 * ── 阶段 1：并行抓取 ──────────────────────────────────────────────────────
 *   两个数据源同时请求（Promise.all）：
 *   ① API  (hot.json)          → parseV2ex()   解析 JSON，提取 id/title/url/replies/created
 *   ② Page (www.v2ex.com/?tab=hot) → parseV2exHotPage() 解析 HTML，提取 DOM 节点信息
 *
 *   任一数据源失败不阻塞；仅当 API 和 Page 同时失败时抛出错误。
 *
 * ── 阶段 2：双源融合去重 ─────────────────────────────────────────────────
 *   mergeV2exTopics(apiTopics, pageTopics) 执行：
 *   ① 以 id 为 key 建 Map
 *   ② 同 id 话题取 Math.max(replies)，标记 sources: ['api','page']
 *   ③ 页面源且 created < 今日 0:00 → sources 改为 ['api']（自动晋升）
 *   ④ 仅 API 源的话题被丢弃（dropApiOnly=true）
 *
 *   然后将历史话题中不在当前结果集内的条目合入（标记 sources: ['api']）。
 *
 * ── 阶段 3：门槛过滤 ────────────────────────────────────────────────────
 *   两条规则按顺序执行：
 *   ① 旧话题 (created < 今日 0:00)：replies < olderMinReplies → 移除
 *   ② 今日页面独占话题 (sources=['page'] 且 created ≥ 今日 0:00)：replies < todayMinReplies → 移除
 *
 *   API 源话题不受门槛过滤（仅 API 源的话题已在阶段 2 被丢弃）。
 *
 * ── 阶段 4：衰减排序 ────────────────────────────────────────────────────
 *   sortByDecayedScore(topics, now, halfLifeDays)：
 *   score = replies × exp(-days × ln2 / halfLifeDays)
 *   - days = (now - created) / 86400000
 *   - created 缺失时 days = 0（视为最新）
 *   - replies ≤ 0 → score = 0
 *   同分时双源确认 (sources.length > 1) 优先
 *   不做截断，全部返回
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

type FetchOutcome = { topics: V2exTopic[]; error?: string }

function fetchFromEndpoint(
  runtime: Runtime,
  url: string,
  parse: (body: string) => V2exTopic[],
): Promise<FetchOutcome> {
  return new Promise<FetchOutcome>((resolve) => {
    let settled = false
    const settle = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      resolve(outcome)
    }
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      anonymous: true,
      onload(response) {
        try {
          settle({ topics: parse(response.responseText) })
        } catch (e) {
          settle({ topics: [], error: e instanceof Error ? e.message : String(e) })
        }
      },
      onerror: () => settle({ topics: [], error: 'network error' }),
      ontimeout: () => settle({ topics: [], error: 'timeout' }),
    })
  })
}

export async function fetchV2ex(
  runtime: Runtime,
  countOptions: V2exCountOptions,
  domParser: DOMParser,
  state: V2exState,
  prevById?: Map<number, V2exTopic>,
): Promise<V2exTopic[]> {
  const [apiResult, pageResult] = await Promise.all([
    fetchFromEndpoint(runtime, `${HOT_API_BASE}?_t=${Date.now()}`, (body) => {
      const json: unknown = JSON.parse(body)
      return parseV2ex(json, Number.POSITIVE_INFINITY)
    }),
    fetchFromEndpoint(runtime, HOT_PAGE_URL, (body) =>
      parseV2exHotPage(body, Number.POSITIVE_INFINITY, domParser),
    ),
  ])

  console.debug(
    `[v2ex-fetch] api${apiResult.error ? `(err:${apiResult.error})` : ''}: ${apiResult.topics.length} topics ` +
      `| page${pageResult.error ? `(err:${pageResult.error})` : ''}: ${pageResult.topics.length} topics`,
  )

  if (apiResult.error && pageResult.error) {
    throw new Error(`v2ex api: ${apiResult.error}; v2ex page: ${pageResult.error}`)
  }

  let full = mergeV2exTopics(apiResult.topics, pageResult.topics, false)

  if (prevById && prevById.size > 0) {
    const currentIds = new Set(full.map((t) => t.id))
    const recovered: V2exTopic[] = []
    prevById.forEach((prev) => {
      if (currentIds.has(prev.id)) return
      recovered.push({
        ...prev,
        sources: ['api'] as const,
      })
    })
    if (recovered.length > 0) {
      full = mergeV2exTopics(recovered, full, false)
    }
  }

  const todayStartMs = getTodayStart().getTime()
  const now = Date.now()

  full = full.filter((t) => {
    if (t.created !== undefined && t.created < todayStartMs) {
      if (t.replies < countOptions.olderMinReplies) return false
    }
    if (
      t.created !== undefined &&
      t.created >= todayStartMs &&
      t.sources?.length === 1 &&
      t.sources[0] === 'page' &&
      t.replies < countOptions.todayMinReplies
    ) {
      return false
    }
    return true
  })

  full = sortByDecayedScore(full, now, countOptions.ageHalfLifeDays)

  console.debug(`[v2ex-merge] merged=${full.length}`)

  return full
}

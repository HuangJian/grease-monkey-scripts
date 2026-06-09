import { dynamicCount } from '../dynamic-count'
import { htmlToDocument, toAbsoluteUrl } from '../../utils'
import { HOT_PAGE_URL, MEMBER_PATH_RE, TOPIC_PATH_RE } from './constants'
import type { V2exCountOptions, V2exTopic } from './types'

export function parseV2ex(json: unknown, maxItems: number): V2exTopic[] {
  if (!Array.isArray(json)) return []
  const topics: V2exTopic[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const id = typeof t.id === 'number' ? t.id : Number(t.id)
    const title = typeof t.title === 'string' ? t.title : ''
    const url = typeof t.url === 'string' ? t.url : ''
    const replies = typeof t.replies === 'number' ? t.replies : Number(t.replies ?? 0)
    // V2EX API returns created as Unix seconds; convert to ms for internal consistency
    const created = typeof t.created === 'number' ? t.created * 1000 : Number(t.created ?? 0) * 1000
    const memberObj = t.member as Record<string, unknown> | undefined
    const nodeObj = t.node as Record<string, unknown> | undefined
    const member =
      memberObj && typeof memberObj.username === 'string'
        ? { username: memberObj.username }
        : { username: '' }
    const node =
      nodeObj && typeof nodeObj.title === 'string' ? { title: nodeObj.title } : { title: '' }
    if (!Number.isFinite(id) || id <= 0) continue
    if (!title || !url) continue
    topics.push({
      id,
      title,
      url,
      replies,
      member,
      node,
      sources: [],
      created: Number.isFinite(created) && created > 0 ? created : undefined,
    })
    if (topics.length >= maxItems) break
  }
  return topics
}

export function parseCreatedFromTitle(titleAttr: string): number | undefined {
  const match = titleAttr.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) ([+-]\d{2}):(\d{2})$/)
  if (!match) return undefined
  const [, datetime, tzSign, tzMinutes] = match
  const base = Date.parse(`${datetime.replace(' ', 'T')}${tzSign}:${tzMinutes}`)
  return Number.isFinite(base) ? base : undefined
}

export function parseV2exHotPage(
  html: string,
  maxItems: number,
  domParser: DOMParser,
): V2exTopic[] {
  if (!html) return []
  const doc = htmlToDocument(html, domParser)
  const rows = doc.querySelectorAll('.cell.item')
  const topics: V2exTopic[] = []
  for (const row of rows) {
    const linkEl = row.querySelector('a.topic-link')
    if (!linkEl) continue
    const href = linkEl.getAttribute('href') ?? ''
    const idMatch = href.match(TOPIC_PATH_RE)
    if (!idMatch) continue
    const id = Number(idMatch[1])
    if (!Number.isFinite(id) || id <= 0) continue
    const title = (linkEl.textContent ?? '').trim()
    if (!title) continue
    const url = toAbsoluteUrl(href, HOT_PAGE_URL) || href
    const authorLink = row.querySelector('a[href^="/member/"]')
    const usernameMatch = authorLink?.getAttribute('href')?.match(MEMBER_PATH_RE)
    const username = usernameMatch ? usernameMatch[1] : ''
    const nodeLink = row.querySelector('a.node[href^="/go/"]')
    const nodeTitle = (nodeLink?.textContent ?? '').trim()
    const countEl = row.querySelector('[class^="count_"]')
    const repliesText = countEl?.textContent?.trim() ?? '0'
    const replies = Number(repliesText)
    const timeEl = row.querySelector('.topic_info > span[title]')
    const created = timeEl ? parseCreatedFromTitle(timeEl.getAttribute('title') ?? '') : undefined
    topics.push({
      id,
      title,
      url,
      replies: Number.isFinite(replies) ? replies : 0,
      member: { username },
      node: { title: nodeTitle },
      sources: [],
      created,
    })
    if (topics.length >= maxItems) break
  }
  return topics
}

/**
 * V2EX 热帖排序算法设计文档
 *
 * ============================================================
 * 核心目标：在"新鲜度"与"热度"之间找到平衡
 * ============================================================
 *
 * 1. 双源融合去重
 *    - API源: /api/topics/hot.json (24小时热帖，含created时间戳)
 *    - 页面源: /?tab=hot (今日热帖，HTML解析获取created)
 *    - 同ID话题取最大回复数，标记sources: ['api','page']为双源确认
 *
 * 2. 自动晋升机制 (mergeV2exTopics中)
 *    - 页面源且created < 今日0:00 UTC → sources改为['api']
 *    - 这让昨天的热帖在今日仍能以"API历史热帖"身份展示
 *
 * 3. 指数衰减排序 (computeSortScore / sortByDecayedScore)
 *    公式: score = replies * exp(-days * λ)
 *    其中 λ = ln(2) / halfLifeDays
 *
 *    halfLifeDays (可配置，默认2天) 控制衰减速度:
 *    - 1天前: factor = 0.5^(1/2) ≈ 0.707
 *    - 2天前: factor = 0.5
 *    - 3天前: factor = 0.354
 *
 *    典型场景验证 (halfLifeDays=2):
 *    - 100回复/昨天 → 70.7
 *    - 30回复/今天 → 30.0  ✓ 昨天热帖优先
 *    - 50回复/昨天 → 35.4
 *    - 10回复/今天 → 10.0  ✓ 昨天中热帖优于今日冷帖
 *    - 117回复/昨天 → 82.7
 *    - 20回复/今天 → 20.0  ✓ 高热旧帖压制低热新帖
 *
 *    无created话题: days=0 (不衰减)，兜底按原始回复数
 *    同分回退: 双源优先 > API索引 > 页面索引
 *
 * 4. 动态截断计数 (dynamicV2exCount)
 *    两个并行指标取最大:
 *    - 阈值法: leader * displayRatio 为截断线，计数≥线的话题数
 *    - 拐点法: 相对跌幅 > elbowDropRatio 视为长尾起点
 *    最终 clamp 到 [minItems, maxItems]
 *
 * ============================================================
 * 参数调优指南
 * ============================================================
 * - 想让旧热帖更有优势 → 增大 ageHalfLifeDays (如 3)
 * - 想让新帖更容易上榜 → 减小 ageHalfLifeDays (如 1.5)
 * - 想显示更多样本 → 增大 maxItems
 * - 想过滤水贴 → 增大 minReplies / displayRatio
 */

export function mergeV2exTopics(
  apiTopics: V2exTopic[],
  pageTopics: V2exTopic[],
  dropApiOnly = true,
): V2exTopic[] {
  const byId = new Map<number, V2exTopic>()

  apiTopics.forEach((topic) => {
    if (!Number.isFinite(topic.id) || topic.id <= 0) return
    byId.set(topic.id, { ...topic, sources: topic.sources?.length ? [...topic.sources] : ['api'] })
  })

  pageTopics.forEach((topic) => {
    if (!Number.isFinite(topic.id) || topic.id <= 0) return
    const existing = byId.get(topic.id)
    if (existing) {
      byId.set(topic.id, {
        ...existing,
        replies: Math.max(existing.replies, topic.replies),
        sources: ['api', 'page'],
        created: existing.created ?? topic.created,
      })
    } else {
      byId.set(topic.id, { ...topic, sources: ['page'] })
    }
  })

  const now = Date.now()
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayStartMs = todayStart.getTime()

  for (const topic of byId.values()) {
    if (topic.sources?.length === 1 && topic.sources[0] === 'page' && topic.created !== undefined) {
      if (topic.created < todayStartMs) {
        topic.sources = ['api']
      }
    }
  }

  const filtered = Array.from(byId.values()).filter((topic) => {
    if (
      dropApiOnly &&
      topic.sources?.includes('page') === false &&
      topic.sources?.includes('api') === true
    ) {
      return false
    }
    return true
  })

  return filtered
}

/**
 * 计算单个话题的衰减后排序分数
 * score = replies * exp(-days * ln(2) / halfLifeDays)
 *       = replies * 0.5^(days / halfLifeDays)
 *
 * @param topic  话题数据，需包含 replies 与 created(毫秒时间戳)
 * @param now    当前时间毫秒戳
 * @param halfLifeDays 半衰期(天)，默认2。每经过 halfLifeDays 天，热度减半
 * @returns 衰减后的综合分数，越大越靠前
 */
export function computeSortScore(topic: V2exTopic, now: number, halfLifeDays: number): number {
  if (!Number.isFinite(topic.replies) || topic.replies <= 0) return 0
  let days = 0
  if (topic.created !== undefined && Number.isFinite(topic.created) && topic.created > 0) {
    days = (now - topic.created) / (24 * 60 * 60 * 1000)
  }
  if (days < 0) days = 0
  const lambda = Math.log(2) / halfLifeDays
  return topic.replies * Math.exp(-days * lambda)
}

/**
 * 按衰减分数排序，同分时双源优先
 * 同分回退: 双源话题优先。不再使用 apiIndex/pageIndex，因为指数衰减已隐含时间信息
 */
export function sortByDecayedScore(
  topics: V2exTopic[],
  now: number,
  halfLifeDays: number,
): V2exTopic[] {
  return [...topics].sort((a, b) => {
    const scoreA = computeSortScore(a, now, halfLifeDays)
    const scoreB = computeSortScore(b, now, halfLifeDays)
    if (scoreB !== scoreA) return scoreB - scoreA
    const aCross = (a.sources?.length ?? 0) > 1 ? 1 : 0
    const bCross = (b.sources?.length ?? 0) > 1 ? 1 : 0
    return bCross - aCross
  })
}

/**
 * 动态计算显示条数 - 双指标并行取最大
 *
 * 设计动机: 热度分布长尾差异大，单一阈值难以通用
 *   - 均匀分布(如 100,90,80...): 阈值法生效
 *   - 断崖分布(如 500,100,20...): 拐点法生效
 *
 * 指标1 - 阈值法 (thresholdCount):
 *   cutoff = max(leader * displayRatio, minReplies)
 *   计数回复数 ≥ cutoff 的话题数
 *   displayRatio默认0.1 → 头部10%为线
 *
 * 指标2 - 拐点法 (elbowCount):
 *   相对跌幅 drop = (prev - curr) / leader
 *   drop > elbowDropRatio(默认0.4) 视为长尾起点
 *   如 100→30 跌幅0.7 > 0.4，elbowCount=1(仅头部)
 *
 * 最终: count = max(thresholdCount, elbowCount)
 *       clamp 到 [minItems, maxItems]
 *
 * 调优:
 *   - 显示更多 → 增大 maxItems / 减小 displayRatio / 减小 elbowDropRatio
 *   - 更严选 → 减小 maxItems / 增大 displayRatio / 增大 elbowDropRatio / 增大 minReplies
 */
export function dynamicV2exCount(
  replies: ReadonlyArray<number>,
  options: V2exCountOptions,
): number {
  return dynamicCount(replies, {
    minItems: options.minItems,
    displayRatio: options.displayRatio,
    elbowDropRatio: options.elbowDropRatio,
    cutoffFloor: options.minReplies,
  })
}

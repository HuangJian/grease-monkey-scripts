import { getTodayStartMs, computeTimeDecay } from '../scoring-utils'
import { htmlToDocument, toAbsoluteUrl } from '../../utils'
import { HOT_PAGE_URL, MEMBER_PATH_RE, TOPIC_PATH_RE } from './constants'
import type { V2exTopic } from './types'

export function parseV2ex(json: unknown, maxItems: number): V2exTopic[] {
  if (!Array.isArray(json)) return []
  const topics: V2exTopic[] = []
  json.some((item) => {
    if (!item || typeof item !== 'object') return false
    const t = item as Record<string, unknown>
    const id = typeof t.id === 'number' ? t.id : Number(t.id)
    const title = typeof t.title === 'string' ? t.title : ''
    const url = typeof t.url === 'string' ? t.url : ''
    const replies = typeof t.replies === 'number' ? t.replies : Number(t.replies ?? 0)
    const created = typeof t.created === 'number' ? t.created * 1000 : Number(t.created ?? 0) * 1000
    const memberObj = t.member as Record<string, unknown> | undefined
    const nodeObj = t.node as Record<string, unknown> | undefined
    const member =
      memberObj && typeof memberObj.username === 'string'
        ? { username: memberObj.username }
        : { username: '' }
    const node =
      nodeObj && typeof nodeObj.title === 'string' ? { title: nodeObj.title } : { title: '' }
    if (!Number.isFinite(id) || id <= 0) return false
    if (!title || !url) return false
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
    return topics.length >= maxItems
  })
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
  Array.from(rows).some((row) => {
    const linkEl = row.querySelector('a.topic-link')
    if (!linkEl) return false
    const href = linkEl.getAttribute('href') ?? ''
    const idMatch = href.match(TOPIC_PATH_RE)
    if (!idMatch) return false
    const id = Number(idMatch[1])
    if (!Number.isFinite(id) || id <= 0) return false
    const title = (linkEl.textContent ?? '').trim()
    if (!title) return false
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
    return topics.length >= maxItems
  })
  return topics
}

/**
 * 双源融合去重（算法阶段 2 的核心实现）
 * ⚠️  后续 agent 注意：修改算法时必须同步更新 fetcher.ts 顶部的算法注释，不要删除！
 *
 * - 同ID话题取最大回复数，标记 sources: ['api','page'] 为双源确认
 * - 页面源且 created < 今日0:00 UTC → sources 改为 ['api'] (自动晋升)
 * - dropApiOnly=true 时丢弃仅 API 源的话题
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

  const todayStartMs = getTodayStartMs()

  byId.forEach((topic) => {
    if (topic.sources?.length === 1 && topic.sources[0] === 'page' && topic.created !== undefined) {
      if (topic.created < todayStartMs) {
        topic.sources = ['api']
      }
    }
  })

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
 * 计算单个话题的衰减后排序分数（算法阶段 4 的核心实现）
 * ⚠️  后续 agent 注意：修改算法时必须同步更新 fetcher.ts 顶部的算法注释，不要删除！
 *
 * score = replies * exp(-days * ln(2) / halfLifeDays)
 */
export function computeSortScore(topic: V2exTopic, now: number, halfLifeDays: number): number {
  if (!Number.isFinite(topic.replies) || topic.replies <= 0) return 0
  const createdMs = topic.created ?? 0
  return computeTimeDecay(createdMs > 0 ? createdMs : now, now, halfLifeDays) * topic.replies
}

/**
 * 按衰减分数排序，同分时双源优先（算法阶段 4 的排序实现）
 * ⚠️  后续 agent 注意：修改算法时必须同步更新 fetcher.ts 顶部的算法注释，不要删除！
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

export function getTodayStart(): Date {
  return new Date(getTodayStartMs())
}

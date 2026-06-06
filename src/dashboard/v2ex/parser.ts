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
    const created = typeof t.created === 'number' ? t.created : Number(t.created ?? 0)
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
    topics.push({
      id,
      title,
      url,
      replies: Number.isFinite(replies) ? replies : 0,
      member: { username },
      node: { title: nodeTitle },
      sources: [],
    })
    if (topics.length >= maxItems) break
  }
  return topics
}

type Indexed = {
  topic: V2exTopic
  apiIndex: number
  pageIndex: number
}

export function mergeV2exTopics(
  apiTopics: V2exTopic[],
  pageTopics: V2exTopic[],
  fetchCap: number,
  dropApiOnly = true,
): V2exTopic[] {
  const byId = new Map<number, Indexed>()

  apiTopics.forEach((topic, i) => {
    if (!Number.isFinite(topic.id) || topic.id <= 0) return
    byId.set(topic.id, {
      topic: { ...topic, sources: topic.sources?.length ? [...topic.sources] : ['api'] },
      apiIndex: i,
      pageIndex: -1,
    })
  })

  pageTopics.forEach((topic, i) => {
    if (!Number.isFinite(topic.id) || topic.id <= 0) return
    const existing = byId.get(topic.id)
    if (existing) {
      existing.topic = {
        ...existing.topic,
        replies: Math.max(existing.topic.replies, topic.replies),
        sources: ['api', 'page'],
        created: existing.topic.created ?? topic.created,
      }
      existing.pageIndex = i
    } else {
      byId.set(topic.id, {
        topic: { ...topic, sources: ['page'] },
        apiIndex: -1,
        pageIndex: i,
      })
    }
  })

  const sorted = Array.from(byId.values())
    .filter((entry) => !dropApiOnly || entry.pageIndex >= 0)
    .sort(compareIndexed)
  return sorted.slice(0, Math.max(0, fetchCap)).map((entry) => entry.topic)
}

function compareIndexed(a: Indexed, b: Indexed): number {
  if (a.topic.replies !== b.topic.replies) return b.topic.replies - a.topic.replies
  const aCross = (a.topic.sources?.length ?? 0) > 1 ? 1 : 0
  const bCross = (b.topic.sources?.length ?? 0) > 1 ? 1 : 0
  if (aCross !== bCross) return bCross - aCross
  if (a.apiIndex !== b.apiIndex) {
    if (a.apiIndex < 0) return 1
    if (b.apiIndex < 0) return -1
    return a.apiIndex - b.apiIndex
  }
  return a.pageIndex - b.pageIndex
}

export function dynamicV2exCount(
  replies: ReadonlyArray<number>,
  options: V2exCountOptions,
): number {
  if (replies.length === 0) return 0
  const leader = replies[0]
  if (!Number.isFinite(leader) || leader <= 0) {
    return options.minItems
  }

  const cutoff = Math.max(leader * options.displayRatio, options.minReplies)
  let thresholdCount = 0
  for (const r of replies) {
    if (r >= cutoff) thresholdCount++
    else break
  }

  let elbowCount = replies.length
  for (let i = 1; i < replies.length; i++) {
    const prev = replies[i - 1]
    const drop = (prev - replies[i]) / leader
    if (drop > options.elbowDropRatio) {
      elbowCount = i
      break
    }
  }

  const count = Math.max(thresholdCount, elbowCount)
  return Math.max(options.minItems, Math.min(options.maxItems, count))
}

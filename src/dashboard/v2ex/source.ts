import type { Runtime } from '../../runtime'
import { htmlToDocument, htmlToElement, toAbsoluteUrl } from '../../utils'
import type { Source } from '../types'
import { createV2exEditor } from './editor'

export type V2exSource = 'api' | 'page'

export type V2exTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
  sources?: ReadonlyArray<V2exSource>
}

const HOT_API_URL = 'https://www.v2ex.com/api/topics/hot.json'
const HOT_PAGE_URL = 'https://www.v2ex.com/?tab=hot'

const TOPIC_PATH_RE = /^\/t\/(\d+)/
const MEMBER_PATH_RE = /^\/member\/([A-Za-z0-9_-]+)/

export type V2exCountOptions = {
  minItems: number
  maxItems: number
  displayRatio: number
  elbowDropRatio: number
  minCutoffReplies: number
}

export type V2exSourceOptions = {
  ttlMinutes: number
} & V2exCountOptions

const FETCH_CAP_FLOOR = 50

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    fetch(runtime, _prevData) {
      const fetchCap = Math.max(options.maxItems, FETCH_CAP_FLOOR)
      return fetchV2ex(
        runtime,
        fetchCap,
        {
          minItems: options.minItems,
          maxItems: options.maxItems,
          displayRatio: options.displayRatio,
          elbowDropRatio: options.elbowDropRatio,
          minCutoffReplies: options.minCutoffReplies,
        },
        new runtime.DOMParser(),
      )
    },
    render(container, data) {
      renderV2ex(container, data)
    },
    createEditor() {
      return createV2exEditor(options)
    },
  }
}

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
  fetchCap: number,
  countOptions: V2exCountOptions,
  domParser: DOMParser,
): Promise<V2exTopic[]> {
  const [apiResult, pageResult] = await Promise.all([
    fetchFromEndpoint(runtime, HOT_API_URL, (body) => {
      const json: unknown = JSON.parse(body)
      return parseV2ex(json, Number.POSITIVE_INFINITY)
    }),
    fetchFromEndpoint(runtime, HOT_PAGE_URL, (body) =>
      parseV2exHotPage(body, Number.POSITIVE_INFINITY, domParser),
    ),
  ])

  if (apiResult.error && pageResult.error) {
    throw new Error(`v2ex api: ${apiResult.error}; v2ex page: ${pageResult.error}`)
  }

  const full = mergeV2exTopics(apiResult.topics, pageResult.topics, fetchCap)
  const replies = full.map((t) => t.replies)
  const count = dynamicV2exCount(replies, countOptions)
  console.debug(
    `[v2ex-dynamic] opts=${JSON.stringify(countOptions)} merged=${full.length} ` +
      `leader=${replies[0] ?? 0} top10Replies=[${replies.slice(0, 10).join(',')}] ` +
      `finalCount=${count}`,
  )
  return full.slice(0, count)
}

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
    topics.push({ id, title, url, replies, member, node, sources: [] })
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
): V2exTopic[] {
  const byId = new Map<number, Indexed>()

  apiTopics.forEach((topic, i) => {
    if (!Number.isFinite(topic.id) || topic.id <= 0) return
    byId.set(topic.id, {
      topic: { ...topic, sources: ['api'] },
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

  const sorted = Array.from(byId.values()).sort(compareIndexed)
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

  // A: relative threshold — leader * ratio, floored by minCutoffReplies
  const cutoff = Math.max(leader * options.displayRatio, options.minCutoffReplies)
  let thresholdCount = 0
  for (const r of replies) {
    if (r >= cutoff) thresholdCount++
    else break
  }

  // B: elbow — first relative drop exceeding threshold
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

function renderV2ex(container: HTMLElement, data: V2exTopic[] | null): void {
  const document = container.ownerDocument
  container.replaceChildren()
  if (!data || data.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-empty">暂无数据</div>')
    container.appendChild(empty)
    return
  }
  const list = htmlToElement<HTMLOListElement>(document, '<ol class="gm-sp-v2ex-list"></ol>')
  for (const topic of data) {
    const item = htmlToElement<HTMLLIElement>(
      document,
      `<li class="gm-sp-v2ex-item">
        <span class="gm-sp-v2ex-count" title="回复数"></span>
        <a class="gm-sp-v2ex-title" target="_blank" rel="noopener noreferrer"></a>
        <span class="gm-sp-v2ex-meta">
          <span class="gm-sp-v2ex-node"></span>
          <span class="gm-sp-v2ex-author"></span>
          <span class="gm-sp-v2ex-source" aria-label=""></span>
        </span>
      </li>`,
    )
    const countEl = item.querySelector('.gm-sp-v2ex-count') as HTMLSpanElement
    countEl.textContent = String(topic.replies)
    const link = item.querySelector('.gm-sp-v2ex-title') as HTMLAnchorElement
    link.href = topic.url
    link.textContent = topic.title
    item.querySelector('.gm-sp-v2ex-node')!.textContent = topic.node.title
    item.querySelector('.gm-sp-v2ex-author')!.textContent = topic.member.username
      ? `@${topic.member.username}`
      : ''
    const sourceEl = item.querySelector('.gm-sp-v2ex-source') as HTMLSpanElement
    if ((topic.sources?.length ?? 0) > 1) {
      sourceEl.textContent = '🔥'
      sourceEl.title = '双源确认热帖'
    }
    list.appendChild(item)
  }
  container.appendChild(list)
}

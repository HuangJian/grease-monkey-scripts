import type { Runtime } from '../../runtime'
import { htmlToDocument, htmlToElement, toAbsoluteUrl } from '../../utils'
import type { Source } from '../types'
import { CACHE_KEY, type CachedSource } from '../types'
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
  created?: number
}

const HOT_API_BASE = 'https://www.v2ex.com/api/topics/hot.json'
const HOT_PAGE_URL = 'https://www.v2ex.com/?tab=hot'

const TOPIC_PATH_RE = /^\/t\/(\d+)/
const MEMBER_PATH_RE = /^\/member\/([A-Za-z0-9_-]+)/

export type V2exCountOptions = {
  minItems: number
  maxItems: number
  displayRatio: number
  elbowDropRatio: number
  minReplies: number
}

export type V2exSourceOptions = {
  ttlMinutes: number
} & V2exCountOptions

const FETCH_CAP_FLOOR = 50

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  let runtimeRef: Runtime | null = null
  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    async fetch(runtime, _prevData) {
      runtimeRef = runtime
      const fetchCap = Math.max(options.maxItems, FETCH_CAP_FLOOR)
      await loadTopicState(runtime)
      const allTopics = await fetchV2ex(
        runtime,
        fetchCap,
        {
          minItems: options.minItems,
          maxItems: options.maxItems,
          displayRatio: options.displayRatio,
          elbowDropRatio: options.elbowDropRatio,
          minReplies: options.minReplies,
        },
        new runtime.DOMParser(),
      )
      const visible = allTopics.filter((t) => !hiddenAt.has(t.id))
      await saveTopicState(runtime)
      return visible
    },
    render(container, data) {
      renderV2ex(container, data, runtimeRef)
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
  const [apiResult, pageResult, historicalApiTopics] = await Promise.all([
    fetchFromEndpoint(runtime, `${HOT_API_BASE}?_t=${Date.now()}`, (body) => {
      const json: unknown = JSON.parse(body)
      return parseV2ex(json, Number.POSITIVE_INFINITY)
    }),
    fetchFromEndpoint(runtime, HOT_PAGE_URL, (body) =>
      parseV2exHotPage(body, Number.POSITIVE_INFINITY, domParser),
    ),
    loadApiTopics(runtime),
  ])

  const apiIds = apiResult.topics.map((t) => t.id)
  const pageIds = pageResult.topics.map((t) => t.id)
  console.debug(
    `[v2ex-fetch] api${apiResult.error ? `(err:${apiResult.error})` : ''}: ${apiResult.topics.length} topics ` +
      `[${apiResult.topics
        .slice(0, 5)
        .map((t) => `${t.id}(${t.replies})`)
        .join(',')}]` +
      ` | page${pageResult.error ? `(err:${pageResult.error})` : ''}: ${pageResult.topics.length} topics ` +
      `[${pageResult.topics
        .slice(0, 5)
        .map((t) => `${t.id}(${t.replies})`)
        .join(',')}]` +
      ` | historical: ${historicalApiTopics.length} topics`,
  )
  console.debug(`[v2ex-fetch] all api IDs: [${apiIds.join(',')}]`)
  console.debug(`[v2ex-fetch] all page IDs: [${pageIds.join(',')}]`)

  if (apiResult.error && pageResult.error) {
    throw new Error(`v2ex api: ${apiResult.error}; v2ex page: ${pageResult.error}`)
  }

  let full = mergeV2exTopics(apiResult.topics, pageResult.topics, fetchCap, false)

  if (historicalApiTopics.length > 0) {
    const currentIds = new Set(full.map((t) => t.id))
    const historicalAsV2ex: V2exTopic[] = historicalApiTopics
      .filter((t) => !currentIds.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        url: t.url,
        replies: t.replies,
        member: t.member,
        node: t.node,
        sources: ['api'] as const,
        created: t.created,
      }))
    if (historicalAsV2ex.length > 0) {
      full = mergeV2exTopics(full, historicalAsV2ex, fetchCap + historicalAsV2ex.length, false)
    }
  }

  if (!apiResult.error) {
    void saveApiTopics(runtime, apiResult.topics)
  }

  console.debug(
    `[v2ex-merge] merged=${full.length} ` +
      `sources=[${full
        .slice(0, 5)
        .map((t) => `${t.id}:${t.sources?.join('+')}`)
        .join(',')}]`,
  )
  console.debug(
    `[v2ex-merge] all merged IDs: [${full.map((t) => `${t.id}:${t.sources?.join('+')}`).join(',')}]`,
  )
  const filtered = full.filter((t) => t.replies >= countOptions.minReplies)
  const replies = filtered.map((t) => t.replies)
  const count = dynamicV2exCount(replies, countOptions)
  console.debug(
    `[v2ex-dynamic] opts=${JSON.stringify(countOptions)} merged=${full.length} filtered=${filtered.length} ` +
      `leader=${replies[0] ?? 0} top10Replies=[${replies.slice(0, 10).join(',')}] ` +
      `finalCount=${count}`,
  )
  console.debug(
    `[v2ex-dynamic] all filtered IDs: [${filtered.map((t) => `${t.id}:${t.replies}`).join(',')}]`,
  )
  return filtered.slice(0, count)
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

  // A: relative threshold — leader * ratio, floored by minReplies
  const cutoff = Math.max(leader * options.displayRatio, options.minReplies)
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

const TOPIC_STATE_KEY = 'gm:v2ex:topic-state'
const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000
const API_TOPICS_KEY = 'gm:v2ex:api-topics'
const API_TOPICS_TTL = 48 * 60 * 60 * 1000

type StoredApiTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
  fetchedAt: number
  created?: number
}

const readAt = new Map<number, number>()
const hiddenAt = new Map<number, number>()
let cachedApiTopics: StoredApiTopic[] | null = null

export function clearV2exTopicState(): void {
  readAt.clear()
  hiddenAt.clear()
  cachedApiTopics = null
}

async function loadTopicState(runtime: Runtime): Promise<void> {
  const stored = await runtime.getValue<Record<string, { r?: number; h?: number }> | null>(
    TOPIC_STATE_KEY,
    null,
  )
  const now = Date.now()
  if (stored) {
    for (const [idStr, entry] of Object.entries(stored)) {
      const id = Number(idStr)
      if (entry.r && now - entry.r < TOPIC_STATE_TTL && !readAt.has(id)) {
        readAt.set(id, entry.r)
      }
      if (entry.h && now - entry.h < TOPIC_STATE_TTL && !hiddenAt.has(id)) {
        hiddenAt.set(id, entry.h)
      }
    }
  }
  for (const [id, ts] of readAt) {
    if (now - ts >= TOPIC_STATE_TTL) readAt.delete(id)
  }
  for (const [id, ts] of hiddenAt) {
    if (now - ts >= TOPIC_STATE_TTL) hiddenAt.delete(id)
  }
}

async function saveTopicState(runtime: Runtime): Promise<void> {
  const now = Date.now()
  const obj: Record<string, { r?: number; h?: number }> = {}
  for (const [id, ts] of readAt) {
    if (now - ts < TOPIC_STATE_TTL) {
      obj[String(id)] = { r: ts }
    }
  }
  for (const [id, ts] of hiddenAt) {
    if (now - ts < TOPIC_STATE_TTL) {
      const prev = obj[String(id)]
      obj[String(id)] = prev ? { ...prev, h: ts } : { h: ts }
    }
  }
  await runtime.setValue(TOPIC_STATE_KEY, obj)
}

async function loadApiTopics(runtime: Runtime): Promise<StoredApiTopic[]> {
  if (cachedApiTopics) return cachedApiTopics
  try {
    const stored = await runtime.getValue<StoredApiTopic[] | null>(API_TOPICS_KEY, null)
    if (!stored || !Array.isArray(stored)) {
      cachedApiTopics = []
      return cachedApiTopics
    }
    const now = Date.now()
    cachedApiTopics = stored.filter((t) => now - t.fetchedAt < API_TOPICS_TTL)
    return cachedApiTopics
  } catch {
    cachedApiTopics = []
    return cachedApiTopics
  }
}

async function removeTopicFromCache(runtime: Runtime, topicId: number): Promise<void> {
  try {
    const cached = await runtime.getValue<CachedSource<V2exTopic[]> | null>(CACHE_KEY('v2ex'), null)
    if (!cached?.data || !Array.isArray(cached.data)) return
    const filtered = cached.data.filter((t) => t.id !== topicId)
    await runtime.setValue(CACHE_KEY('v2ex'), { ...cached, data: filtered })
  } catch {
    /* ignore */
  }
}

async function saveApiTopics(runtime: Runtime, topics: V2exTopic[]): Promise<void> {
  const now = Date.now()
  const existing = await loadApiTopics(runtime)
  const byId = new Map<number, StoredApiTopic>()
  for (const t of existing) {
    byId.set(t.id, t)
  }
  for (const t of topics) {
    if (byId.has(t.id)) continue
    byId.set(t.id, {
      id: t.id,
      title: t.title,
      url: t.url,
      replies: t.replies,
      member: t.member,
      node: t.node,
      fetchedAt: now,
      created: t.created,
    })
  }
  const result = Array.from(byId.values()).filter((t) => now - t.fetchedAt < API_TOPICS_TTL)
  cachedApiTopics = result
  await runtime.setValue(API_TOPICS_KEY, result)
}

function renderV2ex(
  container: HTMLElement,
  data: V2exTopic[] | null,
  runtime: Runtime | null,
): void {
  const document = container.ownerDocument
  container.replaceChildren()
  const visible = data?.filter((t) => !hiddenAt.has(t.id)) ?? null
  if (!visible || visible.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-empty">暂无数据</div>')
    container.appendChild(empty)
    return
  }
  const list = htmlToElement<HTMLOListElement>(document, '<ol class="gm-sp-v2ex-list"></ol>')
  for (const topic of visible) {
    const item = htmlToElement<HTMLLIElement>(
      document,
      `<li class="gm-sp-v2ex-item">
        <span class="gm-sp-v2ex-source"></span>
        <span class="gm-sp-v2ex-count" title="回复数"></span>
        <a class="gm-sp-v2ex-title" target="_blank" rel="noopener noreferrer"></a>
        <span class="gm-sp-v2ex-meta">
          <span class="gm-sp-v2ex-node"></span>
          <span class="gm-sp-v2ex-author"></span>
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
    const sources = topic.sources
    const isFromApi = sources?.includes('api') ?? false
    const isFromPage = sources?.includes('page') ?? false
    if (isFromApi && isFromPage) {
      sourceEl.textContent = '🔥'
      sourceEl.title = '双源确认热帖'
    } else if (isFromPage) {
      sourceEl.textContent = '🌅'
      sourceEl.title = '今天发布的热帖'
    } else if (isFromApi) {
      sourceEl.textContent = '⏳'
      sourceEl.title = 'API 抓取（24小时内热帖）'
    }
    if (readAt.has(topic.id)) {
      item.classList.add('gm-sp-v2ex-read')
    }
    link.addEventListener('click', () => {
      readAt.set(topic.id, Date.now())
      item.classList.add('gm-sp-v2ex-read')
    })
    const hideBtn = htmlToElement<HTMLButtonElement>(
      document,
      '<button class="gm-sp-v2ex-hide" title="隐藏该主题">×</button>',
    )
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      hiddenAt.set(topic.id, Date.now())
      item.remove()
      if (runtime) {
        void saveTopicState(runtime)
        void removeTopicFromCache(runtime, topic.id)
      }
    })
    item.appendChild(hideBtn)
    list.appendChild(item)
  }
  container.appendChild(list)
}

import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { Source } from '../types'
import { createRedditEditor } from './editor'

export type RedditPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  subreddits: string[]
  author: string
}

export type RedditCountOptions = {
  minItems: number
  maxItems: number
  displayRatio: number
  elbowDropRatio: number
  minCutoffScore: number
}

export type RedditSourceOptions = {
  ttlMinutes: number
  subreddits: string[]
} & RedditCountOptions

const REDDIT_USER_AGENT =
  'web:grease-monkey-dashboard:1.0 (contact: https://github.com/HuangJian/grease-monkey-scripts)'
const REDDIT_HOSTS = ['old.reddit.com', 'www.reddit.com'] as const
const REDDIT_API_URL = (host: string, sub: string): string =>
  `https://${host}/r/${encodeURIComponent(sub)}/hot.json?limit=100&raw_json=1`
const MAX_RETRIES_ON_429 = 1
const TOPIC_STATE_KEY = 'gm:reddit:topic-state'
const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export function normalizeSubredditName(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?r\//i, '')
    .replace(/^\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
}

export function parseRedditListing(json: unknown, maxItems: number): RedditPost[] {
  if (!json || typeof json !== 'object') return []
  const data = (json as { data?: unknown }).data
  if (!data || typeof data !== 'object') return []
  const children = (data as { children?: unknown }).children
  if (!Array.isArray(children)) return []
  const out: RedditPost[] = []
  for (const child of children) {
    if (!child || typeof child !== 'object') continue
    const c = child as { kind?: unknown; data?: unknown }
    if (c.kind !== 't3') continue
    if (!c.data || typeof c.data !== 'object') continue
    const d = c.data as Record<string, unknown>
    if (d['over_18'] === true) continue
    if (d['distinguished'] === 'promoted') continue
    const id = d['id']
    const title = d['title']
    const permalink = d['permalink']
    const score = d['score']
    const numComments = d['num_comments']
    const subreddit = d['subreddit']
    const author = d['author']
    if (typeof id !== 'string' || !id) continue
    if (typeof title !== 'string' || !title) continue
    if (typeof permalink !== 'string' || !permalink) continue
    if (typeof score !== 'number' || !Number.isFinite(score)) continue
    if (typeof numComments !== 'number' || !Number.isFinite(numComments)) continue
    if (typeof subreddit !== 'string' || !subreddit) continue
    const authorText = typeof author === 'string' ? author : ''
    const normalizedSub = normalizeSubredditName(subreddit)
    if (!normalizedSub) continue
    out.push({
      id,
      title,
      url: `https://www.reddit.com${permalink}`,
      score: Math.max(0, Math.floor(score)),
      numComments: Math.max(0, Math.floor(numComments)),
      subreddits: [normalizedSub],
      author: authorText,
    })
    if (out.length >= maxItems) break
  }
  return out
}

export function dynamicRedditCount(
  scores: ReadonlyArray<number>,
  options: RedditCountOptions,
): number {
  if (scores.length === 0) return 0
  const leader = scores[0]!
  if (!Number.isFinite(leader) || leader <= 0) {
    return options.minItems
  }
  const cutoff = Math.max(leader * options.displayRatio, options.minCutoffScore)
  let thresholdCount = 0
  for (const r of scores) {
    if (r >= cutoff) thresholdCount++
    else break
  }
  let elbowCount = scores.length
  for (let i = 1; i < scores.length; i++) {
    const prev = scores[i - 1]!
    const drop = (prev - scores[i]!) / leader
    if (drop > options.elbowDropRatio) {
      elbowCount = i
      break
    }
  }
  const count = Math.max(thresholdCount, elbowCount)
  return Math.max(options.minItems, Math.min(options.maxItems, count))
}

function parseRetryAfter(headers: string | undefined): number {
  if (!headers) return 0
  const match = headers.match(/^retry-after:\s*(\d+)/im)
  if (!match) return 0
  const n = Number(match[1])
  return Number.isFinite(n) && n > 0 ? n : 0
}

type FetchOutcome =
  | { ok: true; posts: RedditPost[] }
  | { ok: false; error: string; status?: number }

function fetchOneSub(runtime: Runtime, subreddit: string): Promise<FetchOutcome> {
  return new Promise<FetchOutcome>((resolve) => {
    let settled = false
    let hostIdx = 0
    let retriesLeft = MAX_RETRIES_ON_429
    let lastError = 'unknown'
    const settle = (outcome: FetchOutcome) => {
      if (settled) return
      settled = true
      console.debug(
        '[gm-dashboard] reddit.fetchOneSub settled sub=',
        subreddit,
        'hostIdx=',
        hostIdx,
        'outcome=',
        outcome,
      )
      resolve(outcome)
    }
    const attempt = () => {
      const host = REDDIT_HOSTS[hostIdx]!
      console.debug(
        '[gm-dashboard] reddit.fetchOneSub attempt sub=',
        subreddit,
        'host=',
        host,
        'retriesLeft=',
        retriesLeft,
      )
      runtime.request({
        url: REDDIT_API_URL(host, subreddit),
        method: 'GET',
        timeout: 15000,
        anonymous: false,
        headers: { 'User-Agent': REDDIT_USER_AGENT },
        onload(response) {
          if (response.status === 429 && retriesLeft > 0) {
            retriesLeft--
            const waitSec = parseRetryAfter(response.responseHeaders)
            setTimeout(() => attempt(), Math.max(0, waitSec * 1000))
            return
          }
          if (response.status === 403) {
            lastError = 'http 403'
            advanceHost()
            return
          }
          if (response.status && response.status >= 400) {
            settle({
              ok: false,
              error: `http ${response.status}`,
              status: response.status,
            })
            return
          }
          try {
            const json: unknown = JSON.parse(response.responseText)
            const posts = parseRedditListing(json, 100)
            settle({ ok: true, posts })
          } catch (e) {
            settle({
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            })
          }
        },
        onerror: () => {
          lastError = 'network error'
          advanceHost()
        },
        ontimeout: () => {
          lastError = 'timeout'
          advanceHost()
        },
      })
    }
    const advanceHost = () => {
      if (hostIdx + 1 >= REDDIT_HOSTS.length) {
        settle({ ok: false, error: lastError })
        return
      }
      hostIdx++
      retriesLeft = MAX_RETRIES_ON_429
      attempt()
    }
    attempt()
  })
}

export function mergeRedditPosts(
  perSubResults: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  options: RedditCountOptions & { maxItems: number },
): RedditPost[] {
  const merged = new Map<string, RedditPost>()
  for (const { sub, posts } of perSubResults) {
    for (const post of posts) {
      const existing = merged.get(post.id)
      if (existing) {
        if (!existing.subreddits.includes(sub)) existing.subreddits.push(sub)
      } else {
        merged.set(post.id, { ...post, subreddits: [sub] })
      }
    }
  }
  const sorted = Array.from(merged.values())
    .filter((p) => p.score >= options.minCutoffScore)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.numComments - a.numComments
    })
  return sorted.slice(0, options.maxItems)
}

export type RedditFetchResult = {
  posts: RedditPost[]
  partialErrors: string[]
}

export async function fetchReddit(
  runtime: Runtime,
  options: RedditSourceOptions,
): Promise<RedditFetchResult> {
  const normalizedSubs = options.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0)
  const uniqueSubs = Array.from(new Set(normalizedSubs))
  if (uniqueSubs.length === 0) {
    throw new Error('reddit: no valid subreddits configured')
  }

  const settled = await Promise.all(
    uniqueSubs.map(async (sub) => {
      const outcome = await fetchOneSub(runtime, sub)
      if (!outcome.ok) return { sub, posts: [] as RedditPost[], error: outcome.error }
      const scores = outcome.posts.map((p) => p.score)
      const n = dynamicRedditCount(scores, options)
      return { sub, posts: outcome.posts.slice(0, n), error: null as string | null }
    }),
  )

  const errors: string[] = []
  const perSub: Array<{ sub: string; posts: RedditPost[] }> = []
  for (const item of settled) {
    if (item.error) errors.push(`r/${item.sub}: ${item.error}`)
    if (item.posts.length > 0) perSub.push({ sub: item.sub, posts: item.posts })
  }

  if (perSub.length === 0) {
    throw new Error(`reddit: all subs failed: ${errors.join('; ')}`)
  }

  const posts = mergeRedditPosts(perSub, { ...options, maxItems: options.maxItems })
  return { posts, partialErrors: errors }
}

const readAt = new Map<string, number>()
const hiddenAt = new Map<string, number>()

export function clearRedditTopicState(): void {
  readAt.clear()
  hiddenAt.clear()
}

async function loadTopicState(runtime: Runtime): Promise<void> {
  const stored = await runtime.getValue<Record<string, { r?: number; h?: number }> | null>(
    TOPIC_STATE_KEY,
    null,
  )
  const now = Date.now()
  if (stored) {
    for (const [idStr, entry] of Object.entries(stored)) {
      const id = idStr
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
      obj[id] = { r: ts }
    }
  }
  for (const [id, ts] of hiddenAt) {
    if (now - ts < TOPIC_STATE_TTL) {
      const prev = obj[id]
      obj[id] = prev ? { ...prev, h: ts } : { h: ts }
    }
  }
  await runtime.setValue(TOPIC_STATE_KEY, obj)
}

export function createRedditSource(options: RedditSourceOptions): Source<RedditPost[]> {
  return {
    id: 'reddit',
    title: 'Reddit 热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 2,
    async fetch(runtime, _prevData) {
      console.debug('[gm-dashboard] reddit.fetch start subs=', options.subreddits)
      await loadTopicState(runtime)
      const result = await fetchReddit(runtime, options)
      console.debug(
        '[gm-dashboard] reddit.fetch ok posts=',
        result.posts.length,
        'partial=',
        result.partialErrors,
      )
      const visible = result.posts.filter((p) => !hiddenAt.has(p.id))
      await saveTopicState(runtime)
      return visible
    },
    render(container, data) {
      renderReddit(container, data, hiddenAt)
    },
    createEditor() {
      return createRedditEditor(options)
    },
  }
}

function renderReddit(
  container: HTMLElement,
  data: RedditPost[] | null,
  hiddenAtMap: ReadonlyMap<string, number>,
): void {
  const document = container.ownerDocument
  container.replaceChildren()
  if (!data || data.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-empty">暂无数据</div>')
    container.appendChild(empty)
    return
  }
  const list = htmlToElement<HTMLOListElement>(document, '<ol class="gm-sp-reddit-list"></ol>')
  for (const post of data) {
    const item = htmlToElement<HTMLLIElement>(
      document,
      `<li class="gm-sp-reddit-item">
        <span class="gm-sp-reddit-count" title="得分"></span>
        <a class="gm-sp-reddit-title" target="_blank" rel="noopener noreferrer"></a>
        <span class="gm-sp-reddit-meta">
          <span class="gm-sp-reddit-sub"></span>
          <span class="gm-sp-reddit-comments" title="评论数"></span>
        </span>
      </li>`,
    )
    const countEl = item.querySelector('.gm-sp-reddit-count') as HTMLSpanElement
    countEl.textContent = String(post.score)
    const link = item.querySelector('.gm-sp-reddit-title') as HTMLAnchorElement
    link.href = post.url
    link.textContent = post.title
    item.querySelector('.gm-sp-reddit-sub')!.textContent = post.subreddits
      .map((s) => `r/${s}`)
      .join(', ')
    item.querySelector('.gm-sp-reddit-comments')!.textContent = `💬 ${post.numComments}`
    if (readAt.has(post.id)) {
      item.classList.add('gm-sp-reddit-read')
    }
    if (hiddenAtMap.has(post.id)) {
      item.classList.add('gm-sp-reddit-hidden-marker')
    }
    link.addEventListener('click', () => {
      readAt.set(post.id, Date.now())
      item.classList.add('gm-sp-reddit-read')
    })
    const hideBtn = htmlToElement<HTMLButtonElement>(
      document,
      '<button class="gm-sp-reddit-hide" title="隐藏该主题">×</button>',
    )
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      hiddenAt.set(post.id, Date.now())
      item.remove()
    })
    item.appendChild(hideBtn)
    list.appendChild(item)
  }
  container.appendChild(list)
}

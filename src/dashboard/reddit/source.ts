import type { Runtime } from '../../runtime'
import { escapeHtml, escapeUrl } from '../../utils'
import { loadConfigSection } from '../config'
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
  minPerSub: number
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

  const bySub = new Map<string, RedditPost[]>()
  for (const post of merged.values()) {
    for (const sub of post.subreddits) {
      const arr = bySub.get(sub) ?? []
      arr.push(post)
      bySub.set(sub, arr)
    }
  }
  for (const arr of bySub.values()) {
    arr.sort((a, b) => (b.score !== a.score ? b.score - a.score : b.numComments - a.numComments))
  }

  const numSubs = bySub.size
  if (numSubs === 0) return []

  const minPerSub = Math.max(0, options.minPerSub)
  const quota = Math.max(minPerSub, Math.floor(options.maxItems / numSubs))

  const selected = new Set<string>()
  const remainder: RedditPost[] = []

  for (const posts of bySub.values()) {
    let count = 0
    for (const post of posts) {
      if (count < quota) {
        selected.add(post.id)
        count++
      } else {
        remainder.push(post)
      }
    }
  }

  remainder.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : b.numComments - a.numComments,
  )

  const remaining = options.maxItems - selected.size
  for (let i = 0; i < Math.min(remaining, remainder.length); i++) {
    selected.add(remainder[i]!.id)
  }

  return Array.from(merged.values())
    .filter((p) => selected.has(p.id) && p.score >= options.minCutoffScore)
    .sort((a, b) => (b.score !== a.score ? b.score - a.score : b.numComments - a.numComments))
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

function coerceRedditOptions(
  raw: Record<string, unknown>,
  fallback: RedditSourceOptions,
): RedditSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    subreddits:
      Array.isArray(raw['subreddits']) && (raw['subreddits'] as unknown[]).length > 0
        ? (raw['subreddits'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.subreddits,
    minItems: typeof raw['minItems'] === 'number' ? (raw['minItems'] as number) : fallback.minItems,
    maxItems: typeof raw['maxItems'] === 'number' ? (raw['maxItems'] as number) : fallback.maxItems,
    minPerSub:
      typeof raw['minPerSub'] === 'number' ? (raw['minPerSub'] as number) : fallback.minPerSub,
    displayRatio:
      typeof raw['displayRatio'] === 'number'
        ? (raw['displayRatio'] as number)
        : fallback.displayRatio,
    elbowDropRatio:
      typeof raw['elbowDropRatio'] === 'number'
        ? (raw['elbowDropRatio'] as number)
        : fallback.elbowDropRatio,
    minCutoffScore:
      typeof raw['minCutoffScore'] === 'number'
        ? (raw['minCutoffScore'] as number)
        : fallback.minCutoffScore,
  }
}

export async function loadFreshRedditOptions(
  runtime: Runtime,
  fallback: RedditSourceOptions,
): Promise<RedditSourceOptions> {
  return loadConfigSection(runtime, 'reddit', fallback, (raw) => coerceRedditOptions(raw, fallback))
}

export function createRedditSource(options: RedditSourceOptions): Source<RedditPost[]> {
  return {
    id: 'reddit',
    title: 'Reddit 热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 2,
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshRedditOptions(runtime, options)
      console.debug('[gm-dashboard] reddit.fetch start subs=', fresh.subreddits)
      await loadTopicState(runtime)
      const result = await fetchReddit(runtime, fresh)
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
  container.replaceChildren()
  if (!data || data.length === 0) {
    container.insertAdjacentHTML('beforeend', '<div class="gm-sp-empty">暂无数据</div>')
    return
  }
  const listHtml = data
    .map((post) => {
      const readClass = readAt.has(post.id) ? ' gm-sp-reddit-read' : ''
      const hiddenClass = hiddenAtMap.has(post.id) ? ' gm-sp-reddit-hidden-marker' : ''
      const titleHtml = `<a class="gm-sp-reddit-title" href="${escapeUrl(post.url)}" target="_blank"
        rel="noopener noreferrer">${escapeHtml(post.title)}</a>`
      const subText = escapeHtml(post.subreddits.map((s) => `r/${s}`).join(', '))
      return `<li class="gm-sp-reddit-item${readClass}${hiddenClass}" data-post-id="${post.id}">
        <span class="gm-sp-reddit-count" title="得分">${post.score}</span>
        ${titleHtml}
        <span class="gm-sp-reddit-meta">
          <span class="gm-sp-reddit-sub">${subText}</span>
          <span class="gm-sp-reddit-comments" title="评论数">💬 ${post.numComments}</span>
        </span>
        <button class="gm-sp-reddit-hide" title="隐藏该主题">×</button>
      </li>`
    })
    .join('')
  container.insertAdjacentHTML('beforeend', `<ol class="gm-sp-reddit-list">${listHtml}</ol>`)
  container.querySelectorAll<HTMLElement>('.gm-sp-reddit-item').forEach((item) => {
    const postId = item.dataset['postId']!
    const link = item.querySelector('.gm-sp-reddit-title') as HTMLAnchorElement
    link.addEventListener('click', () => {
      readAt.set(postId, Date.now())
      item.classList.add('gm-sp-reddit-read')
    })
    const hideBtn = item.querySelector('.gm-sp-reddit-hide') as HTMLButtonElement
    hideBtn.addEventListener('click', (e) => {
      e.preventDefault()
      hiddenAt.set(postId, Date.now())
      item.remove()
    })
  })
}

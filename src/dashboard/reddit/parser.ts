import type { RedditPost } from './types'

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
  const now = Date.now()
  children.some((child) => {
    if (!child || typeof child !== 'object') return false
    const c = child as { kind?: unknown; data?: unknown }
    if (c.kind !== 't3') return false
    if (!c.data || typeof c.data !== 'object') return false
    const d = c.data as Record<string, unknown>
    if (d['over_18'] === true) return false
    if (d['distinguished'] === 'promoted') return false
    const id = d['id']
    const title = d['title']
    const permalink = d['permalink']
    const score = d['score']
    const numComments = d['num_comments']
    const subreddit = d['subreddit']
    const author = d['author']
    const createdUtc = d['created_utc']
    if (typeof id !== 'string' || !id) return false
    if (typeof title !== 'string' || !title) return false
    if (typeof permalink !== 'string' || !permalink) return false
    if (typeof score !== 'number' || !Number.isFinite(score)) return false
    if (typeof numComments !== 'number' || !Number.isFinite(numComments)) return false
    if (typeof subreddit !== 'string' || !subreddit) return false
    const authorText = typeof author === 'string' ? author : ''
    const normalizedSub = normalizeSubredditName(subreddit)
    if (!normalizedSub) return false
    let created: number
    if (typeof createdUtc === 'number' && Number.isFinite(createdUtc) && createdUtc > 0) {
      created = Math.floor(createdUtc * 1000)
    } else {
      created = now
    }
    out.push({
      id,
      title,
      url: `https://www.reddit.com${permalink}`,
      score: Math.max(0, Math.floor(score)),
      numComments: Math.max(0, Math.floor(numComments)),
      subreddits: [normalizedSub],
      author: authorText,
      created,
    })
    return out.length >= maxItems
  })
  return out
}

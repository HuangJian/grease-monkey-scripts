import { dynamicCount } from '../dynamic-count'
import type { RedditCountOptions, RedditPost, StoredHistoryPost } from './types'

export function computeRedditDecayedScore(
  post: RedditPost,
  now: number,
  halfLifeDays: number,
): number {
  if (!Number.isFinite(post.score) || post.score <= 0) return 0
  const days = Math.max(0, (now - post.created) / 86_400_000)
  const lambda = Math.log(2) / halfLifeDays
  return post.score * Math.exp(-days * lambda)
}

function unionUnique(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  const out: string[] = []
  for (const s of a) if (!out.includes(s)) out.push(s)
  for (const s of b) if (!out.includes(s)) out.push(s)
  return out
}

function mergePost(live: RedditPost | undefined, hist: StoredHistoryPost): RedditPost {
  if (!live) {
    return {
      id: hist.id,
      title: hist.title,
      url: hist.url,
      score: hist.score,
      numComments: hist.numComments,
      author: hist.author,
      subreddits: [...hist.subreddits],
      created: hist.created,
    }
  }
  return {
    id: live.id,
    title: live.title,
    url: live.url,
    score: Math.max(live.score, hist.score),
    numComments: Math.max(live.numComments, hist.numComments),
    author: live.author || hist.author,
    subreddits: unionUnique(live.subreddits, hist.subreddits),
    created: Math.min(live.created, hist.created),
  }
}

export function mergeSubPosts(
  perSubLive: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  history: ReadonlyArray<StoredHistoryPost>,
): Array<{ sub: string; posts: RedditPost[] }> {
  const liveBySub = new Map<string, RedditPost[]>()
  for (const { sub, posts } of perSubLive) {
    if (posts.length === 0) continue
    liveBySub.set(sub, [...(liveBySub.get(sub) ?? []), ...posts])
  }

  const out: Array<{ sub: string; posts: RedditPost[] }> = []
  const seenIds = new Set<string>()

  for (const [sub, livePosts] of liveBySub) {
    const byId = new Map<string, RedditPost>()
    for (const p of livePosts) {
      if (!byId.has(p.id)) byId.set(p.id, p)
    }
    for (const h of history) {
      if (!h.subreddits.includes(sub)) continue
      if (seenIds.has(h.id)) continue
      const existing = byId.get(h.id)
      byId.set(h.id, mergePost(existing, h))
    }
    const posts = Array.from(byId.values())
    for (const p of posts) seenIds.add(p.id)
    out.push({ sub, posts })
  }

  for (const h of history) {
    if (seenIds.has(h.id)) continue
    const liveSubs = new Set(liveBySub.keys())
    const matchingSubs = h.subreddits.filter((s) => liveSubs.has(s))
    if (matchingSubs.length === 0) continue
    const sub = matchingSubs[0]!
    const existing = out.find((x) => x.sub === sub)
    const post: RedditPost = {
      id: h.id,
      title: h.title,
      url: h.url,
      score: h.score,
      numComments: h.numComments,
      author: h.author,
      subreddits: [...h.subreddits],
      created: h.created,
    }
    seenIds.add(h.id)
    if (existing) {
      existing.posts.push(post)
    } else {
      out.push({ sub, posts: [post] })
    }
  }

  return out
}

export type SelectOptions = RedditCountOptions & {
  ageHalfLifeDays: number
  now: number
}

export function selectPostsPerSub(
  merged: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  options: SelectOptions,
): Map<string, RedditPost[]> {
  const result = new Map<string, RedditPost[]>()
  for (const { sub, posts } of merged) {
    const eligible = posts.filter((p) => p.score >= options.minCutoffScore)
    const sorted = [...eligible].sort((a, b) => {
      const da = computeRedditDecayedScore(a, options.now, options.ageHalfLifeDays)
      const db = computeRedditDecayedScore(b, options.now, options.ageHalfLifeDays)
      return db - da
    })
    const decayedScores = sorted.map((p) =>
      computeRedditDecayedScore(p, options.now, options.ageHalfLifeDays),
    )
    const n = dynamicCount(decayedScores, {
      minItems: options.minPerSub,
      displayRatio: options.displayRatio,
      elbowDropRatio: options.elbowDropRatio,
      cutoffFloor: 0,
    })
    result.set(sub, sorted.slice(0, n))
  }
  return result
}

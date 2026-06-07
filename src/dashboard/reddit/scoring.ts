import { dynamicCount } from '../dynamic-count'
import type { RedditCountOptions, RedditPost } from './types'

export function dynamicRedditCount(
  scores: ReadonlyArray<number>,
  options: RedditCountOptions,
): number {
  return dynamicCount(scores, {
    minItems: options.minItems,
    maxItems: options.maxItems,
    displayRatio: options.displayRatio,
    elbowDropRatio: options.elbowDropRatio,
    cutoffFloor: options.minCutoffScore,
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

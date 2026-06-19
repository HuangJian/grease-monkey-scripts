import { getTodayStartMs, computeDecayedScore } from '../scoring-utils'
import type { RedditCountOptions, RedditPost } from './types'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Reddit 热门帖子算法（阶段 2–4：融合 + 过滤 + 排序）
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  后续 agent 注意：修改算法时必须同步更新本注释，不要删除！
 *
 * ── 阶段 2：双源融合去重 ─────────────────────────────────────────────────
 *   mergeSubPosts(perSubLive, history) 执行：
 *   ① 按 sub 分组 live 帖子
 *   ② 对每个 sub：合并同 id 的 history 条目（取 max(score), max(numComments), min(created)）
 *   ③ 跨 sub 去重（seenIds）
 *   ④ 剩余 history 条目匹配到对应 sub
 *
 * ── 阶段 3：门槛过滤 ────────────────────────────────────────────────────
 *   selectPostsPerSub(merged, options) 对每个 sub 执行：
 *   ① 旧帖子 (created < 今日 0:00)：numComments < olderMinComments → 移除
 *   ② 今日帖子 (created ≥ 今日 0:00)：无评论门槛（全部保留）
 *   不做截断，全部返回
 *
 * ── 阶段 4：衰减排序 ────────────────────────────────────────────────────
 *   computeRedditDecayedScore(post, now, halfLifeDays)：
 *   score = post.score × exp(-days × ln2 / halfLifeDays)
 *   - days = (now - created) / 86400000
 *   - created 缺失时 days = 0（视为最新）
 *   - post.score ≤ 0 → score = 0
 *   按衰减分数降序排列，不做截断
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

export function computeRedditDecayedScore(
  post: RedditPost,
  now: number,
  halfLifeDays: number,
): number {
  return computeDecayedScore(post.score, post.created, now, halfLifeDays)
}

export function mergeSubPosts(
  perSubLive: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  prevById: Map<string, RedditPost>,
): Array<{ sub: string; posts: RedditPost[] }> {
  const liveBySub = new Map<string, RedditPost[]>()
  perSubLive
    .filter(({ posts }) => posts.length > 0)
    .forEach(({ sub, posts }) => {
      liveBySub.set(sub, [...(liveBySub.get(sub) ?? []), ...posts])
    })

  const out: Array<{ sub: string; posts: RedditPost[] }> = []
  const seenIds = new Set<string>()

  liveBySub.forEach((livePosts, sub) => {
    const byId = new Map<string, RedditPost>()
    livePosts.forEach((p) => byId.set(p.id, p))
    prevById.forEach((prev, id) => {
      if (seenIds.has(id)) return
      if (prev.subreddits.length > 0 && !prev.subreddits.includes(sub)) return
      const existing = byId.get(id)
      if (existing) {
        byId.set(id, {
          ...existing,
          score: Math.max(existing.score, prev.score),
          numComments: Math.max(existing.numComments, prev.numComments),
          author: existing.author || prev.author,
          created: Math.min(existing.created, prev.created),
          subreddits: [...new Set([...existing.subreddits, ...prev.subreddits])],
        })
      } else {
        byId.set(id, prev)
      }
    })
    const posts = Array.from(byId.values())
    posts.forEach((p) => seenIds.add(p.id))
    out.push({ sub, posts })
  })

  prevById.forEach((prev) => {
    if (seenIds.has(prev.id)) return
    const liveSubs = new Set(liveBySub.keys())
    const matchingSubs = prev.subreddits.filter((s) => liveSubs.has(s))
    if (matchingSubs.length === 0) return
    const sub = matchingSubs[0]!
    const existing = out.find((x) => x.sub === sub)
    if (existing) {
      existing.posts.push(prev)
    } else {
      out.push({ sub, posts: [prev] })
    }
    seenIds.add(prev.id)
  })

  return out
}

export type SelectOptions = RedditCountOptions & {
  now: number
}

export function selectPostsPerSub(
  merged: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  options: SelectOptions,
): Map<string, RedditPost[]> {
  const todayStartMs = getTodayStartMs()
  const result = new Map<string, RedditPost[]>()
  merged.forEach(({ sub, posts }) => {
    const filtered = posts.filter((p) => {
      if (p.created < todayStartMs) {
        return p.numComments >= options.olderMinComments
      }
      return p.numComments >= options.todayMinComments
    })
    const sorted = [...filtered].sort((a, b) => {
      const da = computeRedditDecayedScore(a, options.now, options.ageHalfLifeDays)
      const db = computeRedditDecayedScore(b, options.now, options.ageHalfLifeDays)
      return db - da
    })
    result.set(sub, sorted)
  })
  return result
}

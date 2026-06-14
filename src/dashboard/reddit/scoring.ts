import { getTodayStartMs, computeDecayedScore } from '../scoring-utils'
import type { RedditCountOptions, RedditPost, StoredHistoryPost } from './types'

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
  now: number
}

export function selectPostsPerSub(
  merged: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  options: SelectOptions,
): Map<string, RedditPost[]> {
  const todayStartMs = getTodayStartMs()
  const result = new Map<string, RedditPost[]>()
  for (const { sub, posts } of merged) {
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
  }
  return result
}

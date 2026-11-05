import { getTodayStartMs, computeDecayedScore } from '../scoring-utils'
import { earliestTimestamp } from '../shared-utils'
import { specContainsSub } from './parser'
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
 *   ① 按分组键分组 live 帖子（键可以是单个 sub，也可以是 a+b 这样的合并组）
 *   ② 验证 live 帖子归属：从 URL (/r/{sub}/comments/) 提取 sub，不属于该分组的
 *      任何成员则跳过（合并组接受任一成员的帖子）；prev 帖子直接使用缓存分组中的键进行匹配
 *   ③ 对每个分组：合并同 id 的 history 条目（取 max(score), max(numComments), min(created)）
 *   ④ 跨 sub 去重（seenIds）
 *   ⑤ 剩余 history 条目匹配到对应 sub
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
 * ── feed 通道（阶段 3/4 的例外）────────────────────────────────────────
 *   Reddit 匿名 JSON 于 2026 年被封（403），内容改走 Atom feed；`score` /
 *   `num_comments` 由归档 API 按 id 补回（`metrics.ts`），但那是发布后数小时的
 *   快照。feed 通道因此**永久跳过阶段 3/4**（`preserveFeedOrder = true`）：
 *   ① 门槛会拿滞后快照的评论数误杀新帖；
 *   ② feed 文档顺序本身就是 Reddit 的 hot 排序，比滞后分数更准，重排是倒退。
 *   补回的数字只用于行内显示，不参与筛选与排序。
 *   `every(p => p.metrics !== false)` 是第二道保险：某个帖子没被归档收录时
 *   整段仍留在 feed 顺序，避免零值把它挤到末尾。
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

function subFromUrl(url: string): string | undefined {
  const m = url.match(/\/r\/([^/]+)\/comments\//)
  return m ? m[1]!.toLowerCase() : undefined
}

export function mergeSubPosts(
  perSubLive: ReadonlyArray<{ sub: string; posts: RedditPost[] }>,
  prevById: Map<string, { sub: string; post: RedditPost }>,
): Array<{ sub: string; posts: RedditPost[] }> {
  const liveBySub = new Map<string, RedditPost[]>()
  // Empty groups are kept, not filtered out: during feed rotation a section is
  // skipped for a round and arrives here as `posts: []` purely to claim the key,
  // so that its cached posts are carried over below. Dropping it would erase the
  // whole section until its next turn (the hupu group-key lesson).
  perSubLive.forEach(({ sub, posts }) => {
    liveBySub.set(sub, [...(liveBySub.get(sub) ?? []), ...posts])
  })

  const out: Array<{ sub: string; posts: RedditPost[] }> = []
  const seenIds = new Set<string>()

  liveBySub.forEach((livePosts, sub) => {
    const byId = new Map<string, RedditPost>()
    livePosts.forEach((p) => {
      const urlSub = subFromUrl(p.url)
      if (urlSub !== undefined && !specContainsSub(sub, urlSub)) return
      byId.set(p.id, p)
    })
    prevById.forEach(({ sub: prevSub, post: prev }, id) => {
      if (seenIds.has(id)) return
      if (prevSub !== sub) return
      const existing = byId.get(id)
      if (existing) {
        byId.set(id, {
          ...existing,
          score: Math.max(existing.score, prev.score),
          numComments: Math.max(existing.numComments, prev.numComments),
          author: existing.author || prev.author,
          created: earliestTimestamp(existing.created, prev.created),
        })
      } else {
        byId.set(id, prev)
      }
    })
    const posts = Array.from(byId.values())
    posts.forEach((p) => seenIds.add(p.id))
    out.push({ sub, posts })
  })

  prevById.forEach(({ sub: prevSub, post: prev }) => {
    if (seenIds.has(prev.id)) return
    const liveSubs = new Set(liveBySub.keys())
    if (!liveSubs.has(prevSub)) return
    const existing = out.find((x) => x.sub === prevSub)
    if (existing) {
      existing.posts.push(prev)
    } else {
      out.push({ sub: prevSub, posts: [prev] })
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
  preserveFeedOrder = false,
): Map<string, RedditPost[]> {
  const todayStartMs = getTodayStartMs()
  const result = new Map<string, RedditPost[]>()
  merged.forEach(({ sub, posts }) => {
    // Feed document order IS Reddit's hot ranking. Even after the archive fills
    // in real score/comment counts, those numbers are a few hours stale: gating
    // or re-sorting with them would bury fresh posts and shuffle a more accurate
    // order. `preserveFeedOrder` keeps the feed channel on this path; the
    // metrics check covers posts the archive has not enriched.
    if (preserveFeedOrder || !posts.every((p) => p.metrics !== false)) {
      result.set(sub, posts)
      return
    }
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

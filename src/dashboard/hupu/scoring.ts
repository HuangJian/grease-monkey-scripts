import { getTodayStartMs, computeTimeDecay } from '../scoring-utils'
import type { HupuCountOptions, HupuPost, StoredHistoryPost } from './types'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 虎扑热帖排序算法（阶段 2–4：融合 + 过滤 + 排序）
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  后续 agent 注意：修改算法时必须同步更新本注释，不要删除！
 *
 * ── 数据范围背景 ────────────────────────────────────────────────────────────
 *   lights（亮了）天然上限约 50，replies（回复数）可达 2,600+。
 *   两者量级差异约 50×，直接加权会被 replies 主导。
 *   因此采用 log1p 对数归一化压缩大值范围：
 *     log1p(50)  ≈ 3.93
 *     log1p(2600) ≈ 7.86
 *   量级差异从 52× 压缩到 2×，lights 的贡献变得有意义。
 *
 * ── 阶段 2：双源融合去重 ─────────────────────────────────────────────────
 *   mergeBoardPosts(perBoardLive, history) 执行：
 *   ① 按 board 分组 live 帖子
 *   ② 对每个 board：合并同 id 的 history 条目
 *      （取 max(lights), max(replies), max(views), min(created), union boards）
 *   ③ 跨 board 去重（seenIds）
 *   ④ 剩余 history 条目匹配到对应 board
 *
 * ── 阶段 3：门槛过滤 ────────────────────────────────────────────────────
 *   selectPostsPerBoard(merged, options) 对每个 board 执行：
 *   ① 旧帖子 (created < 今日 0:00)：replies < olderMinReplies → 移除
 *   ② 今日帖子 (created ≥ 今日 0:00)：replies < todayMinReplies → 移除
 *   不做截断，全部返回
 *
 * ── 阶段 4：对数归一化加权衰减排序 ──────────────────────────────────────
 *   computeHupuDecayedScore(post, now, options)：
 *
 *   Phase 1 — 基础分数（对数归一化加权）：
 *     baseScore = log1p(lights) × lightsWeight + log1p(replies) × repliesWeight
 *
 *     log1p(x) = ln(1+x) 将 [0, ∞) 映射到 [0, ∞)，压缩大值范围。
 *     选择 log1p 而非硬编码归一化的原因：
 *       - 无需预设 max 值（不同版块 max 不同）
 *       - 冷启动即可工作（无需累积历史数据）
 *       - 跨版块一致
 *
 *   Phase 2 — 时间衰减（指数衰减）：
 *     decayedScore = baseScore × exp(-days × ln2 / halfLifeDays)
 *     - days = (now - created) / 86400000
 *     - created 缺失时 days = 0（视为最新）
 *     - baseScore ≤ 0 → decayedScore = 0
 *
 *   Phase 3 — 排序：
 *     按 decayedScore 降序排列，不做截断
 *
 * ── 排序示例（lightsWeight=1, repliesWeight=1, halfLifeDays=2）─────────────
 *   帖子 A: lights=50, replies=315 → base=9.69, 1天后=6.85
 *   帖子 B: lights=5,  replies=300 → base=7.50, 1天后=5.30
 *   帖子 D: lights=0,  replies=2600→ base=7.86, 1天后=5.56
 *   排序：A > D > B（lights 贡献被保留，不会因 replies 量级大而碾压）
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

export function computeBaseScore(
  post: HupuPost,
  lightsWeight: number,
  repliesWeight: number,
): number {
  return Math.log1p(post.lights) * lightsWeight + Math.log1p(post.replies) * repliesWeight
}

export function computeHupuDecayedScore(
  post: HupuPost,
  now: number,
  options: HupuCountOptions,
): number {
  const base = computeBaseScore(post, options.lightsWeight, options.repliesWeight)
  if (base <= 0) return 0
  return base * computeTimeDecay(post.created, now, options.ageHalfLifeDays)
}

function mergePost(live: HupuPost | undefined, hist: StoredHistoryPost): HupuPost {
  if (!live) {
    return {
      id: hist.id,
      title: hist.title,
      url: hist.url,
      lights: hist.lights,
      replies: hist.replies,
      views: hist.views,
      author: hist.author,
      authorUrl: hist.authorUrl,
      board: hist.boards[0] ?? '',
      topicName: hist.topicName,
      created: hist.created,
    }
  }
  return {
    id: live.id,
    title: live.title,
    url: live.url,
    lights: Math.max(live.lights, hist.lights),
    replies: Math.max(live.replies, hist.replies),
    views: Math.max(live.views, hist.views),
    author: live.author || hist.author,
    authorUrl: live.authorUrl || hist.authorUrl,
    board: live.board,
    topicName: live.topicName || hist.topicName,
    created: Math.min(live.created, hist.created),
  }
}

export function mergeBoardPosts(
  perBoardLive: ReadonlyArray<{ board: string; posts: HupuPost[] }>,
  history: ReadonlyArray<StoredHistoryPost>,
): Array<{ board: string; posts: HupuPost[] }> {
  const liveByBoard = new Map<string, HupuPost[]>()
  perBoardLive
    .filter(({ posts }) => posts.length > 0)
    .forEach(({ board, posts }) => {
      liveByBoard.set(board, [...(liveByBoard.get(board) ?? []), ...posts])
    })

  const out: Array<{ board: string; posts: HupuPost[] }> = []
  const seenIds = new Set<string>()

  liveByBoard.forEach((livePosts, board) => {
    const byId = new Map<string, HupuPost>()
    livePosts.filter((p) => !byId.has(p.id)).forEach((p) => byId.set(p.id, p))
    history
      .filter((h) => h.boards.includes(board))
      .filter((h) => !seenIds.has(h.id))
      .forEach((h) => {
        const existing = byId.get(h.id)
        byId.set(h.id, mergePost(existing, h))
      })
    const posts = Array.from(byId.values())
    posts.forEach((p) => seenIds.add(p.id))
    out.push({ board, posts })
  })

  history.forEach((h) => {
    if (seenIds.has(h.id)) return
    const liveBoards = new Set(liveByBoard.keys())
    const matchingBoards = h.boards.filter((b) => liveBoards.has(b))
    if (matchingBoards.length === 0) return
    const board = matchingBoards[0]!
    const existing = out.find((x) => x.board === board)
    const post: HupuPost = {
      id: h.id,
      title: h.title,
      url: h.url,
      lights: h.lights,
      replies: h.replies,
      views: h.views,
      author: h.author,
      authorUrl: h.authorUrl,
      board,
      topicName: h.topicName,
      created: h.created,
    }
    seenIds.add(h.id)
    if (existing) {
      existing.posts.push(post)
    } else {
      out.push({ board, posts: [post] })
    }
  })

  return out
}

export type SelectOptions = HupuCountOptions & {
  now: number
}

export function selectPostsPerBoard(
  merged: ReadonlyArray<{ board: string; posts: HupuPost[] }>,
  options: SelectOptions,
): Map<string, HupuPost[]> {
  const todayStartMs = getTodayStartMs()
  const result = new Map<string, HupuPost[]>()
  merged.forEach(({ board, posts }) => {
    const filtered = posts.filter((p) => {
      if (p.created < todayStartMs) {
        return p.replies >= options.olderMinReplies
      }
      return p.replies >= options.todayMinReplies
    })
    const sorted = [...filtered].sort((a, b) => {
      const da = computeHupuDecayedScore(a, options.now, options)
      const db = computeHupuDecayedScore(b, options.now, options)
      return db - da
    })
    result.set(board, sorted)
  })
  return result
}

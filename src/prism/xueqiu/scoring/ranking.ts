/**
 * Xueqiu ranking pipeline.
 *
 * Complete ranking pipeline that filters noise, computes scores,
 * and dynamically determines display count.
 */
import { computeTimeDecay } from '../../scoring-utils'
import type { XueqiuNewsItem, XueqiuRankingOptions } from '../types'
import { filterNoise } from './noise'
import { computeContentQualityScore } from './quality'
import { computeEngagementScore } from './engagement'

export { computeTimeDecay }

export type ScoredItem = {
  item: XueqiuNewsItem
  score: number
}

export function computeXueqiuScore(
  item: XueqiuNewsItem,
  now: number,
  options: XueqiuRankingOptions,
): number {
  const cqs = computeContentQualityScore(item)
  const eqs = computeEngagementScore(item)
  const td = computeTimeDecay(item.created_at, now, options.halfLifeDays)
  return cqs * options.cqsWeight + eqs * options.eqsWeight + td * options.timeDecayWeight
}

export function rankHotPosts(
  items: ReadonlyArray<XueqiuNewsItem>,
  now: number,
  options: XueqiuRankingOptions,
): XueqiuNewsItem[] {
  const filtered = filterNoise(items)

  const scored: ScoredItem[] = filtered.map((item) => ({
    item,
    score: computeXueqiuScore(item, now, options),
  }))

  scored.sort((a, b) => b.score - a.score)

  const count = dynamicCount(
    scored.map((s) => s.score),
    options.minItems,
  )

  return scored.slice(0, count).map((s) => s.item)
}

/**
 * 动态展示数量：找到分数分布的"肘部"。
 *
 * 策略：相邻两项分数差占首位分数的比例 > elbowDropRatio 时截断。
 * 保证至少显示 minItems 项。
 */
function dynamicCount(scores: ReadonlyArray<number>, minItems: number): number {
  if (scores.length === 0) return 0
  const leader = scores[0]!
  if (!Number.isFinite(leader) || leader <= 0) return minItems

  const ELBOW_DROP_RATIO = 0.3

  const dropIdx = scores.slice(1).findIndex((curr, i) => {
    const prev = scores[i]!
    const drop = (prev - curr) / leader
    return drop > ELBOW_DROP_RATIO
  })
  if (dropIdx >= 0) return Math.max(minItems, dropIdx + 1)

  return scores.length
}

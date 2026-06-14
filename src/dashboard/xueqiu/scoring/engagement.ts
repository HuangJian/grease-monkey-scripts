/**
 * Xueqiu engagement scoring.
 *
 * Computes engagement quality score (EQS) based on reply and like counts
 * using logarithmic normalization.
 */
import type { XueqiuNewsItem } from '../types'

export function computeEngagementScore(item: XueqiuNewsItem): number {
  const replies = item.reply_count ?? 0
  const likes = item.like_count ?? 0

  const LOG_201 = Math.log(201)
  const LOG_501 = Math.log(501)

  const replyNorm = Math.log(1 + replies) / LOG_201
  const likeNorm = Math.log(1 + likes) / LOG_501

  let eqs = replyNorm * 0.5 + likeNorm * 0.5

  // 讨论质量加成：回复多于点赞的 30%，说明引发深度讨论
  if (replies > likes * 0.3) {
    eqs *= 1.1
  }

  return Math.min(eqs, 1)
}

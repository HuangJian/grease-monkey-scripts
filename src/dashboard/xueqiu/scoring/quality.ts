/**
 * Xueqiu content quality scoring.
 *
 * Computes content quality score (CQS) based on length, data richness,
 * and structure analysis.
 */
import type { XueqiuNewsItem } from '../types'
import {
  LENGTH_RANGES,
  ANALYSIS_KEYWORDS,
  STOCK_CODE_PATTERN,
  NUMBER_PATTERN,
  QUOTE_PATTERN,
  BR_PATTERN,
} from './constants'
import { stripHtml } from './helpers'

function computeLengthScore(plainText: string): number {
  const len = plainText.length
  for (const range of LENGTH_RANGES) {
    if (len >= range.min && len < range.max) return range.score
  }
  return 0.1
}

function computeDataScore(plainText: string, html: string): number {
  let score = 0

  if (STOCK_CODE_PATTERN.test(html)) score += 0.3
  if (NUMBER_PATTERN.test(plainText)) score += 0.2

  let keywordHits = 0
  for (const kw of ANALYSIS_KEYWORDS) {
    if (plainText.includes(kw)) {
      keywordHits++
      if (keywordHits >= 4) break
    }
  }
  score += Math.min(keywordHits * 0.15, 0.5)

  return Math.min(score, 1)
}

function computeStructureScore(html: string): number {
  let score = 0

  if (BR_PATTERN.test(html)) score += 0.3
  if (QUOTE_PATTERN.test(html)) score += 0.2

  // 纯文本无标签 → 基础分
  if (!/<[a-z]/i.test(html)) score = Math.max(score, 0.2)

  return Math.min(score, 1)
}

export function computeContentQualityScore(item: XueqiuNewsItem): number {
  const plainText = stripHtml(item.text)
  const lengthScore = computeLengthScore(plainText)
  const dataScore = computeDataScore(plainText, item.text)
  const structureScore = computeStructureScore(item.text)
  return lengthScore * 0.3 + dataScore * 0.4 + structureScore * 0.3
}

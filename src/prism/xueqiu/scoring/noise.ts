/**
 * Xueqiu noise filtering.
 *
 * Filters out low-quality, spam, or emoji-heavy posts.
 */
import type { XueqiuNewsItem } from '../types'
import { MIN_TEXT_LENGTH_FOR_NOISE_CHECK } from './constants'
import { stripHtml, countEmoji } from './helpers'

export function isNoise(item: XueqiuNewsItem): boolean {
  const plainText = stripHtml(item.text)
  const len = plainText.length

  // 极短 + 低互动 = 噪音
  if (len < MIN_TEXT_LENGTH_FOR_NOISE_CHECK) {
    const lowReply = item.reply_count < 5
    const lowLike = (item.like_count ?? 0) < 20
    if (lowReply && lowLike) return true
  }

  // 表情刷屏
  const emojiCount = countEmoji(plainText)
  if (len > 0 && emojiCount / len > 0.5) return true

  return false
}

export function filterNoise(items: ReadonlyArray<XueqiuNewsItem>): XueqiuNewsItem[] {
  return items.filter((it) => !isNoise(it))
}

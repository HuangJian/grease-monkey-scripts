/**
 * Xueqiu scoring helper functions.
 *
 * Utility functions for text processing and emoji counting.
 */
import { EMOJI_PATTERN } from './constants'

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function countEmoji(text: string): number {
  const matches = text.match(EMOJI_PATTERN)
  return matches ? matches.length : 0
}

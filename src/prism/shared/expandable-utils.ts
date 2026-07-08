/**
 * Shared utilities for expandable/collapsible topic lists.
 */

export type TimeFormat = 'date-time' | 'date'

/**
 * Format a timestamp as `MM-DD HH:mm` (date-time) or `MM-DD` (date).
 */
export function formatTopicTime(ts: number, format: TimeFormat): string {
  const d = new Date(ts)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  if (format === 'date') return `${month}-${day}`
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

/**
 * Check whether *any part* of `el` is visible inside its nearest scrollable ancestor.
 *
 * Used to decide whether to scroll after expand/collapse: if the row title
 * is already (at least partially) on-screen, skip the scroll.
 */
export function isElementInScrollContainer(el: HTMLElement): boolean {
  const elRect = el.getBoundingClientRect()
  let parent = el.parentElement
  while (parent) {
    const style = getComputedStyle(parent)
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      const containerRect = parent.getBoundingClientRect()
      return elRect.bottom > containerRect.top && elRect.top < containerRect.bottom
    }
    parent = parent.parentElement
  }
  return true
}

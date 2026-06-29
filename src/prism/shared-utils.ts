import type { DateFilter } from './date-filter'
import { dateFilterBounds } from './date-filter'

export function formatReplyCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

export function sourceBadge(created: number): { icon: string; title: string } {
  const now = Date.now()
  const isToday = new Date(created).toDateString() === new Date(now).toDateString()
  return isToday ? { icon: '🌅', title: '今日主题' } : { icon: '⏳', title: '历史主题' }
}

export function applyDateFilter<T>(
  items: T[],
  filter: DateFilter,
  getCreated: (item: T) => number,
): T[] {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds) return items
  return items.filter((item) => {
    const created = getCreated(item)
    if (bounds.start !== undefined && created < bounds.start) return false
    if (bounds.end !== undefined && created >= bounds.end) return false
    return true
  })
}

export function applyGroupedDateFilter<T>(
  data: Record<string, T[]>,
  filter: DateFilter,
  getCreated: (item: T) => number,
): Record<string, T[]> {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds) return data
  return Object.entries(data).reduce<Record<string, T[]>>((result, [key, items]) => {
    const filtered = items.filter((item) => {
      const created = getCreated(item)
      if (bounds.start !== undefined && created < bounds.start) return false
      if (bounds.end !== undefined && created >= bounds.end) return false
      return true
    })
    if (filtered.length > 0) result[key] = filtered
    return result
  }, {})
}

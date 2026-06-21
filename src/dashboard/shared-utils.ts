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
  items: T[] | null,
  filter: DateFilter,
  getCreated: (item: T) => number | undefined,
): T[] | null {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds || !items) return items
  return items.filter((item) => {
    const created = getCreated(item)
    if (created === undefined) return false
    if (bounds.start !== undefined && created < bounds.start) return false
    if (bounds.end !== undefined && created >= bounds.end) return false
    return true
  })
}

export function applyGroupedDateFilter<T>(
  data: Record<string, T[]> | null,
  filter: DateFilter,
  getCreated: (item: T) => number | undefined,
): Record<string, T[]> | null {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds || !data) return data
  return Object.entries(data).reduce<Record<string, T[]>>((result, [key, items]) => {
    const filtered = items.filter((item) => {
      const created = getCreated(item)
      if (created === undefined) return false
      if (bounds.start !== undefined && created < bounds.start) return false
      if (bounds.end !== undefined && created >= bounds.end) return false
      return true
    })
    if (filtered.length > 0) result[key] = filtered
    return result
  }, {})
}

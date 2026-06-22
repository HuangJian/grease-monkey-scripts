import { describe, expect, test } from 'bun:test'
import {
  formatReplyCount,
  sourceBadge,
  applyDateFilter,
  applyGroupedDateFilter,
} from '../../src/dashboard/shared-utils'

describe('formatReplyCount', () => {
  test('returns current when readReplies is undefined', () => {
    expect(formatReplyCount(10, undefined)).toBe('10')
  })

  test('returns current when current <= readReplies', () => {
    expect(formatReplyCount(5, 5)).toBe('5')
    expect(formatReplyCount(3, 5)).toBe('3')
  })

  test('shows unread delta when current > readReplies', () => {
    expect(formatReplyCount(10, 3)).toBe('3+7')
    expect(formatReplyCount(5, 0)).toBe('0+5')
  })

  test('handles zero', () => {
    expect(formatReplyCount(0, undefined)).toBe('0')
    expect(formatReplyCount(0, 0)).toBe('0')
  })
})

describe('sourceBadge', () => {
  test('returns today icon for timestamps from today', () => {
    const now = Date.now()
    const badge = sourceBadge(now)
    expect(badge.icon).toBe('🌅')
    expect(badge.title).toBe('今日主题')
  })

  test('returns history icon for timestamps from yesterday', () => {
    const yesterday = Date.now() - 86400000
    const badge = sourceBadge(yesterday)
    expect(badge.icon).toBe('⏳')
    expect(badge.title).toBe('历史主题')
  })

  test('returns history icon for old timestamps', () => {
    const old = Date.now() - 7 * 86400000
    const badge = sourceBadge(old)
    expect(badge.icon).toBe('⏳')
    expect(badge.title).toBe('历史主题')
  })
})

describe('applyDateFilter', () => {
  const items = [
    { id: '1', created: 100 },
    { id: '2', created: 200 },
    { id: '3', created: 300 },
    { id: '4', created: undefined as number | undefined },
  ]

  test('returns original items for unknown filter', () => {
    const result = applyDateFilter(items, '未', (i) => i.created)
    expect(result).toBe(items)
  })

  test('filters items outside bounds', () => {
    const now = Date.now()
    const dayMs = 86400000
    const localDayStart = new Date(now).setHours(0, 0, 0, 0)

    const freshItems = [
      { id: '1', created: localDayStart + dayMs * 0.5 }, // 今天本地中午 → "今"
      { id: '2', created: localDayStart - dayMs * 0.5 }, // 昨天本地中午 → "昨"
      { id: '3', created: localDayStart - dayMs * 5 }, // 5天前 → "早"
    ]

    const todayResult = applyDateFilter(freshItems, '今', (i) => i.created)
    expect(todayResult).not.toBeNull()
    expect(todayResult!.length).toBe(1)
    expect(todayResult![0].id).toBe('1')

    const yesterdayResult = applyDateFilter(freshItems, '昨', (i) => i.created)
    expect(yesterdayResult).not.toBeNull()
    expect(yesterdayResult!.length).toBe(1)
    expect(yesterdayResult![0].id).toBe('2')

    const olderResult = applyDateFilter(freshItems, '早', (i) => i.created)
    expect(olderResult).not.toBeNull()
    expect(olderResult!.length).toBe(1)
    expect(olderResult![0].id).toBe('3')
  })

  test('returns null for null input', () => {
    const result = applyDateFilter(null, '今', (i: { created: number }) => i.created)
    expect(result).toBeNull()
  })

  test('excludes items with undefined created', () => {
    const now = Date.now()
    const localDayStart = new Date(now).setHours(0, 0, 0, 0)
    const itemsWithUndefined = [
      { id: '1', created: localDayStart + 3600000 },
      { id: '2', created: undefined as number | undefined },
    ]
    const result = applyDateFilter(itemsWithUndefined, '今', (i) => i.created)
    expect(result).not.toBeNull()
    expect(result!.length).toBe(1)
    expect(result![0].id).toBe('1')
  })
})

describe('applyGroupedDateFilter', () => {
  test('filters grouped data and drops empty groups', () => {
    const now = Date.now()
    const dayMs = 86400000
    const localDayStart = new Date(now).setHours(0, 0, 0, 0)

    const grouped = {
      a: [
        { id: '1', created: localDayStart + dayMs * 0.5 }, // 今天本地中午 → "今"
        { id: '2', created: localDayStart - dayMs * 5 }, // 5天前 → 不在"今"
      ],
      b: [{ id: '3', created: localDayStart - dayMs * 5 }], // 5天前 → 不在"今"
    }

    const result = applyGroupedDateFilter(grouped, '今', (i) => i.created)
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toEqual(['a'])
    expect(result!['a'].length).toBe(1)
    expect(result!['a'][0].id).toBe('1')
  })

  test('returns null for null input', () => {
    const result = applyGroupedDateFilter(null, '今', (i: { created: number }) => i.created)
    expect(result).toBeNull()
  })

  test('returns original data for unknown filter', () => {
    const data = { a: [{ id: '1', created: 100 }] }
    const result = applyGroupedDateFilter(data, '未', (i) => i.created)
    expect(result).toBe(data)
  })

  test('drops all groups when nothing matches', () => {
    const now = Date.now()
    const grouped = {
      a: [{ id: '1', created: now - now }], // epoch, very old
    }

    const result = applyGroupedDateFilter(grouped, '今', (i) => i.created)
    expect(result).not.toBeNull()
    expect(Object.keys(result!)).toEqual([])
  })
})

import { describe, expect, test } from 'bun:test'
import {
  formatReplyCount,
  sourceBadge,
  applyDateFilter,
  applyGroupedDateFilter,
  hasKnownTimestamp,
  earliestTimestamp,
  isRetentionExpired,
  localDateKey,
} from '../../src/prism/shared-utils'

describe('localDateKey', () => {
  test('formats as YYYY-MM-DD in local time', () => {
    // Noon UTC — safely mid-day in any timezone, so +1h stays on the same day.
    const ms = Date.UTC(2026, 2, 9, 12, 0)
    const key = localDateKey(ms)
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The local-day key must equal the key derived from a same-local-day instant.
    const sameLocalDay = new Date(ms)
    sameLocalDay.setHours(sameLocalDay.getHours() + 1) // still same local calendar day
    expect(localDateKey(sameLocalDay.getTime())).toBe(key)
  })

  test('two instants on different local days produce different keys', () => {
    const d = new Date(2026, 2, 9, 23, 59)
    const next = new Date(2026, 2, 10, 0, 1)
    expect(localDateKey(d.getTime())).not.toBe(localDateKey(next.getTime()))
  })
})

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

describe('hasKnownTimestamp', () => {
  test('rejects the 0 sentinel used for a missing creation time', () => {
    expect(hasKnownTimestamp(0)).toBe(false)
    expect(hasKnownTimestamp(-1)).toBe(false)
    expect(hasKnownTimestamp(Number.NaN)).toBe(false)
    expect(hasKnownTimestamp(undefined)).toBe(false)
  })

  test('accepts real timestamps', () => {
    expect(hasKnownTimestamp(Date.now())).toBe(true)
  })
})

describe('earliestTimestamp', () => {
  test('takes the earlier of two real timestamps', () => {
    expect(earliestTimestamp(500, 300)).toBe(300)
    expect(earliestTimestamp(300, 500)).toBe(300)
  })

  test('ignores unknown timestamps so a stale 0 cannot win', () => {
    // Regression: Math.min(live, 0) used to zero out a freshly fetched post
    // whenever the cached copy had lost its timestamp.
    expect(earliestTimestamp(0, 500)).toBe(500)
    expect(earliestTimestamp(500, 0)).toBe(500)
  })
})

describe('isRetentionExpired', () => {
  const retentionMs = 7 * 86400000
  const now = Date.now()

  test('expires items older than the retention window', () => {
    expect(isRetentionExpired(now - retentionMs - 1, now, retentionMs)).toBe(true)
  })

  test('keeps items inside the retention window', () => {
    expect(isRetentionExpired(now - retentionMs + 1, now, retentionMs)).toBe(false)
  })

  test('expires a missing timestamp so legacy 0 entries get purged', () => {
    expect(isRetentionExpired(0, now, retentionMs)).toBe(true)
  })
})

describe('applyDateFilter', () => {
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
    expect(todayResult.length).toBe(1)
    expect(todayResult[0]!.id).toBe('1')

    const yesterdayResult = applyDateFilter(freshItems, '昨', (i) => i.created)
    expect(yesterdayResult.length).toBe(1)
    expect(yesterdayResult[0]!.id).toBe('2')

    const olderResult = applyDateFilter(freshItems, '早', (i) => i.created)
    expect(olderResult.length).toBe(1)
    expect(olderResult[0]!.id).toBe('3')
  })

  test('returns empty array for empty input', () => {
    const result = applyDateFilter([], '今', (i: { created: number }) => i.created)
    expect(result).toEqual([])
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
    expect(Object.keys(result)).toEqual(['a'])
    expect(result['a']!.length).toBe(1)
    expect(result['a']![0]!.id).toBe('1')
  })

  test('drops all groups when nothing matches', () => {
    const now = Date.now()
    const grouped = {
      a: [{ id: '1', created: now - now }], // epoch, very old
    }

    const result = applyGroupedDateFilter(grouped, '今', (i) => i.created)
    expect(Object.keys(result)).toEqual([])
  })

  test('returns empty object for empty input', () => {
    const result = applyGroupedDateFilter({}, '今', (i: { created: number }) => i.created)
    expect(result).toEqual({})
  })
})

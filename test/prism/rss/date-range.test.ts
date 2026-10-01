import { describe, expect, test } from 'bun:test'
import {
  ALL_DATES,
  applyDateRange,
  DATE_RANGE_OPTIONS,
  dateRangeBounds,
  isDateRangeActive,
  type DateRangePreset,
} from '../../../src/prism/rss/date-range'

/** Local midnight `offset` days from `now`'s own day. */
function midnight(offset: number, now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.getTime()
}

/** 2026-09-30 is a Wednesday, so 本周 has room on both sides. */
const NOW = new Date(2026, 8, 30, 15, 45).getTime()
const THIS_MONDAY = midnight(-2, NOW)

describe('DATE_RANGE_OPTIONS', () => {
  test('offers 全部 plus the four windows', () => {
    expect(DATE_RANGE_OPTIONS).toEqual(['全部', '本周', '近十天', '近三十天', '三十天以前'])
  })
})

describe('isDateRangeActive', () => {
  test('only 全部 is inactive', () => {
    expect(isDateRangeActive(ALL_DATES)).toBe(false)
    for (const option of DATE_RANGE_OPTIONS.filter((it) => it !== ALL_DATES)) {
      expect(isDateRangeActive(option)).toBe(true)
    }
  })
})

describe('dateRangeBounds', () => {
  test('全部 means no bounds at all', () => {
    expect(dateRangeBounds('全部', NOW)).toBeNull()
  })

  test("本周 starts at this week's Monday and stays open at the top", () => {
    expect(dateRangeBounds('本周', NOW)).toEqual({ start: THIS_MONDAY })
  })

  test('本周 is Monday-based even on a Sunday', () => {
    // getDay() is Sunday-first; without the shift, Sunday would start a new week
    // and the whole week behind it would fall out of the window.
    const sunday = new Date(2026, 9, 4, 9, 0).getTime()
    expect(dateRangeBounds('本周', sunday)).toEqual({ start: midnight(-6, sunday) })
  })

  test('近十天 is today plus the nine days before it', () => {
    // Calendar days, not 10 × 24h: the bound is a midnight, so the section
    // headings and the window agree about where the window starts.
    expect(dateRangeBounds('近十天', NOW)).toEqual({ start: midnight(-9, NOW) })
  })

  test('近三十天 covers thirty calendar days', () => {
    expect(dateRangeBounds('近三十天', NOW)).toEqual({ start: midnight(-29, NOW) })
  })

  test('三十天以前 is the exact complement of 近三十天', () => {
    // One starts where the other ends: switching between them cannot drop an
    // entry or show it twice.
    const recent = dateRangeBounds('近三十天', NOW)!
    const older = dateRangeBounds('三十天以前', NOW)!
    expect(recent.start).toBe(older.end)
    expect(recent.end).toBeUndefined()
    expect(older.start).toBeUndefined()
  })

  test('only 三十天以前 has an upper bound — there is no future to keep out', () => {
    // An entry whose feed timestamp runs ahead of this machine's clock is still
    // recent, and clipping it would be indistinguishable from a bug.
    for (const option of DATE_RANGE_OPTIONS) {
      if (option === '三十天以前') continue
      expect(dateRangeBounds(option, NOW)?.end).toBeUndefined()
    }
  })
})

describe('applyDateRange', () => {
  const items = [
    { id: 'today', pubDate: midnight(0, NOW) + 12 * 3600_000 },
    { id: 'd9', pubDate: midnight(-9, NOW) },
    { id: 'd10', pubDate: midnight(-10, NOW) },
    { id: 'd29', pubDate: midnight(-29, NOW) },
    { id: 'd30', pubDate: midnight(-30, NOW) },
    { id: 'monday', pubDate: THIS_MONDAY },
    { id: 'beforeMonday', pubDate: THIS_MONDAY - 1 },
  ]
  const ids = (range: DateRangePreset) =>
    applyDateRange(items, range, (it) => it.pubDate, NOW).map((it) => it.id)

  test('全部 keeps everything', () => {
    expect(ids('全部')).toEqual(items.map((it) => it.id))
  })

  test('本周 keeps the week and drops what came before it', () => {
    const kept = ids('本周')
    expect(kept).toContain('monday')
    expect(kept).not.toContain('beforeMonday')
  })

  test('近十天 keeps the boundary day and nothing past it', () => {
    const kept = ids('近十天')
    expect(kept).toContain('d9')
    expect(kept).not.toContain('d10')
  })

  test('近三十天 keeps day 29 and hands day 30 to 三十天以前', () => {
    expect(ids('近三十天')).toContain('d29')
    expect(ids('近三十天')).not.toContain('d30')
    expect(ids('三十天以前')).toEqual(['d30'])
  })

  test('the two long windows together account for every entry', () => {
    const union = new Set([...ids('近三十天'), ...ids('三十天以前')])
    expect(union.size).toBe(items.length)
  })
})

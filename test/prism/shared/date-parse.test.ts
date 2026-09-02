import { describe, expect, test } from 'bun:test'
import {
  currentYear,
  parseChapterLabel,
  parseDateLabelToStr,
  parseRelativeTime,
  startOfDay,
} from '../../../src/prism/shared/date-parse'

const NOW = new Date(2026, 5, 3, 12, 0, 0).getTime() // 2026-06-03 12:00 local

describe('shared/date-parse', () => {
  test('startOfDay floors to local midnight', () => {
    expect(startOfDay(NOW)).toBe(new Date(2026, 5, 3, 0, 0, 0, 0).getTime())
  })

  test('currentYear reads local year', () => {
    expect(currentYear(NOW)).toBe(2026)
  })

  describe('parseRelativeTime (hupu, +08:00, no year roll-back)', () => {
    test('falls back to now on empty / unknown', () => {
      expect(parseRelativeTime('', NOW)).toBe(NOW)
      expect(parseRelativeTime('刚刚', NOW)).toBe(NOW)
    })
    test('relative offsets from now', () => {
      expect(parseRelativeTime('5分钟前', NOW)).toBe(NOW - 5 * 60_000)
      expect(parseRelativeTime('2小时前', NOW)).toBe(NOW - 2 * 3_600_000)
      expect(parseRelativeTime('3天前', NOW)).toBe(NOW - 3 * 86_400_000)
    })
    test('absolute datetime pinned to +08:00', () => {
      const ts = parseRelativeTime('2026-06-03 13:30', NOW)
      // 2026-06-03 13:30 +08:00 in local ms (machine tz-independent).
      expect(ts).toBe(new Date('2026-06-03T13:30:00+08:00').getTime())
    })
  })

  describe('parseChapterLabel (novels, local tz, year roll-back)', () => {
    test('今天 / 昨天 map to local midnight', () => {
      const t = parseChapterLabel('今天', NOW)!
      expect(new Date(t).getDate()).toBe(3)
      expect(new Date(t).getHours()).toBe(0)
      const y = parseChapterLabel('昨天', NOW)!
      expect(new Date(y).getDate()).toBe(2)
    })
    test('HH:MM is today at that time', () => {
      const t = parseChapterLabel('18:30', NOW)!
      expect(new Date(t).getHours()).toBe(18)
      expect(new Date(t).getMinutes()).toBe(30)
    })
    test('YYYY-MM-DD is absolute', () => {
      const t = parseChapterLabel('2024-01-15', NOW)!
      expect(new Date(t).getFullYear()).toBe(2024)
    })
    test('MM-DD rolls back a year when it would be in the future', () => {
      // 12-25 is after 06-03, so it must be last year (2025).
      const t = parseChapterLabel('12-25', NOW)!
      expect(new Date(t).getFullYear()).toBe(2025)
      expect(new Date(t).getMonth()).toBe(11)
      expect(new Date(t).getDate()).toBe(25)
    })
    test('returns undefined for unknown', () => {
      expect(parseChapterLabel('')).toBeUndefined()
      expect(parseChapterLabel('未知格式', NOW)).toBeUndefined()
    })
  })

  describe('two parsers intentionally differ', () => {
    test('month-day handling: hupu keeps current year, novels rolls back', () => {
      // hupu has no year roll-back, so 12-25 stays 2026; novels rolls to 2025.
      const hupu = parseRelativeTime('12-25 00:00', NOW)
      const novels = parseChapterLabel('12-25', NOW)!
      expect(new Date(hupu).getFullYear()).toBe(2026)
      expect(new Date(novels).getFullYear()).toBe(2025)
    })
  })

  describe('parseDateLabelToStr (weather CMA, M/D -> YYYY-MM-DD)', () => {
    test('builds a date string with the current year', () => {
      expect(parseDateLabelToStr('9/2', NOW)).toBe('2026-09-02')
    })
    test('accepts a dash separator too', () => {
      expect(parseDateLabelToStr('09-02', NOW)).toBe('2026-09-02')
    })
    test('returns undefined for non date labels', () => {
      expect(parseDateLabelToStr('今天', NOW)).toBeUndefined()
      expect(parseDateLabelToStr('garbage', NOW)).toBeUndefined()
    })
    test('rejects impossible month/day', () => {
      expect(parseDateLabelToStr('13/40', NOW)).toBeUndefined()
    })
  })
})

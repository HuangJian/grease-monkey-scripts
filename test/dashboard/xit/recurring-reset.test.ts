import { describe, expect, it } from 'bun:test'
import {
  applyRecurringReset,
  dateKey,
  weekKey,
  resetRecurringTasks,
  LAST_RESET_KEY,
} from '../../../src/dashboard/xit/recurring-reset'
import { createRuntime, type TestRuntime } from '../../runtime'

describe('dateKey', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 5, 25))).toBe('2026-06-25')
    expect(dateKey(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(dateKey(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('weekKey', () => {
  it('returns Monday for a Monday', () => {
    // 2026-06-15 is a Monday
    expect(weekKey(new Date(2026, 5, 15))).toBe('2026-06-15')
  })

  it('returns the same Monday for any day in the same week', () => {
    // Week of 2026-06-15 (Monday) to 2026-06-21 (Sunday)
    for (let day = 15; day <= 21; day++) {
      expect(weekKey(new Date(2026, 5, day))).toBe('2026-06-15')
    }
  })

  it('returns different keys for different weeks', () => {
    expect(weekKey(new Date(2026, 5, 14))).toBe('2026-06-08') // Sunday of previous week
    expect(weekKey(new Date(2026, 5, 15))).toBe('2026-06-15') // Monday of new week
  })

  it('handles year boundaries', () => {
    // 2026-12-28 is a Monday
    expect(weekKey(new Date(2026, 11, 28))).toBe('2026-12-28')
    // 2026-12-31 is Thursday, same week
    expect(weekKey(new Date(2026, 11, 31))).toBe('2026-12-28')
    // 2027-01-01 is Friday, same week
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-12-28')
    // 2027-01-04 is Monday, new week
    expect(weekKey(new Date(2027, 0, 4))).toBe('2027-01-04')
  })
})

describe('applyRecurringReset', () => {
  // 2026-06-15 is a Monday
  const monday = new Date(2026, 5, 15, 10, 0, 0)
  const tuesday = new Date(2026, 5, 16, 10, 0, 0)
  const nextMonday = new Date(2026, 5, 22, 10, 0, 0)

  it('first run (null lastResetDate) does not reset, records today', () => {
    const text = '[x] Daily task ->everyday\n[x] Weekly task ->monday'
    const result = applyRecurringReset(text, null, monday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
    expect(result.lastResetDate).toBe('2026-06-15')
  })

  it('same day does not reset', () => {
    const text = '[x] Daily task ->everyday\n[x] Weekly task ->monday'
    const result = applyRecurringReset(text, '2026-06-15', monday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
    expect(result.lastResetDate).toBe('2026-06-15')
  })

  it('next day same week resets everyday items only', () => {
    const text = [
      '[x] Daily task ->everyday',
      '[x] Weekly task ->monday',
      '[x] Regular task -> 2026-06-20',
      '[ ] Open daily task ->everyday',
    ].join('\n')
    const result = applyRecurringReset(text, '2026-06-15', tuesday)
    expect(result.changed).toBe(true)
    expect(result.lastResetDate).toBe('2026-06-16')
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('[ ] Daily task ->everyday')
    expect(lines[1]).toBe('[x] Weekly task ->monday') // not reset (same week)
    expect(lines[2]).toBe('[x] Regular task -> 2026-06-20') // not reset (fixed date)
    expect(lines[3]).toBe('[ ] Open daily task ->everyday') // was already open
  })

  it('crossing week boundary resets weekday items', () => {
    const text = [
      '[x] Daily task ->everyday',
      '[x] Weekly task ->monday',
      '[x] Friday task ->friday',
    ].join('\n')
    // lastReset Sunday 2026-06-21, now Monday 2026-06-22
    const result = applyRecurringReset(text, '2026-06-21', nextMonday)
    expect(result.changed).toBe(true)
    expect(result.lastResetDate).toBe('2026-06-22')
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('[ ] Daily task ->everyday') // day changed too
    expect(lines[1]).toBe('[ ] Weekly task ->monday') // week changed
    expect(lines[2]).toBe('[ ] Friday task ->friday') // week changed
  })

  it('same day different time does not reset', () => {
    const text = '[x] Daily task ->everyday'
    const morning = new Date(2026, 5, 15, 6, 0, 0)
    const evening = new Date(2026, 5, 15, 23, 0, 0)
    const result = applyRecurringReset(text, '2026-06-15', evening)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
    // morning and evening are same day
    const result2 = applyRecurringReset(text, dateKey(morning), evening)
    expect(result2.changed).toBe(false)
  })

  it('does not reset non-checked statuses', () => {
    const text = [
      '[@] Ongoing daily ->everyday',
      '[~] Obsolete daily ->everyday',
      '[?] Question daily ->everyday',
    ].join('\n')
    const result = applyRecurringReset(text, '2026-06-15', tuesday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
  })

  it('does not reset items without due date', () => {
    const text = '[x] No due date task'
    const result = applyRecurringReset(text, '2026-06-15', nextMonday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
  })

  it('does not reset items with fixed YYYY-MM-DD due date', () => {
    const text = '[x] Fixed date -> 2026-06-20'
    const result = applyRecurringReset(text, '2026-06-15', nextMonday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
  })

  it('resets all weekday names when week changes', () => {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const text = weekdays.map((d) => `[x] Task ->${d}`).join('\n')
    const result = applyRecurringReset(text, '2026-06-21', nextMonday)
    expect(result.changed).toBe(true)
    const lines = result.text.split('\n')
    lines.forEach((line) => {
      expect(line.startsWith('[ ]')).toBe(true)
    })
  })

  it('preserves priority, tags, and multi-line descriptions', () => {
    const text = [
      '[x] !!! Important daily ->everyday #urgent',
      '[x] Multi-line task ->monday:',
      '    line 2',
      '    line 3',
    ].join('\n')
    // Cross week boundary
    const result = applyRecurringReset(text, '2026-06-21', nextMonday)
    expect(result.changed).toBe(true)
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('[ ] !!! Important daily ->everyday #urgent')
    expect(lines[1]).toBe('[ ] Multi-line task ->monday:')
    expect(lines[2]).toBe('    line 2')
    expect(lines[3]).toBe('    line 3')
  })

  it('handles -> with space before keyword', () => {
    const text = '[x] Daily task -> everyday'
    const result = applyRecurringReset(text, '2026-06-15', tuesday)
    expect(result.changed).toBe(true)
    expect(result.text).toBe('[ ] Daily task -> everyday')
  })

  it('handles CRLF line endings', () => {
    const text = '[x] Daily task ->everyday\r\n[x] Weekly task ->monday'
    const result = applyRecurringReset(text, '2026-06-21', nextMonday)
    expect(result.changed).toBe(true)
    expect(result.text).toBe('[ ] Daily task ->everyday\r\n[ ] Weekly task ->monday')
  })

  it('multiple days same week resets everyday items', () => {
    const text = '[x] Daily task ->everyday\n[x] Weekly task ->wednesday'
    // lastReset Monday 2026-06-15, now Thursday 2026-06-18 (same week)
    const thursday = new Date(2026, 5, 18, 10, 0, 0)
    const result = applyRecurringReset(text, '2026-06-15', thursday)
    expect(result.changed).toBe(true)
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('[ ] Daily task ->everyday')
    expect(lines[1]).toBe('[x] Weekly task ->wednesday') // same week, not reset
  })

  it('multiple weeks later resets both everyday and weekday', () => {
    const text = '[x] Daily task ->everyday\n[x] Weekly task ->monday'
    // lastReset 2026-06-15, now 2026-07-01 (3 weeks later)
    const result = applyRecurringReset(text, '2026-06-15', new Date(2026, 6, 1))
    expect(result.changed).toBe(true)
    const lines = result.text.split('\n')
    expect(lines[0]).toBe('[ ] Daily task ->everyday')
    expect(lines[1]).toBe('[ ] Weekly task ->monday')
  })

  it('empty text returns unchanged', () => {
    const result = applyRecurringReset('', '2026-06-15', tuesday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe('')
  })

  it('text with no recurring items returns unchanged', () => {
    const text = '[x] Regular task\n[ ] Another task -> 2026-12-01'
    const result = applyRecurringReset(text, '2026-06-15', nextMonday)
    expect(result.changed).toBe(false)
    expect(result.text).toBe(text)
  })
})

describe('resetRecurringTasks (I/O)', () => {
  function setup(): TestRuntime {
    return createRuntime()
  }

  it('first run initializes last-reset date without modifying text', async () => {
    const runtime = setup()
    const text = '[x] Daily ->everyday'
    const result = await resetRecurringTasks(runtime, text)
    expect(result).toBe(text) // unchanged
    expect(runtime.stores[LAST_RESET_KEY]).toBe(dateKey(new Date()))
  })

  it('resets everyday items when day changes', async () => {
    const runtime = setup()
    // Simulate a previous run from yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayKey = dateKey(yesterday)
    runtime.stores[LAST_RESET_KEY] = yesterdayKey

    const text = '[x] Daily ->everyday\n[x] Regular -> 2026-12-01'
    const result = await resetRecurringTasks(runtime, text)
    expect(result).toBe('[ ] Daily ->everyday\n[x] Regular -> 2026-12-01')
    expect(runtime.stores[LAST_RESET_KEY]).toBe(dateKey(new Date()))
  })

  it('does not reset when same day', async () => {
    const runtime = setup()
    runtime.stores[LAST_RESET_KEY] = dateKey(new Date())

    const text = '[x] Daily ->everyday'
    const result = await resetRecurringTasks(runtime, text)
    expect(result).toBe(text)
  })
})

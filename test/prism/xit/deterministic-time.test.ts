import { describe, expect, it } from 'bun:test'
import { createRuntime } from '../../runtime'
import {
  getTodayStart,
  resolveDateKeyword,
  parseDateValue,
} from '../../../src/prism/xit/query/date-math'
import { getDueDateStatus, formatDueDateDisplay } from '../../../src/prism/xit/render/due-date'
import { parseQuery, filterItems } from '../../../src/prism/xit/query'
import { computePinnedLines } from '../../../src/prism/xit/component/body'
import { resetRecurringTasks, LAST_RESET_KEY } from '../../../src/prism/xit/recurring-reset'
import type { XitItem, XitLine } from '../../../src/prism/xit/types'

// Fixed wall-clock reference. Every function under test accepts an injected
// `now: Date` seam; passing these constants makes date logic fully deterministic
// and proves the seam actually drives results (S14.1 / S14.2).
const FIXED = new Date(2026, 5, 10, 14, 30, 0) // local: 2026-06-10 (Wed) 14:30
const NOW_LATER = new Date(2026, 5, 12, 14, 30, 0) // local: 2026-06-12 (Fri) 14:30

function makeItem(overrides: Partial<XitItem> = {}): XitItem {
  return {
    type: 'item',
    status: 'open',
    priority: 0,
    priorityText: '',
    description: '',
    rawLines: [],
    lineIndex: 0,
    dueDate: null,
    tags: [],
    ...overrides,
  }
}

const toLines = (items: XitItem[]): XitLine[] => items.map((i) => i as any)

describe('deterministic time seam — date-math', () => {
  it('getTodayStart collapses to local midnight of injected now', () => {
    const start = getTodayStart(FIXED)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(5)
    expect(start.getDate()).toBe(10)
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
  })

  it('parseDateValue MMDD branch uses injected now year', () => {
    const d = parseDateValue('0610', FIXED)
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2026) // FIXED year, not the wall clock year
    expect(d!.getMonth()).toBe(5)
    expect(d!.getDate()).toBe(10)
  })

  it('resolveDateKeyword today spans injected now date', () => {
    const range = resolveDateKeyword('today', undefined, FIXED)
    expect(range).not.toBeNull()
    expect(range!.start.getDate()).toBe(10)
    expect(range!.end.getDate()).toBe(11)
    expect(range!.start.getFullYear()).toBe(2026)
  })
})

describe('deterministic time seam — due-date render', () => {
  it('getDueDateStatus classifies relative to injected now', () => {
    expect(getDueDateStatus('2026-06-09', FIXED)).toBe('overdue')
    expect(getDueDateStatus('2026-06-10', FIXED)).toBe('today')
    expect(getDueDateStatus('2026-06-11', FIXED)).toBe('tomorrow')
    expect(getDueDateStatus('2026-06-12', FIXED)).toBe('soon')
    expect(getDueDateStatus('2026-06-14', FIXED)).toBe('future')
  })

  it('formatDueDateDisplay strips current year from injected now', () => {
    expect(formatDueDateDisplay('2026-06-10', FIXED)).toBe('06-10')
    expect(formatDueDateDisplay('2025-06-10', FIXED)).toBe('2025-06-10')
    expect(formatDueDateDisplay('everyday', FIXED)).toBe('everyday')
  })
})

describe('deterministic time seam — filterItems', () => {
  const itemDueFixed = toLines([makeItem({ description: 'due on FIXED', dueDate: '2026-06-10' })])

  it('today query matches only when injected now lands on the due date', () => {
    const ast = parseQuery('today')
    expect(ast.ok).toBe(true)
    if (!ast.ok) return
    expect(filterItems(itemDueFixed, ast.ast, FIXED).length).toBe(1)
    // Two days later the same item is overdue, so `today` no longer matches.
    expect(filterItems(itemDueFixed, ast.ast, NOW_LATER).length).toBe(0)
  })

  it('overdue query matches only after injected now passes the due date', () => {
    const ast = parseQuery('overdue')
    expect(ast.ok).toBe(true)
    if (!ast.ok) return
    // On FIXED the item is "today", not overdue.
    expect(filterItems(itemDueFixed, ast.ast, FIXED).length).toBe(0)
    // Two days later it is in the past.
    expect(filterItems(itemDueFixed, ast.ast, NOW_LATER).length).toBe(1)
  })

  it('everyday query resolves against injected now', () => {
    const everyday = toLines([makeItem({ description: 'everyday task', dueDate: 'everyday' })])
    const ast = parseQuery('today')
    expect(ast.ok).toBe(true)
    if (!ast.ok) return
    expect(filterItems(everyday, ast.ast, FIXED).length).toBe(1)
    expect(filterItems(everyday, ast.ast, NOW_LATER).length).toBe(1)
  })
})

describe('deterministic time seam — computePinnedLines', () => {
  it('pins a today-due item only when injected now lands on its date', () => {
    const lines = toLines([makeItem({ status: 'open', dueDate: '2026-06-12', priority: 1 })])
    // Under FIXED (06-10) the item is future → not pinned.
    expect(computePinnedLines(lines, FIXED).length).toBe(0)
    // Under NOW_LATER (06-12) the item is today → pinned.
    expect(computePinnedLines(lines, NOW_LATER).length).toBe(1)
  })
})

describe('deterministic time seam — recurring reset boundary', () => {
  it('resetRecurringTasks reads now from the runtime clock (not the wall clock)', async () => {
    const runtime = createRuntime()
    runtime.setClock(FIXED.getTime())

    // Last reset was the day before FIXED → daily reset should trigger.
    runtime.stores[LAST_RESET_KEY] = '2026-06-09'
    const text = '[x] daily chore -> everyday\n[ ] normal task\n'

    const result = await resetRecurringTasks(runtime, text)

    // The checked everyday item is un-checked.
    expect(result).toContain('[ ] daily chore -> everyday')
    expect(result).not.toContain('[x] daily chore')

    // LAST_RESET advanced to the injected now's date key.
    expect(runtime.stores[LAST_RESET_KEY]).toBe('2026-06-10')
  })

  it('resetRecurringTasks is a no-op when last reset equals injected now', async () => {
    const runtime = createRuntime()
    runtime.setClock(FIXED.getTime())
    runtime.stores[LAST_RESET_KEY] = '2026-06-10' // same as FIXED's date key
    const text = '[x] daily chore -> everyday\n'

    const result = await resetRecurringTasks(runtime, text)

    expect(result).toContain('[x] daily chore -> everyday') // unchanged
    expect(runtime.stores[LAST_RESET_KEY]).toBe('2026-06-10')
  })
})

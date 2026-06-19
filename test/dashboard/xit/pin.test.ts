import { describe, expect, it } from 'bun:test'
import { computePinnedLines } from '../../../src/dashboard/xit/component/body'
import type { XitItem, XitLine } from '../../../src/dashboard/xit/types'

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

function todayStr(): string {
  const d = new Date()
  return d.toISOString().slice(0, 10)
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

describe('computePinnedLines', () => {
  it('pins overdue open items', () => {
    const lines: XitLine[] = [makeItem({ status: 'open', dueDate: yesterdayStr(), priority: 1 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
    expect((pinned[0] as XitItem).status).toBe('open')
  })

  it('pins today open items', () => {
    const lines: XitLine[] = [makeItem({ status: 'open', dueDate: todayStr(), priority: 1 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
    expect((pinned[0] as XitItem).status).toBe('open')
  })

  it('does not pin checked items with overdue due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'checked', dueDate: yesterdayStr(), priority: 5 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(0)
  })

  it('does not pin obsolete items with overdue due date', () => {
    const lines: XitLine[] = [
      makeItem({ status: 'obsolete', dueDate: yesterdayStr(), priority: 5 }),
    ]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(0)
  })

  it('pins checked items with today due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'checked', dueDate: todayStr(), priority: 5 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
  })

  it('pins obsolete items with today due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'obsolete', dueDate: todayStr(), priority: 5 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
  })

  it('pins ongoing items with overdue due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'ongoing', dueDate: yesterdayStr(), priority: 1 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
  })

  it('pins in-question items with today due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'in-question', dueDate: todayStr(), priority: 1 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(1)
  })

  it('sorts pinned items by priority descending', () => {
    const lines: XitLine[] = [
      makeItem({ status: 'open', dueDate: yesterdayStr(), priority: 1 }),
      makeItem({ status: 'open', dueDate: yesterdayStr(), priority: 3 }),
      makeItem({ status: 'open', dueDate: yesterdayStr(), priority: 2 }),
    ]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(3)
    expect((pinned[0] as XitItem).priority).toBe(3)
    expect((pinned[1] as XitItem).priority).toBe(2)
    expect((pinned[2] as XitItem).priority).toBe(1)
  })

  it('overdue items come before today items', () => {
    const lines: XitLine[] = [
      makeItem({ status: 'open', dueDate: todayStr(), priority: 5 }),
      makeItem({ status: 'open', dueDate: yesterdayStr(), priority: 1 }),
    ]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(2)
    expect((pinned[0] as XitItem).dueDate).toBe(yesterdayStr())
    expect((pinned[1] as XitItem).dueDate).toBe(todayStr())
  })

  it('does not pin items without due date', () => {
    const lines: XitLine[] = [makeItem({ status: 'open', dueDate: null, priority: 5 })]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(0)
  })

  it('does not pin items with future due date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 10)
    const lines: XitLine[] = [
      makeItem({ status: 'open', dueDate: future.toISOString().slice(0, 10), priority: 5 }),
    ]
    const pinned = computePinnedLines(lines)
    expect(pinned.length).toBe(0)
  })
})

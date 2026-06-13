import { describe, expect, it } from 'bun:test'
import {
  parseXitText,
  parseDueDate,
  resolveWeekday,
  isWeekdayName,
} from '../../../src/dashboard/xit/parser'
import type { XitItem, XitHeading, XitComment } from '../../../src/dashboard/xit/types'

describe('xit parser', () => {
  it('should parse basic checkboxes', () => {
    const text = [
      '[ ] Open item',
      '[x] Checked item',
      '[@] Ongoing item',
      '[~] Obsolete item',
      '[?] In question item',
    ].join('\n')

    const parsed = parseXitText(text)
    expect(parsed.length).toBe(5)

    expect(parsed[0]!.type).toBe('item')
    expect((parsed[0] as XitItem).status).toBe('open')
    expect((parsed[0] as XitItem).description).toBe('Open item')

    expect(parsed[1]!.type).toBe('item')
    expect((parsed[1] as XitItem).status).toBe('checked')

    expect(parsed[2]!.type).toBe('item')
    expect((parsed[2] as XitItem).status).toBe('ongoing')

    expect(parsed[3]!.type).toBe('item')
    expect((parsed[3] as XitItem).status).toBe('obsolete')

    expect(parsed[4]!.type).toBe('item')
    expect((parsed[4] as XitItem).status).toBe('in-question')
  })

  it('should parse priority levels', () => {
    const text = [
      '[ ] ! Priority 1',
      '[ ] !!! Priority 3',
      '[ ] ..! Padded 1',
      '[ ] !.. Padded 2',
      '[ ] No priority',
    ].join('\n')

    const parsed = parseXitText(text)
    expect(parsed.length).toBe(5)

    expect((parsed[0] as XitItem).priority).toBe(1)
    expect((parsed[0] as XitItem).priorityText).toBe('!')
    expect((parsed[0] as XitItem).description).toBe('Priority 1')

    expect((parsed[1] as XitItem).priority).toBe(3)
    expect((parsed[1] as XitItem).priorityText).toBe('!!!')
    expect((parsed[1] as XitItem).description).toBe('Priority 3')

    expect((parsed[2] as XitItem).priority).toBe(1)
    expect((parsed[2] as XitItem).priorityText).toBe('..!')

    expect((parsed[3] as XitItem).priority).toBe(1)
    expect((parsed[3] as XitItem).priorityText).toBe('!..')

    expect((parsed[4] as XitItem).priority).toBe(0)
    expect((parsed[4] as XitItem).priorityText).toBe('')
    expect((parsed[4] as XitItem).description).toBe('No priority')
  })

  it('should parse multi-line descriptions', () => {
    const text = [
      '[ ] Task with',
      '    multiple lines',
      '    of description.',
      '[ ] Next task',
    ].join('\n')

    const parsed = parseXitText(text)
    expect(parsed.length).toBe(2)

    const first = parsed[0] as XitItem
    expect(first.type).toBe('item')
    expect(first.description).toBe('Task with\nmultiple lines\nof description.')
    expect(first.rawLines).toEqual(['[ ] Task with', '    multiple lines', '    of description.'])

    const second = parsed[1] as XitItem
    expect(second.description).toBe('Next task')
  })

  it('should parse headings, blank lines, and comments', () => {
    const text = [
      'Work Tasks:',
      '    ', // blank line (spaces)
      '[ ] Task 1',
      'Some comment text',
    ].join('\n')

    const parsed = parseXitText(text)
    expect(parsed.length).toBe(4)

    expect(parsed[0]!.type).toBe('heading')
    expect((parsed[0] as XitHeading).text).toBe('Work Tasks')

    expect(parsed[1]!.type).toBe('blank')

    expect(parsed[2]!.type).toBe('item')

    expect(parsed[3]!.type).toBe('comment')
    expect((parsed[3] as XitComment).text).toBe('Some comment text')
  })

  it('should parse due dates and tags', () => {
    const text = [
      '[ ] Do project -> 2026-06-09 #work #priority=high #project="Antigravity"',
      '[ ] Custom Chinese tags #学习 #代办=重要',
    ].join('\n')

    const parsed = parseXitText(text)
    expect(parsed.length).toBe(2)

    const first = parsed[0] as XitItem
    expect(first.dueDate).toBe('2026-06-09')
    expect(first.tags).toEqual([
      { name: 'work', value: undefined },
      { name: 'priority', value: 'high' },
      { name: 'project', value: 'Antigravity' },
    ])

    const second = parsed[1] as XitItem
    expect(second.tags).toEqual([
      { name: '学习', value: undefined },
      { name: '代办', value: '重要' },
    ])
  })

  it('should parse ->everyday due date', () => {
    const text = '[ ] Daily task ->everyday #daily'
    const parsed = parseXitText(text)
    expect(parsed.length).toBe(1)
    const item = parsed[0] as XitItem
    expect(item.dueDate).toBe('everyday')
    expect(item.tags).toEqual([{ name: 'daily', value: undefined }])
  })

  it('should parse -> everyday with space', () => {
    const text = '[ ] Daily task -> everyday'
    const parsed = parseXitText(text)
    expect(parsed.length).toBe(1)
    const item = parsed[0] as XitItem
    expect(item.dueDate).toBe('everyday')
  })

  it('should parse ->monday due date', () => {
    const text = '[ ] Weekly task ->monday #work'
    const parsed = parseXitText(text)
    expect(parsed.length).toBe(1)
    const item = parsed[0] as XitItem
    expect(item.dueDate).toBe('monday')
    expect(item.tags).toEqual([{ name: 'work', value: undefined }])
  })

  it('should parse -> monday with space', () => {
    const text = '[ ] Weekly task -> monday'
    const parsed = parseXitText(text)
    expect(parsed.length).toBe(1)
    const item = parsed[0] as XitItem
    expect(item.dueDate).toBe('monday')
  })

  it('should parse all weekday names as due dates', () => {
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    for (const day of weekdays) {
      const text = `[ ] Task ->${day}`
      const parsed = parseXitText(text)
      expect(parsed.length).toBe(1)
      const item = parsed[0] as XitItem
      expect(item.dueDate).toBe(day)
    }
  })

  describe('parseDueDate helper', () => {
    it('parses YYYY-MM-DD', () => {
      const d = parseDueDate('2026-06-09')
      expect(d).not.toBeNull()
      expect(d!.getFullYear()).toBe(2026)
      expect(d!.getMonth()).toBe(5) // 0-indexed
      expect(d!.getDate()).toBe(9)
    })

    it('parses YYYY-MM', () => {
      const d = parseDueDate('2026-06')
      expect(d).not.toBeNull()
      expect(d!.getFullYear()).toBe(2026)
      // End of June is June 30th
      expect(d!.getMonth()).toBe(5)
      expect(d!.getDate()).toBe(30)
    })

    it('parses YYYY-Qx', () => {
      const d = parseDueDate('2026-Q2')
      expect(d).not.toBeNull()
      expect(d!.getFullYear()).toBe(2026)
      // End of Q2 is June 30th
      expect(d!.getMonth()).toBe(5)
      expect(d!.getDate()).toBe(30)
    })

    it('parses YYYY-Wx', () => {
      const d = parseDueDate('2026-W01')
      expect(d).not.toBeNull()
      expect(d!.getFullYear()).toBe(2026)
    })

    it('parses YYYY', () => {
      const d = parseDueDate('2026')
      expect(d).not.toBeNull()
      expect(d!.getFullYear()).toBe(2026)
      // End of 2026 is December 31st
      expect(d!.getMonth()).toBe(11)
      expect(d!.getDate()).toBe(31)
    })

    it('parses everyday as today', () => {
      const d = parseDueDate('everyday')
      expect(d).not.toBeNull()
      const now = new Date()
      expect(d!.getFullYear()).toBe(now.getFullYear())
      expect(d!.getMonth()).toBe(now.getMonth())
      expect(d!.getDate()).toBe(now.getDate())
    })

    it('parses weekday names', () => {
      const weekdays = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ]
      for (const name of weekdays) {
        const d = parseDueDate(name)
        expect(d).not.toBeNull()
      }
    })
  })

  describe('resolveWeekday helper', () => {
    it('resolves to today when today matches the weekday', () => {
      // 2026-06-15 is a Monday
      const now = new Date(2026, 5, 15)
      const d = resolveWeekday('monday', now)
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(5)
      expect(d.getDate()).toBe(15)
    })

    it('resolves to this week when weekday is after today', () => {
      // 2026-06-15 is a Monday; Wednesday is +2 days
      const now = new Date(2026, 5, 15)
      const d = resolveWeekday('wednesday', now)
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(5)
      expect(d.getDate()).toBe(17)
    })

    it('resolves to next week when weekday is before today', () => {
      // 2026-06-15 is a Monday; Sunday is -1 day mod 7 = +6 days (next Sunday)
      const now = new Date(2026, 5, 15)
      const d = resolveWeekday('sunday', now)
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(5)
      expect(d.getDate()).toBe(21)
    })

    it('resolves friday on a monday to this friday', () => {
      // 2026-06-15 is a Monday; Friday is +4 days
      const now = new Date(2026, 5, 15)
      const d = resolveWeekday('friday', now)
      expect(d.getDate()).toBe(19)
    })

    it('resolves monday on a friday to next monday', () => {
      // 2026-06-19 is a Friday; Monday is +3 days mod 7 = next Monday
      const now = new Date(2026, 5, 19)
      const d = resolveWeekday('monday', now)
      expect(d.getDate()).toBe(22)
    })
  })

  describe('isWeekdayName helper', () => {
    it('identifies weekday names', () => {
      expect(isWeekdayName('monday')).toBe(true)
      expect(isWeekdayName('sunday')).toBe(true)
      expect(isWeekdayName('everyday')).toBe(false)
      expect(isWeekdayName('today')).toBe(false)
      expect(isWeekdayName('foo')).toBe(false)
    })
  })
})

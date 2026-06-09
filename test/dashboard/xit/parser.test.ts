import { describe, expect, it } from 'bun:test'
import { parseXitText, parseDueDate } from '../../../src/dashboard/xit/parser'
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
  })
})

import { describe, expect, it } from 'bun:test'
import { parseQuery, filterItems } from '../../../src/prism/xit/query'
import type { XitItem } from '../../../src/prism/xit/types'

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

describe('query parser', () => {
  describe('empty query', () => {
    it('empty string matches all', () => {
      const r = parseQuery('')
      expect(r.ok).toBe(true)
    })

    it('whitespace-only matches all', () => {
      const r = parseQuery('   ')
      expect(r.ok).toBe(true)
    })
  })

  describe('status terms', () => {
    it('parses [ ] as open', () => {
      const r = parseQuery('[ ]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'open' })
    })

    it('parses [] as open', () => {
      const r = parseQuery('[]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'open' })
    })

    it('parses [x] as checked', () => {
      const r = parseQuery('[x]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'checked' })
    })

    it('parses [@] as ongoing', () => {
      const r = parseQuery('[@]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'ongoing' })
    })

    it('parses [~] as obsolete', () => {
      const r = parseQuery('[~]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'obsolete' })
    })

    it('parses [?] as in-question', () => {
      const r = parseQuery('[?]')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'status', value: 'in-question' })
    })

    it('rejects multiple status terms', () => {
      const r = parseQuery('[ ] [x]')
      expect(r.ok).toBe(false)
    })
  })

  describe('priority terms', () => {
    it('parses ! as any priority', () => {
      const r = parseQuery('!')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'priority', op: 'any' })
    })

    it('parses !3 as exact priority', () => {
      const r = parseQuery('!3')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'priority', op: '=', value: 3 })
    })

    it('parses !>2', () => {
      const r = parseQuery('!>2')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'priority', op: '>', value: 2 })
    })

    it('parses !>=1', () => {
      const r = parseQuery('!>=1')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'priority', op: '>=', value: 1 })
    })

    it('rejects !open', () => {
      const r = parseQuery('!open')
      expect(r.ok).toBe(false)
    })
  })

  describe('date comparison terms', () => {
    it('parses >20260609', () => {
      const r = parseQuery('>20260609')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '>', value: '20260609' })
    })

    it('parses <0830', () => {
      const r = parseQuery('<0830')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '<', value: '0830' })
    })

    it('parses =20260609', () => {
      const r = parseQuery('=20260609')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '=', value: '20260609' })
    })

    it('parses >=20260609', () => {
      const r = parseQuery('>=20260609')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '>=', value: '20260609' })
    })

    it('parses <=0830', () => {
      const r = parseQuery('<=0830')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '<=', value: '0830' })
    })
  })

  describe('date period terms', () => {
    it('parses ~2026Q3', () => {
      const r = parseQuery('~2026Q3')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: '2026Q3' })
    })

    it('parses ~2026W23', () => {
      const r = parseQuery('~2026W23')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: '2026W23' })
    })

    it('parses ~202606', () => {
      const r = parseQuery('~202606')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: '202606' })
    })

    it('parses ~06', () => {
      const r = parseQuery('~06')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: '06' })
    })

    it('parses ~2026', () => {
      const r = parseQuery('~2026')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: '2026' })
    })
  })

  describe('date keyword terms', () => {
    it('parses today', () => {
      const r = parseQuery('today')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'today' })
    })

    it('parses thisweek', () => {
      const r = parseQuery('thisweek')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'thisweek' })
    })

    it('parses thismonth', () => {
      const r = parseQuery('thismonth')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'thismonth' })
    })

    it('parses thisyear', () => {
      const r = parseQuery('thisyear')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'thisyear' })
    })

    it('parses overdue', () => {
      const r = parseQuery('overdue')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'overdue' })
    })

    it('parses nodue', () => {
      const r = parseQuery('nodue')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'nodue' })
    })

    it('parses everyday', () => {
      const r = parseQuery('everyday')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'everyday' })
    })

    it('parses monday', () => {
      const r = parseQuery('monday')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'monday' })
    })

    it('parses all weekday names', () => {
      const weekdays = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ] as const
      for (const day of weekdays) {
        const r = parseQuery(day)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: day })
      }
    })

    it('parses today+3', () => {
      const r = parseQuery('today+3')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'today', offset: 3 })
    })

    it('parses thisweek-1', () => {
      const r = parseQuery('thisweek-1')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'dateKeyword', value: 'thisweek', offset: -1 })
    })

    it('parses >today-1', () => {
      const r = parseQuery('>today-1')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '>', value: 'today', offset: -1 })
    })

    it('parses <today', () => {
      const r = parseQuery('<today')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '<', value: 'today' })
    })

    it('parses >today', () => {
      const r = parseQuery('>today')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '>', value: 'today' })
    })

    it('parses <today+3', () => {
      const r = parseQuery('<today+3')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '<', value: 'today', offset: 3 })
    })

    it('parses ~thisweek', () => {
      const r = parseQuery('~thisweek')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: 'thisweek' })
    })

    it('parses ~thisweek+1', () => {
      const r = parseQuery('~thisweek+1')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: 'thisweek', offset: 1 })
    })

    it('parses ~Q2', () => {
      const r = parseQuery('~Q2')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'date', op: '~', value: 'Q2' })
    })
  })

  describe('tag terms', () => {
    it('parses #urgent', () => {
      const r = parseQuery('#urgent')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'tag', name: 'urgent' })
    })

    it('parses #project=frontend', () => {
      const r = parseQuery('#project=frontend')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'tag', name: 'project', value: 'frontend' })
    })

    it('parses #tag="hello world"', () => {
      const r = parseQuery('#tag="hello world"')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'tag', name: 'tag', value: 'hello world' })
    })
  })

  describe('text terms', () => {
    it('parses quoted string', () => {
      const r = parseQuery('"buy groceries"')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'text', value: 'buy groceries' })
    })

    it('parses bare word as text', () => {
      const r = parseQuery('groceries')
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.ast).toEqual({ type: 'text', value: 'groceries' })
    })
  })

  describe('operators', () => {
    it('implicit AND', () => {
      const r = parseQuery('[ ] !>2')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.ast.type).toBe('and')
        if (r.ast.type === 'and') {
          expect(r.ast.children.length).toBe(2)
          expect(r.ast.children[0]!.type).toBe('status')
          expect(r.ast.children[1]!.type).toBe('priority')
        }
      }
    })

    it('explicit AND', () => {
      const r = parseQuery('[ ] and !>2')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.ast.type).toBe('and')
        if (r.ast.type === 'and') expect(r.ast.children.length).toBe(2)
      }
    })

    it('OR', () => {
      const r = parseQuery('[ ] or [x]')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.ast.type).toBe('or')
        if (r.ast.type === 'or') expect(r.ast.children.length).toBe(2)
      }
    })

    it('NOT', () => {
      const r = parseQuery('not [x]')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.ast.type).toBe('not')
        if (r.ast.type === 'not') expect(r.ast.child.type).toBe('status')
      }
    })

    it('grouping with ()', () => {
      const r = parseQuery('([ ] or [@]) !>2')
      expect(r.ok).toBe(true)
      if (r.ok) {
        expect(r.ast.type).toBe('and')
        if (r.ast.type === 'and') {
          expect(r.ast.children[0]!.type).toBe('or')
          expect(r.ast.children[1]!.type).toBe('priority')
        }
      }
    })

    it('precedence: OR lower than AND', () => {
      const r = parseQuery('[ ] or [x] !>2')
      expect(r.ok).toBe(true)
      if (r.ok) {
        // should be: [ ] or ([x] and !>2)
        expect(r.ast.type).toBe('or')
        if (r.ast.type === 'or') {
          expect(r.ast.children[0]!.type).toBe('status')
          expect(r.ast.children[1]!.type).toBe('and')
        }
      }
    })
  })

  describe('error cases', () => {
    it('rejects unclosed quote', () => {
      const r = parseQuery('"hello')
      expect(r.ok).toBe(false)
    })

    it('rejects unmatched paren', () => {
      const r = parseQuery('([ ]')
      expect(r.ok).toBe(false)
    })
  })
})

describe('filterItems', () => {
  const items: XitItem[] = [
    makeItem({ status: 'open', description: 'task A', priority: 1, tags: [{ name: 'urgent' }] }),
    makeItem({ status: 'checked', description: 'task B', priority: 2 }),
    makeItem({
      status: 'open',
      description: 'task C',
      priority: 3,
      dueDate: '2026-06-10',
      tags: [{ name: 'work', value: 'frontend' }],
    }),
    makeItem({ status: 'ongoing', description: 'task D', dueDate: '2026-12-01' }),
    makeItem({ status: 'open', description: 'task E', dueDate: null }),
  ]

  const lines = items.map((item) => item as any)

  it('filters by status', () => {
    const r = parseQuery('[ ]')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(3)
    }
  })

  it('filters by priority', () => {
    const r = parseQuery('!>=2')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(2) // task B (2) and task C (3)
    }
  })

  it('filters by tag', () => {
    const r = parseQuery('#urgent')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task A')
    }
  })

  it('filters by tag with value', () => {
    const r = parseQuery('#work=frontend')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task C')
    }
  })

  it('filters by text', () => {
    const r = parseQuery('task D')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      // task D matches description "task D", task C matches because tag value "frontend" contains "d"
      expect(result.length).toBe(2)
    }
  })

  it('filters by exact quoted text', () => {
    const r = parseQuery('"task D"')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task D')
    }
  })

  it('filters by nodue', () => {
    const r = parseQuery('nodue')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(3) // tasks A, B, E have null dueDate
    }
  })

  it('filters by overdue excludes checked items', () => {
    const overdueItems = [
      makeItem({ description: 'overdue open', status: 'open', dueDate: '2026-06-01' }),
      makeItem({ description: 'overdue checked', status: 'checked', dueDate: '2026-06-01' }),
      makeItem({ description: 'overdue obsolete', status: 'obsolete', dueDate: '2026-06-01' }),
      makeItem({ description: 'overdue ongoing', status: 'ongoing', dueDate: '2026-06-01' }),
      makeItem({ description: 'not overdue', status: 'open', dueDate: '2099-01-01' }),
    ]
    const overdueLines = overdueItems.map((item) => item as any)

    const r = parseQuery('overdue')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(overdueLines, r.ast)
      const descs = result.map((l) => (l as XitItem).description)
      expect(descs).toContain('overdue open')
      expect(descs).toContain('overdue ongoing')
      expect(descs).not.toContain('overdue checked')
      expect(descs).not.toContain('overdue obsolete')
      expect(descs).not.toContain('not overdue')
    }
  })

  it('filters by overdue (past dates)', () => {
    // Change task C's dueDate to a past date for this test
    const pastItems = items.map((item) =>
      item.description === 'task C' ? { ...item, dueDate: '2026-06-01' } : item,
    )
    const pastLines = pastItems.map((item) => item as any)

    const r = parseQuery('overdue')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(pastLines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task C')
    }
  })

  it('filters by everyday (always matches today)', () => {
    const everydayItems = items.map((item) =>
      item.description === 'task A' ? { ...item, dueDate: 'everyday' } : item,
    )
    const everydayLines = everydayItems.map((item) => item as any)

    const r = parseQuery('everyday')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(everydayLines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task A')
    }
  })

  it('filters by weekday name (matches items with that weekday due date)', () => {
    // Use items without conflicting due dates
    const weekdayItems = [
      makeItem({ description: 'monday task', dueDate: 'monday' }),
      makeItem({ description: 'other task', dueDate: '2026-12-01' }), // not a Monday
    ]
    const weekdayLines = weekdayItems.map((item) => item as any)

    const r = parseQuery('monday')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(weekdayLines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('monday task')
    }
  })

  it('weekday filter does not match unrelated due dates', () => {
    const weekdayItems = [
      makeItem({ description: 'tuesday task', dueDate: 'tuesday' }),
      makeItem({ description: 'other task', dueDate: '2026-12-01' }),
    ]
    const weekdayLines = weekdayItems.map((item) => item as any)

    const r = parseQuery('monday')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(weekdayLines, r.ast)
      // monday resolves to a specific Monday; tuesday resolves to a different day
      expect(result.length).toBe(0)
    }
  })

  it('everyday items match >today comparison', () => {
    const everydayItems = [makeItem({ description: 'everyday task', dueDate: 'everyday' })]
    const everydayLines = everydayItems.map((item) => item as any)

    const r = parseQuery('>today')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(everydayLines, r.ast)
      // everyday resolves to today, so >today should NOT match (today is not > today)
      expect(result.length).toBe(0)
    }
  })

  it('everyday items match >=today comparison', () => {
    const everydayItems = [makeItem({ description: 'everyday task', dueDate: 'everyday' })]
    const everydayLines = everydayItems.map((item) => item as any)

    const r = parseQuery('>=today')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(everydayLines, r.ast)
      // everyday resolves to today, so >=today should match
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('everyday task')
    }
  })

  it('everyday items match ~today period', () => {
    const everydayItems = [makeItem({ description: 'everyday task', dueDate: 'everyday' })]
    const everydayLines = everydayItems.map((item) => item as any)

    const r = parseQuery('~today')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(everydayLines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('everyday task')
    }
  })

  it('combines with AND', () => {
    const r = parseQuery('[ ] !>=2')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task C')
    }
  })

  it('combines with OR', () => {
    const r = parseQuery('[x] or [@]')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(2)
    }
  })

  it('combines with NOT', () => {
    const r = parseQuery('not [x]')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(4)
    }
  })

  it('combines with grouping', () => {
    const r = parseQuery('([ ] or [@]) !>=2')
    expect(r.ok).toBe(true)
    if (r.ok) {
      const result = filterItems(lines, r.ast)
      expect(result.length).toBe(1)
      expect((result[0] as XitItem).description).toBe('task C')
    }
  })

  describe('date comparison with keywords', () => {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const oneDay = 86400000

    // Items with known due dates relative to today
    const dateItems: XitItem[] = [
      makeItem({ description: 'far past', dueDate: '2020-01-15' }),
      makeItem({
        description: 'yesterday',
        dueDate: new Date(todayStart.getTime() - oneDay).toISOString().slice(0, 10),
      }),
      makeItem({
        description: 'today',
        dueDate: todayStart.toISOString().slice(0, 10),
      }),
      makeItem({
        description: 'tomorrow',
        dueDate: new Date(todayStart.getTime() + oneDay).toISOString().slice(0, 10),
      }),
      makeItem({ description: 'no date' }),
    ]

    const dateLines = dateItems.map((item) => item as any)

    it('>today-1 matches due dates after yesterday (today+)', () => {
      const r = parseQuery('>today-1')
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = filterItems(dateLines, r.ast)
        const descs = result.map((l) => (l as XitItem).description)
        expect(descs).toContain('today')
        expect(descs).toContain('tomorrow')
        expect(descs).not.toContain('far past')
        expect(descs).not.toContain('yesterday')
        expect(descs).not.toContain('no date')
      }
    })

    it('<today matches due dates before today', () => {
      const r = parseQuery('<today')
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = filterItems(dateLines, r.ast)
        const descs = result.map((l) => (l as XitItem).description)
        expect(descs).toContain('far past')
        expect(descs).toContain('yesterday')
        expect(descs).not.toContain('today')
        expect(descs).not.toContain('tomorrow')
        expect(descs).not.toContain('no date')
      }
    })
  })

  describe('date period with keywords', () => {
    it('~thisweek matches due dates in the current week', () => {
      const today = new Date()
      const dayOfWeek = today.getDay()
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek)
      const weekMid = new Date(weekStart.getTime() + 3 * 86400000)
      const prevWeek = new Date(weekStart.getTime() - 86400000)
      const nextWeek = new Date(weekStart.getTime() + 7 * 86400000)

      const weekItems: XitItem[] = [
        makeItem({ description: 'in week', dueDate: weekMid.toISOString().slice(0, 10) }),
        makeItem({ description: 'before week', dueDate: prevWeek.toISOString().slice(0, 10) }),
        makeItem({ description: 'after week', dueDate: nextWeek.toISOString().slice(0, 10) }),
        makeItem({ description: 'no date' }),
      ]
      const weekLines = weekItems.map((item) => item as any)

      const r = parseQuery('~thisweek')
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = filterItems(weekLines, r.ast)
        const descs = result.map((l) => (l as XitItem).description)
        expect(descs).toEqual(['in week'])
      }
    })

    it('~Q2 matches due dates in Q2 of the current year', () => {
      const year = new Date().getFullYear()
      const q2Start = new Date(year, 3, 1) // April 1
      const q2Mid = new Date(year, 4, 15) // May 15
      const q2End = new Date(year, 5, 30) // June 30
      const beforeQ2 = new Date(year, 2, 31) // March 31
      const afterQ2 = new Date(year, 6, 1) // July 1

      const qItems: XitItem[] = [
        makeItem({ description: 'q2 start', dueDate: q2Start.toISOString().slice(0, 10) }),
        makeItem({ description: 'q2 mid', dueDate: q2Mid.toISOString().slice(0, 10) }),
        makeItem({ description: 'q2 end', dueDate: q2End.toISOString().slice(0, 10) }),
        makeItem({ description: 'before q2', dueDate: beforeQ2.toISOString().slice(0, 10) }),
        makeItem({ description: 'after q2', dueDate: afterQ2.toISOString().slice(0, 10) }),
        makeItem({ description: 'no date' }),
      ]
      const qLines = qItems.map((item) => item as any)

      const r = parseQuery('~Q2')
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = filterItems(qLines, r.ast)
        const descs = result.map((l) => (l as XitItem).description)
        expect(descs).toContain('q2 start')
        expect(descs).toContain('q2 mid')
        expect(descs).toContain('q2 end')
        expect(descs).not.toContain('before q2')
        expect(descs).not.toContain('after q2')
        expect(descs).not.toContain('no date')
      }
    })

    it('~thisweek matches ->weekday items where weekday >= today', () => {
      const weekdays = [
        'sunday',
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
      ] as const
      const todayDow = new Date().getDay() || 7 // Sun=7

      const weekdayItems = weekdays.map((day) => makeItem({ description: day, dueDate: day }))
      const weekdayLines = weekdayItems.map((item) => item as any)

      const r = parseQuery('~thisweek')
      expect(r.ok).toBe(true)
      if (r.ok) {
        const result = filterItems(weekdayLines, r.ast)
        const descs = result.map((l) => (l as XitItem).description)
        for (const day of weekdays) {
          const num = day === 'sunday' ? 7 : weekdays.indexOf(day)
          if (num >= todayDow) {
            expect(descs).toContain(day)
          } else {
            expect(descs).not.toContain(day)
          }
        }
      }
    })
  })
})

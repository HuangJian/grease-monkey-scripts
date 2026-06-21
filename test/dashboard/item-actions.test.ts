import { beforeEach, describe, expect, test } from 'bun:test'
import {
  createItemHandlers,
  createGroupedItemHandlers,
  type ItemState,
} from '../../src/dashboard/item-actions'

type TestItem = { id: string; replies?: number }

interface MockState<T extends { id: string }> extends ItemState<T> {
  isHidden(id: T['id']): boolean
  getReadReplies(id: T['id']): number | undefined
}

function createMockState<T extends { id: string }>(_items: T[]): MockState<T> {
  const readIds = new Set<string>()
  const hiddenIds = new Set<string>()
  const readRepliesMap = new Map<string, number>()

  return {
    isRead: (id) => readIds.has(id),
    isHidden: (id) => hiddenIds.has(id),
    getReadReplies: (id) => readRepliesMap.get(id),
    markRead: (id, _ts, replies) => {
      readIds.add(id)
      if (replies !== undefined) readRepliesMap.set(id, replies)
    },
    markHidden: (id) => hiddenIds.add(id),
    filterVisible: (all) => all.filter((it) => !hiddenIds.has(it.id)),
    saveToStorage: async () => {},
    removeFromCache: async () => {},
  }
}

describe('createItemHandlers', () => {
  let items: TestItem[]
  let state: MockState<TestItem>
  let visibleItems: TestItem[]
  let forceUpdateCallCount: number
  let handlers: ReturnType<typeof createItemHandlers<TestItem>>

  beforeEach(() => {
    items = [
      { id: '1', replies: 10 },
      { id: '2', replies: 20 },
      { id: '3', replies: 30 },
    ]
    state = createMockState(items)
    visibleItems = [...items]
    forceUpdateCallCount = 0
    handlers = createItemHandlers<TestItem>({
      state: state as ItemState<TestItem>,
      forceUpdate: () => {
        forceUpdateCallCount++
      },
      getVisible: () => visibleItems,
      repliesOf: (item) => item.replies,
    })
  })

  describe('handleHide', () => {
    test('marks item hidden and calls forceUpdate', () => {
      handlers.handleHide('1')
      expect(state.isHidden('1')).toBe(true)
      expect(forceUpdateCallCount).toBe(1)
    })

    test('does not affect other items', () => {
      handlers.handleHide('1')
      expect(state.isHidden('2')).toBe(false)
      expect(state.isHidden('3')).toBe(false)
    })
  })

  describe('handleBulkRead', () => {
    test('marks all visible items up to and including hovered as read', () => {
      handlers.handleBulkRead(items[1]!)
      expect(state.isRead('1')).toBe(true)
      expect(state.isRead('2')).toBe(true)
      expect(state.isRead('3')).toBe(false)
      expect(forceUpdateCallCount).toBe(1)
    })

    test('stores replies count for each item', () => {
      handlers.handleBulkRead(items[1]!)
      expect(state.getReadReplies('1')).toBe(10)
      expect(state.getReadReplies('2')).toBe(20)
    })

    test('does not re-mark already read items', () => {
      state.markRead('1')
      handlers.handleBulkRead(items[1]!)
      expect(state.isRead('1')).toBe(true)
      expect(state.isRead('2')).toBe(true)
    })

    test('no-op when hovered item not in visible list', () => {
      const hiddenItem = { id: '99', replies: 5 }
      handlers.handleBulkRead(hiddenItem)
      expect(forceUpdateCallCount).toBe(0)
    })

    test('reads all items when last item is hovered', () => {
      handlers.handleBulkRead(items[2]!)
      expect(state.isRead('1')).toBe(true)
      expect(state.isRead('2')).toBe(true)
      expect(state.isRead('3')).toBe(true)
    })
  })

  describe('handleBulkHide', () => {
    test('marks all visible items up to and including hovered as hidden', () => {
      handlers.handleBulkHide(items[1]!)
      expect(state.isHidden('1')).toBe(true)
      expect(state.isHidden('2')).toBe(true)
      expect(state.isHidden('3')).toBe(false)
      expect(forceUpdateCallCount).toBe(1)
    })

    test('no-op when hovered item not in visible list', () => {
      const hiddenItem = { id: '99' }
      handlers.handleBulkHide(hiddenItem)
      expect(forceUpdateCallCount).toBe(0)
    })
  })
})

describe('createGroupedItemHandlers', () => {
  const grouped: Record<string, TestItem[]> = {
    a: [
      { id: 'a1', replies: 5 },
      { id: 'a2', replies: 10 },
    ],
    b: [{ id: 'b1', replies: 15 }],
  }
  let state: MockState<TestItem>
  let forceUpdateCallCount: number

  function findGroupForItem(item: TestItem): string | null {
    for (const [key, items] of Object.entries(grouped)) {
      if (items.some((i) => i.id === item.id)) return key
    }
    return null
  }

  function getVisibleInSub(sub: string): TestItem[] {
    return grouped[sub]?.filter((i) => !state.isHidden(i.id)) ?? []
  }

  beforeEach(() => {
    state = createMockState([...grouped.a, ...grouped.b])
    forceUpdateCallCount = 0
  })

  describe('handleHide', () => {
    test('marks item hidden and calls forceUpdate', () => {
      const handlers = createGroupedItemHandlers<TestItem, string>({
        state,
        forceUpdate: () => {
          forceUpdateCallCount++
        },
        getSubForItem: findGroupForItem,
        getVisibleInSub,
      })
      handlers.handleHide('a1')
      expect(state.isHidden('a1')).toBe(true)
      expect(forceUpdateCallCount).toBe(1)
    })
  })

  describe('handleBulkRead', () => {
    test('marks items in the same group up to hovered', () => {
      const handlers = createGroupedItemHandlers<TestItem, string>({
        state,
        forceUpdate: () => {
          forceUpdateCallCount++
        },
        getSubForItem: findGroupForItem,
        getVisibleInSub,
        repliesOf: (item) => item.replies,
      })
      handlers.handleBulkRead(grouped.a[1]!)
      expect(state.isRead('a1')).toBe(true)
      expect(state.isRead('a2')).toBe(true)
      expect(state.isRead('b1')).toBe(false)
    })

    test('no-op when hovered item group not found', () => {
      const handlers = createGroupedItemHandlers<TestItem, string>({
        state,
        forceUpdate: () => {
          forceUpdateCallCount++
        },
        getSubForItem: () => null,
        getVisibleInSub,
      })
      handlers.handleBulkRead({ id: 'x', replies: 1 })
      expect(forceUpdateCallCount).toBe(0)
    })
  })

  describe('handleBulkHide', () => {
    test('marks items in the same group up to hovered', () => {
      const handlers = createGroupedItemHandlers<TestItem, string>({
        state,
        forceUpdate: () => {
          forceUpdateCallCount++
        },
        getSubForItem: findGroupForItem,
        getVisibleInSub,
      })
      handlers.handleBulkHide(grouped.a[0]!)
      expect(state.isHidden('a1')).toBe(true)
      expect(state.isHidden('a2')).toBe(false)
      expect(state.isHidden('b1')).toBe(false)
    })
  })
})

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  CACHE_KEY,
  CACHE_SCHEMA_VERSION,
  type CachedSource,
  STATE_KEY,
} from '../../src/dashboard/types'
import { createItemState } from '../../src/dashboard/item-state'
import { removeItemFromCache } from '../../src/dashboard/browse-state'
import { createRuntime, type TestRuntime } from '../runtime'

const TTL_MS = 10 * 60 * 1000

function makeItem(
  over: { id: string } & Record<string, unknown>,
): { id: string } & Record<string, unknown> {
  return { title: 't', ...over }
}

function makeNumItem(
  over: { id: number } & Record<string, unknown>,
): { id: number } & Record<string, unknown> {
  return { title: 't', ...over }
}

describe('createItemState (string IDs)', () => {
  let runtime: TestRuntime
  let state: ReturnType<typeof createItemState<string>>

  beforeEach(() => {
    runtime = createRuntime()
    state = createItemState<string>({
      storageKey: STATE_KEY('test'),
      ttlMs: TTL_MS,
    })
  })

  describe('isRead / isHidden / markRead / markHidden', () => {
    test('initial state is unread and unhidden', () => {
      expect(state.isRead('1')).toBe(false)
      expect(state.isHidden('1')).toBe(false)
    })
    test('markRead sets isRead true', () => {
      state.markRead('1')
      expect(state.isRead('1')).toBe(true)
    })
    test('markHidden sets isHidden true', () => {
      state.markHidden('2')
      expect(state.isHidden('2')).toBe(true)
    })
    test('markRead/markHidden accept custom timestamps', () => {
      const ts = Date.now() - 1000
      state.markRead('1', ts)
      state.markHidden('2', ts)
      expect(state.isRead('1')).toBe(true)
      expect(state.isHidden('2')).toBe(true)
    })
    test('markRead with replies stores reply count', () => {
      state.markRead('1', Date.now(), 42)
      expect(state.getReadReplies('1')).toBe(42)
    })
    test('getReadReplies returns undefined for unread items', () => {
      expect(state.getReadReplies('1')).toBeUndefined()
    })
    test('round-trip preserves read replies', async () => {
      state.markRead('1', Date.now(), 10)
      await state.saveToStorage(runtime)
      const restored = createItemState<string>({ storageKey: STATE_KEY('test'), ttlMs: TTL_MS })
      await restored.loadFromStorage(runtime)
      expect(restored.getReadReplies('1')).toBe(10)
    })
  })

  describe('filterVisible', () => {
    test('removes hidden items', () => {
      const a = makeItem({ id: 'a' })
      const b = makeItem({ id: 'b' })
      state.markHidden('b')
      expect(state.filterVisible([a, b])).toEqual([a])
    })
    test('keeps read items', () => {
      const a = makeItem({ id: 'a' })
      state.markRead('a')
      expect(state.filterVisible([a])).toEqual([a])
    })
    test('empty input returns empty', () => {
      expect(state.filterVisible([])).toEqual([])
    })
  })

  describe('loadFromStorage / saveToStorage', () => {
    test('round-trip preserves read and hidden markers', async () => {
      state.markRead('1')
      state.markHidden('2')
      await state.saveToStorage(runtime)
      const restored = createItemState<string>({ storageKey: STATE_KEY('test'), ttlMs: TTL_MS })
      await restored.loadFromStorage(runtime)
      expect(restored.isRead('1')).toBe(true)
      expect(restored.isHidden('2')).toBe(true)
    })
    test('expired read markers are not loaded', async () => {
      const oldMin = Math.floor((Date.now() - TTL_MS - 1000) / 60000)
      runtime.stores[STATE_KEY('test')] = { '1': { r: oldMin } }
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
    test('expired hidden markers are not loaded', async () => {
      const oldMin = Math.floor((Date.now() - TTL_MS - 1000) / 60000)
      runtime.stores[STATE_KEY('test')] = { '2': { h: oldMin } }
      await state.loadFromStorage(runtime)
      expect(state.isHidden('2')).toBe(false)
    })
    test('ignores null storage', async () => {
      runtime.stores[STATE_KEY('test')] = null
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
    test('handles missing storage key', async () => {
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
    test('expired entries are not written during save', async () => {
      state.markRead('fresh', Date.now())
      state.markRead('stale', Date.now() - TTL_MS - 1000)
      await state.saveToStorage(runtime)
      const stored = runtime.stores[STATE_KEY('test')] as Record<string, { r?: number }>
      expect(stored['fresh']).toBeDefined()
      expect(stored['stale']).toBeUndefined()
    })
  })

  describe('migration from old key', () => {
    test('reads from old key when new key is empty', async () => {
      const OLD = 'gm:old:test'
      runtime.stores[OLD] = { '1': { r: Date.now() }, '2': { h: Date.now() } }
      const migrated = createItemState<string>({
        storageKey: STATE_KEY('test'),
        ttlMs: TTL_MS,
        oldStorageKey: OLD,
      })
      await migrated.loadFromStorage(runtime)
      expect(migrated.isRead('1')).toBe(true)
      expect(migrated.isHidden('2')).toBe(true)
    })
    test('writes migrated data to new key and clears old key', async () => {
      const OLD = 'gm:old:test'
      runtime.stores[OLD] = { '1': { r: Date.now() } }
      const migrated = createItemState<string>({
        storageKey: STATE_KEY('test'),
        ttlMs: TTL_MS,
        oldStorageKey: OLD,
      })
      await migrated.loadFromStorage(runtime)
      expect(runtime.stores[STATE_KEY('test')]).toBeDefined()
      expect(runtime.stores[OLD]).toBeNull()
    })
    test('prefers new key over old key when both exist', async () => {
      const OLD = 'gm:old:test'
      runtime.stores[STATE_KEY('test')] = { new: { r: Date.now() } }
      runtime.stores[OLD] = { old: { r: Date.now() } }
      const migrated = createItemState<string>({
        storageKey: STATE_KEY('test'),
        ttlMs: TTL_MS,
        oldStorageKey: OLD,
      })
      await migrated.loadFromStorage(runtime)
      expect(migrated.isRead('new')).toBe(true)
      expect(migrated.isRead('old')).toBe(false)
    })
    test('no migration when no old key provided', async () => {
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
  })

  describe('clear', () => {
    test('resets in-memory state', () => {
      state.markRead('1')
      state.markHidden('2')
      state.clear()
      expect(state.isRead('1')).toBe(false)
      expect(state.isHidden('2')).toBe(false)
    })
  })
})

describe('createItemState (number IDs)', () => {
  let runtime: TestRuntime
  let state: ReturnType<typeof createItemState<number>>

  beforeEach(() => {
    runtime = createRuntime()
    state = createItemState<number>({
      storageKey: STATE_KEY('numtest'),
      ttlMs: TTL_MS,
      serializeId: String,
      deserializeId: Number,
    })
  })

  test('round-trip preserves read and hidden markers', async () => {
    state.markRead(1)
    state.markHidden(2)
    await state.saveToStorage(runtime)
    const restored = createItemState<number>({
      storageKey: STATE_KEY('numtest'),
      ttlMs: TTL_MS,
      serializeId: String,
      deserializeId: Number,
    })
    await restored.loadFromStorage(runtime)
    expect(restored.isRead(1)).toBe(true)
    expect(restored.isHidden(2)).toBe(true)
  })

  test('filterVisible works with number IDs', () => {
    const a = makeNumItem({ id: 1 })
    const b = makeNumItem({ id: 2 })
    state.markHidden(2)
    expect(state.filterVisible([a, b])).toEqual([a])
  })
})

describe('removeItemFromCache', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    runtime = createRuntime()
  })

  test('removes item from array-shaped cache', async () => {
    const key = CACHE_KEY('test')
    const cached: CachedSource<{ id: string }[]> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [{ id: '1' }, { id: '2' }],
      fetchedAt: Date.now(),
    }
    runtime.stores[key] = cached
    await removeItemFromCache(runtime, 'test', '1')
    const after = runtime.stores[key] as CachedSource<{ id: string }[]>
    expect(after.data).toHaveLength(1)
    expect(after.data![0].id).toBe('2')
  })

  test('removes item from grouped cache', async () => {
    const key = CACHE_KEY('test')
    const cached: CachedSource<Record<string, { id: string }[]>> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: { group1: [{ id: '1' }, { id: '2' }], group2: [{ id: '3' }] },
      fetchedAt: Date.now(),
    }
    runtime.stores[key] = cached
    await removeItemFromCache(runtime, 'test', '1')
    const after = runtime.stores[key] as CachedSource<Record<string, { id: string }[]>>
    expect(after.data!.group1).toHaveLength(1)
    expect(after.data!.group1[0].id).toBe('2')
    expect(after.data!.group2).toHaveLength(1)
  })

  test('removes item from grouped cache removes empty groups', async () => {
    const key = CACHE_KEY('test')
    const cached: CachedSource<Record<string, { id: string }[]>> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: { group1: [{ id: '1' }], group2: [{ id: '2' }] },
      fetchedAt: Date.now(),
    }
    runtime.stores[key] = cached
    await removeItemFromCache(runtime, 'test', '1')
    const after = runtime.stores[key] as CachedSource<Record<string, { id: string }[]>>
    expect(after.data!.group1).toBeUndefined()
    expect(after.data!.group2).toHaveLength(1)
  })

  test('no-op when cache missing', async () => {
    await removeItemFromCache(runtime, 'test', '1')
    expect(runtime.stores[CACHE_KEY('test')]).toBeUndefined()
  })

  test('no-op when data is malformed', async () => {
    runtime.stores[CACHE_KEY('test')] = { schemaVersion: CACHE_SCHEMA_VERSION, data: 'x' }
    await removeItemFromCache(runtime, 'test', '1')
    const after = runtime.stores[CACHE_KEY('test')] as { data: unknown }
    expect(after.data).toBe('x')
  })

  test('no-op when id not found', async () => {
    const key = CACHE_KEY('test')
    runtime.stores[key] = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [{ id: '1' }],
      fetchedAt: Date.now(),
    }
    await removeItemFromCache(runtime, 'test', '99')
    const after = runtime.stores[key] as CachedSource<{ id: string }[]>
    expect(after.data).toHaveLength(1)
  })
})

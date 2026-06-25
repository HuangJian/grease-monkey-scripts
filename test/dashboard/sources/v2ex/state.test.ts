import { beforeEach, describe, expect, test } from 'bun:test'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../../../src/dashboard/types'
import { createV2exState, type V2exState } from '../../../../src/dashboard/v2ex/state'
import type { V2exTopic } from '../../../../src/dashboard/v2ex/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const STATE_TTL_MS = RETENTION_MS + 24 * 60 * 60 * 1000

function makeTopic(over: Partial<V2exTopic>): V2exTopic {
  return {
    id: 0,
    title: '',
    url: '',
    replies: 0,
    member: { username: '' },
    node: { title: '' },
    sources: [],
    created: 0,
    ...over,
  }
}

describe('createV2exState', () => {
  let runtime: TestRuntime
  let state: V2exState

  beforeEach(() => {
    runtime = createRuntime()
    state = createV2exState({ retentionMs: RETENTION_MS })
  })

  describe('markRead / isRead / markHidden / isHidden', () => {
    test('initial state is unread and unhidden', () => {
      expect(state.isRead(1)).toBe(false)
      expect(state.isHidden(1)).toBe(false)
    })
    test('markRead sets isRead true', () => {
      state.markRead(1)
      expect(state.isRead(1)).toBe(true)
    })
    test('markHidden sets isHidden true', () => {
      state.markHidden(2)
      expect(state.isHidden(2)).toBe(true)
    })
    test('markRead/markHidden accept a custom timestamp', () => {
      const ts = Date.now() - 1000
      state.markRead(1, ts)
      state.markHidden(2, ts)
      expect(state.isRead(1)).toBe(true)
      expect(state.isHidden(2)).toBe(true)
    })
  })

  describe('filterVisible', () => {
    test('removes hidden topics', () => {
      const t1 = makeTopic({ id: 1 })
      const t2 = makeTopic({ id: 2 })
      state.markHidden(2)
      expect(state.filterVisible([t1, t2])).toEqual([t1])
    })
    test('keeps read topics', () => {
      const t1 = makeTopic({ id: 1 })
      state.markRead(1)
      expect(state.filterVisible([t1])).toEqual([t1])
    })
    test('empty input returns empty', () => {
      expect(state.filterVisible([])).toEqual([])
    })
  })

  describe('clear', () => {
    test('resets in-memory read/hidden', async () => {
      state.markRead(1)
      state.markHidden(2)
      state.clear()
      expect(state.isRead(1)).toBe(false)
      expect(state.isHidden(2)).toBe(false)
    })
  })

  describe('loadFromStorage / saveToStorage', () => {
    test('round-trip preserves read and hidden markers', async () => {
      state.markRead(1)
      state.markHidden(2)
      await state.saveToStorage(runtime)
      const restored = createV2exState({ retentionMs: RETENTION_MS })
      await restored.loadFromStorage(runtime)
      expect(restored.isRead(1)).toBe(true)
      expect(restored.isHidden(2)).toBe(true)
    })
    test('expired read markers are not loaded', async () => {
      const oldTs = Date.now() - STATE_TTL_MS - 1000
      const KEY = 'gm:v2ex:topic-state'
      runtime.stores[KEY] = { '1': { r: oldTs } }
      await state.loadFromStorage(runtime)
      expect(state.isRead(1)).toBe(false)
    })
    test('expired hidden markers are not loaded', async () => {
      const oldTs = Date.now() - STATE_TTL_MS - 1000
      const KEY = 'gm:v2ex:topic-state'
      runtime.stores[KEY] = { '2': { h: oldTs } }
      await state.loadFromStorage(runtime)
      expect(state.isHidden(2)).toBe(false)
    })
    test('ignores non-object storage', async () => {
      const KEY = 'gm:v2ex:topic-state'
      runtime.stores[KEY] = null
      await state.loadFromStorage(runtime)
      expect(state.isRead(1)).toBe(false)
    })
    test('handles missing storage key', async () => {
      await state.loadFromStorage(runtime)
      expect(state.isRead(1)).toBe(false)
    })
    test('strips in-memory expired entries on load', async () => {
      const freshTs = Date.now() - 1000
      const staleTs = Date.now() - STATE_TTL_MS - 1000
      state.markRead(1, freshTs)
      state.markRead(99, staleTs)
      await state.saveToStorage(runtime)
      const restored = createV2exState({ retentionMs: RETENTION_MS })
      await restored.loadFromStorage(runtime)
      expect(restored.isRead(1)).toBe(true)
      expect(restored.isRead(99)).toBe(false)
    })
  })

  describe('removeFromCache', () => {
    test('removes the topic from cached data', async () => {
      const cacheKey = CACHE_KEY('v2ex')
      const cached: CachedSource<V2exTopic[]> = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        data: [makeTopic({ id: 1 }), makeTopic({ id: 2 })],
        fetchedAt: Date.now(),
        error: '',
      }
      runtime.stores[cacheKey] = cached
      await state.removeFromCache(runtime, 1)
      const after = runtime.stores[cacheKey] as CachedSource<V2exTopic[]>
      expect(after.data).toHaveLength(1)
      expect(after.data![0].id).toBe(2)
    })
    test('no-op when cache missing', async () => {
      await state.removeFromCache(runtime, 1)
      expect(runtime.stores[CACHE_KEY('v2ex')]).toBeUndefined()
    })
    test('no-op when data is malformed', async () => {
      runtime.stores[CACHE_KEY('v2ex')] = { schemaVersion: CACHE_SCHEMA_VERSION, data: 'x' }
      await state.removeFromCache(runtime, 1)
      const after = runtime.stores[CACHE_KEY('v2ex')] as { data: unknown }
      expect(after.data).toBe('x')
    })
  })
})

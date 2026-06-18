import { beforeEach, describe, expect, test } from 'bun:test'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../../../src/dashboard/types'
import { createRedditState, type RedditState } from '../../../../src/dashboard/reddit/state'
import type { RedditPost, StoredHistoryPost } from '../../../../src/dashboard/reddit/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

const TOPIC_STATE_TTL_MS = 72 * 60 * 60 * 1000
const HISTORY_DAYS = 7
const HISTORY_TTL_MS = HISTORY_DAYS * 24 * 60 * 60 * 1000
const NOW = Date.now() - 60_000

function makePost(over: Partial<RedditPost>): RedditPost {
  return {
    id: 'x',
    title: 't',
    url: 'https://www.reddit.com/r/x/comments/x/t',
    score: 100,
    numComments: 10,
    subreddits: ['x'],
    author: 'u',
    created: NOW,
    ...over,
  }
}

function makeStored(over: Partial<StoredHistoryPost>): StoredHistoryPost {
  return {
    id: 'x',
    title: 't',
    url: 'https://www.reddit.com/r/x/comments/x/t',
    score: 100,
    numComments: 10,
    subreddits: ['x'],
    author: 'u',
    created: NOW,
    ...over,
  }
}

describe('createRedditState', () => {
  let runtime: TestRuntime
  let state: RedditState

  beforeEach(() => {
    runtime = createRuntime()
    state = createRedditState()
  })

  describe('markRead / markHidden / filterVisible', () => {
    test('initial state is unread and unhidden', () => {
      expect(state.isRead('1')).toBe(false)
      expect(state.isHidden('1')).toBe(false)
    })
    test('markRead and markHidden accept custom timestamps', () => {
      state.markRead('1', 1000)
      state.markHidden('2', 2000)
      expect(state.isRead('1')).toBe(true)
      expect(state.isHidden('2')).toBe(true)
    })
    test('filterVisible removes hidden posts', () => {
      const a = makePost({ id: 'a' })
      const b = makePost({ id: 'b' })
      state.markHidden('b')
      expect(state.filterVisible([a, b])).toEqual([a])
    })
  })

  describe('clear', () => {
    test('resets in-memory state', async () => {
      state.markRead('1')
      state.markHidden('2')
      await state.saveHistory(runtime, [makePost({ id: 'h' })], HISTORY_DAYS)
      state.clear()
      expect(state.isRead('1')).toBe(false)
      expect(state.isHidden('2')).toBe(false)
    })
  })

  describe('loadFromStorage / saveToStorage', () => {
    test('round-trip preserves read and hidden markers', async () => {
      state.markRead('1')
      state.markHidden('2')
      await state.saveToStorage(runtime)
      const restored = createRedditState()
      await restored.loadFromStorage(runtime)
      expect(restored.isRead('1')).toBe(true)
      expect(restored.isHidden('2')).toBe(true)
    })
    test('expired read markers are not loaded', async () => {
      const oldTs = Date.now() - TOPIC_STATE_TTL_MS - 1000
      const KEY = 'gm:reddit:topic-state'
      runtime.stores[KEY] = { '1': { r: oldTs } }
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
    test('expired hidden markers are not loaded', async () => {
      const oldTs = Date.now() - TOPIC_STATE_TTL_MS - 1000
      const KEY = 'gm:reddit:topic-state'
      runtime.stores[KEY] = { '2': { h: oldTs } }
      await state.loadFromStorage(runtime)
      expect(state.isHidden('2')).toBe(false)
    })
    test('handles missing storage key', async () => {
      await state.loadFromStorage(runtime)
      expect(state.isRead('1')).toBe(false)
    })
  })

  describe('loadHistory / saveHistory', () => {
    test('returns empty when nothing stored', async () => {
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result).toEqual([])
    })
    test('round-trip preserves stored topics', async () => {
      const post = makePost({ id: '5', title: 'foo' })
      await state.saveHistory(runtime, [post], HISTORY_DAYS)
      const restored = createRedditState()
      const result = await restored.loadHistory(runtime, HISTORY_DAYS)
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('5')
      expect(result[0]!.title).toBe('foo')
    })
    test('saveHistory dedupes by id and takes max score', async () => {
      const a = makePost({ id: '1', title: 'first', score: 10 })
      const b = makePost({ id: '1', title: 'second', score: 20 })
      await state.saveHistory(runtime, [a], HISTORY_DAYS)
      await state.saveHistory(runtime, [b], HISTORY_DAYS)
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result).toHaveLength(1)
      expect(result[0]!.title).toBe('second')
      expect(result[0]!.score).toBe(20)
    })
    test('saveHistory merges across calls', async () => {
      await state.saveHistory(runtime, [makePost({ id: '1' })], HISTORY_DAYS)
      await state.saveHistory(runtime, [makePost({ id: '2' })], HISTORY_DAYS)
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result.map((t) => t.id).sort()).toEqual(['1', '2'])
    })
    test('saveHistory takes min created when upserting', async () => {
      const newer = makePost({ id: '1', created: NOW })
      const older = makePost({ id: '1', created: NOW - 86_400_000 })
      await state.saveHistory(runtime, [newer], HISTORY_DAYS)
      await state.saveHistory(runtime, [older], HISTORY_DAYS)
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result[0]!.created).toBe(NOW - 86_400_000)
    })
    test('saveHistory unions subreddits when upserting', async () => {
      const a = makePost({ id: '1', subreddits: ['aww'] })
      const b = makePost({ id: '1', subreddits: ['funny'] })
      await state.saveHistory(runtime, [a], HISTORY_DAYS)
      await state.saveHistory(runtime, [b], HISTORY_DAYS)
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result[0]!.subreddits.sort()).toEqual(['aww', 'funny'])
    })
    test('expired entries are not loaded', async () => {
      const KEY = 'gm:reddit:topics-history'
      const oldCreated = Date.now() - HISTORY_TTL_MS - 1000
      runtime.stores[KEY] = [makeStored({ id: '1', created: oldCreated })]
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result).toEqual([])
    })
    test('handles malformed storage', async () => {
      const KEY = 'gm:reddit:topics-history'
      runtime.stores[KEY] = { not: 'an array' }
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result).toEqual([])
    })
    test('skips posts with invalid created when saving', async () => {
      const valid = makePost({ id: '1' })
      const invalid = makePost({ id: '2', created: NaN })
      await state.saveHistory(runtime, [valid, invalid], HISTORY_DAYS)
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result.map((r) => r.id)).toEqual(['1'])
    })
  })

  describe('removeFromCache', () => {
    test('removes the post from cached data', async () => {
      const cacheKey = CACHE_KEY('reddit')
      const cached: CachedSource<Record<string, RedditPost[]>> = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        data: { popular: [makePost({ id: '1' }), makePost({ id: '2' })] },
        fetchedAt: Date.now(),
      }
      runtime.stores[cacheKey] = cached
      await state.removeFromCache(runtime, '1')
      const after = runtime.stores[cacheKey] as CachedSource<Record<string, RedditPost[]>>
      const popular = after.data!['popular']!
      expect(popular).toHaveLength(1)
      expect(popular[0]!.id).toBe('2')
    })
    test('drops empty sub entries after removal', async () => {
      const cacheKey = CACHE_KEY('reddit')
      const cached: CachedSource<Record<string, RedditPost[]>> = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        data: {
          popular: [makePost({ id: '1' })],
          funny: [makePost({ id: '2', subreddits: ['funny'] })],
        },
        fetchedAt: Date.now(),
      }
      runtime.stores[cacheKey] = cached
      await state.removeFromCache(runtime, '1')
      const after = runtime.stores[cacheKey] as CachedSource<Record<string, RedditPost[]>>
      expect(after.data!['popular']).toBeUndefined()
      expect(after.data!['funny']).toHaveLength(1)
    })
    test('no-op when cache missing', async () => {
      await state.removeFromCache(runtime, '1')
      expect(runtime.stores[CACHE_KEY('reddit')]).toBeUndefined()
    })
    test('no-op when data is malformed', async () => {
      runtime.stores[CACHE_KEY('reddit')] = { schemaVersion: CACHE_SCHEMA_VERSION, data: 'x' }
      await state.removeFromCache(runtime, '1')
      const after = runtime.stores[CACHE_KEY('reddit')] as { data: unknown }
      expect(after.data).toBe('x')
    })
  })

  describe('removeFromHistory', () => {
    test('removes the post from history', async () => {
      await state.saveHistory(runtime, [makePost({ id: '1' }), makePost({ id: '2' })], HISTORY_DAYS)
      await state.removeFromHistory(runtime, '1')
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result.map((r) => r.id)).toEqual(['2'])
    })
    test('no-op when id not in history', async () => {
      await state.saveHistory(runtime, [makePost({ id: '1' })], HISTORY_DAYS)
      await state.removeFromHistory(runtime, '99')
      const result = await state.loadHistory(runtime, HISTORY_DAYS)
      expect(result.map((r) => r.id)).toEqual(['1'])
    })
  })
})

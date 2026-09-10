import { describe, expect, test } from 'bun:test'
import { createRssState, totalUnread, unreadItems } from '../../../src/prism/rss/state'
import type { RssFeed } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

const DAY = 24 * 60 * 60 * 1000
const RETENTION_MS = 30 * DAY
const NOW = 100 * DAY

function makeRuntime(): TestRuntime {
  const runtime = createRuntime()
  runtime.setClock(NOW)
  return runtime
}

function feed(id: string, itemIds: string[]): RssFeed {
  return {
    id: `u:https://example.com/${id}.xml`,
    title: id,
    url: `https://example.com/${id}.xml`,
    items: itemIds.map((itemId) => ({
      id: itemId,
      title: itemId,
      link: `https://example.com/${itemId}`,
      pubDate: NOW,
      summaryText: '',
    })),
    error: '',
    fetchedAt: NOW,
  }
}

describe('createRssState', () => {
  test('tracks read and hidden entries', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    state.markRead('a', NOW)
    state.markHidden('b', NOW)
    expect(state.isRead('a')).toBe(true)
    expect(state.isHidden('b')).toBe(true)
    expect(state.isRead('b')).toBe(false)
  })

  test('filterVisible drops hidden entries', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    state.markHidden('b', NOW)
    expect(state.filterVisible([{ id: 'a' }, { id: 'b' }]).map((it) => it.id)).toEqual(['a'])
  })

  test('expands and collapses entries', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    expect(state.toggleExpanded('a')).toBe(true)
    expect(state.isExpanded('a')).toBe(true)
    state.setExpanded('a', false)
    expect(state.isExpanded('a')).toBe(false)
  })

  test('persists read state across a reload', async () => {
    const runtime = makeRuntime()
    const state = createRssState({ retentionMs: RETENTION_MS })
    state.markRead('a', NOW)
    await state.saveToStorage(runtime)

    const reloaded = createRssState({ retentionMs: RETENTION_MS })
    await reloaded.loadFromStorage(runtime)
    expect(reloaded.isRead('a')).toBe(true)
  })

  test('expires read state one day after the retention window', async () => {
    const runtime = makeRuntime()
    const state = createRssState({ retentionMs: RETENTION_MS })
    state.markRead('a', NOW)
    await state.saveToStorage(runtime)

    // Still valid just inside the window.
    runtime.setClock(NOW + RETENTION_MS + 1)
    const inside = createRssState({ retentionMs: RETENTION_MS })
    await inside.loadFromStorage(runtime)
    expect(inside.isRead('a')).toBe(true)

    // Gone once the extra day has passed (ttl = retention + 1 day).
    runtime.setClock(NOW + RETENTION_MS + DAY + 1)
    const outside = createRssState({ retentionMs: RETENTION_MS })
    await outside.loadFromStorage(runtime)
    expect(outside.isRead('a')).toBe(false)
  })

  test('removes entries and clears everything', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    state.markRead('a', NOW)
    state.markRead('b', NOW)
    state.removeEntries(['a'])
    expect(state.isRead('a')).toBe(false)
    expect(state.isRead('b')).toBe(true)
    state.clear()
    expect(state.isRead('b')).toBe(false)
  })
})

describe('unreadItems / totalUnread', () => {
  test('counts only entries that are not read', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    const a = feed('a', ['a1', 'a2'])
    const b = feed('b', ['b1'])
    state.markRead('a1', NOW)
    expect(unreadItems(a, state).map((it) => it.id)).toEqual(['a2'])
    expect(totalUnread([a, b], state)).toBe(2)
  })

  test('returns zero when everything is read', () => {
    const state = createRssState({ retentionMs: RETENTION_MS })
    const a = feed('a', ['a1'])
    state.markRead('a1', NOW)
    expect(totalUnread([a], state)).toBe(0)
  })
})

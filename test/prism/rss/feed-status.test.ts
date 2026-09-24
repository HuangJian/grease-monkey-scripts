import { describe, expect, test } from 'bun:test'
import { feedStatusLabel, formatAgoLabel } from '../../../src/prism/rss/editor/status'
import { CACHE_KEY } from '../../../src/prism/types'
import { createRuntime } from '../../runtime'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = 1_700_000_000_000

describe('formatAgoLabel', () => {
  test('reads as "ago" at every scale', () => {
    expect(formatAgoLabel(30_000)).toBe('刚刚')
    expect(formatAgoLabel(12 * MIN)).toBe('12 分钟前')
    expect(formatAgoLabel(3 * HOUR)).toBe('3 小时前')
    expect(formatAgoLabel(2 * 24 * HOUR)).toBe('2 天前')
  })
})

describe('feedStatusLabel', () => {
  test('an unknown feed says so instead of pretending it is fresh', () => {
    expect(feedStatusLabel(undefined, NOW).text).toBe('尚未抓取')
    expect(feedStatusLabel(undefined, NOW).failed).toBe(false)
  })

  test('a healthy feed reports when it last updated', () => {
    const label = feedStatusLabel(
      { fetchedAt: NOW - 12 * MIN, attemptedAt: NOW - 12 * MIN, failureCount: 0, error: '' },
      NOW,
    )
    expect(label.text).toBe('最后更新 12 分钟前')
    expect(label.failed).toBe(false)
  })

  test('a failing feed reports the count and how long it has been broken', () => {
    const label = feedStatusLabel(
      { fetchedAt: NOW - 2 * HOUR, attemptedAt: NOW - 5 * MIN, failureCount: 3, error: 'http 502' },
      NOW,
    )
    // The duration is measured from the last success — that is "how long broken".
    expect(label.text).toBe('⚠ 失败 3 次 · 已 2 小时未成功')
    expect(label.failed).toBe(true)
    // The hover text carries the reason, which the one-liner has no room for.
    expect(label.detail).toBe('http 502')
  })

  test('a feed that never succeeded does not claim a duration', () => {
    const label = feedStatusLabel(
      { fetchedAt: 0, attemptedAt: NOW - MIN, failureCount: 4, error: 'timeout' },
      NOW,
    )
    expect(label.text).toBe('⚠ 失败 4 次 · 从未成功')
    expect(label.failed).toBe(true)
  })

  test('a failure recorded without a count still reads as one failure', () => {
    // Caches written before failureCount existed carry only the error.
    const label = feedStatusLabel(
      { fetchedAt: NOW - HOUR, attemptedAt: NOW - MIN, failureCount: 0, error: 'http 500' },
      NOW,
    )
    expect(label.text).toBe('⚠ 失败 1 次 · 已 1 小时未成功')
  })
})

describe('loadFeedStatuses', () => {
  test('reads fetch state from the cache, keyed by url', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('rss')] = {
      schemaVersion: 2,
      fetchedAt: NOW,
      data: [
        {
          id: 'u:https://a.example.com/feed.xml',
          title: '源 a',
          url: 'https://a.example.com/feed.xml',
          items: [],
          error: 'http 502',
          fetchedAt: NOW - HOUR,
          attemptedAt: NOW - MIN,
          failureCount: 2,
        },
        {
          id: 'u:https://b.example.com/feed.xml',
          title: '源 b',
          url: 'https://b.example.com/feed.xml',
          items: [],
          error: '',
          fetchedAt: NOW - 5 * MIN,
        },
      ],
    }
    // Imported lazily so the type-only import above stays cheap.
    const { loadFeedStatuses } = await import('../../../src/prism/rss/editor/status')
    const statuses = await loadFeedStatuses(runtime)

    expect(statuses.size).toBe(2)
    expect(statuses.get('https://a.example.com/feed.xml')).toEqual({
      fetchedAt: NOW - HOUR,
      attemptedAt: NOW - MIN,
      failureCount: 2,
      error: 'http 502',
    })
    expect(statuses.get('https://b.example.com/feed.xml')?.failureCount).toBe(0)
  })

  test('an empty cache yields no statuses rather than throwing', async () => {
    const runtime = createRuntime()
    const { loadFeedStatuses } = await import('../../../src/prism/rss/editor/status')
    expect((await loadFeedStatuses(runtime)).size).toBe(0)
  })
})

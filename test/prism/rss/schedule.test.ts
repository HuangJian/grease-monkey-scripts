import { describe, expect, test } from 'bun:test'
import {
  FEED_BACKOFF_DELAYS_MS,
  feedRetryDelayMs,
  feedSchedule,
  isFeedDue,
  nextFetchAtOf,
  resolveIntervalMs,
  type DueFields,
} from '../../../src/prism/rss/schedule'
import type { RssFeed } from '../../../src/prism/rss/types'

const MIN = 60_000
const NOW = 1_700_000_000_000

const OPTS = { ttlMinutes: 30, respectFeedPeriod: true }

function feed(over: Partial<RssFeed> = {}): RssFeed {
  return {
    id: 'u:https://example.com/feed.xml',
    title: 'Feed',
    url: 'https://example.com/feed.xml',
    items: [],
    error: '',
    fetchedAt: NOW,
    ...over,
  }
}

function due(over: Partial<DueFields> = {}): DueFields {
  return { fetchedAt: NOW, ...over }
}

describe('resolveIntervalMs', () => {
  test('falls back to the user minimum when the feed declares nothing', () => {
    expect(resolveIntervalMs(undefined, 30, true)).toBe(30 * MIN)
    expect(resolveIntervalMs(0, 30, true)).toBe(30 * MIN)
    expect(resolveIntervalMs(-1, 30, true)).toBe(30 * MIN)
  })

  test('uses the declaration when it is longer than the minimum', () => {
    expect(resolveIntervalMs(24 * 60 * MIN, 30, true)).toBe(24 * 60 * MIN)
  })

  test('the user minimum wins over a shorter declaration', () => {
    expect(resolveIntervalMs(5 * MIN, 30, true)).toBe(30 * MIN)
  })

  test('ignores the declaration when respectFeedPeriod is off', () => {
    expect(resolveIntervalMs(24 * 60 * MIN, 30, false)).toBe(30 * MIN)
  })

  test('never goes below one minute', () => {
    expect(resolveIntervalMs(undefined, 0, true)).toBe(MIN)
    expect(resolveIntervalMs(undefined, -5, true)).toBe(MIN)
    expect(resolveIntervalMs(undefined, 0.4, true)).toBe(MIN)
  })
})

describe('nextFetchAtOf', () => {
  test('a feed that never succeeded is due immediately', () => {
    expect(nextFetchAtOf(due({ fetchedAt: 0 }), 30 * MIN)).toBe(0)
  })

  test('otherwise it is the last success plus the interval', () => {
    expect(nextFetchAtOf(due(), 30 * MIN)).toBe(NOW + 30 * MIN)
  })
})

describe('feedRetryDelayMs', () => {
  test('0 when it has not failed', () => {
    expect(feedRetryDelayMs(0)).toBe(0)
    expect(feedRetryDelayMs(-1)).toBe(0)
  })

  test('follows the ladder', () => {
    FEED_BACKOFF_DELAYS_MS.forEach((delay: number, i: number) => {
      expect(feedRetryDelayMs(i + 1)).toBe(delay)
    })
  })

  test('caps at one hour', () => {
    expect(feedRetryDelayMs(FEED_BACKOFF_DELAYS_MS.length + 1)).toBe(3_600_000)
    expect(feedRetryDelayMs(100)).toBe(3_600_000)
  })
})

describe('isFeedDue', () => {
  const interval = 30 * MIN

  test('a feed that never succeeded is due', () => {
    expect(isFeedDue(due({ fetchedAt: 0 }), NOW, interval)).toBe(true)
  })

  test('is due exactly at the boundary, and not one ms before', () => {
    expect(isFeedDue(due({ fetchedAt: NOW - interval }), NOW, interval)).toBe(true)
    expect(isFeedDue(due({ fetchedAt: NOW - interval + 1 }), NOW, interval)).toBe(false)
  })

  test('an unelapsed retry delay blocks the fetch even when the interval passed', () => {
    const failing = due({ fetchedAt: 0, nextRetryAt: NOW + MIN })
    expect(isFeedDue(failing, NOW, interval)).toBe(false)
  })

  test('an elapsed retry delay lets the retry through', () => {
    const failing = due({ fetchedAt: 0, nextRetryAt: NOW - 1 })
    expect(isFeedDue(failing, NOW, interval)).toBe(true)
    expect(isFeedDue(due({ fetchedAt: 0, nextRetryAt: NOW }), NOW, interval)).toBe(true)
  })
})

describe('feedSchedule', () => {
  test('a disabled feed is never due', () => {
    const schedule = feedSchedule(feed({ fetchedAt: 0 }), false, OPTS, NOW)
    expect(schedule.due).toBe(false)
    expect(schedule.intervalMs).toBe(30 * MIN)
  })

  test('a feed with no cache row is due with no wait', () => {
    const schedule = feedSchedule(undefined, true, OPTS, NOW)
    expect(schedule).toEqual({ intervalMs: 30 * MIN, due: true, nextFetchAt: 0 })
  })

  test('a monthly feed fetched yesterday is not due', () => {
    const monthly = feed({
      fetchedAt: NOW - 24 * 60 * MIN,
      declaredIntervalMs: 30 * 24 * 60 * MIN,
    })
    const schedule = feedSchedule(monthly, true, OPTS, NOW)
    expect(schedule.intervalMs).toBe(30 * 24 * 60 * MIN)
    expect(schedule.due).toBe(false)
    expect(schedule.nextFetchAt).toBe(NOW - 24 * 60 * MIN + 30 * 24 * 60 * MIN)
  })

  test('the same monthly feed becomes due once the declaration elapses', () => {
    const monthly = feed({
      fetchedAt: NOW - 31 * 24 * 60 * MIN,
      declaredIntervalMs: 30 * 24 * 60 * MIN,
    })
    expect(feedSchedule(monthly, true, OPTS, NOW).due).toBe(true)
  })

  test('turning the declaration off follows the user minimum', () => {
    const monthly = feed({
      fetchedAt: NOW - 60 * MIN,
      declaredIntervalMs: 30 * 24 * 60 * MIN,
    })
    const schedule = feedSchedule(monthly, true, { ttlMinutes: 30, respectFeedPeriod: false }, NOW)
    expect(schedule.intervalMs).toBe(30 * MIN)
    expect(schedule.due).toBe(true)
  })

  test('a feed inside its retry delay reports its next attempt', () => {
    const failing = feed({ fetchedAt: 0, failureCount: 2, nextRetryAt: NOW + 2 * MIN })
    const schedule = feedSchedule(failing, true, OPTS, NOW)
    expect(schedule.due).toBe(false)
    expect(schedule.nextFetchAt).toBe(0)
  })

  test('a forced refresh bypasses the interval gate', () => {
    const schedule = feedSchedule(feed(), true, { ...OPTS, force: true }, NOW)
    expect(schedule.due).toBe(true)
    // The reported next-fetch time still reflects the regular schedule.
    expect(schedule.nextFetchAt).toBe(NOW + 30 * MIN)
  })

  test('a forced refresh bypasses a running retry delay', () => {
    const failing = feed({ fetchedAt: 0, failureCount: 4, nextRetryAt: NOW + 30 * MIN })
    expect(feedSchedule(failing, true, { ...OPTS, force: true }, NOW).due).toBe(true)
  })

  test('a forced refresh still skips a disabled feed', () => {
    const schedule = feedSchedule(feed({ fetchedAt: 0 }), false, { ...OPTS, force: true }, NOW)
    expect(schedule.due).toBe(false)
  })
})

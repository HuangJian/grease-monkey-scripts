import { describe, expect, test } from 'bun:test'
import { coerceRssFeeds, coerceRssOptions } from '../../../src/prism/rss/editor/types'
import type { RssFeedConfig, RssSourceOptions } from '../../../src/prism/rss/types'

const FALLBACK_FEEDS: RssFeedConfig[] = [{ url: 'https://example.com/fallback.xml', title: 'FB' }]

const FALLBACK: RssSourceOptions = {
  feeds: FALLBACK_FEEDS,
  ttlMinutes: 123,
  retentionDays: 30,
  maxItemsPerFeed: 100,
  viewMode: 'grouped',
}

describe('coerceRssFeeds', () => {
  test('falls back when the section is missing or feeds is not an array', () => {
    expect(coerceRssFeeds(undefined, FALLBACK_FEEDS)).toEqual(FALLBACK_FEEDS)
    expect(coerceRssFeeds({}, FALLBACK_FEEDS)).toEqual(FALLBACK_FEEDS)
    expect(coerceRssFeeds({ feeds: 'nope' }, FALLBACK_FEEDS)).toEqual(FALLBACK_FEEDS)
  })

  test('keeps an explicitly empty list instead of falling back', () => {
    expect(coerceRssFeeds({ feeds: [] }, FALLBACK_FEEDS)).toEqual([])
  })

  test('falls back when every row is malformed', () => {
    const section = { feeds: [{ title: 'no url' }, null, 'string', { url: '   ' }] }
    expect(coerceRssFeeds(section, FALLBACK_FEEDS)).toEqual(FALLBACK_FEEDS)
  })

  test('drops malformed rows and keeps the good ones', () => {
    const section = {
      feeds: [
        { url: 'https://example.com/ok.xml', title: 'Ok' },
        { title: 'missing url' },
        { url: 'https://example.com/no-title.xml' },
      ],
    }
    expect(coerceRssFeeds(section, FALLBACK_FEEDS)).toEqual([
      { url: 'https://example.com/ok.xml', title: 'Ok' },
      { url: 'https://example.com/no-title.xml', title: '' },
    ])
  })

  test('trims the url and preserves an explicit enabled flag', () => {
    const section = {
      feeds: [
        { url: '  https://example.com/a.xml  ', title: '', enabled: false },
        { url: 'https://example.com/b.xml', title: '', enabled: true },
        { url: 'https://example.com/c.xml', title: '', enabled: 'yes' },
      ],
    }
    expect(coerceRssFeeds(section, FALLBACK_FEEDS)).toEqual([
      { url: 'https://example.com/a.xml', title: '', enabled: false },
      { url: 'https://example.com/b.xml', title: '', enabled: true },
      { url: 'https://example.com/c.xml', title: '' },
    ])
  })

  test('drops duplicate urls', () => {
    const section = {
      feeds: [
        { url: 'https://example.com/dup.xml', title: 'First' },
        { url: 'https://example.com/dup.xml', title: 'Second' },
        { url: 'https://example.com/other.xml', title: '' },
      ],
    }
    expect(coerceRssFeeds(section, FALLBACK_FEEDS)).toEqual([
      { url: 'https://example.com/dup.xml', title: 'First' },
      { url: 'https://example.com/other.xml', title: '' },
    ])
  })
})

describe('coerceRssOptions', () => {
  test('uses the fallback for every field when the section is empty', () => {
    expect(coerceRssOptions({}, FALLBACK)).toEqual(FALLBACK)
  })

  test('reads a complete section', () => {
    const out = coerceRssOptions(
      {
        feeds: [{ url: 'https://example.com/a.xml', title: 'A' }],
        ttlMinutes: 45,
        retentionDays: 7,
        maxItemsPerFeed: 20,
        viewMode: 'timeline',
      },
      FALLBACK,
    )
    expect(out).toEqual({
      feeds: [{ url: 'https://example.com/a.xml', title: 'A' }],
      ttlMinutes: 45,
      retentionDays: 7,
      maxItemsPerFeed: 20,
      viewMode: 'timeline',
    })
  })

  test('rejects NaN and Infinity, which would make the ttl meaningless', () => {
    const out = coerceRssOptions(
      { ttlMinutes: Number.NaN, retentionDays: Number.POSITIVE_INFINITY, maxItemsPerFeed: 0 },
      FALLBACK,
    )
    expect(out.ttlMinutes).toBe(FALLBACK.ttlMinutes)
    expect(out.retentionDays).toBe(FALLBACK.retentionDays)
  })

  test('clamps non-positive numbers to 1, matching the editor validation', () => {
    const out = coerceRssOptions({ ttlMinutes: 0, retentionDays: -5, maxItemsPerFeed: 0 }, FALLBACK)
    expect(out.ttlMinutes).toBe(1)
    expect(out.retentionDays).toBe(1)
    expect(out.maxItemsPerFeed).toBe(1)
  })

  test('rounds fractional numbers', () => {
    expect(coerceRssOptions({ ttlMinutes: 12.6 }, FALLBACK).ttlMinutes).toBe(13)
  })

  test('rejects an unknown view mode', () => {
    expect(coerceRssOptions({ viewMode: 'kanban' }, FALLBACK).viewMode).toBe('grouped')
    expect(coerceRssOptions({ viewMode: 'timeline' }, FALLBACK).viewMode).toBe('timeline')
  })

  test('does not mutate the fallback', () => {
    coerceRssOptions({ ttlMinutes: 5, viewMode: 'timeline' }, FALLBACK)
    expect(FALLBACK.ttlMinutes).toBe(123)
    expect(FALLBACK.viewMode).toBe('grouped')
    expect(FALLBACK_FEEDS).toHaveLength(1)
  })
})

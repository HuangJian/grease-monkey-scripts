import { describe, expect, test } from 'bun:test'
import {
  capItems,
  filterByRetention,
  mergeFeedItems,
  sortByPubDateDesc,
  truncateText,
} from '../../../src/prism/rss/merge'
import { MAX_SUMMARY_CHARS } from '../../../src/prism/rss/constants'
import type { RssItem } from '../../../src/prism/rss/types'

function item(id: string, pubDate: number, title = id): RssItem {
  return { id, title, link: `https://example.com/${id}`, pubDate, summaryText: '' }
}

const DAY = 24 * 60 * 60 * 1000

describe('mergeFeedItems', () => {
  test('unions by id and lets the fresh entry win', () => {
    const prev = [item('a', 100, 'old A')]
    const next = [item('a', 100, 'new A'), item('b', 200)]
    const merged = mergeFeedItems(prev, next)
    expect(merged).toHaveLength(2)
    expect(merged.find((it) => it.id === 'a')!.title).toBe('new A')
  })

  test('keeps a known publish date when the fresh entry has none', () => {
    const merged = mergeFeedItems([item('a', 1000)], [item('a', 0)])
    expect(merged[0]!.pubDate).toBe(1000)
  })

  test('keeps entries that disappeared from the feed', () => {
    expect(mergeFeedItems([item('gone', 100)], [item('b', 200)])).toHaveLength(2)
  })
})

describe('filterByRetention', () => {
  test('drops entries older than the window', () => {
    const now = 10 * DAY
    const kept = filterByRetention([item('old', 1 * DAY), item('new', 9 * DAY)], now, 3 * DAY)
    expect(kept.map((it) => it.id)).toEqual(['new'])
  })

  test('keeps entries without a publish date', () => {
    const now = 10 * DAY
    const kept = filterByRetention([item('nodate', 0)], now, 3 * DAY)
    expect(kept.map((it) => it.id)).toEqual(['nodate'])
  })
})

describe('sortByPubDateDesc', () => {
  test('newest first, unknown dates last', () => {
    const sorted = sortByPubDateDesc([item('mid', 200), item('nodate', 0), item('new', 300)])
    expect(sorted.map((it) => it.id)).toEqual(['new', 'mid', 'nodate'])
  })

  test('does not mutate the input', () => {
    const input = [item('a', 1), item('b', 2)]
    sortByPubDateDesc(input)
    expect(input.map((it) => it.id)).toEqual(['a', 'b'])
  })
})

describe('capItems', () => {
  test('keeps only the first max entries', () => {
    expect(capItems([item('a', 3), item('b', 2), item('c', 1)], 2).map((it) => it.id)).toEqual([
      'a',
      'b',
    ])
  })

  test('returns empty for a non-positive max', () => {
    expect(capItems([item('a', 1)], 0)).toEqual([])
  })
})

describe('truncateText', () => {
  test('leaves short text untouched', () => {
    expect(truncateText('short summary')).toBe('short summary')
  })

  test('truncates to the configured length with an ellipsis', () => {
    const out = truncateText('x'.repeat(500))
    expect(out.length).toBe(MAX_SUMMARY_CHARS)
    expect(out.endsWith('…')).toBe(true)
  })

  test('honours an explicit max', () => {
    expect(truncateText('abcdefghij', 5)).toBe('abcd…')
  })
})

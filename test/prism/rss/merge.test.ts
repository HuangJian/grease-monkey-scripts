import { describe, expect, test } from 'bun:test'
import {
  applySummaryWindow,
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

/** The fetch time every scenario here stamps undated entries with. */
const SEEN_AT = 10 * DAY

describe('mergeFeedItems', () => {
  test('unions by id and lets the fresh entry win', () => {
    const prev = [item('a', 100, 'old A')]
    const next = [item('a', 100, 'new A'), item('b', 200)]
    const merged = mergeFeedItems(prev, next, SEEN_AT)
    expect(merged).toHaveLength(2)
    expect(merged.find((it) => it.id === 'a')!.title).toBe('new A')
  })

  test('keeps a known publish date when the fresh entry has none', () => {
    const merged = mergeFeedItems([item('a', 1000)], [item('a', 0)], SEEN_AT)
    expect(merged[0]!.pubDate).toBe(1000)
  })

  test('keeps entries that disappeared from the feed', () => {
    expect(mergeFeedItems([item('gone', 100)], [item('b', 200)], SEEN_AT)).toHaveLength(2)
  })

  test('puts freshly fetched entries ahead of cached-only ones', () => {
    const merged = mergeFeedItems([item('old', 0)], [item('new', 0)], SEEN_AT)
    expect(merged.map((it) => it.id)).toEqual(['new', 'old'])
  })

  test('new entries survive the cap when the feed supplies no dates', () => {
    // Regression: with every pubDate 0 the sort is a no-op, so a merge that
    // appended new entries would let the cached head fill the cap and drop
    // everything new — the feed would freeze at its first N entries.
    const prev = Array.from({ length: 5 }, (_, i) => item(`old${i}`, 0))
    const next = [item('new1', 0), item('new2', 0)]
    const capped = capItems(sortByPubDateDesc(mergeFeedItems(prev, next, SEEN_AT)), 5)
    expect(capped.map((it) => it.id)).toEqual(['new1', 'new2', 'old0', 'old1', 'old2'])
  })

  test('an entry the feed leaves undated is dated with the fetch time', () => {
    // `0` is legal RSS but unplaceable: it sorts last, falls outside every date
    // window, and would be exempt from retention forever.
    const merged = mergeFeedItems([], [item('a', 0)], SEEN_AT)
    expect(merged[0]!.pubDate).toBe(SEEN_AT)
  })

  test('the stamped date is the first sighting, not the latest fetch', () => {
    // Regression shape: stamping at fetch time unconditionally would drag every
    // undated entry forward on every refresh, so a week-old post would read as
    // brand new forever.
    const first = mergeFeedItems([], [item('a', 0)], SEEN_AT)
    const second = mergeFeedItems(first, [item('a', 0)], SEEN_AT + 3 * DAY)
    expect(second[0]!.pubDate).toBe(SEEN_AT)
  })

  test('a date the feed starts supplying later wins over the stamped one', () => {
    const stamped = mergeFeedItems([], [item('a', 0)], SEEN_AT)
    const dated = mergeFeedItems(stamped, [item('a', SEEN_AT - 5 * DAY)], SEEN_AT + DAY)
    expect(dated[0]!.pubDate).toBe(SEEN_AT - 5 * DAY)
  })

  test('a cached entry still carrying 0 gets this fetch as its best guess', () => {
    // Entries written before undated entries were stamped have no first-seen
    // time left to recover; leaving them at 0 would keep them outside every
    // window forever.
    const merged = mergeFeedItems([item('a', 0)], [item('a', 0)], SEEN_AT)
    expect(merged[0]!.pubDate).toBe(SEEN_AT)
  })

  test('an undated entry is only stamped once per id, even across feeds', () => {
    const merged = mergeFeedItems([item('a', 0), item('b', 0)], [item('a', 0)], SEEN_AT)
    // 'b' is cached-only and keeps whatever it had — this pass never sees it in
    // a response, so it must not be silently re-dated.
    expect(merged.find((it) => it.id === 'a')!.pubDate).toBe(SEEN_AT)
    expect(merged.find((it) => it.id === 'b')!.pubDate).toBe(0)
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

describe('applySummaryWindow', () => {
  function withSummary(id: string, text: string): RssItem {
    return { ...item(id, 100), summaryText: text }
  }

  test('keeps summaries for the newest entries only', () => {
    const items = [withSummary('a', 's1'), withSummary('b', 's2'), withSummary('c', 's3')]
    const out = applySummaryWindow(items, 2)
    expect(out[0]!.summaryText).toBe('s1')
    expect(out[1]!.summaryText).toBe('s2')
    expect(out[2]!.summaryText).toBe('')
    expect(out[2]!.summaryTrimmed).toBe(true)
  })

  test('never marks an entry that had no summary as trimmed', () => {
    const out = applySummaryWindow([item('a', 100), item('b', 100)], 1)
    expect(out[1]!.summaryTrimmed).toBeUndefined()
    expect(out[1]!.summaryText).toBe('')
  })

  test('does not mutate the input', () => {
    const input = [withSummary('a', 's1'), withSummary('b', 's2')]
    applySummaryWindow(input, 1)
    expect(input[1]!.summaryText).toBe('s2')
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

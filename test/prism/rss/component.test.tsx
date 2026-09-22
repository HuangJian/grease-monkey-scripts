import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor, within } from '@testing-library/preact'
import {
  formatCountdownLabel,
  formatIntervalLabel,
  RssComponent,
} from '../../../src/prism/rss/component'
import { TIMELINE_MAX_ITEMS } from '../../../src/prism/rss/constants'
import type { DateFilter } from '../../../src/prism/date-filter'
import type { FeedSchedule } from '../../../src/prism/rss/schedule'
import { createRssState, unreadCount, type RssState } from '../../../src/prism/rss/state'
import type { RssFeed, RssItem, RssViewMode } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

const NOW = 1_700_000_000_000
const MIN = 60_000
const DAY = 24 * 60 * 60 * 1000

function item(id: string, over: Partial<RssItem> = {}): RssItem {
  return {
    id,
    title: `标题 ${id}`,
    link: `https://example.com/${id}`,
    pubDate: NOW - DAY,
    summaryText: `摘要 ${id}`,
    ...over,
  }
}

function feed(id: string, items: RssItem[], over: Partial<RssFeed> = {}): RssFeed {
  return {
    id: `u:https://example.com/${id}.xml`,
    title: `源 ${id}`,
    url: `https://example.com/${id}.xml`,
    items,
    error: '',
    fetchedAt: NOW,
    ...over,
  }
}

function setup(
  feeds: RssFeed[],
  over: {
    runtime?: TestRuntime
    viewMode?: RssViewMode
    onViewModeChange?: (mode: RssViewMode) => void
    scheduleHint?: (feed: RssFeed, now: number) => FeedSchedule
    dateFilter?: DateFilter
    onDateFilterChange?: (filter: DateFilter) => void
    filterUnread?: boolean
    onToggleFilterUnread?: () => void
    /** Runs before the first render, to set the state a scenario needs. */
    prepare?: (state: RssState) => void
  } = {},
) {
  const runtime = over.runtime ?? createRuntime()
  const state = createRssState({ retentionMs: 30 * DAY })
  over.prepare?.(state)
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = render(
    <RssComponent
      data={feeds}
      root={root}
      runtime={runtime}
      state={state}
      viewMode={over.viewMode ?? 'grouped'}
      onViewModeChange={over.onViewModeChange}
      scheduleHint={over.scheduleHint}
      dateFilter={over.dateFilter ?? '全'}
      onDateFilterChange={over.onDateFilterChange ?? (() => {})}
      filterUnread={over.filterUnread ?? false}
      onToggleFilterUnread={over.onToggleFilterUnread ?? (() => {})}
    />,
    { container: root },
  )
  return { state, root, runtime, view }
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-list-item'))
}

describe('RssComponent', () => {
  test('shows an empty state when no feeds are configured', () => {
    const { root } = setup([])
    expect(within(root).getByText('尚未添加订阅源，请通过 ⚙ 添加或导入 OPML')).not.toBeNull()
  })

  test('says so when every feed is disabled', () => {
    const { root } = setup([feed('a', [item('a1')], { enabled: false })])
    expect(within(root).getByText('所有订阅源均已禁用，请通过 ⚙ 重新启用')).not.toBeNull()
  })

  test('renders only the enabled feeds', () => {
    const { root } = setup([feed('a', [item('a1')], { enabled: false }), feed('b', [item('b1')])])
    expect(within(root).queryByText('源 a')).toBeNull()
    expect(within(root).getByText('源 b')).not.toBeNull()
  })

  test('renders one block per feed with its unread count', () => {
    const { root } = setup([feed('a', [item('a1'), item('a2')]), feed('b', [item('b1')])])
    expect(within(root).getByText('源 a')).not.toBeNull()
    expect(within(root).getByText('源 b')).not.toBeNull()
    expect(within(root).getByText('2 条未读')).not.toBeNull()
    expect(within(root).getByText('1 条未读')).not.toBeNull()
  })

  test('marks a fully read feed with 无新条目', () => {
    const { root, state } = setup([feed('a', [item('a1')])])
    state.markRead('a1', NOW)
    render(
      <RssComponent
        data={[feed('a', [item('a1')])]}
        root={root}
        runtime={createRuntime()}
        state={state}
        viewMode="grouped"
        dateFilter="全"
        onDateFilterChange={() => {}}
        filterUnread={false}
        onToggleFilterUnread={() => {}}
      />,
      { container: root },
    )
    expect(within(root).getByText('无新条目')).not.toBeNull()
  })

  test('surfaces a per-feed fetch error as a marker with a tooltip', () => {
    const { root } = setup([feed('a', [], { error: 'http 500' })])
    const warn = root.querySelector('.gm-sp-rss-feed-warn')!
    expect(warn.textContent).toBe('⚠')
    expect(warn.getAttribute('title')).toBe('刷新失败：http 500')
  })

  test('folds more than three unread entries and can expand them', () => {
    const { root } = setup([feed('a', [item('a1'), item('a2'), item('a3'), item('a4')])])
    expect(rows(root)).toHaveLength(2)
    const toggle = within(root).getByText('…还有 2 条未读')
    toggle.click()
    expect(rows(root)).toHaveLength(4)
    expect(within(root).getByText('收起未读条目')).not.toBeNull()
  })

  test('clicking a row expands the summary without marking it read', () => {
    const { root, state } = setup([feed('a', [item('a1')])])
    within(root).getByText('标题 a1').click()
    expect(within(root).getByText('摘要 a1')).not.toBeNull()
    expect(within(root).getByText('打开原文')).not.toBeNull()
    expect(state.isRead('a1')).toBe(false)
  })

  test('says the summary was trimmed when the storage window dropped it', () => {
    const trimmed = item('a1', { summaryText: '', summaryTrimmed: true })
    const { root } = setup([feed('a', [trimmed])])
    within(root).getByText('标题 a1').click()
    expect(within(root).getByText('摘要已裁剪，点击打开原文')).not.toBeNull()
  })

  test('opening the original marks the entry read', () => {
    const { root, state } = setup([feed('a', [item('a1')])])
    within(root).getByText('标题 a1').click()
    within(root).getByText('打开原文').click()
    expect(state.isRead('a1')).toBe(true)
  })

  test('bulk-read marks every entry up to the clicked row', () => {
    const { root, state } = setup([feed('a', [item('a1'), item('a2'), item('a3')])])
    const first = rows(root)[0]!
    within(first).getByText('↑已读').click()
    expect(state.isRead('a1')).toBe(true)
    expect(state.isRead('a2')).toBe(false)
  })

  test('hiding an entry removes it from the list', () => {
    const { root, state } = setup([feed('a', [item('a1'), item('a2')])])
    const first = rows(root)[0]!
    within(first).getByText('×隐藏').click()
    expect(state.isHidden('a1')).toBe(true)
    expect(rows(root)).toHaveLength(1)
  })

  test('the feed title links to the feed url', () => {
    const { root } = setup([feed('a', [])])
    const link = within(root).getByText('源 a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.com/a.xml')
  })

  test('unread count follows read state', () => {
    const a = feed('a', [item('a1'), item('a2')])
    const { state } = setup([a])
    expect(unreadCount(a, state)).toBe(2)
    state.markRead('a1', NOW)
    expect(unreadCount(a, state)).toBe(1)
  })
})

describe('RssComponent view switching', () => {
  function rowTitles(root: HTMLElement): string[] {
    return rows(root).map((row) => row.querySelector('.gm-sp-expandable-title')?.textContent ?? '')
  }

  test('starts in the configured view and marks its button active', () => {
    const { root } = setup([feed('a', [item('a1')])], { viewMode: 'timeline' })
    expect(root.querySelector('[data-action="view-timeline"]')!.className).toContain(
      'gm-sp-rss-viewbtn-active',
    )
    expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
  })

  test('switching to the timeline reports the change and swaps the view', () => {
    const changes: RssViewMode[] = []
    const { root } = setup([feed('a', [item('a1')])], {
      onViewModeChange: (mode) => changes.push(mode),
    })
    root.querySelector<HTMLButtonElement>('[data-action="view-timeline"]')!.click()
    expect(changes).toEqual(['timeline'])
    expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
    expect(root.querySelector('.gm-sp-rss-feed')).toBeNull()
  })

  test('timeline labels each row with its feed', () => {
    const { root } = setup([feed('a', [item('a1')]), feed('b', [item('b1')])], {
      viewMode: 'timeline',
    })
    const labels = Array.from(root.querySelectorAll('.gm-sp-rss-feed-tag')).map(
      (el) => el.textContent,
    )
    expect(labels.sort()).toEqual(['源 a', '源 b'])
  })

  test('timeline merges feeds newest first', () => {
    const older = feed('a', [item('a1', { pubDate: NOW - 3 * DAY })])
    const newer = feed('b', [item('b1', { pubDate: NOW - 1000 })])
    const { root } = setup([older, newer], { viewMode: 'timeline' })
    expect(rowTitles(root)).toEqual(['标题 b1', '标题 a1'])
  })

  test('timeline keeps read entries (greyed) and drops hidden ones', () => {
    // Read rows stay put: 「打开原文」 used to make the row vanish from under the
    // cursor, which reads as a deletion rather than as "read".
    const { root, state } = setup([feed('a', [item('a1'), item('a2'), item('a3')])], {
      viewMode: 'timeline',
    })
    state.markRead('a1', NOW)
    state.markHidden('a2', NOW)
    root.querySelector<HTMLButtonElement>('[data-action="view-grouped"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-action="view-timeline"]')!.click()
    expect(rowTitles(root)).toEqual(['标题 a1', '标题 a3'])
    const readRow = rows(root).find((row) => row.dataset['itemId'] === 'a1')!
    expect(readRow.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('「未」 is what drops read entries from the timeline', () => {
    const { root } = setup([feed('a', [item('a1'), item('a3')])], {
      viewMode: 'timeline',
      filterUnread: true,
      prepare: (state) => state.markRead('a1', NOW),
    })
    expect(rowTitles(root)).toEqual(['标题 a3'])
  })

  test('opening an entry from the timeline leaves the row in place, marked read', async () => {
    const { root, state } = setup([feed('a', [item('a1'), item('a2')])], { viewMode: 'timeline' })
    rows(root)[0]!.querySelector<HTMLElement>('.gm-sp-expandable-row')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="open-original"]')).not.toBeNull()
    })
    root.querySelector<HTMLAnchorElement>('[data-action="open-original"]')!.click()
    await waitFor(() => {
      expect(state.isRead('a1')).toBe(true)
    })
    // The row must still be there — only its styling changed.
    expect(rowTitles(root)).toEqual(['标题 a1', '标题 a2'])
    expect(rows(root)[0]!.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('follows a viewMode prop change after mount', async () => {
    // The editor saves the view mode too; a local-only state would ignore that
    // write until a reload.
    const feeds = [feed('a', [item('a1')])]
    const { root, view, state, runtime } = setup(feeds, { viewMode: 'grouped' })
    expect(root.querySelector('.gm-sp-rss-feed')).not.toBeNull()
    view.rerender(
      <RssComponent
        data={feeds}
        root={root}
        runtime={runtime}
        state={state}
        viewMode="timeline"
        dateFilter="全"
        onDateFilterChange={() => {}}
        filterUnread={false}
        onToggleFilterUnread={() => {}}
      />,
    )
    await waitFor(() => {
      expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
    })
    expect(root.querySelector('.gm-sp-rss-feed')).toBeNull()
  })

  test('timeline truncates past the cap and says so', () => {
    // Many small sources rather than one firehose: a single source's entries
    // would be folded by the high-frequency rule before the cap is reached.
    const many = Array.from({ length: 40 }, (_unused, f) =>
      feed(
        `s${f}`,
        Array.from({ length: 3 }, (_ignored, i) =>
          item(`s${f}-${i}`, { pubDate: NOW - (f * 3 + i) * MIN }),
        ),
      ),
    )
    const { root } = setup(many, { viewMode: 'timeline' })
    expect(rows(root)).toHaveLength(TIMELINE_MAX_ITEMS)
    // Read entries are part of the timeline now, so the cap counts entries, not
    // "entries I have not read".
    expect(within(root).getByText(`仅显示最近 ${TIMELINE_MAX_ITEMS} 条`)).not.toBeNull()
  })
})

describe('schedule hints', () => {
  const HOUR = 60 * MIN

  /** A runtime pinned to NOW so the countdown labels are deterministic. */
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  function schedule(over: Partial<FeedSchedule> = {}): FeedSchedule {
    return { intervalMs: HOUR, due: false, nextFetchAt: NOW + HOUR, ...over }
  }

  function hint(value: FeedSchedule) {
    return () => value
  }

  test('formatIntervalLabel picks a readable unit', () => {
    expect(formatIntervalLabel(30 * MIN)).toBe('每 30 分钟')
    expect(formatIntervalLabel(HOUR)).toBe('每 1 小时')
    expect(formatIntervalLabel(12 * HOUR)).toBe('每 12 小时')
    expect(formatIntervalLabel(24 * HOUR)).toBe('每 1 天')
    expect(formatIntervalLabel(7 * 24 * HOUR)).toBe('每 7 天')
  })

  test('formatCountdownLabel rounds up to minutes, then hours, then days', () => {
    expect(formatCountdownLabel(1)).toBe('1 分钟后')
    expect(formatCountdownLabel(90_000)).toBe('2 分钟后')
    expect(formatCountdownLabel(3 * HOUR)).toBe('3 小时后')
    expect(formatCountdownLabel(2 * 24 * HOUR)).toBe('2 天后')
  })

  test('the header states the interval and the next fetch', () => {
    const { root } = setup([feed('a', [item('1')])], {
      runtime: clockedRuntime(),
      scheduleHint: hint(schedule({ intervalMs: 12 * HOUR, nextFetchAt: NOW + 8 * HOUR })),
    })
    expect(root.querySelector('.gm-sp-rss-feed-schedule')?.textContent).toBe(
      '每 12 小时 · 下次 8 小时后',
    )
  })

  test('a due feed says 待刷新 instead of counting down', () => {
    const { root } = setup([feed('a', [item('1')])], {
      runtime: clockedRuntime(),
      scheduleHint: hint(schedule({ due: true, nextFetchAt: 0 })),
    })
    expect(root.querySelector('.gm-sp-rss-feed-schedule')?.textContent).toBe('每 1 小时 · 待刷新')
  })

  test('no hint means no schedule line', () => {
    const { root } = setup([feed('a', [item('1')])], { runtime: clockedRuntime() })
    expect(root.querySelector('.gm-sp-rss-feed-schedule')).toBeNull()
  })

  test('a failing feed carries the sentence in a tooltip', () => {
    const { root } = setup([feed('a', [], { error: 'http 500', nextRetryAt: NOW + 3 * MIN })], {
      runtime: clockedRuntime(),
      scheduleHint: hint(schedule({ nextFetchAt: 0 })),
    })
    const warn = root.querySelector('.gm-sp-rss-feed-warn')!
    expect(warn.textContent).toBe('⚠')
    expect(warn.getAttribute('title')).toBe('刷新失败：http 500，3 分钟后重试')
  })

  test('a failing feed past its retry delay omits the countdown', () => {
    const { root } = setup([feed('a', [], { error: 'http 500', nextRetryAt: NOW - 1 })], {
      runtime: clockedRuntime(),
      scheduleHint: hint(schedule()),
    })
    expect(root.querySelector('.gm-sp-rss-feed-warn')?.getAttribute('title')).toBe(
      '刷新失败：http 500',
    )
  })

  test('failure and schedule share the title line, failure first', () => {
    const { root } = setup([feed('a', [], { error: 'http 500', nextRetryAt: NOW + 3 * MIN })], {
      runtime: clockedRuntime(),
      scheduleHint: hint(schedule({ intervalMs: 12 * HOUR, nextFetchAt: NOW + 8 * HOUR })),
    })
    const header = root.querySelector('.gm-sp-rss-feed-header')!
    expect(header.textContent).toContain('每 12 小时 · 下次 8 小时后')
    const warn = header.querySelector('.gm-sp-rss-feed-warn')!
    const hintSpan = header.querySelector('.gm-sp-rss-feed-schedule')!
    expect(warn.compareDocumentPosition(hintSpan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('no secondary text when there is nothing to say', () => {
    const { root } = setup([feed('a', [item('1')])], { runtime: clockedRuntime() })
    expect(root.querySelector('.gm-sp-rss-feed-warn')).toBeNull()
    expect(root.querySelector('.gm-sp-rss-feed-schedule')).toBeNull()
  })

  test('the timeline has neither hint', () => {
    const { root } = setup([feed('a', [item('1')])], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    expect(root.querySelector('.gm-sp-rss-feed-warn')).toBeNull()
    expect(root.querySelector('.gm-sp-rss-feed-schedule')).toBeNull()
  })
})

describe('timeline day sections', () => {
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  /**
   * Day groups no longer carry a heading row of their own — the single label in
   * the view bar stands in for whichever section is current — so grouping is
   * asserted on the groups themselves.
   */
  function sectionKeys(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-rss-daygroup')).map(
      (el) => el.dataset['daySection'] ?? '',
    )
  }

  function sectionTotals(root: HTMLElement): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-rss-daygroup')).map(
      (el) => el.dataset['total'] ?? '',
    )
  }

  function timeline(items: RssItem[], over: { dateFilter?: DateFilter } = {}) {
    return setup([feed('a', items)], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: over.dateFilter ?? '全',
    })
  }

  test('groups entries into 今天 / 昨天 / 更早, newest section first', () => {
    const { root } = timeline([
      item('t', { pubDate: NOW }),
      item('y', { pubDate: NOW - DAY }),
      item('e', { pubDate: NOW - 3 * DAY }),
    ])
    expect(sectionKeys(root)).toEqual(['today', 'yesterday', 'earlier'])
  })

  test('each heading carries its own count', () => {
    const { root } = timeline([
      item('t1', { pubDate: NOW }),
      item('t2', { pubDate: NOW }),
      item('y1', { pubDate: NOW - DAY }),
    ])
    expect(sectionTotals(root)).toEqual(['2', '1'])
  })

  test('undated entries get their own trailing section instead of 更早', () => {
    const { root } = timeline([item('undated', { pubDate: 0 }), item('t', { pubDate: NOW })])
    expect(sectionKeys(root)).toEqual(['today', 'unknown'])
  })

  test('empty sections are not rendered', () => {
    const { root } = timeline([item('t', { pubDate: NOW })])
    expect(sectionKeys(root)).toEqual(['today'])
  })

  test('the date filter still wins over the grouping', () => {
    const { root } = timeline([item('t', { pubDate: NOW }), item('y', { pubDate: NOW - DAY })], {
      dateFilter: '昨',
    })
    expect(sectionKeys(root)).toEqual(['yesterday'])
    expect(rows(root)).toHaveLength(1)
  })

  test('switching the date filter re-measures the label instead of keeping the old one', async () => {
    // Regression: the measurement cached the group elements once, so after a
    // filter change it measured detached nodes (all rects 0) and fell back to
    // the first group of the *previous* render — the label stuck on 昨天/今天
    // whatever was selected.
    const feeds = [
      feed('a', [
        item('t', { pubDate: NOW }),
        item('y', { pubDate: NOW - DAY }),
        item('e', { pubDate: NOW - 3 * DAY }),
      ]),
    ]
    const { root, view, state, runtime } = setup(feeds, {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '全',
    })
    const label = () =>
      root.querySelector('.gm-sp-rss-day-now .gm-sp-rss-day-label')?.textContent ?? null
    expect(label()).toBe('今天')

    view.rerender(
      <RssComponent
        data={feeds}
        root={root}
        runtime={runtime}
        state={state}
        viewMode="timeline"
        dateFilter="早"
        onDateFilterChange={() => {}}
        filterUnread={false}
        onToggleFilterUnread={() => {}}
      />,
    )
    await waitFor(() => {
      expect(label()).toBe('更早')
    })

    view.rerender(
      <RssComponent
        data={feeds}
        root={root}
        runtime={runtime}
        state={state}
        viewMode="timeline"
        dateFilter="昨"
        onDateFilterChange={() => {}}
        filterUnread={false}
        onToggleFilterUnread={() => {}}
      />,
    )
    await waitFor(() => {
      expect(label()).toBe('昨天')
    })
  })

  test('a single day label rides in the view bar instead of one row per section', () => {
    const { root } = timeline([
      item('t', { pubDate: NOW }),
      item('y', { pubDate: NOW - DAY }),
      item('e', { pubDate: NOW - 3 * DAY }),
    ])
    // No per-section heading rows, and exactly one label anywhere.
    expect(root.querySelector('.gm-sp-rss-day')).toBeNull()
    expect(root.querySelectorAll('.gm-sp-rss-day-label')).toHaveLength(1)
    const bar = root.querySelector('.gm-sp-rss-viewbar')!
    expect(bar.querySelector('.gm-sp-rss-day-now')).not.toBeNull()
    // No layout engine here, so "current section" cannot be measured — the
    // fallback is the first one on screen rather than no label at all.
    expect(bar.querySelector('.gm-sp-rss-day-label')!.textContent).toBe('今天')
    expect(bar.querySelector('.gm-sp-rss-day-count')!.textContent).toBe('1')
    const listed = root.querySelectorAll<HTMLElement>('.gm-sp-rss-daygroup')
    expect(listed.length).toBe(3)
  })
})

describe('feed block collapse', () => {
  test('the header toggle hides the entries but keeps the count visible', async () => {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    const { root } = setup([feed('a', [item('a1'), item('a2')])], { runtime })
    const toggle = root.querySelector<HTMLButtonElement>('[data-action="toggle-feed"]')!
    expect(rows(root)).toHaveLength(2)

    toggle.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(0)
    })
    // The unread count survives the collapse: that is the point of folding.
    expect(within(root).getByText('2 条未读')).not.toBeNull()
    expect(root.querySelector('.gm-sp-rss-feed-title')).not.toBeNull()

    toggle.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(2)
    })
  })

  test('a collapsed feed keeps its warning marker visible', async () => {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    const { root } = setup([feed('a', [item('a1')], { error: 'http 500' })], { runtime })
    root.querySelector<HTMLButtonElement>('[data-action="toggle-feed"]')!.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(0)
    })
    expect(root.querySelector('.gm-sp-rss-feed-warn')?.getAttribute('title')).toBe(
      '刷新失败：http 500',
    )
  })
})

describe('unread-only filter (未)', () => {
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  test('both controls are offered in both views', () => {
    const grouped = setup([feed('a', [item('1')])], { runtime: clockedRuntime() })
    expect(grouped.root.querySelector('.gm-sp-date-filter-unread')).not.toBeNull()
    expect(grouped.root.querySelectorAll('.gm-sp-date-filter-btn')).toHaveLength(5)

    const timeline = setup([feed('a', [item('1')])], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    expect(timeline.root.querySelector('.gm-sp-date-filter-unread')).not.toBeNull()
    expect(timeline.root.querySelectorAll('.gm-sp-date-filter-btn')).toHaveLength(5)
  })

  test('a fully read source is dropped once 未 is checked', () => {
    const feeds = [feed('busy', [item('b1')]), feed('empty', [item('e1')])]
    const prepare = (state: RssState) => state.markRead('e1', NOW)

    const off = setup(feeds, { runtime: clockedRuntime(), filterUnread: false, prepare })
    expect(off.root.querySelectorAll('.gm-sp-rss-feed')).toHaveLength(2)

    const on = setup(feeds, { runtime: clockedRuntime(), filterUnread: true, prepare })
    expect(on.root.querySelectorAll('.gm-sp-rss-feed')).toHaveLength(1)
    expect(within(on.root).getByText('源 busy')).not.toBeNull()
    expect(within(on.root).queryByText('源 empty')).toBeNull()
  })

  test('with everything read, 未 给出「没有未读条目」而不是空态误报', () => {
    const feeds = [feed('a', [item('a1')])]
    const { root } = setup(feeds, {
      runtime: clockedRuntime(),
      filterUnread: true,
      prepare: (state) => state.markRead('a1', NOW),
    })
    expect(root.querySelector('.gm-sp-empty')?.textContent).toBe('没有未读条目')
  })

  test('checking 未 reports through the callback', () => {
    let toggled = 0
    const { root } = setup([feed('a', [item('1')])], {
      runtime: clockedRuntime(),
      onToggleFilterUnread: () => {
        toggled += 1
      },
    })
    root.querySelector<HTMLInputElement>('.gm-sp-date-filter-unread input')!.click()
    expect(toggled).toBe(1)
  })

  test('未 hides what has nothing in the current range, but keeps a broken source', () => {
    const feeds = [
      feed('stale', [item('s1', { pubDate: NOW - 3 * DAY })]),
      feed('broken', [], { error: 'http 500' }),
    ]
    // 今 + 未: 'stale' has unread, but not today — gone. 'broken' stays visible so
    // its ⚠ has somewhere to live.
    const today = setup(feeds, {
      runtime: clockedRuntime(),
      filterUnread: true,
      dateFilter: '今',
    })
    expect(today.root.querySelectorAll('.gm-sp-rss-feed')).toHaveLength(1)
    expect(within(today.root).getByText('源 broken')).not.toBeNull()
    expect(within(today.root).queryByText('源 stale')).toBeNull()

    // Same sources with 全: the stale one has unread again and comes back.
    const all = setup(feeds, { runtime: clockedRuntime(), filterUnread: true })
    expect(all.root.querySelectorAll('.gm-sp-rss-feed')).toHaveLength(2)
  })
})

describe('timeline high-frequency sources', () => {
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  /** One firehose source (5 entries today) and one quiet source. */
  function feeds(): RssFeed[] {
    return [
      feed(
        'firehose',
        Array.from({ length: 5 }, (_, i) =>
          item(`f${i}`, { title: `快讯 ${i + 1}`, pubDate: NOW - i * MIN }),
        ),
      ),
      feed('quiet', [item('q1', { title: '安静源的一条', pubDate: NOW - 30 * MIN })]),
    ]
  }

  test('a source over the threshold shows one entry plus 展开查看更多', () => {
    const { root } = setup(feeds(), { runtime: clockedRuntime(), viewMode: 'timeline' })
    // 5 + 1 raw entries, but the firehose contributes only its newest.
    expect(rows(root)).toHaveLength(2)
    const button = within(root).getByText('展开查看更多 4 个主题 · 源 firehose')
    expect(button).not.toBeNull()
    // The affordance sits inside the row it belongs to, not at the end of the day.
    const row = button.closest('li')!
    expect(row.textContent).toContain('快讯 1')
    expect(row.textContent).not.toContain('安静源的一条')
  })

  test('clicking it reveals the rest and offers 收起', async () => {
    const { root } = setup(feeds(), { runtime: clockedRuntime(), viewMode: 'timeline' })
    root.querySelector<HTMLButtonElement>('[data-action="expand-source"]')!.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(6)
    })
    expect(within(root).getByText('收起 源 firehose 的主题')).not.toBeNull()
  })

  test('expanded entries stay under their own row, not interleaved by timestamp', async () => {
    const { root } = setup(feeds(), { runtime: clockedRuntime(), viewMode: 'timeline' })
    // The quiet source is newer than part of the firehose: in a timestamp merge
    // its row would land in the middle of the cluster.
    const headline = rows(root)[0]!
    expect(headline.textContent).toContain('快讯 1')

    root.querySelector<HTMLButtonElement>('[data-action="expand-source"]')!.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(6)
    })

    const all = rows(root)
    expect(all[0]).toBe(headline)
    const nested = headline.querySelectorAll('.gm-sp-rss-items-nested .gm-sp-list-item')
    expect(Array.from(nested)).toEqual(all.slice(1, 5))
    // …and the other source comes after the whole cluster, not inside it.
    expect(all[5]!.textContent).toContain('安静源的一条')
  })

  test('the day heading counts every entry, including the collapsed ones', () => {
    const { root } = setup(feeds(), { runtime: clockedRuntime(), viewMode: 'timeline' })
    expect(root.querySelector('.gm-sp-rss-day-count')?.textContent).toBe('6')
    expect(rows(root)).toHaveLength(2)
  })

  test('a source at or below the threshold is left alone', () => {
    const { root } = setup(
      [
        feed(
          'trio',
          Array.from({ length: 3 }, (_, i) => item(`t${i}`, { pubDate: NOW - i * MIN })),
        ),
      ],
      { runtime: clockedRuntime(), viewMode: 'timeline' },
    )
    expect(rows(root)).toHaveLength(3)
    expect(root.querySelector('.gm-sp-rss-more-toggle')).toBeNull()
  })
})

describe('timeline date filter', () => {
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  /** One feed with an entry today and one yesterday, both unread. */
  function datedFeed(): RssFeed {
    return feed('a', [item('today', { pubDate: NOW }), item('yesterday', { pubDate: NOW - DAY })])
  }

  function filterButtons(root: HTMLElement): HTMLButtonElement[] {
    return Array.from(root.querySelectorAll<HTMLButtonElement>('.gm-sp-date-filter-btn'))
  }

  test('the date buttons are offered in both views', () => {
    const grouped = setup([datedFeed()], { runtime: clockedRuntime() })
    expect(filterButtons(grouped.root).map((b) => b.textContent)).toEqual([
      '全',
      '今',
      '昨',
      '前',
      '早',
    ])
    expect(grouped.root.querySelector('.gm-sp-date-filter-unread')).not.toBeNull()

    const timeline = setup([datedFeed()], { runtime: clockedRuntime(), viewMode: 'timeline' })
    expect(filterButtons(timeline.root).map((b) => b.textContent)).toEqual([
      '全',
      '今',
      '昨',
      '前',
      '早',
    ])
  })

  test('今 keeps only today and hides yesterday', () => {
    const { root } = setup([datedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '今',
    })
    expect(rows(root)).toHaveLength(1)
    expect(within(root).getByText('标题 today')).not.toBeNull()
    expect(within(root).queryByText('标题 yesterday')).toBeNull()
  })

  test('昨 keeps only yesterday', () => {
    const { root } = setup([datedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '昨',
    })
    expect(rows(root)).toHaveLength(1)
    expect(within(root).getByText('标题 yesterday')).not.toBeNull()
  })

  test('全 keeps both', () => {
    const { root } = setup([datedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '全',
    })
    expect(rows(root)).toHaveLength(2)
  })

  test('picking a filter reports it instead of mutating local state', () => {
    const picked: DateFilter[] = []
    const { root } = setup([datedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      onDateFilterChange: (filter) => picked.push(filter),
    })
    filterButtons(root)[2]!.click() // 昨
    expect(picked).toEqual(['昨'])
  })

  test('an empty result distinguishes "nothing matched" from "nothing unread"', () => {
    const nothingMatched = setup([datedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '早',
    })
    expect(nothingMatched.root.querySelector('.gm-sp-empty')?.textContent).toBe(
      '该日期范围内没有未读条目',
    )

    const nothingUnread = setup([feed('a', [])], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
      dateFilter: '早',
    })
    expect(nothingUnread.root.querySelector('.gm-sp-empty')?.textContent).toBe('没有未读条目')
  })

  test('the date filter narrows the grouped lists too', () => {
    // datedFeed: one entry today, one yesterday.
    const all = setup([datedFeed()], { runtime: clockedRuntime() })
    expect(rows(all.root)).toHaveLength(2)

    const todayOnly = setup([datedFeed()], { runtime: clockedRuntime(), dateFilter: '今' })
    expect(rows(todayOnly.root)).toHaveLength(1)
    expect(within(todayOnly.root).getByText('标题 today')).not.toBeNull()
  })

  test('a source filtered down to nothing says why, and keeps its real count', () => {
    const { root } = setup([datedFeed()], { runtime: clockedRuntime(), dateFilter: '前' })
    expect(rows(root)).toHaveLength(0)
    // The badge counts the source, not the filter — it must not read 0/无新条目.
    expect(within(root).getByText('2 条未读')).not.toBeNull()
    expect(within(root).getByText('该日期范围内没有未读条目')).not.toBeNull()
  })
})

describe('timeline bulk read (↑已读)', () => {
  const HOUR = 60 * MIN

  /** Two interleaved sources: a1, b2, a3, b4, a5 (newest first). */
  function interleaved(): RssFeed[] {
    return [
      feed('a', [
        item('a1', { pubDate: NOW - 1 * HOUR }),
        item('a3', { pubDate: NOW - 3 * HOUR }),
        item('a5', { pubDate: NOW - 5 * HOUR }),
      ]),
      feed('b', [item('b2', { pubDate: NOW - 2 * HOUR }), item('b4', { pubDate: NOW - 4 * HOUR })]),
    ]
  }

  test("「↑已读」 stays inside the clicked entry's own source", async () => {
    // Regression: the timeline is a merged list, so slicing "everything above
    // this row" marked 源 b's newer entries read along with 源 a's.
    const { root, state } = setup(interleaved(), { viewMode: 'timeline' })
    expect(rows(root).map((row) => row.dataset['itemId'])).toEqual(['a1', 'b2', 'a3', 'b4', 'a5'])

    root.querySelector<HTMLButtonElement>('[data-item-id="a3"] .gm-sp-item-bulk-btn')!.click()
    await waitFor(() => {
      expect(state.isRead('a1')).toBe(true)
    })
    expect(state.isRead('a3')).toBe(true)
    // Same source, below the click — untouched.
    expect(state.isRead('a5')).toBe(false)
    // Other sources, above and below the click — untouched.
    expect(state.isRead('b2')).toBe(false)
    expect(state.isRead('b4')).toBe(false)
  })

  test('the other source keeps its rows unread in the DOM too', async () => {
    const { root } = setup(interleaved(), { viewMode: 'timeline' })
    root.querySelector<HTMLButtonElement>('[data-item-id="a3"] .gm-sp-item-bulk-btn')!.click()
    await waitFor(() => {
      expect(
        rows(root)
          .find((row) => row.dataset['itemId'] === 'b2')!
          .classList.contains('gm-sp-item-read'),
      ).toBe(false)
    })
    const readIds = rows(root)
      .filter((row) => row.classList.contains('gm-sp-item-read'))
      .map((row) => row.dataset['itemId'])
    expect(readIds).toEqual(['a1', 'a3'])
  })

  test('the topmost entry of a source marks only itself', async () => {
    const { root, state } = setup(interleaved(), { viewMode: 'timeline' })
    root.querySelector<HTMLButtonElement>('[data-item-id="b2"] .gm-sp-item-bulk-btn')!.click()
    await waitFor(() => {
      expect(state.isRead('b2')).toBe(true)
    })
    // a1 sits above it in the merged list but belongs to another source.
    expect(state.isRead('a1')).toBe(false)
  })
})

describe('timeline feed failures', () => {
  function clockedRuntime(): TestRuntime {
    const runtime = createRuntime()
    runtime.setClock(NOW)
    return runtime
  }

  function failedFeed(over: Partial<RssFeed> = {}): RssFeed {
    return feed('b', [], { error: 'http 502', ...over })
  }

  test('a failed source is visible even though it contributes no entries', () => {
    // The gap this fills: the timeline is built from unread entries, so a broken
    // feed rendered as nothing, and the card banner that used to report it is
    // suppressed for rss (`hideCardError`).
    const { root } = setup([feed('a', [item('a1')]), failedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    expect(within(root).getByText('⚠ 1 个源刷新失败')).not.toBeNull()
    // The healthy source's entries are untouched by the notice.
    expect(rows(root)).toHaveLength(1)
  })

  test('it rides in the view bar beside the date filter, not in its own row', () => {
    // The point of the placement: a permanent line above the list costs vertical
    // space on every visit, including the many visits where nothing is broken.
    const { root } = setup([feed('a', [item('a1')]), failedFeed()], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    const bar = root.querySelector('.gm-sp-rss-viewbar')!
    expect(bar.querySelector('.gm-sp-date-filter')).not.toBeNull()
    expect(bar.querySelector('.gm-sp-rss-failures')).not.toBeNull()
    expect(bar.lastElementChild?.classList.contains('gm-sp-rss-failures')).toBe(true)
    expect(root.querySelector('.gm-sp-rss-timeline .gm-sp-rss-failures')).toBeNull()
  })

  test('healthy sources show no such line', () => {
    const { root } = setup([feed('a', [item('a1')])], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    expect(root.querySelector('.gm-sp-rss-failures')).toBeNull()
  })

  test('the empty timeline keeps the line — that is the state where it matters', () => {
    const { root } = setup([failedFeed()], { runtime: clockedRuntime(), viewMode: 'timeline' })
    expect(within(root).getByText('没有未读条目')).not.toBeNull()
    expect(within(root).getByText('⚠ 1 个源刷新失败')).not.toBeNull()
  })

  test('clicking it names the feed, the reason and the retry', async () => {
    const { root } = setup([failedFeed({ nextRetryAt: NOW + 30 * MIN })], {
      runtime: clockedRuntime(),
      viewMode: 'timeline',
    })
    root.querySelector<HTMLButtonElement>('[data-action="toggle-feed-failures"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('.gm-sp-rss-failures-list')).not.toBeNull()
    })
    expect(within(root).getByText('源 b')).not.toBeNull()
    expect(within(root).getByText('http 502')).not.toBeNull()
    expect(within(root).getByText('30 分钟后重试')).not.toBeNull()
  })

  test('two broken sources are counted, not listed inline', () => {
    const { root } = setup(
      [
        failedFeed(),
        feed('c', [], { error: 'timeout', id: 'u:https://example.com/c.xml', title: '源 c' }),
      ],
      { runtime: clockedRuntime(), viewMode: 'timeline' },
    )
    expect(within(root).getByText('⚠ 2 个源刷新失败')).not.toBeNull()
    // Collapsed: no URL in the timeline until the reader asks for it.
    expect(within(root).queryByText('http 502')).toBeNull()
  })

  test('the grouped view keeps marking the feed instead of adding the line', () => {
    const { root } = setup([failedFeed()], { runtime: clockedRuntime(), viewMode: 'grouped' })
    expect(root.querySelector('.gm-sp-rss-failures')).toBeNull()
    expect(root.querySelector('[data-action="feed-warning"]')).not.toBeNull()
  })
})

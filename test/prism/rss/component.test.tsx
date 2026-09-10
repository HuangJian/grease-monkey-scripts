import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor, within } from '@testing-library/preact'
import { RssComponent } from '../../../src/prism/rss/component'
import { TIMELINE_MAX_ITEMS } from '../../../src/prism/rss/constants'
import { createRssState, unreadCount } from '../../../src/prism/rss/state'
import type { RssFeed, RssItem, RssViewMode } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

const NOW = 1_700_000_000_000
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
  } = {},
) {
  const runtime = over.runtime ?? createRuntime()
  const state = createRssState({ retentionMs: 30 * DAY })
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
      />,
      { container: root },
    )
    expect(within(root).getByText('无新条目')).not.toBeNull()
  })

  test('surfaces a per-feed fetch error', () => {
    const { root } = setup([feed('a', [], { error: 'http 500' })])
    expect(within(root).getByText('刷新失败：http 500')).not.toBeNull()
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

  test('timeline omits entries that are already read or hidden', () => {
    const { root, state } = setup([feed('a', [item('a1'), item('a2')])], { viewMode: 'timeline' })
    state.markRead('a1', NOW)
    state.markHidden('a2', NOW)
    root.querySelector<HTMLButtonElement>('[data-action="view-grouped"]')!.click()
    root.querySelector<HTMLButtonElement>('[data-action="view-timeline"]')!.click()
    expect(within(root).getByText('没有未读条目')).not.toBeNull()
  })

  test('follows a viewMode prop change after mount', async () => {
    // The editor saves the view mode too; a local-only state would ignore that
    // write until a reload.
    const feeds = [feed('a', [item('a1')])]
    const { root, view, state, runtime } = setup(feeds, { viewMode: 'grouped' })
    expect(root.querySelector('.gm-sp-rss-feed')).not.toBeNull()
    view.rerender(
      <RssComponent data={feeds} root={root} runtime={runtime} state={state} viewMode="timeline" />,
    )
    await waitFor(() => {
      expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
    })
    expect(root.querySelector('.gm-sp-rss-feed')).toBeNull()
  })

  test('timeline truncates past the cap and says so', () => {
    const many = Array.from({ length: TIMELINE_MAX_ITEMS + 20 }, (_, i) =>
      item(`x${i}`, { pubDate: NOW - i * 1000 }),
    )
    const { root } = setup([feed('a', many)], { viewMode: 'timeline' })
    expect(rows(root)).toHaveLength(TIMELINE_MAX_ITEMS)
    expect(within(root).getByText(`仅显示最近 ${TIMELINE_MAX_ITEMS} 条未读`)).not.toBeNull()
  })
})

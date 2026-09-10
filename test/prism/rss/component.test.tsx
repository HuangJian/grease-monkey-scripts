import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, within } from '@testing-library/preact'
import { RssComponent } from '../../../src/prism/rss/component'
import { createRssState, unreadCount } from '../../../src/prism/rss/state'
import type { RssFeed, RssItem } from '../../../src/prism/rss/types'
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

function setup(feeds: RssFeed[], runtime: TestRuntime = createRuntime()) {
  const state = createRssState({ retentionMs: 30 * DAY })
  const root = document.createElement('div')
  document.body.appendChild(root)
  const view = render(<RssComponent data={feeds} root={root} runtime={runtime} state={state} />, {
    container: root,
  })
  return { state, root, view }
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-list-item'))
}

describe('RssComponent', () => {
  test('shows an empty state when no feeds are configured', () => {
    const { root } = setup([])
    expect(within(root).getByText('尚未添加订阅源，请通过 ⚙ 添加或导入 OPML')).not.toBeNull()
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

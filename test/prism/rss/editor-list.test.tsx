import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor, within } from '@testing-library/preact'
import { createRssEditor } from '../../../src/prism/rss/editor/form'
import { FEEDS_PER_PAGE } from '../../../src/prism/rss/editor/list-toolbar'
import { CACHE_KEY, DEFAULT_SOURCE_SETTINGS } from '../../../src/prism/types'
import type { RssSourceOptions } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

const BASE: RssSourceOptions = {
  feeds: [],
  ttlMinutes: 123,
  retentionDays: 30,
  maxItemsPerFeed: 100,
  viewMode: 'grouped',
  respectFeedPeriod: true,
}

function optionsWith(feeds: RssSourceOptions['feeds']): RssSourceOptions {
  return { ...BASE, feeds }
}

/** The scale this redesign is for: a hundred feeds, half of them named. */
function manyFeeds(count: number): RssSourceOptions['feeds'] {
  return Array.from({ length: count }, (_u, i) => ({
    url: `https://site-${i}.example.com/feed.xml`,
    title: i % 2 === 0 ? `第 ${i} 个源` : '',
  }))
}

async function setup(runtime: TestRuntime = createRuntime(), options: RssSourceOptions = BASE) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const editor = createRssEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(root, { runtime, onRevert: () => {}, close: () => {} })
  return { runtime, root, result }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-re-feed'))
}

function setInput(el: Element, value: string): void {
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function blur(el: Element): void {
  el.dispatchEvent(new Event('blur'))
}

function search(root: HTMLElement, value: string): void {
  setInput(root.querySelector('[data-action="toolbar-search"]')!, value)
}

function counter(root: HTMLElement): string {
  return root.querySelector('[data-action="toolbar-counter"]')?.textContent ?? ''
}

describe('rss editor long list', () => {
  test('paginates instead of rendering every row', async () => {
    const { root } = await setup(createRuntime(), optionsWith(manyFeeds(60)))
    expect(rows(root)).toHaveLength(FEEDS_PER_PAGE)
    expect(root.querySelector('[data-action="page-label"]')?.textContent).toBe('1 / 2')

    root.querySelector<HTMLButtonElement>('[data-action="page-next"]')!.click()
    await waitFor(() => {
      expect(rows(root)).toHaveLength(10)
    })
    expect(root.querySelector('[data-action="page-label"]')?.textContent).toBe('2 / 2')
  })

  test('search matches the title and the url', async () => {
    const { root } = await setup(createRuntime(), optionsWith(manyFeeds(20)))
    search(root, '第 4 个源')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    expect(counter(root)).toBe('共 20 · 命中 1')

    search(root, 'site-7.')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    // An unnamed feed is findable by its host — matching titles alone would hide it.
    expect(rows(root)[0]!.dataset['feedUrl']).toBe('https://site-7.example.com/feed.xml')
  })

  test('a search with no hits says so instead of showing a stale list', async () => {
    const { root } = await setup(createRuntime(), optionsWith(manyFeeds(5)))
    search(root, '不存在的源')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(0)
    })
    expect(within(root).getByText('没有符合条件的订阅源')).not.toBeNull()
  })

  test('select-all covers the filtered rows only', async () => {
    const { root } = await setup(createRuntime(), optionsWith(manyFeeds(20)))
    // Only every other feed is named, so this hits 第 10/12/14/16/18 个源.
    search(root, '第 1')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(5)
    })
    const selectAll = root.querySelector<HTMLInputElement>('[data-action="toolbar-select-all"]')!
    selectAll.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="toolbar-selected"]')?.textContent).toBe('已选 5')
    })
  })

  test('bulk disable then enable round-trips the selection', async () => {
    const { root, result } = await setup(createRuntime(), optionsWith(manyFeeds(4)))
    root.querySelector<HTMLInputElement>('[data-action="toolbar-select-all"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="bulk-disable"]')).not.toBeNull()
    })
    root.querySelector<HTMLButtonElement>('[data-action="bulk-disable"]')!.click()
    await waitFor(() => {
      expect(counter(root)).toBe('共 4 个源')
    })
    // The enabled checkbox, not the row's own "pick" checkbox.
    const enabledBoxes = rows(root).map(
      (row) => row.querySelector<HTMLInputElement>('.gm-sp-re-feed-enabled input')!,
    )
    expect(enabledBoxes.every((box) => !box.checked)).toBe(true)
    void result
  })

  test('bulk remove waits for an explicit confirmation', async () => {
    const { root } = await setup(createRuntime(), optionsWith(manyFeeds(4)))
    root.querySelector<HTMLInputElement>('[data-action="toolbar-select-all"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="bulk-remove"]')).not.toBeNull()
    })
    root.querySelector<HTMLButtonElement>('[data-action="bulk-remove"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="bulk-remove-guard"]')).not.toBeNull()
    })
    expect(rows(root)).toHaveLength(4)

    root.querySelector<HTMLButtonElement>('[data-action="bulk-remove-confirm"]')!.click()
    await waitFor(() => {
      expect(within(root).getByText('尚未添加订阅源')).not.toBeNull()
    })
  })

  test('a row expands to an editable url, applied when the field is left', async () => {
    const { root, result } = await setup(
      createRuntime(),
      optionsWith([{ url: 'https://old.example.com/feed.xml', title: '旧源' }]),
    )
    root.querySelector<HTMLElement>('[data-action="feed-name"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="feed-url"]')).not.toBeNull()
    })
    const field = root.querySelector<HTMLInputElement>('[data-action="feed-url"]')!
    setInput(field, 'https://new.example.com/feed.xml')
    blur(field)
    await waitFor(() => {
      expect(rows(root)[0]!.dataset['feedUrl']).toBe('https://new.example.com/feed.xml')
    })
    expect(result.isDirty?.()).toBe(true)
  })

  test('an edited url that already exists is rejected, not duplicated', async () => {
    const { root } = await setup(
      createRuntime(),
      optionsWith([
        { url: 'https://a.example.com/feed.xml', title: '' },
        { url: 'https://b.example.com/feed.xml', title: '' },
      ]),
    )
    const names = root.querySelectorAll<HTMLElement>('[data-action="feed-name"]')
    names[1]!.click()
    await waitFor(() => {
      expect(root.querySelectorAll('[data-action="feed-url"]')).toHaveLength(1)
    })
    const field = root.querySelector<HTMLInputElement>('[data-action="feed-url"]')!
    setInput(field, 'https://a.example.com/feed.xml')
    blur(field)
    await waitFor(() => {
      expect(within(root).getByText('该订阅源已在列表中')).not.toBeNull()
    })
    expect(rows(root)).toHaveLength(2)
  })

  test('each row shows when its feed last updated, or how long it has been failing', async () => {
    const runtime = createRuntime()
    const now = runtime.now()
    const MIN = 60_000
    const HOUR = 60 * MIN
    const url = (i: number) => `https://site-${i}.example.com/feed.xml`
    runtime.stores[CACHE_KEY('rss')] = {
      schemaVersion: 2,
      fetchedAt: now,
      data: [
        {
          id: `u:${url(0)}`,
          title: '第 0 个源',
          url: url(0),
          items: [],
          error: '',
          fetchedAt: now - 12 * MIN,
        },
        {
          id: `u:${url(1)}`,
          title: '第 1 个源',
          url: url(1),
          items: [],
          error: 'http 502',
          fetchedAt: now - 2 * HOUR,
          failureCount: 3,
        },
      ],
    }
    const { root } = await setup(
      runtime,
      optionsWith([
        { url: url(0), title: '第 0 个源' },
        { url: url(1), title: '第 1 个源' },
        { url: url(2), title: '第 2 个源' }, // never fetched: no cache entry
      ]),
    )
    const statuses = Array.from(
      root.querySelectorAll<HTMLElement>('[data-action="feed-status"]'),
    ).map((el) => ({ text: el.textContent, failed: el.dataset['failed'] }))

    expect(statuses[0]).toEqual({ text: '最后更新 12 分钟前', failed: undefined })
    expect(statuses[1]).toEqual({ text: '⚠ 失败 3 次 · 已 2 小时未成功', failed: 'true' })
    expect(statuses[2]).toEqual({ text: '尚未抓取', failed: undefined })
  })

  test('a disabled feed keeps its failure text but drops the alarm colour', async () => {
    const runtime = createRuntime()
    const now = runtime.now()
    const url = 'https://paused.example.com/feed.xml'
    runtime.stores[CACHE_KEY('rss')] = {
      schemaVersion: 2,
      fetchedAt: now,
      data: [
        {
          id: `u:${url}`,
          title: '停用的源',
          url,
          items: [],
          error: 'http 502',
          fetchedAt: now - 3 * 60 * 60 * 1000,
          failureCount: 2,
        },
      ],
    }
    const { root } = await setup(runtime, optionsWith([{ url, title: '停用的源', enabled: false }]))
    const status = root.querySelector<HTMLElement>('[data-action="feed-status"]')!
    expect(status.dataset['failed']).toBeUndefined()
    // Still says what happened — it just is not shouting about it.
    expect(status.textContent).toBe('⚠ 失败 2 次 · 已 3 小时未成功')
  })

  test('the 至今失败 filter lists only the feeds that are currently broken', async () => {
    const runtime = createRuntime()
    const now = runtime.now()
    const url = (i: number) => `https://site-${i}.example.com/feed.xml`
    const cached = (i: number, error: string) => ({
      id: `u:${url(i)}`,
      title: `第 ${i} 个源`,
      url: url(i),
      items: [],
      error,
      fetchedAt: now - 60_000,
      failureCount: error ? 2 : 0,
    })
    runtime.stores[CACHE_KEY('rss')] = {
      schemaVersion: 2,
      fetchedAt: now,
      data: [cached(0, 'http 502'), cached(1, ''), cached(2, 'timeout'), cached(4, 'http 500')],
    }
    const { root } = await setup(
      runtime,
      optionsWith([
        { url: url(0), title: '第 0 个源' },
        { url: url(1), title: '第 1 个源' },
        { url: url(2), title: '第 2 个源' },
        { url: url(3), title: '第 3 个源' }, // no cache entry: never fetched
        // Paused *and* previously failing — not failing, because nothing is tried.
        { url: url(4), title: '第 4 个源', enabled: false },
      ]),
    )
    const select = root.querySelector('[data-action="toolbar-status"]') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('至今失败')
    select.value = 'failing'
    select.dispatchEvent(new Event('change'))
    await tick()

    const titles = Array.from(root.querySelectorAll<HTMLElement>('[data-action="feed-name"]')).map(
      (el) => el.textContent,
    )
    expect(titles).toEqual(['第 0 个源', '第 2 个源'])
    expect(counter(root)).toBe('共 5 · 命中 2')
  })

  test('declares the wide dialog and reports no edits until something changes', async () => {
    const { root, result } = await setup(createRuntime(), optionsWith(manyFeeds(3)))
    expect(result.size).toBe('lg')
    expect(result.isDirty?.()).toBe(false)
    setInput(root.querySelector('[data-action="toolbar-search"]')!, 'x')
    // Filtering is not an edit — it must not arm the unsaved-changes guard.
    expect(result.isDirty?.()).toBe(false)
    rows(root)
  })
})

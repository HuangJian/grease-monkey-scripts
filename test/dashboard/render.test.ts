import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { formatRelativeTime, renderCard, renderHeader } from '../../src/dashboard/overlay/render'
import type { Source } from '../../src/dashboard/sources/types'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'

function stubSource(): Source<{ msg: string }> {
  return {
    id: 'stub',
    title: 'Stub Source',
    ttlMs: 60_000,
    fetch: () => Promise.resolve({ msg: 'hi' }),
    render: (container, data) => {
      container.textContent = data?.msg ?? 'no-data'
    },
  }
}

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
}

describe('formatRelativeTime', () => {
  test('returns 从未更新 when null', () => {
    expect(formatRelativeTime(null, 1_000_000)).toBe('从未更新')
  })
  test('returns 刚刚 for < 1 min', () => {
    expect(formatRelativeTime(1_000_000 - 30_000, 1_000_000)).toBe('刚刚')
  })
  test('returns N 分钟前 for minutes', () => {
    expect(formatRelativeTime(1_000_000 - 5 * 60_000, 1_000_000)).toBe('5 分钟前')
  })
  test('returns N 小时前 for hours', () => {
    expect(formatRelativeTime(1_000_000 - 2 * 3_600_000, 1_000_000)).toBe('2 小时前')
  })
  test('returns N 天前 for days', () => {
    expect(formatRelativeTime(1_000_000 - 3 * 86_400_000, 1_000_000)).toBe('3 天前')
  })
})

describe('renderHeader', () => {
  test('renders title and close button; close triggers callback', () => {
    const dom = new JSDOM('<html><body><div id="m"></div></body></html>')
    const modal = dom.window.document.getElementById('m')!
    let closed = 0
    renderHeader(modal, { onClose: () => closed++ })
    expect(modal.querySelector('.gm-sp-title')!.textContent).toBe('个人仪表盘')
    const btn = modal.querySelector('.gm-sp-close') as HTMLButtonElement
    btn.click()
    expect(closed).toBe(1)
  })
})

describe('renderCard', () => {
  function setup() {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    const container = dom.window.document.getElementById('c') as HTMLElement
    const runtime = createRuntime(dom)
    return { dom, container, runtime }
  }

  test('renders title, data, and never shows badge for fresh data', () => {
    const { container, runtime } = setup()
    const source = stubSource()
    const now = 1_000_000
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'hello' }, fetchedAt: now - 1_000 }),
      ttlMs: 60_000,
      now,
      runtime,
      onRefresh: () => {},
      onRevert: () => {},
    })
    expect(container.dataset['source']).toBe('stub')
    expect(container.querySelector('.gm-sp-card-title-text')!.textContent).toBe('Stub Source')
    expect(container.querySelector('.gm-sp-card-stale')).toBeNull()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('hello')
  })

  test('shows stale badge when cache is very old', () => {
    const { container, runtime } = setup()
    const source = stubSource()
    const now = 1_000_000
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'stale' }, fetchedAt: now - 60 * 60_000 * 4 }),
      ttlMs: 60_000,
      now,
      runtime,
      onRefresh: () => {},
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-card-stale')!.textContent).toBe('数据陈旧')
  })

  test('shows error block when cached.error is set', () => {
    const { container, runtime } = setup()
    const source = stubSource()
    renderCard(container, {
      source,
      cached: cached({ fetchedAt: 1, error: 'boom' }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      onRefresh: () => {},
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-error')!.textContent).toBe('boom')
  })

  test('refresh button triggers onRefresh callback', () => {
    const { container, runtime } = setup()
    const source = stubSource()
    let refreshes = 0
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      onRefresh: () => refreshes++,
      onRevert: () => {},
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    expect(refreshes).toBe(1)
  })

  test('omits edit button when source has no createEditor', () => {
    const { container, runtime } = setup()
    renderCard(container, {
      source: stubSource(),
      cached: null,
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      onRefresh: () => {},
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-edit')).toBeNull()
  })

  test('shows edit button and swaps body when source has createEditor', () => {
    const { container, runtime } = setup()
    const source: Source<{ msg: string }> = {
      id: 'edit',
      title: 'E',
      ttlMs: 60_000,
      fetch: () => Promise.resolve({ msg: 'x' }),
      render: (c, d) => {
        c.textContent = d?.msg ?? ''
      },
      createEditor: () => (c) => {
        c.textContent = 'editor-body'
      },
    }
    let reverted = 0
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'real-data' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      onRefresh: () => {},
      onRevert: () => reverted++,
    })
    expect(container.querySelector('.gm-sp-edit')).not.toBeNull()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('real-data')
    ;(container.querySelector('.gm-sp-edit') as HTMLButtonElement).click()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('editor-body')
    expect(reverted).toBe(0)
  })
})

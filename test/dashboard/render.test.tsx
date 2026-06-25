import { describe, expect, test, afterEach } from 'bun:test'
import { render, cleanup, within } from '@testing-library/preact'

afterEach(cleanup)
import { formatRelativeTime } from '../../src/dashboard/card/primitives'
import { RenderCard } from '../../src/dashboard/card/card'
import type { Source } from '../../src/dashboard/types'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import type { CardOptions } from '../../src/dashboard/card/card'
import { createRuntime } from '../runtime'

function stubSource(): Source<{ msg: string }> {
  return {
    id: 'stub',
    title: 'Stub Source',
    ttlMs: 60_000,
    headerState: {},
    fetch: () => Promise.resolve({ msg: 'hi' }),
    RenderComponent: ({ data }) => <span>{(data as { msg: string } | null)?.msg ?? ''}</span>,
  }
}

function cached<T>(partial: { data?: T; fetchedAt: number; error?: string }): CachedSource<T> {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    data: partial.data ?? null,
    fetchedAt: partial.fetchedAt,
    error: partial.error ?? '',
  }
}

function suppressConsoleError(fn: () => void): void {
  const orig = console.error
  console.error = () => {}
  try {
    fn()
  } finally {
    console.error = orig
  }
}

function renderCard(opts: CardOptions<unknown>): HTMLElement {
  const { container } = render(<RenderCard {...opts} />)
  const el = container as unknown as HTMLElement
  el.dataset['source'] = opts.source.id
  return el
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

describe('renderCard', () => {
  test('renders title, data, and never shows badge for fresh data', () => {
    const source = stubSource()
    const now = 1_000_000
    const container = renderCard({
      source,
      cached: cached({ data: { msg: 'hello' }, fetchedAt: now - 1_000 }),
      ttlMs: 60_000,
      now,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.dataset['source']).toBe('stub')
    expect(within(container).getByText('Stub Source')).not.toBeNull()
    expect(within(container).queryByText('数据陈旧')).toBeNull()
    expect(within(container).getByText('hello')).not.toBeNull()
  })

  test('shows stale badge when cache is very old', () => {
    const source = stubSource()
    const now = 1_000_000
    const container = renderCard({
      source,
      cached: cached({ data: { msg: 'stale' }, fetchedAt: now - 60 * 60_000 * 4 }),
      ttlMs: 60_000,
      now,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(within(container).getByText('数据陈旧')).not.toBeNull()
  })

  test('shows error block when cached.error is set', () => {
    const container = renderCard({
      source: stubSource(),
      cached: cached({ fetchedAt: 1, error: 'boom' }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(within(container).getByText('boom')).not.toBeNull()
  })

  test('refresh button triggers onRefresh callback', () => {
    let refreshes = 0
    const container = renderCard({
      source: stubSource(),
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () => {
        refreshes++
        return Promise.resolve()
      },
      onRevert: () => {},
    })
    const btn = within(container).getByRole('button') as HTMLButtonElement
    btn.click()
    expect(refreshes).toBe(1)
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    expect(btn.disabled).toBe(true)
  })

  test('refresh button removes loading class after onRefresh resolves', async () => {
    let resolveRefresh: () => void = () => {}
    const container = renderCard({
      source: stubSource(),
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
      onRevert: () => {},
    })
    const btn = within(container).getByRole('button') as HTMLButtonElement
    btn.click()
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    resolveRefresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('refresh button removes loading class even when onRefresh rejects', async () => {
    let rejectRefresh: (e: Error) => void = () => {}
    const container = renderCard({
      source: stubSource(),
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () =>
        new Promise<void>((_resolve, reject) => {
          rejectRefresh = reject
        }),
      onRevert: () => {},
    })
    const btn = within(container).getByRole('button') as HTMLButtonElement
    btn.click()
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    suppressConsoleError(() => rejectRefresh(new Error('boom')))
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('omits edit button when source has no createEditor', () => {
    const container = renderCard({
      source: stubSource(),
      cached: null,
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(within(container).queryByRole('button', { name: '⚙' })).toBeNull()
  })

  test('shows edit button and opens dialog when source has createEditor', async () => {
    const root = document.createElement('div') as unknown as ShadowRoot
    document.body.appendChild(root as unknown as HTMLElement)
    const source: Source<{ msg: string }> = {
      id: 'edit',
      title: 'E',
      ttlMs: 60_000,
      headerState: {},
      fetch: () => Promise.resolve({ msg: 'x' }),
      RenderComponent: ({ data }) => <span>{(data as { msg: string } | null)?.msg ?? ''}</span>,
      createEditor: () => (c) => {
        c.textContent = 'editor-body'
        return { render() {}, cancel() {}, save() {} }
      },
    }
    const container = renderCard({
      source,
      cached: cached({ data: { msg: 'real-data' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime: createRuntime(),
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(within(container).getByRole('button', { name: '⚙' })).not.toBeNull()
    expect(within(container).getByText('real-data')).not.toBeNull()
    ;(within(container).getByRole('button', { name: '⚙' }) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root as unknown as HTMLElement).getByText('保存')).not.toBeNull()
    expect(within(root as unknown as HTMLElement).getByText('editor-body')).not.toBeNull()
  })
})

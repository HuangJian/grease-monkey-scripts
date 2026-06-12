import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { render } from 'preact'
import { h } from 'preact'
import { formatRelativeTime } from '../../src/dashboard/card/chrome'
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
    fetch: () => Promise.resolve({ msg: 'hi' }),
    render: (container, data) => {
      container.textContent = data?.msg ?? 'no-data'
    },
  }
}

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
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

function renderCard(container: HTMLElement, opts: CardOptions<unknown>): void {
  container.dataset['source'] = opts.source.id
  render(h(RenderCard, opts), container)
}

describe('formatRelativeTime', () => {
  test('returns \u4ECE\u672A\u66F4\u65B0 when null', () => {
    expect(formatRelativeTime(null, 1_000_000)).toBe('\u4ECE\u672A\u66F4\u65B0')
  })
  test('returns \u521A\u521A for < 1 min', () => {
    expect(formatRelativeTime(1_000_000 - 30_000, 1_000_000)).toBe('\u521A\u521A')
  })
  test('returns N \u5206\u949F\u524D for minutes', () => {
    expect(formatRelativeTime(1_000_000 - 5 * 60_000, 1_000_000)).toBe('5 \u5206\u949F\u524D')
  })
  test('returns N \u5C0F\u65F6\u524D for hours', () => {
    expect(formatRelativeTime(1_000_000 - 2 * 3_600_000, 1_000_000)).toBe('2 \u5C0F\u65F6\u524D')
  })
  test('returns N \u5929\u524D for days', () => {
    expect(formatRelativeTime(1_000_000 - 3 * 86_400_000, 1_000_000)).toBe('3 \u5929\u524D')
  })
})

describe('renderCard', () => {
  function setup() {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    const container = dom.window.document.getElementById('c') as HTMLElement
    const runtime = createRuntime(dom)
    const root = dom.window.document.createElement('div') as unknown as ShadowRoot
    return { dom, container, runtime, root }
  }

  test('renders title, data, and never shows badge for fresh data', () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    const now = 1_000_000
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'hello' }, fetchedAt: now - 1_000 }),
      ttlMs: 60_000,
      now,
      runtime,
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.dataset['source']).toBe('stub')
    expect(container.querySelector('.gm-sp-card-title-text')!.textContent).toBe('Stub Source')
    expect(container.querySelector('.gm-sp-card-stale')).toBeNull()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('hello')
  })

  test('shows stale badge when cache is very old', () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    const now = 1_000_000
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'stale' }, fetchedAt: now - 60 * 60_000 * 4 }),
      ttlMs: 60_000,
      now,
      runtime,
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-card-stale')!.textContent).toBe(
      '\u6570\u636E\u9648\u65E7',
    )
  })

  test('shows error block when cached.error is set', () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    renderCard(container, {
      source,
      cached: cached({ fetchedAt: 1, error: 'boom' }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-error-box')!.textContent).toBe('boom')
  })

  test('refresh button triggers onRefresh callback', () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    let refreshes = 0
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () => {
        refreshes++
        return Promise.resolve()
      },
      onRevert: () => {},
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    expect(refreshes).toBe(1)
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    expect(btn.disabled).toBe(true)
  })

  test('refresh button removes loading class after onRefresh resolves', async () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    let resolveRefresh: () => void = () => {}
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
      onRevert: () => {},
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    resolveRefresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('refresh button removes loading class even when onRefresh rejects', async () => {
    const { container, runtime, root } = setup()
    const source = stubSource()
    let rejectRefresh: (e: Error) => void = () => {}
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'x' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () =>
        new Promise<void>((_resolve, reject) => {
          rejectRefresh = reject
        }),
      onRevert: () => {},
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    suppressConsoleError(() => rejectRefresh(new Error('boom')))
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('omits edit button when source has no createEditor', () => {
    const { container, runtime, root } = setup()
    renderCard(container, {
      source: stubSource(),
      cached: null,
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-edit')).toBeNull()
  })

  test('shows edit button and opens dialog when source has createEditor', () => {
    const { container, runtime, root } = setup()
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
        return { render() {}, cancel() {}, save() {} }
      },
    }
    renderCard(container, {
      source,
      cached: cached({ data: { msg: 'real-data' }, fetchedAt: 1_000_000 }),
      ttlMs: 60_000,
      now: 1_000_000,
      runtime,
      root,
      onRefresh: () => Promise.resolve(),
      onRevert: () => {},
    })
    expect(container.querySelector('.gm-sp-edit')).not.toBeNull()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('real-data')
    ;(container.querySelector('.gm-sp-edit') as HTMLButtonElement).click()
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('real-data')
    const dialog = (root as unknown as HTMLElement).querySelector('.gm-sp-editor-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog!.querySelector('.gm-sp-editor-dialog-body')!.textContent).toBe('editor-body')
  })
})

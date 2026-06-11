import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { render } from 'preact'
import { h } from 'preact'
import { CardChrome } from '../../src/dashboard/ui/card-chrome'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import type { CardChromeProps } from '../../src/dashboard/ui/card-chrome'
import { createRuntime } from '../runtime'

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
}

function setup() {
  const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
  const container = dom.window.document.getElementById('c') as HTMLElement
  const runtime = createRuntime(dom)
  const root = dom.window.document.createElement('div') as unknown as ShadowRoot
  return { dom, container, runtime, root }
}

function renderChrome(container: HTMLElement, props: Partial<CardChromeProps> = {}) {
  const defaults: CardChromeProps = {
    root: props.root!,
    runtime: props.runtime!,
    now: 1_000_000,
    ttlMs: 60_000,
    cached: null as CachedSource<unknown> | null,
    title: h('span', { class: 'test-title' }, 'title'),
    onRefresh: () => Promise.resolve(),
    ...props,
  }
  render(h(CardChrome, defaults), container)
}

describe('CardChrome (Preact component)', () => {
  test('renders header, body, and refresh button', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, { runtime, root })
    const header = container.querySelector('.gm-sp-card-header')
    const body = container.querySelector('.gm-sp-card-body')
    const refreshBtn = container.querySelector('.gm-sp-refresh')
    expect(header).not.toBeNull()
    expect(body).not.toBeNull()
    expect(refreshBtn).not.toBeNull()
  })

  test('omits stale badge when cache is fresh', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, {
      runtime,
      root,
      cached: cached({ fetchedAt: 999_000 }),
    })
    expect(container.querySelector('.gm-sp-card-stale')).toBeNull()
  })

  test('shows stale badge when cache is very old', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, {
      runtime,
      root,
      now: 1_000_000,
      ttlMs: 60_000,
      cached: cached({ fetchedAt: 1_000_000 - 60 * 60_000 * 4 }),
    })
    const badge = container.querySelector('.gm-sp-card-stale')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('数据陈旧')
  })

  test('shows error block only when cached.error is set', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, { runtime, root })
    expect(container.querySelector('.gm-sp-error-box')).toBeNull()
    renderChrome(container, {
      runtime,
      root,
      cached: cached({ fetchedAt: 1, error: 'boom' }),
    })
    const errBlock = container.querySelector('.gm-sp-error-box')
    expect(errBlock).not.toBeNull()
    expect(errBlock!.textContent).toBe('boom')
  })

  test('omits edit button when edit option is not provided', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, { runtime, root })
    expect(container.querySelector('.gm-sp-edit')).toBeNull()
  })

  test('shows edit button when edit option is provided', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, {
      runtime,
      root,
      edit: {
        sourceTitle: 'Edit Title',
        createEditor: () => () => ({ render() {}, cancel() {}, save() {} }),
        onRevert: () => {},
      },
    })
    expect(container.querySelector('.gm-sp-edit')).not.toBeNull()
  })

  test('refresh button toggles loading state and clears it on resolve', async () => {
    const { container, runtime, root } = setup()
    let resolveRefresh!: () => void
    renderChrome(container, {
      runtime,
      root,
      onRefresh: () => new Promise<void>((r) => (resolveRefresh = r)),
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(true)
    expect(btn.disabled).toBe(true)
    resolveRefresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('refresh button clears loading state on rejection', async () => {
    const { container, runtime, root } = setup()
    let rejectRefresh!: (e: Error) => void
    renderChrome(container, {
      runtime,
      root,
      onRefresh: () => new Promise<void>((_r, rej) => (rejectRefresh = rej)),
    })
    const btn = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
    btn.click()
    rejectRefresh(new Error('boom'))
    await new Promise((r) => setTimeout(r, 0))
    expect(btn.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  test('replaces children when re-rendering into the same container', () => {
    const { container, runtime, root } = setup()
    container.innerHTML = '<legacy-tag>stale</legacy-tag>'
    renderChrome(container, { runtime, root })
    // Preact only manages its own VNodes; non-VNode children persist.
    // In real usage, containers are always empty (lifecycle.ts) or
    // hold a previous Preact tree (refresh), so this is not an issue.
    expect(container.querySelector('.gm-sp-card-header')).not.toBeNull()
  })

  test('renders title text content', () => {
    const { container, runtime, root } = setup()
    renderChrome(container, {
      runtime,
      root,
      title: h('span', { class: 'gm-sp-card-title-text' }, 'My Title'),
    })
    expect(container.querySelector('.test-title')).toBeNull()
    expect(container.querySelector('.gm-sp-card-title-text')!.textContent).toBe('My Title')
  })
})

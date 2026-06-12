import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { render } from 'preact'
import { h } from 'preact'
import { Card } from '../../src/dashboard/card/card'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
}

function setup() {
  const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
  const container = dom.window.document.getElementById('c') as HTMLElement
  const runtime = createRuntime(dom)
  return { dom, container, runtime }
}

function renderWithChrome(
  container: HTMLElement,
  {
    title = 'Test',
    cached: cachedData = null as CachedSource<unknown> | null,
    now = 1_000_000,
    ttlMs = 60_000,
  } = {},
) {
  const timeAgo = cachedData ? `${Math.round((now - cachedData.fetchedAt) / 1000)}\u79D2\u524D` : ''
  const isStale = cachedData != null && now - cachedData.fetchedAt > ttlMs * 3

  render(
    h(
      Card,
      {
        header: h(
          'div',
          null,
          h('span', { class: 'gm-sp-card-title-text' }, title),
          cachedData ? h('span', { class: 'gm-sp-card-time' }, timeAgo) : null,
          isStale ? h('span', { class: 'gm-sp-card-stale' }, '\u6570\u636E\u9648\u65E7') : null,
          h('button', { type: 'button', class: 'gm-sp-refresh' }, '\u21BB'),
          h('button', { type: 'button', class: 'gm-sp-edit', 'data-action': 'edit' }, '\u2699'),
        ),
      },
      h('div', null, 'body'),
    ),
    container,
  )
}

describe('Card chrome integration', () => {
  test('renders header, body, and refresh button', () => {
    const { container } = setup()
    renderWithChrome(container)
    const header = container.querySelector('.gm-sp-card-header')
    const body = container.querySelector('.gm-sp-card-body')
    const refreshBtn = container.querySelector('.gm-sp-refresh')
    expect(header).not.toBeNull()
    expect(body).not.toBeNull()
    expect(refreshBtn).not.toBeNull()
  })

  test('omits stale badge when cache is fresh', () => {
    const { container } = setup()
    renderWithChrome(container, {
      cached: cached({ fetchedAt: 999_000 }),
    })
    expect(container.querySelector('.gm-sp-card-stale')).toBeNull()
  })

  test('shows stale badge when cache is very old', () => {
    const { container } = setup()
    renderWithChrome(container, {
      now: 1_000_000,
      ttlMs: 60_000,
      cached: cached({ fetchedAt: 1_000_000 - 60 * 60_000 * 4 }),
    })
    const badge = container.querySelector('.gm-sp-card-stale')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('\u6570\u636E\u9648\u65E7')
  })

  test('shows error block only when cached.error is set', () => {
    const { container } = setup()
    render(h(Card, { error: '' }, h('div', null, 'body')), container)
    expect(container.querySelector('.gm-sp-error-box')).toBeNull()
    render(h(Card, { error: 'boom' }, h('div', null, 'body')), container)
    const errBlock = container.querySelector('.gm-sp-error-box')
    expect(errBlock).not.toBeNull()
    expect(errBlock!.textContent).toBe('boom')
  })

  test('renders title text content', () => {
    const { container } = setup()
    renderWithChrome(container, { title: 'My Title' })
    expect(container.querySelector('.gm-sp-card-title-text')!.textContent).toBe('My Title')
  })
})

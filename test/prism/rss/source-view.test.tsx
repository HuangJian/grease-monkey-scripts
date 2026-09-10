import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/preact'
import { createRssSource } from '../../../src/prism/rss/source'
import { CONFIG_KEY } from '../../../src/prism/types'
import type { RssFeed, RssSourceOptions } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

const NOW = 1_700_000_000_000

function feed(): RssFeed {
  return {
    id: 'u:https://example.com/feed.xml',
    title: '源 a',
    url: 'https://example.com/feed.xml',
    items: [
      {
        id: 'https://example.com/1',
        title: '标题 1',
        link: 'https://example.com/1',
        pubDate: NOW,
        summaryText: '摘要',
      },
    ],
    error: '',
    fetchedAt: NOW,
  }
}

function options(over: Partial<RssSourceOptions> = {}): RssSourceOptions {
  return {
    feeds: [{ url: 'https://example.com/feed.xml', title: '源 a' }],
    ttlMinutes: 123,
    retentionDays: 30,
    maxItemsPerFeed: 100,
    viewMode: 'grouped',
    ...over,
  }
}

/** Mount the source's own component, so the wired callbacks are exercised. */
function mount(source: ReturnType<typeof createRssSource>, runtime: TestRuntime) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const Render = source.RenderComponent
  render(<Render data={[feed()]} root={root} runtime={runtime} />, { container: root })
  return root
}

describe('RSS view mode persistence', () => {
  test('renders the configured view', () => {
    const runtime = createRuntime()
    const root = mount(createRssSource(options({ viewMode: 'timeline' })), runtime)
    expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
  })

  test('toggling writes the choice to CONFIG_KEY', async () => {
    const runtime = createRuntime()
    const root = mount(createRssSource(options()), runtime)
    root.querySelector<HTMLButtonElement>('[data-action="view-timeline"]')!.click()
    await waitFor(() => {
      const stored = runtime.stores[CONFIG_KEY] as { rss?: RssSourceOptions } | undefined
      expect(stored?.rss?.viewMode).toBe('timeline')
    })
    // The rest of the section survives the write.
    const stored = runtime.stores[CONFIG_KEY] as { rss?: RssSourceOptions }
    expect(stored.rss?.feeds).toHaveLength(1)
    expect(stored.rss?.ttlMinutes).toBe(123)
  })

  test('a stored view mode is picked up on the next load', async () => {
    const runtime = createRuntime()
    runtime.stores[CONFIG_KEY] = { rss: options({ viewMode: 'timeline' }) }
    const source = createRssSource(options())
    await source.loadState?.(runtime)
    const root = mount(source, runtime)
    expect(root.querySelector('.gm-sp-rss-timeline')).not.toBeNull()
  })

  test('clicking the already-active view does not rewrite config', async () => {
    const runtime = createRuntime()
    const root = mount(createRssSource(options()), runtime)
    root.querySelector<HTMLButtonElement>('[data-action="view-grouped"]')!.click()
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0))
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })
})

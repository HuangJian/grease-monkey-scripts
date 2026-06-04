import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderTabsCard } from '../../src/dashboard/overlay/tabs-render'
import type { CardGroup } from '../../src/dashboard/card-group'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'
import type { Source, TabLabel } from '../../src/dashboard/sources/types'

function cached<T>(data: T | null, fetchedAt = 1_000_000, error?: string): CachedSource<T> {
  const out: CachedSource<T> = { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, fetchedAt }
  if (data !== null) out.data = data
  if (error) out.error = error
  return out
}

function makeSource(opts: {
  id: string
  title: string
  render?: (container: HTMLElement, data: unknown) => void
  getTabLabel?: (data: any) => TabLabel
  createEditor?: () => (container: HTMLElement, ctx: { onRevert: () => void }) => void
}): Source<unknown> {
  return {
    id: opts.id,
    title: opts.title,
    ttlMs: 60_000,
    fetch: () => Promise.resolve(null as never),
    render:
      opts.render ??
      ((container, data) => {
        container.textContent = data == null ? 'empty' : 'data'
      }),
    getTabLabel: opts.getTabLabel,
    createEditor: opts.createEditor as Source<unknown>['createEditor'],
  }
}

function setup() {
  const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
  const container = dom.window.document.getElementById('c') as HTMLElement
  const runtime = createRuntime(dom)
  return { dom, container, runtime }
}

function browseGroup(tabs: Source<unknown>[]): CardGroup {
  return { id: 'browse', placement: 'main', tabs }
}

function renderOnce(opts: {
  container: HTMLElement
  runtime: ReturnType<typeof createRuntime>
  group: CardGroup
  caches: Map<string, CachedSource<unknown> | null>
  activeTabId: string
  onTabChange?: (id: string) => void
  onRefresh?: (id: string) => Promise<void>
  onEdit?: (id: string) => void
  now?: number
}) {
  let tabChanges: string[] = []
  let refreshes: string[] = []
  let edits: string[] = []
  renderTabsCard(opts.container, {
    group: opts.group,
    caches: opts.caches,
    now: opts.now ?? 1_000_000,
    runtime: opts.runtime,
    activeTabId: opts.activeTabId,
    onTabChange: (id) => {
      tabChanges.push(id)
      opts.onTabChange?.(id)
    },
    onRefresh: async (id) => {
      refreshes.push(id)
      await opts.onRefresh?.(id)
    },
    onEdit: (id) => {
      edits.push(id)
      opts.onEdit?.(id)
    },
  })
  return { tabChanges, refreshes, edits }
}

describe('renderTabsCard', () => {
  test('sets data-source to group id and renders one tab per source', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    renderOnce({ container, runtime, group, caches: new Map(), activeTabId: 'v2ex' })
    expect(container.dataset['source']).toBe('browse')
    const tabs = container.querySelectorAll('.gm-sp-tab')
    expect(tabs.length).toBe(2)
    expect(tabs[0]!.querySelector('.gm-sp-tab-label')!.textContent).toBe('V2EX 热议')
    expect(tabs[1]!.querySelector('.gm-sp-tab-label')!.textContent).toBe('网文更新')
  })

  test('marks the active tab and shows only the active panel by default', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({
      id: 'v2ex',
      title: 'V2EX 热议',
      render: (c) => {
        c.textContent = 'v2ex-body'
      },
    })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      render: (c) => {
        c.textContent = 'novels-body'
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    renderOnce({ container, runtime, group, caches: new Map(), activeTabId: 'v2ex' })
    expect((container.querySelector('.gm-sp-tab-active') as HTMLElement).dataset['tabId']).toBe('v2ex')
    const panels = container.querySelectorAll('.gm-sp-tab-panel')
    expect(panels.length).toBe(2)
    expect(panels[0]!.classList.contains('gm-sp-tab-panel-active')).toBe(true)
    expect(panels[1]!.classList.contains('gm-sp-tab-panel-active')).toBe(false)
  })

  test('clicking a tab fires onTabChange', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { tabChanges } = renderOnce({
      container,
      runtime,
      group,
      caches: new Map(),
      activeTabId: 'v2ex',
    })
    ;(container.querySelectorAll('.gm-sp-tab')[1] as HTMLButtonElement).click()
    expect(tabChanges).toEqual(['novels'])
  })

  test('shows badge when getTabLabel returns one, hides otherwise', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      getTabLabel: (data) => {
        const count = data?.books.filter((b: { hasNew: boolean }) => b.hasNew).length ?? 0
        return { label: '网文更新', badge: count > 0 ? count : null }
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached({ books: [{ hasNew: true }, { hasNew: false }, { hasNew: true }] })],
    ])
    renderOnce({ container, runtime, group, caches, activeTabId: 'v2ex' })
    const novelTab = container.querySelectorAll('.gm-sp-tab')[1]!
    const badge = novelTab.querySelector('.gm-sp-tab-badge') as HTMLElement
    expect(badge.hidden).toBe(false)
    expect(badge.textContent).toBe('2')
  })

  test('hides badge when count is zero', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      getTabLabel: (data) => {
        const count = data?.books.filter((b: { hasNew: boolean }) => b.hasNew).length ?? 0
        return { label: '网文更新', badge: count > 0 ? count : null }
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached({ books: [{ hasNew: false }] })],
    ])
    renderOnce({ container, runtime, group, caches, activeTabId: 'v2ex' })
    const badge = container
      .querySelectorAll('.gm-sp-tab')[1]!
      .querySelector('.gm-sp-tab-badge') as HTMLElement
    expect(badge.hidden).toBe(true)
  })

  test('clicking refresh fires onRefresh for the active tab', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { refreshes } = renderOnce({
      container,
      runtime,
      group,
      caches: new Map(),
      activeTabId: 'novels',
    })
    ;(container.querySelector('.gm-sp-refresh') as HTMLButtonElement).click()
    expect(refreshes).toEqual(['novels'])
  })

  test('renders each tab body with its own data', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({
      id: 'v2ex',
      title: 'V2EX 热议',
      render: (c, data) => {
        c.textContent = `v:${(data as { n?: number } | null)?.n ?? '-'}`
      },
    })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      render: (c, data) => {
        c.textContent = `n:${(data as { n?: number } | null)?.n ?? '-'}`
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', cached({ n: 1 })],
      ['novels', cached({ n: 2 })],
    ])
    renderOnce({ container, runtime, group, caches, activeTabId: 'v2ex' })
    const panels = container.querySelectorAll('.gm-sp-tab-panel')
    expect(panels[0]!.textContent).toBe('v:1')
    expect(panels[1]!.textContent).toBe('n:2')
  })

  test('shows edit button only when active tab has createEditor', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      createEditor: () => (c) => {
        c.textContent = 'editor'
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    renderOnce({ container, runtime, group, caches: new Map(), activeTabId: 'v2ex' })
    expect(container.querySelector('.gm-sp-edit')).toBeNull()
    renderTabsCard(container, {
      group,
      caches: new Map(),
      now: 1_000_000,
      runtime,
      activeTabId: 'novels',
      onTabChange: () => {},
      onRefresh: async () => {},
      onEdit: () => {},
    })
    expect(container.querySelector('.gm-sp-edit')).not.toBeNull()
  })

  test('shows error from the active tab cache', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached(null, 1, 'network error')],
    ])
    renderOnce({ container, runtime, group, caches, activeTabId: 'novels' })
    expect(container.querySelector('.gm-sp-error')!.textContent).toBe('network error')
  })

  test('clicking edit swaps body to the editor; editor.onRevert fires onEdit', () => {
    const { container, runtime } = setup()
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    let captured: { onRevert: () => void } | null = null
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      createEditor: () => (c, ctx) => {
        c.textContent = 'editor'
        captured = ctx
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { edits } = renderOnce({
      container,
      runtime,
      group,
      caches: new Map(),
      activeTabId: 'novels',
    })
    const body = container.querySelector('.gm-sp-card-body')!
    expect(body.textContent).not.toBe('editor')
    ;(container.querySelector('.gm-sp-edit') as HTMLButtonElement).click()
    expect(body.textContent).toBe('editor')
    expect(edits).toEqual([])
    captured!.onRevert()
    expect(edits).toEqual(['novels'])
  })
})
